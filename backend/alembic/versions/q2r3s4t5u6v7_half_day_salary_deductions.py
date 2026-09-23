"""half-day attendance, salary pay day, and absence deductions

- recurring_expenses.pay_day: the day of the month a salary is paid (NULL =
  the last day of the month). It is when admins are alerted to confirm the
  month's absence deduction.
- salary_deductions: one row per salary payment that an admin has confirmed or
  waived a deduction for. No row means "not decided yet" -- the figure is
  computed live from attendance until then.
- attendance.status gains a "half_day" value. The column is a plain VARCHAR
  with no CHECK constraint (SQLite ignores the declared length), so existing
  rows and the table itself need no change.

Revision ID: q2r3s4t5u6v7
Revises: p1q2r3s4t5u6
Create Date: 2026-09-20 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'q2r3s4t5u6v7'
down_revision: Union[str, None] = 'p1q2r3s4t5u6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('recurring_expenses', sa.Column('pay_day', sa.Integer(), nullable=True))

    op.create_table(
        'salary_deductions',
        sa.Column('business_id', sa.Integer(), nullable=False),
        sa.Column('employee_id', sa.Integer(), nullable=False),
        sa.Column('expense_id', sa.Integer(), nullable=False),
        sa.Column('decision', sa.Enum('confirmed', 'waived', name='deductiondecision'), nullable=False),
        sa.Column('period_start', sa.Date(), nullable=False),
        sa.Column('period_end', sa.Date(), nullable=False),
        sa.Column('absent_days', sa.Integer(), nullable=False),
        sa.Column('half_days', sa.Integer(), nullable=False),
        sa.Column('deduction_days', sa.Numeric(6, 1), nullable=False),
        sa.Column('daily_rate', sa.Numeric(14, 4), nullable=False),
        sa.Column('gross_amount', sa.Numeric(12, 2), nullable=False),
        sa.Column('amount', sa.Numeric(12, 2), nullable=False),
        sa.Column('decided_by', sa.Integer(), nullable=False),
        sa.Column('decided_at', sa.DateTime(), nullable=False),
        sa.Column('note', sa.String(length=500), nullable=True),
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id']),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.id']),
        sa.ForeignKeyConstraint(['expense_id'], ['expenses.id']),
        sa.ForeignKeyConstraint(['decided_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('expense_id'),
    )
    op.create_index(op.f('ix_salary_deductions_business_id'), 'salary_deductions', ['business_id'])
    op.create_index(op.f('ix_salary_deductions_employee_id'), 'salary_deductions', ['employee_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_salary_deductions_employee_id'), table_name='salary_deductions')
    op.drop_index(op.f('ix_salary_deductions_business_id'), table_name='salary_deductions')
    op.drop_table('salary_deductions')
    with op.batch_alter_table('recurring_expenses') as batch:
        batch.drop_column('pay_day')
    # Nothing to undo for attendance: half_day rows are just strings.
    op.execute("UPDATE attendance SET status = 'present' WHERE status = 'half_day'")
