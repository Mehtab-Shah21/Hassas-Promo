"""add thermal_template_config to businesses

Data-preserving: adds a nullable JSON column (the app already treats a NULL
value as "use DEFAULT_THERMAL_CONFIG", same pattern as the existing
template_config column), so existing rows are unaffected.

Revision ID: 3b8d5e2f9a1c
Revises: 9f1c2a4b6d7e
Create Date: 2026-09-01 00:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3b8d5e2f9a1c'
down_revision: Union[str, None] = '9f1c2a4b6d7e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('businesses', schema=None) as batch_op:
        batch_op.add_column(sa.Column('thermal_template_config', sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('businesses', schema=None) as batch_op:
        batch_op.drop_column('thermal_template_config')
