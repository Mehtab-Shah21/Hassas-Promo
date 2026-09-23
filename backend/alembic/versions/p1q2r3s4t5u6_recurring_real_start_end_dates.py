"""fixed monthly costs: real start/end dates instead of whole months

recurring_expenses.start_month / end_month held the 1st of a month, so a cost
could only begin and end on month boundaries. They become start_date /
end_date, which can be any day: a cost starting on the 15th is charged for the
15th through month-end in its first month (prorated by the actual length of
that month), then in full from the 1st, and an end date mid-month prorates the
last month the same way.

Existing rows keep their exact meaning:
  - start_month (a 1st) is already a valid start_date: the first month stays a
    full month.
  - end_month meant "the last month, in full", so it becomes the LAST DAY of
    that month, not the 1st -- otherwise every existing end date would suddenly
    prorate its final month down to a single day.

Revision ID: p1q2r3s4t5u6
Revises: o0p1q2r3s4t5
Create Date: 2026-09-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'p1q2r3s4t5u6'
down_revision: Union[str, None] = 'o0p1q2r3s4t5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('recurring_expenses') as batch:
        batch.alter_column('start_month', new_column_name='start_date')
        batch.alter_column('end_month', new_column_name='end_date')

    # last day of the stored month: first of next month, minus one day
    op.execute(
        "UPDATE recurring_expenses "
        "SET end_date = date(end_date, 'start of month', '+1 month', '-1 day') "
        "WHERE end_date IS NOT NULL"
    )


def downgrade() -> None:
    # Back to whole months: snap both to the 1st of their month.
    op.execute("UPDATE recurring_expenses SET start_date = date(start_date, 'start of month')")
    op.execute(
        "UPDATE recurring_expenses SET end_date = date(end_date, 'start of month') WHERE end_date IS NOT NULL"
    )
    with op.batch_alter_table('recurring_expenses') as batch:
        batch.alter_column('start_date', new_column_name='start_month')
        batch.alter_column('end_date', new_column_name='end_month')
