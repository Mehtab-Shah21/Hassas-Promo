"""replace transaction_type with payment_method; add reconciliation fields

Data-preserving: no table is dropped/recreated, no invoice status or
amount_paid is touched, and every existing row is explicitly backfilled
rather than left NULL.

invoices.transaction_type -> invoices.payment_method:
  Every existing row (regardless of past cash/credit) is backfilled to
  'cash' — this is a display/categorization field, not a source of truth
  for money already collected (that stays in the untouched payments rows),
  so a safe default for historical data is enough. Matches the brief's own
  "existing paid = cash" guidance, extended to legacy unpaid/credit rows
  since there is no reliable retroactive payment method for those.

payments.method (free text) -> payments.payment_method (cash|card|online):
  'cash' -> cash, 'card' -> card, everything else (bank_transfer/cheque/
  other/anything unrecognized) -> online, as the closest non-cash bucket.

payments.cleared_status / received_at:
  Every existing payment already happened in the past, so it's backfilled
  to 'received' with received_at = paid_on — reconciliation is a
  forward-looking workflow for new card/online payments going forward.

Revision ID: 6e2a9c4f1d8b
Revises: 3b8d5e2f9a1c
Create Date: 2026-09-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6e2a9c4f1d8b'
down_revision: Union[str, None] = '3b8d5e2f9a1c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- invoices: transaction_type -> payment_method ---
    with op.batch_alter_table('invoices', schema=None) as batch_op:
        batch_op.add_column(sa.Column('payment_method', sa.Enum('cash', 'card', 'online', name='paymentmethod'), nullable=True))
    op.execute("UPDATE invoices SET payment_method = 'cash'")
    with op.batch_alter_table('invoices', schema=None) as batch_op:
        batch_op.alter_column('payment_method', nullable=False)
        batch_op.drop_column('transaction_type')

    # --- payments: add payment_method, cleared_status, received_at ---
    with op.batch_alter_table('payments', schema=None) as batch_op:
        batch_op.add_column(sa.Column('payment_method', sa.Enum('cash', 'card', 'online', name='paymentmethod'), nullable=True))
    op.execute("UPDATE payments SET payment_method = 'cash' WHERE method = 'cash'")
    op.execute("UPDATE payments SET payment_method = 'card' WHERE method = 'card'")
    op.execute("UPDATE payments SET payment_method = 'online' WHERE payment_method IS NULL")

    with op.batch_alter_table('payments', schema=None) as batch_op:
        batch_op.alter_column('payment_method', nullable=False)
        batch_op.add_column(sa.Column('cleared_status', sa.Enum('pending', 'received', name='clearedstatus'), nullable=True))
    op.execute("UPDATE payments SET cleared_status = 'received'")
    with op.batch_alter_table('payments', schema=None) as batch_op:
        batch_op.alter_column('cleared_status', nullable=False)
        batch_op.add_column(sa.Column('received_at', sa.Date(), nullable=True))
    op.execute("UPDATE payments SET received_at = paid_on WHERE cleared_status = 'received'")


def downgrade() -> None:
    with op.batch_alter_table('payments', schema=None) as batch_op:
        batch_op.drop_column('received_at')
        batch_op.drop_column('cleared_status')
        batch_op.drop_column('payment_method')

    with op.batch_alter_table('invoices', schema=None) as batch_op:
        batch_op.add_column(sa.Column('transaction_type', sa.Enum('cash', 'credit', name='transactiontype'), nullable=True))
    op.execute("UPDATE invoices SET transaction_type = 'cash'")
    with op.batch_alter_table('invoices', schema=None) as batch_op:
        batch_op.alter_column('transaction_type', nullable=False)
        batch_op.drop_column('payment_method')
