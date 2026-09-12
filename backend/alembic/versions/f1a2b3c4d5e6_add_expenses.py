"""add expenses table

New table only — nothing existing is touched, so this is trivially
data-preserving. Reuses the Step 1 unified employee record: expenses.
employee_id (nullable, only meaningful for type=salary) FKs to the same
`employees` table Attendance and Users already share, rather than a new
roster.

Revision ID: f1a2b3c4d5e6
Revises: e5f6a7b8c9d0
Create Date: 2026-09-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'expenses',
        sa.Column('business_id', sa.Integer(), nullable=False),
        sa.Column('type', sa.Enum('salary', 'overhead', 'company_expense', name='expensetype'), nullable=False),
        sa.Column('amount', sa.Numeric(12, 2), nullable=False),
        sa.Column('description', sa.String(length=1000), nullable=True),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('employee_id', sa.Integer(), nullable=True),
        sa.Column('attachment_path', sa.String(length=500), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id']),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_expenses_business_id', 'expenses', ['business_id'])
    op.create_index('ix_expenses_employee_id', 'expenses', ['employee_id'])


def downgrade() -> None:
    op.drop_index('ix_expenses_employee_id', table_name='expenses')
    op.drop_index('ix_expenses_business_id', table_name='expenses')
    op.drop_table('expenses')
