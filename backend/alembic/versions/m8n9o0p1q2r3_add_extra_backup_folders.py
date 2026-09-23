"""add extra_backup_folders for mirroring backups to multiple destinations

Lets a backup also be copied into additional folders at once -- e.g. a
second internal/external drive, or a folder that's synced by the Google
Drive / OneDrive desktop app, so "back up to Google Drive" works without
any API integration. Stored as a JSON-encoded list of paths; the existing
backup_folder stays the single primary folder that restore and the
"backups in this folder" list read from.

Revision ID: m8n9o0p1q2r3
Revises: l7m8n9o0p1q2
Create Date: 2026-09-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'm8n9o0p1q2r3'
down_revision: Union[str, None] = 'l7m8n9o0p1q2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('backup_settings', sa.Column('extra_backup_folders', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('backup_settings', 'extra_backup_folders')
