"""attendance check-in/check-out times, employee email

- attendance gains check_in / check_out (wall-clock times on the attendance
  date), so the office records when someone arrived and when they left, not
  just whether they were present.
- employees gain an optional email.

Both are nullable, so every existing row stays valid as-is.

Revision ID: o0p1q2r3s4t5
Revises: n9o0p1q2r3s4
Create Date: 2026-09-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'o0p1q2r3s4t5'
down_revision: Union[str, None] = 'n9o0p1q2r3s4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('attendance', sa.Column('check_in', sa.Time(), nullable=True))
    op.add_column('attendance', sa.Column('check_out', sa.Time(), nullable=True))
    op.add_column('employees', sa.Column('email', sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column('employees', 'email')
    op.drop_column('attendance', 'check_out')
    op.drop_column('attendance', 'check_in')
