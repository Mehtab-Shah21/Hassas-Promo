"""add bank_fee/edrh_fee/trans_no/inv_no to line items and services, custom_invoice_template on businesses

HASSAS's exact invoice/quotation template breaks out Gov Fee, Bank Fee, and
E-Drh (E-Dirham) Fee as separate per-line columns, plus free-text Trans No./
Inv No. reference fields. Adds:
  - services: bank_fee, edrh_fee (configurable per-service defaults, mirrors
    the existing govt_fee)
  - invoice_items / quotation_items: bank_fee, edrh_fee, trans_no, inv_no
  - invoices / quotations: bank_fee_total, edrh_fee_total (aggregate columns,
    mirrors govt_fee_total)
  - businesses: custom_invoice_template — selects a fixed exact-replica PDF
    template (see services/pdf.py) instead of the configurable Design Studio
    system, for businesses whose documents must match a fixed client design.

All new numeric columns default to 0 and all new text columns are nullable,
so this is a pure additive, backward-compatible change — no backfill needed.

Revision ID: h3i4j5k6l7m8
Revises: g2h3i4j5k6l7
Create Date: 2026-09-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'h3i4j5k6l7m8'
down_revision: Union[str, None] = 'g2h3i4j5k6l7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('services', sa.Column('bank_fee', sa.Numeric(12, 2), nullable=False, server_default='0'))
    op.add_column('services', sa.Column('edrh_fee', sa.Numeric(12, 2), nullable=False, server_default='0'))

    op.add_column('invoice_items', sa.Column('bank_fee', sa.Numeric(12, 2), nullable=False, server_default='0'))
    op.add_column('invoice_items', sa.Column('edrh_fee', sa.Numeric(12, 2), nullable=False, server_default='0'))
    op.add_column('invoice_items', sa.Column('trans_no', sa.String(100), nullable=True))
    op.add_column('invoice_items', sa.Column('inv_no', sa.String(100), nullable=True))
    op.add_column('invoices', sa.Column('bank_fee_total', sa.Numeric(12, 2), nullable=False, server_default='0'))
    op.add_column('invoices', sa.Column('edrh_fee_total', sa.Numeric(12, 2), nullable=False, server_default='0'))

    op.add_column('quotation_items', sa.Column('bank_fee', sa.Numeric(12, 2), nullable=False, server_default='0'))
    op.add_column('quotation_items', sa.Column('edrh_fee', sa.Numeric(12, 2), nullable=False, server_default='0'))
    op.add_column('quotation_items', sa.Column('trans_no', sa.String(100), nullable=True))
    op.add_column('quotation_items', sa.Column('inv_no', sa.String(100), nullable=True))
    op.add_column('quotations', sa.Column('bank_fee_total', sa.Numeric(12, 2), nullable=False, server_default='0'))
    op.add_column('quotations', sa.Column('edrh_fee_total', sa.Numeric(12, 2), nullable=False, server_default='0'))

    op.add_column('businesses', sa.Column('custom_invoice_template', sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column('businesses', 'custom_invoice_template')

    op.drop_column('quotations', 'edrh_fee_total')
    op.drop_column('quotations', 'bank_fee_total')
    op.drop_column('quotation_items', 'inv_no')
    op.drop_column('quotation_items', 'trans_no')
    op.drop_column('quotation_items', 'edrh_fee')
    op.drop_column('quotation_items', 'bank_fee')

    op.drop_column('invoices', 'edrh_fee_total')
    op.drop_column('invoices', 'bank_fee_total')
    op.drop_column('invoice_items', 'inv_no')
    op.drop_column('invoice_items', 'trans_no')
    op.drop_column('invoice_items', 'edrh_fee')
    op.drop_column('invoice_items', 'bank_fee')

    op.drop_column('services', 'edrh_fee')
    op.drop_column('services', 'bank_fee')
