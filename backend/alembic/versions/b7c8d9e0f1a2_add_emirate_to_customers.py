"""add emirate to customers

Data-preserving: adds a single nullable column. No existing columns are
touched or dropped — address_line2/city/state/postal_code/country stay in
the table (removed from the UI only, per the client's request) so no
existing customer data is lost.

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f6
Create Date: 2026-09-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7c8d9e0f1a2'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMIRATES = (
    "Abu Dhabi",
    "Dubai",
    "Sharjah",
    "Ajman",
    "Umm Al Quwain",
    "Fujairah",
    "Ras Al Khaimah",
)


def upgrade() -> None:
    with op.batch_alter_table('customers', schema=None) as batch_op:
        batch_op.add_column(sa.Column('emirate', sa.Enum(*EMIRATES, name='emirate'), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('customers', schema=None) as batch_op:
        batch_op.drop_column('emirate')
