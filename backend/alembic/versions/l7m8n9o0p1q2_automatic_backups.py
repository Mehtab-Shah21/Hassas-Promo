"""automatic backups: schedule, retention and last-result tracking

Backups become useful for a desktop install:
  - auto_enabled / auto_interval_hours: the in-app scheduler (services/backup.py)
    backs up on its own, catching up shortly after startup if the PC was off
    when one was due. On by default — an install nobody configured should still
    be protected.
  - keep_auto_count: automatic backups beyond this many are pruned; manual and
    before-restore backups are never deleted automatically.
  - last_auto_backup_at drives the schedule; last_backup_at / status / error
    feed the status banner on Settings > Backup & Restore.

Revision ID: l7m8n9o0p1q2
Revises: k6l7m8n9o0p1
Create Date: 2026-09-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'l7m8n9o0p1q2'
down_revision: Union[str, None] = 'k6l7m8n9o0p1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('backup_settings', sa.Column('auto_enabled', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('backup_settings', sa.Column('auto_interval_hours', sa.Integer(), nullable=False, server_default='24'))
    op.add_column('backup_settings', sa.Column('keep_auto_count', sa.Integer(), nullable=False, server_default='14'))
    op.add_column('backup_settings', sa.Column('last_auto_backup_at', sa.DateTime(), nullable=True))
    op.add_column('backup_settings', sa.Column('last_backup_at', sa.DateTime(), nullable=True))
    op.add_column('backup_settings', sa.Column('last_backup_status', sa.String(20), nullable=True))
    op.add_column('backup_settings', sa.Column('last_backup_error', sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column('backup_settings', 'last_backup_error')
    op.drop_column('backup_settings', 'last_backup_status')
    op.drop_column('backup_settings', 'last_backup_at')
    op.drop_column('backup_settings', 'last_auto_backup_at')
    op.drop_column('backup_settings', 'keep_auto_count')
    op.drop_column('backup_settings', 'auto_interval_hours')
    op.drop_column('backup_settings', 'auto_enabled')
