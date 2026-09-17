"""add is_system_owner to users

The software vendor's own account (MS_Software_Solutions) sits above every
client account: it creates the client's first superadmin and is the only
account that can reset a superadmin's password. It stays role=superadmin so
every existing permission check keeps working; this flag adds the extra tier
and hides the account from everyone else (see routers/users.py).

Marks the existing vendor account by username. Every other row defaults to
false.

Revision ID: j5k6l7m8n9o0
Revises: i4j5k6l7m8n9
Create Date: 2026-09-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'j5k6l7m8n9o0'
down_revision: Union[str, None] = 'i4j5k6l7m8n9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('is_system_owner', sa.Boolean(), nullable=False, server_default=sa.false()))
    users = sa.table('users', sa.column('username', sa.String), sa.column('is_system_owner', sa.Boolean))
    op.execute(users.update().where(users.c.username == 'MS_Software_Solutions').values(is_system_owner=True))


def downgrade() -> None:
    op.drop_column('users', 'is_system_owner')
