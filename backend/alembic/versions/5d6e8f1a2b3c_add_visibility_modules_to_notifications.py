"""add visibility_modules to notifications

Data-preserving: adds a nullable JSON column, existing rows are unaffected
and are treated as "no modules selected" by the API.

Revision ID: 5d6e8f1a2b3c
Revises: 7a1c9f3e2b4d
Create Date: 2026-08-31 00:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5d6e8f1a2b3c'
down_revision: Union[str, None] = '7a1c9f3e2b4d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('notifications', schema=None) as batch_op:
        batch_op.add_column(sa.Column('visibility_modules', sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('notifications', schema=None) as batch_op:
        batch_op.drop_column('visibility_modules')
