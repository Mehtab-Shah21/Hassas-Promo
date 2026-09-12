"""unify employee record: base_salary + optional user<->employee link

Data-preserving: both new columns are nullable additions, nothing is
dropped or backfilled destructively. The Attendance module already
referenced this same `employees` table (Attendance.employee_id), so no
data migration between tables is needed here — this just extends the one
existing Employee record so Users and the future Expense module can share
it instead of each maintaining their own roster.

Revision ID: d1e2f3a4b5c6
Revises: c9d0e1f2a3b4
Create Date: 2026-09-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, None] = 'c9d0e1f2a3b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('employees', schema=None) as batch_op:
        batch_op.add_column(sa.Column('base_salary', sa.Numeric(12, 2), nullable=True))

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('employee_id', sa.Integer(), nullable=True))
        batch_op.create_index('ix_users_employee_id', ['employee_id'])
        batch_op.create_unique_constraint('uq_users_employee_id', ['employee_id'])
        batch_op.create_foreign_key('fk_users_employee_id', 'employees', ['employee_id'], ['id'])


def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_constraint('fk_users_employee_id', type_='foreignkey')
        batch_op.drop_constraint('uq_users_employee_id', type_='unique')
        batch_op.drop_index('ix_users_employee_id')
        batch_op.drop_column('employee_id')

    with op.batch_alter_table('employees', schema=None) as batch_op:
        batch_op.drop_column('base_salary')
