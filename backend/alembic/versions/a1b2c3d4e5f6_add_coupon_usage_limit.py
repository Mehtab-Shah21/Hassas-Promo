"""add max_uses/times_used to coupons

Data-preserving: adds two nullable/defaulted columns, so existing rows are
backfilled in place (max_uses=NULL meaning unlimited, times_used=0) rather
than the table being recreated.

Revision ID: a1b2c3d4e5f6
Revises: 8a3f5c1e9b4d
Create Date: 2026-09-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '8a3f5c1e9b4d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('coupons', schema=None) as batch_op:
        batch_op.add_column(sa.Column('max_uses', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('times_used', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    with op.batch_alter_table('coupons', schema=None) as batch_op:
        batch_op.drop_column('times_used')
        batch_op.drop_column('max_uses')
