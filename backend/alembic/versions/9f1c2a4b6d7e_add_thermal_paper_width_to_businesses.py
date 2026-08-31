"""add thermal_paper_width to businesses

Data-preserving: adds a NOT NULL column with a server default, so existing
rows are backfilled to "80mm" in place rather than the table being
recreated.

Revision ID: 9f1c2a4b6d7e
Revises: 5d6e8f1a2b3c
Create Date: 2026-09-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9f1c2a4b6d7e'
down_revision: Union[str, None] = '5d6e8f1a2b3c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('businesses', schema=None) as batch_op:
        batch_op.add_column(sa.Column('thermal_paper_width', sa.String(length=10), nullable=False, server_default='80mm'))


def downgrade() -> None:
    with op.batch_alter_table('businesses', schema=None) as batch_op:
        batch_op.drop_column('thermal_paper_width')
