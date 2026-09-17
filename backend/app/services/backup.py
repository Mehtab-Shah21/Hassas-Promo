"""Backup and restore for the single-PC SQLite install.

What makes these usable on a desktop, rather than a copy of a file:

- **Consistent snapshots.** The live database is copied with sqlite3's online
  backup API, not a file copy, so a backup taken while someone is saving an
  invoice is never half-written. The snapshot must pass `PRAGMA
  integrity_check` before anything is written.
- **One self-contained file.** A backup is a .zip holding the database, every
  uploaded file (banner images, expense PDFs, logos) and a manifest. A restore
  therefore never brings back records that point at missing files, and the
  single file is easy to copy to a USB drive or another PC.
- **Automatic, with catch-up.** A background thread checks periodically and
  backs up when one is due, including shortly after startup — a desktop PC is
  often switched off at the moment a fixed-time schedule would have fired.
- **Retention.** Automatic backups are pruned to `keep_auto_count`; manual and
  before-restore backups are never deleted automatically.
- **Restores that are safe to try.** The backup is extracted and validated
  first (integrity, that it's really a PRO Invoicing database, and that it
  isn't from a newer app version). A "before restore" backup of the current
  data is then taken, so a restore of the wrong backup can be undone. Data is
  copied *into* the live database with the same online backup API — no file
  swap, so it works while the server is running and Windows has the file open
  — and the schema is migrated forward so an older backup works with this
  version. No restart needed.

Everything here refuses to run against a non-SQLite DATABASE_URL; a Postgres
deployment uses pg_dump/pg_restore instead.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import sqlite3
import tempfile
import threading
import time
import zipfile
from datetime import datetime, timedelta
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.core.config import resource_dir, settings
from app.core.db import SessionLocal, engine
from app.models.backup_settings import BackupSettings

logger = logging.getLogger(__name__)

MANIFEST_MARKER = "PRO Invoicing backup"
MANIFEST_FORMAT = 1
FILE_PREFIX = "ProInvoicing-backup-"
LEGACY_GLOB = "backup-*.db"  # plain database copies made by earlier versions

# The scheduler's first look comes shortly after startup (so a PC that was
# off when a backup was due catches up), then every CHECK_EVERY_SECONDS.
FIRST_CHECK_DELAY_SECONDS = 90
CHECK_EVERY_SECONDS = 15 * 60

# Backup, prune and restore all touch the same files; never run two at once.
_lock = threading.Lock()
_scheduler_started = False


class BackupError(Exception):
    """A backup/restore problem worth showing to the user as-is."""


# --- locations & settings -------------------------------------------------


def sqlite_db_path() -> Path | None:
    url = make_url(settings.database_url)
    if url.get_backend_name() != "sqlite" or not url.database:
        return None
    return Path(url.database).resolve()


def default_backup_folder() -> Path:
    db_path = sqlite_db_path()
    base = db_path.parent if db_path else Path(settings.upload_dir).parent
    return base / "backups"


def get_or_create_settings(db: Session) -> BackupSettings:
    row = db.query(BackupSettings).first()
    if not row:
        row = BackupSettings(backup_folder=None)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def effective_folder(row: BackupSettings) -> Path:
    return Path(row.backup_folder) if row.backup_folder else default_backup_folder()


def check_folder_writable(folder: Path) -> None:
    """Raise OSError unless backups can actually be written to `folder`."""
    folder.mkdir(parents=True, exist_ok=True)
    probe = folder / ".proinvoicing-write-test"
    probe.write_text("ok", encoding="utf-8")
    probe.unlink()


def record_result(row: BackupSettings, ok: bool, error: str | None = None) -> None:
    row.last_backup_status = "ok" if ok else "failed"
    row.last_backup_error = None if ok else (error or "Unknown error")[:500]
    if ok:
        row.last_backup_at = datetime.now()


# --- SQLite helpers ---------------------------------------------------------


def _alembic_config() -> Config:
    cfg = Config()
    cfg.set_main_option("script_location", str(resource_dir() / "alembic"))
    cfg.set_main_option("sqlalchemy.url", settings.database_url)
    return cfg


def _integrity_ok(db_file: Path) -> bool:
    con = sqlite3.connect(db_file)
    try:
        return con.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    except sqlite3.DatabaseError:
        return False
    finally:
        con.close()


def _schema_revision(db_file: Path) -> str | None:
    con = sqlite3.connect(db_file)
    try:
        row = con.execute("SELECT version_num FROM alembic_version").fetchone()
        return row[0] if row else None
    except sqlite3.DatabaseError:
        return None
    finally:
        con.close()


def _sqlite_copy(source: Path, destination: Path) -> None:
    """Page-by-page copy with sqlite3's online backup API.

    Consistent even while the source is being written to, and safe to point
    at the live database file as the destination while the app has it open.
    """
    src = sqlite3.connect(source, timeout=30)
    dst = sqlite3.connect(destination, timeout=30)
    try:
        src.backup(dst)
    finally:
        dst.close()
        src.close()


# --- creating & listing -----------------------------------------------------


def create_backup(kind: str, folder: Path) -> dict:
    db_path = sqlite_db_path()
    if db_path is None:
        raise BackupError("Backups are only available for the built-in database (SQLite).")
    with _lock:
        return _create_backup_locked(kind, folder, db_path)


def _create_backup_locked(kind: str, folder: Path, db_path: Path) -> dict:
    if not db_path.exists():
        raise BackupError("The database file couldn't be found.")
    folder.mkdir(parents=True, exist_ok=True)

    stamp = datetime.now()
    final = folder / f"{FILE_PREFIX}{stamp:%Y%m%d-%H%M%S}-{kind}.zip"
    n = 1
    while final.exists():
        final = folder / f"{FILE_PREFIX}{stamp:%Y%m%d-%H%M%S}-{kind}-{n}.zip"
        n += 1

    with tempfile.TemporaryDirectory() as tmp:
        snapshot = Path(tmp) / "database.db"
        _sqlite_copy(db_path, snapshot)
        if not _integrity_ok(snapshot):
            raise BackupError("The database snapshot failed its integrity check, so no backup was written.")

        uploads = Path(settings.upload_dir)
        upload_files = [p for p in uploads.rglob("*") if p.is_file()] if uploads.exists() else []
        manifest = {
            "marker": MANIFEST_MARKER,
            "format": MANIFEST_FORMAT,
            "kind": kind,
            "created_at": stamp.isoformat(timespec="seconds"),
            "schema_revision": _schema_revision(snapshot),
            "database_bytes": snapshot.stat().st_size,
            "upload_files": len(upload_files),
        }

        # Written under a temporary name and renamed at the end, so a crash or
        # full disk never leaves a truncated file that looks like a backup.
        partial = final.with_name(final.name + ".partial")
        try:
            with zipfile.ZipFile(partial, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                zf.writestr("manifest.json", json.dumps(manifest, indent=2))
                zf.write(snapshot, "database.db")
                for f in upload_files:
                    zf.write(f, f"uploads/{f.relative_to(uploads).as_posix()}")
            os.replace(partial, final)
        finally:
            partial.unlink(missing_ok=True)

    logger.info("created %s backup %s", kind, final)
    return describe(final)


def describe(path: Path) -> dict:
    stat = path.stat()
    info = {
        "filename": path.name,
        "size_bytes": stat.st_size,
        "created_at": datetime.fromtimestamp(stat.st_mtime),
        "kind": "legacy",
        "includes_uploads": False,
        "upload_files": 0,
        "schema_revision": None,
        "valid": True,
    }
    if path.suffix.lower() == ".zip":
        try:
            with zipfile.ZipFile(path) as zf:
                manifest = json.loads(zf.read("manifest.json"))
            if manifest.get("marker") != MANIFEST_MARKER:
                raise ValueError("not ours")
            info.update(
                kind=manifest.get("kind", "manual"),
                includes_uploads=True,
                upload_files=int(manifest.get("upload_files", 0)),
                schema_revision=manifest.get("schema_revision"),
            )
            if manifest.get("created_at"):
                info["created_at"] = datetime.fromisoformat(manifest["created_at"])
        except (zipfile.BadZipFile, KeyError, ValueError, TypeError):
            info.update(kind="unknown", valid=False)
    return info


def list_backups(folder: Path) -> list[dict]:
    if not folder.exists():
        return []
    files = list(folder.glob(f"{FILE_PREFIX}*.zip")) + list(folder.glob(LEGACY_GLOB))
    return sorted((describe(f) for f in files), key=lambda b: b["created_at"], reverse=True)


def prune_auto_backups(folder: Path, keep: int) -> list[str]:
    autos = [b for b in list_backups(folder) if b["kind"] == "auto"]
    removed = []
    for backup in autos[max(keep, 1):]:
        try:
            (folder / backup["filename"]).unlink()
            removed.append(backup["filename"])
        except OSError:
            logger.warning("could not prune old backup %s", backup["filename"], exc_info=True)
    return removed


def resolve_backup_file(folder: Path, filename: str) -> Path:
    """A backup in `folder`, by bare filename — never a path outside it."""
    if Path(filename).name != filename or not (
        filename.startswith(FILE_PREFIX) or (filename.startswith("backup-") and filename.endswith(".db"))
    ):
        raise BackupError("Backup file not found")
    path = folder / filename
    if not path.is_file() or path.resolve().parent != folder.resolve():
        raise BackupError("Backup file not found")
    return path


# --- restoring --------------------------------------------------------------


def _extract(backup_file: Path, workdir: Path) -> tuple[Path, Path | None]:
    """Unpack a backup into `workdir`; return (database, uploads folder or None).

    A plain .db from an earlier version carries no uploads, so None means
    "leave the current uploads alone" rather than "restore an empty folder".
    """
    if backup_file.suffix.lower() == ".db":
        database = workdir / "database.db"
        shutil.copyfile(backup_file, database)
        return database, None

    not_ours = BackupError("That file isn't a PRO Invoicing backup.")
    try:
        zf = zipfile.ZipFile(backup_file)
    except zipfile.BadZipFile:
        raise not_ours
    with zf:
        names = set(zf.namelist())
        if "manifest.json" not in names or "database.db" not in names:
            raise not_ours
        try:
            manifest = json.loads(zf.read("manifest.json"))
        except ValueError:
            raise not_ours
        if manifest.get("marker") != MANIFEST_MARKER:
            raise not_ours
        root = workdir.resolve()
        for member in zf.infolist():
            target = (workdir / member.filename).resolve()
            if target != root and root not in target.parents:
                # A crafted archive could otherwise write outside the temp dir.
                raise BackupError("The backup contains an unsafe file path and was rejected.")
        zf.extractall(workdir)
    uploads = workdir / "uploads"
    uploads.mkdir(exist_ok=True)
    return workdir / "database.db", uploads


def _validate_database(database: Path) -> None:
    if not _integrity_ok(database):
        raise BackupError("The backup's database is damaged (it failed its integrity check).")
    revision = _schema_revision(database)
    if revision is None:
        raise BackupError("That file doesn't contain a PRO Invoicing database.")
    try:
        known = ScriptDirectory.from_config(_alembic_config()).get_revision(revision)
    except Exception:  # noqa: BLE001 - alembic raises several types for unknown ids
        known = None
    if known is None:
        raise BackupError(
            "This backup was made by a newer version of PRO Invoicing. Update the app on this PC first, then restore it."
        )


def _replace_uploads(source: Path) -> None:
    target = Path(settings.upload_dir)
    target.mkdir(parents=True, exist_ok=True)
    for child in target.iterdir():
        try:
            shutil.rmtree(child) if child.is_dir() else child.unlink()
        except OSError:
            logger.warning("could not remove %s while restoring uploads", child, exc_info=True)
    for f in source.rglob("*"):
        if f.is_file():
            dest = target / f.relative_to(source)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, dest)


_CARRIED_SETTINGS = ("backup_folder", "auto_enabled", "auto_interval_hours", "keep_auto_count", "last_auto_backup_at")


def _current_settings_snapshot() -> dict:
    db = SessionLocal()
    try:
        row = get_or_create_settings(db)
        return {field: getattr(row, field) for field in _CARRIED_SETTINGS}
    finally:
        db.close()


def _restore_settings_snapshot(values: dict) -> None:
    db = SessionLocal()
    try:
        row = get_or_create_settings(db)
        for field, value in values.items():
            setattr(row, field, value)
        # The before-restore backup was taken moments ago, so the data now in
        # use genuinely is backed up.
        record_result(row, ok=True)
        db.commit()
    finally:
        db.close()


def restore_from_file(backup_file: Path, safety_folder: Path) -> dict:
    """Validate `backup_file`, take a before-restore backup, then restore.

    Nothing about the current data changes until validation has passed and the
    safety backup exists.
    """
    db_path = sqlite_db_path()
    if db_path is None:
        raise BackupError("Restore is only available for the built-in database (SQLite).")

    # Backup settings describe this PC (where backups go, how often), not the
    # business data being restored — carry them across, or restoring an old
    # backup would quietly revert the backup folder and schedule with it.
    keep_settings = _current_settings_snapshot()

    with _lock:
        with tempfile.TemporaryDirectory() as tmp:
            database, uploads = _extract(backup_file, Path(tmp))
            _validate_database(database)

            safety = _create_backup_locked("pre-restore", safety_folder, db_path)

            # Drop pooled connections so no stale handle or cached schema
            # survives, then copy the backup's pages into the live file.
            engine.dispose()
            _sqlite_copy(database, db_path)
            if uploads is not None:
                _replace_uploads(uploads)

        # An older backup is brought up to this version's schema.
        engine.dispose()
        command.upgrade(_alembic_config(), "head")
        engine.dispose()

    _restore_settings_snapshot(keep_settings)
    mark_sessions_invalid()
    logger.info("restored database from %s (safety backup %s)", backup_file, safety["filename"])
    return {"safety_backup": safety["filename"], "restored_uploads": uploads is not None}


# --- sign-in sessions -------------------------------------------------------
# Sign-in tokens identify a user by id. After a restore the same id can belong
# to a different person, so every token issued before the restore must stop
# working. The cut-off lives in a file beside the database rather than inside
# it, because the restore itself replaces the database contents.


def _session_epoch_file() -> Path:
    db_path = sqlite_db_path()
    base = db_path.parent if db_path else Path(settings.upload_dir).parent
    return base / "sessions-valid-after.txt"


def mark_sessions_invalid() -> None:
    _session_epoch_file().write_text(str(int(time.time())), encoding="utf-8")


def sessions_valid_after() -> int | None:
    try:
        return int(_session_epoch_file().read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        return None


# --- automatic schedule -----------------------------------------------------


def run_auto_backup_if_due(now: datetime | None = None) -> str | None:
    if sqlite_db_path() is None:
        return None
    db = SessionLocal()
    try:
        row = get_or_create_settings(db)
        if not row.auto_enabled:
            return None
        now = now or datetime.now()
        if row.last_auto_backup_at and now - row.last_auto_backup_at < timedelta(hours=row.auto_interval_hours):
            return None
        folder = effective_folder(row)
        try:
            info = create_backup("auto", folder)
            with _lock:
                prune_auto_backups(folder, row.keep_auto_count)
        except Exception as exc:  # noqa: BLE001 - recorded and retried next check
            logger.exception("automatic backup failed")
            record_result(row, ok=False, error=str(exc))
            db.commit()
            return None
        row.last_auto_backup_at = now
        record_result(row, ok=True)
        db.commit()
        return info["filename"]
    finally:
        db.close()


def start_auto_backup_scheduler() -> None:
    """Start the background scheduler once per process (SQLite installs only)."""
    global _scheduler_started
    if _scheduler_started or sqlite_db_path() is None:
        return
    _scheduler_started = True

    def loop() -> None:
        time.sleep(FIRST_CHECK_DELAY_SECONDS)
        while True:
            try:
                run_auto_backup_if_due()
            except Exception:  # noqa: BLE001 - the loop must never die
                logger.exception("automatic backup check crashed")
            time.sleep(CHECK_EVERY_SECONDS)

    threading.Thread(target=loop, name="auto-backup", daemon=True).start()
