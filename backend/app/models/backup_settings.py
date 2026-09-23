from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.mixins import TimestampMixin


class BackupSettings(TimestampMixin, Base):
    """A single global row (per-install, like feature_flags) holding where
    backups get written and how the automatic schedule behaves. Not
    business-scoped — one admin PC, one DB, one backup folder."""

    __tablename__ = "backup_settings"

    # NULL means the default folder next to the database (see
    # services/backup.default_backup_folder), so a fresh install is protected
    # without anyone configuring anything.
    backup_folder: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # JSON-encoded list of additional folder paths a backup is also copied
    # into (e.g. a second drive, or a locally-synced Google Drive/OneDrive
    # folder) -- the primary backup_folder above is still the one restore
    # and "backups in this folder" read from; these are mirror-only copies.
    extra_backup_folders: Mapped[str | None] = mapped_column(Text, nullable=True)
    auto_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    auto_interval_hours: Mapped[int] = mapped_column(Integer, default=24, nullable=False)
    # Only automatic backups are pruned to this count; manual and
    # before-restore backups are never deleted automatically.
    keep_auto_count: Mapped[int] = mapped_column(Integer, default=14, nullable=False)
    last_auto_backup_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_backup_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_backup_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    last_backup_error: Mapped[str | None] = mapped_column(String(500), nullable=True)
