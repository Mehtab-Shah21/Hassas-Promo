"""add discount_pct to invoice_items and quotation_items

Line discounts are now entered as a percentage of the line's gross
(qty * unit_price) rather than as a currency amount. The percentage the user
typed is stored in discount_pct; the resulting amount stays in the existing
discount column, because every total, report and PDF template already works
off the amount.

Additive and backward-compatible: the new column defaults to 0, so rows
created before this change keep their discount amount and simply report 0%.
No backfill — an old amount-based discount has no meaningful percentage
attached to it, and recomputing one would imply the row was entered that way.

Revision ID: i4j5k6l7m8n9
Revises: h3i4j5k6l7m8
Create Date: 2026-09-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'i4j5k6l7m8n9'
down_revision: Union[str, None] = 'h3i4j5k6l7m8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('invoice_items', sa.Column('discount_pct', sa.Numeric(5, 2), nullable=False, server_default='0'))
    op.add_column('quotation_items', sa.Column('discount_pct', sa.Numeric(5, 2), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('quotation_items', 'discount_pct')
    op.drop_column('invoice_items', 'discount_pct')
