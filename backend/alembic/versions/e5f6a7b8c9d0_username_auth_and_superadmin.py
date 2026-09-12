"""switch login identity from email to username; add superadmin role

Data-preserving: username starts nullable, gets backfilled for every
existing user from their email's local-part (deduplicated with a numeric
suffix if two emails collide on that part), and is only made NOT
NULL/unique once every row has a value — so no existing account is ever
without a username, and no login is lost. email is relaxed to nullable
(kept as an optional record field, no longer the login identifier) rather
than dropped, so existing email data is preserved. The `role` column is
widened to fit "superadmin" alongside the existing admin/employee values.

Every existing 'admin' row is also promoted to 'superadmin': before this
migration there was only one privileged tier, so whoever held it already
had full authority — carrying that forward as the new top tier (rather
than downgrading them to the now-more-restricted 'admin') avoids an
install ending up with zero superadmins and nobody able to create one
(the Users module requires superadmin to create admin/superadmin
accounts). No existing capability is lost; installs can rebalance roles
afterward via the Users module if they want a two-tier split.

Revision ID: e5f6a7b8c9d0
Revises: d1e2f3a4b5c6
Create Date: 2026-09-12 00:00:01.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd1e2f3a4b5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column('role', existing_type=sa.String(length=8), type_=sa.String(length=10))
        batch_op.alter_column('email', existing_type=sa.String(length=255), nullable=True)
        batch_op.add_column(sa.Column('username', sa.String(length=50), nullable=True))

    bind = op.get_bind()
    users_t = sa.table(
        'users',
        sa.column('id', sa.Integer),
        sa.column('email', sa.String),
        sa.column('username', sa.String),
        sa.column('role', sa.String),
    )
    rows = bind.execute(sa.select(users_t.c.id, users_t.c.email)).all()

    seen: set[str] = set()
    for user_id, email in rows:
        base = (email.split('@')[0] if email else f"user{user_id}").lower()
        base = ''.join(c for c in base if c.isalnum() or c in ('.', '_', '-')) or f"user{user_id}"
        candidate = base
        suffix = 1
        while candidate in seen:
            suffix += 1
            candidate = f"{base}{suffix}"
        seen.add(candidate)
        bind.execute(users_t.update().where(users_t.c.id == user_id).values(username=candidate))

    bind.execute(users_t.update().where(users_t.c.role == 'admin').values(role='superadmin'))

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column('username', existing_type=sa.String(length=50), nullable=False)
        batch_op.create_index('ix_users_username', ['username'])
        batch_op.create_unique_constraint('uq_users_username', ['username'])


def downgrade() -> None:
    bind = op.get_bind()
    users_t = sa.table('users', sa.column('role', sa.String))
    # Best-effort: collapses superadmin back into admin. Any role changes
    # made via the Users module after upgrading are not otherwise
    # reversible by this downgrade.
    bind.execute(users_t.update().where(users_t.c.role == 'superadmin').values(role='admin'))

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_constraint('uq_users_username', type_='unique')
        batch_op.drop_index('ix_users_username')
        batch_op.drop_column('username')
        batch_op.alter_column('email', existing_type=sa.String(length=255), nullable=False)
        batch_op.alter_column('role', existing_type=sa.String(length=10), type_=sa.String(length=8))
