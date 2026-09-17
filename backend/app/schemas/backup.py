from datetime import datetime

from pydantic import BaseModel, Field


class BackupSettingsResponse(BaseModel):
    # False on a non-SQLite deployment, where none of this applies.
    supported: bool
    # The folder actually in use — the configured one, or the default.
    backup_folder: str
    using_default_folder: bool
    default_folder: str
    auto_enabled: bool
    auto_interval_hours: int
    keep_auto_count: int
    last_auto_backup_at: datetime | None
    last_backup_at: datetime | None
    last_backup_status: str | None
    last_backup_error: str | None
    # None while automatic backups are off, or before the first one (which
    # runs within a few minutes of the app starting).
    next_auto_backup_due: datetime | None


class BackupSettingsUpdate(BaseModel):
    # An empty string switches back to the default folder. Length mirrors
    # BackupSettings.backup_folder's column (well above any real path).
    backup_folder: str | None = Field(default=None, max_length=500)
    auto_enabled: bool | None = None
    auto_interval_hours: int | None = Field(default=None, ge=1, le=720)
    keep_auto_count: int | None = Field(default=None, ge=1, le=365)


class BackupFileInfo(BaseModel):
    filename: str
    size_bytes: int
    created_at: datetime
    # manual | auto | pre-restore | legacy (plain .db from an older version) | unknown
    kind: str
    includes_uploads: bool
    upload_files: int
    schema_revision: str | None = None
    valid: bool


class RestoreRequest(BaseModel):
    # A bare filename, further validated (prefix + no path separators) in
    # services/backup.resolve_backup_file -- this cap just keeps an obviously
    # bogus value from reaching that check at all.
    filename: str = Field(max_length=255)
    confirm: bool = False


class RestoreResult(BaseModel):
    ok: bool
    safety_backup: str
    restored_uploads: bool
    message: str
