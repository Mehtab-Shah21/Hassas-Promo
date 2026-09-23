"""recurring fixed costs, employee ID documents, superadmin recovery code

Three features in one revision because they ship together:

1. recurring_expenses -- a salary/overhead defined once that the system turns
   into a real expense every month (services/recurring_expenses.py). Expenses
   gain recurring_expense_id (which definition produced this row, and the
   idempotency key for generation) plus is_paid/paid_on, so "generated but
   not yet paid" is a real state the dashboard and employee salary status
   can report on.
2. employees gain Emirates ID / passport numbers and an uploaded scan path
   for each.
3. users gain recovery_code_hash, so a superadmin -- who has nobody above
   them to reset their password -- can recover their own account.

Existing expense rows are backfilled is_paid=1: everything recorded before
this change was entered after the money went out, so treating it as paid
keeps every historical total exactly as it reads today.

Revision ID: n9o0p1q2r3s4
Revises: m8n9o0p1q2r3
Create Date: 2026-09-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'n9o0p1q2r3s4'
down_revision: Union[str, None] = 'm8n9o0p1q2r3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'recurring_expenses',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('business_id', sa.Integer(), nullable=False),
        sa.Column('type', sa.Enum('salary', 'overhead', 'company_expense', name='expensetype'), nullable=False),
        sa.Column('label', sa.String(length=200), nullable=False),
        sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('employee_id', sa.Integer(), nullable=True),
        sa.Column('day_of_month', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('start_month', sa.Date(), nullable=False),
        sa.Column('end_month', sa.Date(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id']),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_recurring_expenses_business_id', 'recurring_expenses', ['business_id'])
    op.create_index('ix_recurring_expenses_employee_id', 'recurring_expenses', ['employee_id'])

    op.add_column('expenses', sa.Column('recurring_expense_id', sa.Integer(), nullable=True))
    op.create_index('ix_expenses_recurring_expense_id', 'expenses', ['recurring_expense_id'])
    op.add_column('expenses', sa.Column('is_paid', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('expenses', sa.Column('paid_on', sa.Date(), nullable=True))

    op.add_column('employees', sa.Column('emirates_id', sa.String(length=50), nullable=True))
    op.add_column('employees', sa.Column('emirates_id_attachment_path', sa.String(length=500), nullable=True))
    op.add_column('employees', sa.Column('passport_no', sa.String(length=50), nullable=True))
    op.add_column('employees', sa.Column('passport_attachment_path', sa.String(length=500), nullable=True))

    op.add_column('users', sa.Column('recovery_code_hash', sa.String(length=255), nullable=True))

    # Drop the install-wide "iim" switch that could hide the IIM company
    # entirely from Settings > Modules. Turning off a whole company (and with
    # it every invoice, customer and report belonging to it) is not something
    # to leave one click away on a settings page.
    op.execute("DELETE FROM feature_flags WHERE key = 'iim' AND business_id IS NULL")


def downgrade() -> None:
    op.drop_column('users', 'recovery_code_hash')

    op.drop_column('employees', 'passport_attachment_path')
    op.drop_column('employees', 'passport_no')
    op.drop_column('employees', 'emirates_id_attachment_path')
    op.drop_column('employees', 'emirates_id')

    op.drop_column('expenses', 'paid_on')
    op.drop_column('expenses', 'is_paid')
    op.drop_index('ix_expenses_recurring_expense_id', table_name='expenses')
    op.drop_column('expenses', 'recurring_expense_id')

    op.drop_index('ix_recurring_expenses_employee_id', table_name='recurring_expenses')
    op.drop_index('ix_recurring_expenses_business_id', table_name='recurring_expenses')
    op.drop_table('recurring_expenses')
