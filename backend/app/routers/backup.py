import shutil
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.deps import require_admin
from app.models.backup_settings import BackupSettings
from app.schemas.backup import BackupFileInfo, BackupSettingsResponse, BackupSettingsUpdate, RestoreRequest
from app.services.audit import write_audit_log

router = APIRouter(prefix="/api/backup", tags=["backup"])


def _sqlite_db_path() -> Path:
    """This whole module only supports SQLite — that's the "simplest
    single-PC install" default from CLAUDE.md §3. Postgres deployments need
    pg_dump/pg_restore instead, which isn't implemented; the endpoints below
    return a clear 400 in that case rather than silently doing nothing."""
    url = make_url(settings.database_url)
    if url.get_backend_name() != "sqlite" or not url.database:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Automated backup/restore only supports SQLite deployments. "
            "For Postgres, use pg_dump/pg_restore instead.",
        )
    return Path(url.database).resolve()


def _get_or_create_settings(db: Session) -> BackupSettings:
    row = db.query(BackupSettings).first()
    if not row:
        row = BackupSettings(backup_folder=None)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.get("/settings", response_model=BackupSettingsResponse)
def get_settings(db: Session = Depends(get_db), current_user=Depends(require_admin)):
    return _get_or_create_settings(db)


@router.patch("/settings", response_model=BackupSettingsResponse)
def update_settings(
    payload: BackupSettingsUpdate, db: Session = Depends(get_db), current_user=Depends(require_admin)
):
    if payload.backup_folder is None:
        row = _get_or_create_settings(db)
        row.backup_folder = None
        db.commit()
        db.refresh(row)
        return row

    folder = Path(payload.backup_folder)
    try:
        folder.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot use that folder: {exc}") from exc

    row = _get_or_create_settings(db)
    row.backup_folder = str(folder)
    db.commit()
    db.refresh(row)
    return row


@router.post("/run", response_model=BackupFileInfo, status_code=status.HTTP_201_CREATED)
def run_backup(db: Session = Depends(get_db), current_user=Depends(require_admin)):
    row = _get_or_create_settings(db)
    if not row.backup_folder:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Set a backup folder first")

    db_path = _sqlite_db_path()
    if not db_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Database file not found")

    dest_folder = Path(row.backup_folder)
    dest_folder.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    dest_file = dest_folder / f"backup-{timestamp}.db"
    shutil.copy2(db_path, dest_file)

    write_audit_log(
        db, user_id=current_user.id, business_id=None, action="create",
        entity_type="backup", entity_id=None, description=f"Created backup {dest_file.name}",
    )
    db.commit()

    stat = dest_file.stat()
    return BackupFileInfo(filename=dest_file.name, size_bytes=stat.st_size, created_at=datetime.fromtimestamp(stat.st_mtime))


@router.get("/list", response_model=list[BackupFileInfo])
def list_backups(db: Session = Depends(get_db), current_user=Depends(require_admin)):
    row = _get_or_create_settings(db)
    if not row.backup_folder:
        return []
    folder = Path(row.backup_folder)
    if not folder.exists():
        return []
    files = sorted(folder.glob("backup-*.db"), key=lambda p: p.stat().st_mtime, reverse=True)
    return [
        BackupFileInfo(filename=f.name, size_bytes=f.stat().st_size, created_at=datetime.fromtimestamp(f.stat().st_mtime))
        for f in files
    ]


@router.post("/restore")
def restore_backup(payload: RestoreRequest, db: Session = Depends(get_db), current_user=Depends(require_admin)):
    if not payload.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Restoring overwrites the live database. Pass confirm=true to proceed.",
        )
    row = _get_or_create_settings(db)
    if not row.backup_folder:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No backup folder configured")

    source = Path(row.backup_folder) / payload.filename
    if not source.exists() or source.parent.resolve() != Path(row.backup_folder).resolve():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backup file not found")

    db_path = _sqlite_db_path()
    write_audit_log(
        db, user_id=current_user.id, business_id=None, action="update",
        entity_type="backup", entity_id=None, description=f"Restored database from {payload.filename}",
    )
    db.commit()
    db.close()  # release SQLAlchemy's handle on the file before overwriting it

    shutil.copy2(source, db_path)

    return {"ok": True, "message": "Database restored. Restart the backend for the change to take full effect."}
