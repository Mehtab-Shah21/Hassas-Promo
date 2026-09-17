"""add printed-banner coupons

A coupon can now be a "banner": instead of discounting the invoice, it prints
an uploaded image on it (e.g. a partner offer the customer redeems elsewhere).
  - coupons.kind: 'discount' (every existing row) or 'banner'
  - coupons.banner_path: the uploaded artwork for banner coupons
  - invoices.banner_coupon_id / invoices.banner_path: which banner an invoice
    printed, and a snapshot of its image so reprints never change

Additive and backward-compatible. banner_coupon_id is added as a plain integer
rather than with a DB-level foreign key: SQLite can't add a constrained column
without rebuilding the invoices table, and the model's ForeignKey already
documents the relationship for the ORM.

Revision ID: k6l7m8n9o0p1
Revises: j5k6l7m8n9o0
Create Date: 2026-09-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'k6l7m8n9o0p1'
down_revision: Union[str, None] = 'j5k6l7m8n9o0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('coupons', sa.Column('kind', sa.String(20), nullable=False, server_default='discount'))
    op.add_column('coupons', sa.Column('banner_path', sa.String(500), nullable=True))
    op.add_column('invoices', sa.Column('banner_coupon_id', sa.Integer(), nullable=True))
    op.add_column('invoices', sa.Column('banner_path', sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column('invoices', 'banner_path')
    op.drop_column('invoices', 'banner_coupon_id')
    op.drop_column('coupons', 'banner_path')
    op.drop_column('coupons', 'kind')
