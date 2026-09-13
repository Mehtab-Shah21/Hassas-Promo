"""add business_id to users (per-company user isolation)

Adds a nullable business_id FK on users. Superadmin rows stay NULL (they
span every company); every other existing row is backfilled so no one is
left company-less. Enforcement of "non-superadmin must have a business_id"
lives in the application layer (schemas/routers), not a DB constraint,
because SQLite can't cheaply add a conditional NOT NULL after the fact.

Backfill rule, applied in order:
  1. A user linked to an employee (users.employee_id) inherits that
     employee's business_id — employees are already scoped per company,
     so this is the most reliable signal of which company the account
     actually belongs to.
  2. Any remaining non-superadmin user (no employee link) is assigned to
     the lowest-id business (the original/primary company on this
     install) — the safest default absent any other signal, since every
     pre-existing non-superadmin account in practice was already only
     ever used against that company.

Revision ID: g2h3i4j5k6l7
Revises: f1a2b3c4d5e6
Create Date: 2026-09-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'g2h3i4j5k6l7'
down_revision: Union[str, None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('business_id', sa.Integer(), nullable=True))
    op.create_index('ix_users_business_id', 'users', ['business_id'])
    with op.batch_alter_table('users') as batch_op:
        batch_op.create_foreign_key(
            'fk_users_business_id_businesses', 'businesses', ['business_id'], ['id']
        )

    bind = op.get_bind()

    users_t = sa.table(
        'users',
        sa.column('id', sa.Integer),
        sa.column('role', sa.String),
        sa.column('employee_id', sa.Integer),
        sa.column('business_id', sa.Integer),
    )
    employees_t = sa.table(
        'employees',
        sa.column('id', sa.Integer),
        sa.column('business_id', sa.Integer),
    )
    businesses_t = sa.table(
        'businesses',
        sa.column('id', sa.Integer),
    )

    default_business_id = bind.execute(
        sa.select(sa.func.min(businesses_t.c.id))
    ).scalar()

    non_superadmins = bind.execute(
        sa.select(users_t.c.id, users_t.c.employee_id).where(users_t.c.role != 'superadmin')
    ).fetchall()

    for user_id, employee_id in non_superadmins:
        target_business_id = default_business_id
        if employee_id is not None:
            emp_business_id = bind.execute(
                sa.select(employees_t.c.business_id).where(employees_t.c.id == employee_id)
            ).scalar()
            if emp_business_id is not None:
                target_business_id = emp_business_id
        if target_business_id is not None:
            bind.execute(
                users_t.update().where(users_t.c.id == user_id).values(business_id=target_business_id)
            )


def downgrade() -> None:
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_constraint('fk_users_business_id_businesses', type_='foreignkey')
    op.drop_index('ix_users_business_id', table_name='users')
    op.drop_column('users', 'business_id')
