import shutil
import tempfile
from datetime import timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.db import SessionLocal, get_db
from app.core.deps import require_superadmin
from app.models.backup_settings import BackupSettings
from app.schemas.backup import (
    BackupFileInfo,
    BackupSettingsResponse,
    BackupSettingsUpdate,
    RestoreRequest,
    RestoreResult,
)
from app.services import backup as backups
from app.services.audit import write_audit_log

# Superadmin-only (not just require_admin): a backup snapshots and a restore
# overwrites the ENTIRE database, both companies at once, so a company-scoped
# admin must not be able to read the other company's data out of a backup file
# or replace its live data with a restore. See services/backup.py for how
# backups and restores work.
router = APIRouter(prefix="/api/backup", tags=["backup"])


def _require_sqlite() -> None:
    if backups.sqlite_db_path() is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Backup and restore only support the built-in SQLite database. For Postgres, use pg_dump/pg_restore.",
        )


def _settings_response(row: BackupSettings) -> BackupSettingsResponse:
    next_due = None
    if row.auto_enabled and row.last_auto_backup_at:
        next_due = row.last_auto_backup_at + timedelta(hours=row.auto_interval_hours)
    return BackupSettingsResponse(
        supported=backups.sqlite_db_path() is not None,
        backup_folder=str(backups.effective_folder(row)),
        using_default_folder=row.backup_folder is None,
        default_folder=str(backups.default_backup_folder()),
        auto_enabled=row.auto_enabled,
        auto_interval_hours=row.auto_interval_hours,
        keep_auto_count=row.keep_auto_count,
        last_auto_backup_at=row.last_auto_backup_at,
        last_backup_at=row.last_backup_at,
        last_backup_status=row.last_backup_status,
        last_backup_error=row.last_backup_error,
        next_auto_backup_due=next_due,
    )


def _backup_path_or_404(row: BackupSettings, filename: str) -> Path:
    try:
        return backups.resolve_backup_file(backups.effective_folder(row), filename)
    except backups.BackupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/settings", response_model=BackupSettingsResponse)
def get_settings(db: Session = Depends(get_db), current_user=Depends(require_superadmin)):
    return _settings_response(backups.get_or_create_settings(db))


@router.patch("/settings", response_model=BackupSettingsResponse)
def update_settings(
    payload: BackupSettingsUpdate, db: Session = Depends(get_db), current_user=Depends(require_superadmin)
):
    row = backups.get_or_create_settings(db)
    data = payload.model_dump(exclude_unset=True)

    if "backup_folder" in data:
        folder = (data["backup_folder"] or "").strip()
        if folder:
            try:
                backups.check_folder_writable(Path(folder))
            except OSError as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail=f"Backups can't be written to that folder: {exc}"
                ) from exc
            row.backup_folder = folder
        else:
            row.backup_folder = None
    for key in ("auto_enabled", "auto_interval_hours", "keep_auto_count"):
        if data.get(key) is not None:
            setattr(row, key, data[key])

    write_audit_log(
        db, user_id=current_user.id, business_id=None, action="update",
        entity_type="backup", entity_id=None, description="Updated backup settings",
    )
    db.commit()
    db.refresh(row)
    return _settings_response(row)


@router.post("/run", response_model=BackupFileInfo, status_code=status.HTTP_201_CREATED)
def run_backup(db: Session = Depends(get_db), current_user=Depends(require_superadmin)):
    _require_sqlite()
    row = backups.get_or_create_settings(db)
    try:
        info = backups.create_backup("manual", backups.effective_folder(row))
    except (backups.BackupError, OSError) as exc:
        backups.record_result(row, ok=False, error=str(exc))
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Backup failed: {exc}") from exc

    backups.record_result(row, ok=True)
    write_audit_log(
        db, user_id=current_user.id, business_id=None, action="create",
        entity_type="backup", entity_id=None, description=f"Created backup {info['filename']}",
    )
    db.commit()
    return BackupFileInfo(**info)


@router.get("/list", response_model=list[BackupFileInfo])
def list_backups(db: Session = Depends(get_db), current_user=Depends(require_superadmin)):
    row = backups.get_or_create_settings(db)
    return [BackupFileInfo(**b) for b in backups.list_backups(backups.effective_folder(row))]


@router.get("/download/{filename}")
def download_backup(filename: str, db: Session = Depends(get_db), current_user=Depends(require_superadmin)):
    path = _backup_path_or_404(backups.get_or_create_settings(db), filename)
    media_type = "application/zip" if path.suffix.lower() == ".zip" else "application/octet-stream"
    return FileResponse(path, filename=filename, media_type=media_type)


def _do_restore(source: Path, label: str, db: Session, current_user) -> RestoreResult:
    folder = backups.effective_folder(backups.get_or_create_settings(db))
    user_id, username = current_user.id, current_user.username
    # Release this request's database connection before the live data is
    # rewritten underneath it.
    db.close()

    try:
        result = backups.restore_from_file(source, folder)
    except backups.BackupError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Restore failed: {exc}") from exc

    # Logged into the restored database, so the history of the data now in
    # use records that it came from a restore.
    fresh = SessionLocal()
    try:
        write_audit_log(
            fresh, user_id=user_id, business_id=None, action="update", entity_type="backup", entity_id=None,
            description=f"{username} restored the database from {label} (safety backup: {result['safety_backup']})",
        )
        fresh.commit()
    finally:
        fresh.close()

    return RestoreResult(
        ok=True,
        safety_backup=result["safety_backup"],
        restored_uploads=result["restored_uploads"],
        message="Restore complete. Everyone needs to sign in again.",
    )


@router.post("/restore", response_model=RestoreResult)
def restore_backup(payload: RestoreRequest, db: Session = Depends(get_db), current_user=Depends(require_superadmin)):
    _require_sqlite()
    if not payload.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Restoring replaces all current data. Pass confirm=true to proceed.",
        )
    path = _backup_path_or_404(backups.get_or_create_settings(db), payload.filename)
    return _do_restore(path, payload.filename, db, current_user)


@router.post("/restore-upload", response_model=RestoreResult)
def restore_uploaded_backup(
    file: UploadFile = File(...),
    confirm: bool = Form(False),
    db: Session = Depends(get_db),
    current_user=Depends(require_superadmin),
):
    """Restore a backup file brought from elsewhere — a USB drive, another PC."""
    _require_sqlite()
    if not confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Restoring replaces all current data. Pass confirm=true to proceed.",
        )
    name = Path(file.filename or "backup").name
    suffix = Path(name).suffix.lower()
    if suffix not in (".zip", ".db"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Choose a PRO Invoicing backup file (.zip, or .db from an older version).",
        )
    with tempfile.TemporaryDirectory() as tmp:
        temp_path = Path(tmp) / f"uploaded-backup{suffix}"
        with temp_path.open("wb") as out:
            shutil.copyfileobj(file.file, out)
        return _do_restore(temp_path, f"uploaded file {name}", db, current_user)
