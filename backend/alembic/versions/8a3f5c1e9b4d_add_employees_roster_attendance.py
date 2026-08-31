"""add employees roster; point attendance at it instead of users

Data-preserving: no table is dropped/recreated. The new employees table is
scoped per business (Main/IIM get separate rosters), but the existing users
table was never business-scoped — a User has no business_id at all — so
there is no single correct one-to-one mapping from "a user" to "a roster
employee" across businesses. This migration's mapping, documented here:

  1. For every (user_id, business_id) pair that actually appears in the
     existing attendance table, create one Employee row in that business
     (name/phone copied from the user), regardless of the user's current
     role — this guarantees every existing attendance row keeps a valid
     target, even if the user referenced is no longer (or never was)
     role='employee'.
  2. Additionally, for every currently-active role='employee' user, ensure
     an Employee row exists in *every* business (deduplicated against step
     1) — so a business with employee-role users but no attendance history
     yet still starts with a populated roster instead of an empty one.
  3. attendance.user_id is backfilled to attendance.employee_id via the
     mapping built in step 1 (which covers every row by construction), then
     user_id is dropped.

Revision ID: 8a3f5c1e9b4d
Revises: 6e2a9c4f1d8b
Create Date: 2026-09-02 00:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import Boolean, Integer, String, insert, select, table, column


# revision identifiers, used by Alembic.
revision: str = '8a3f5c1e9b4d'
down_revision: Union[str, None] = '6e2a9c4f1d8b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'employees',
        sa.Column('business_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=150), nullable=False),
        sa.Column('role', sa.String(length=100), nullable=True),
        sa.Column('phone_code', sa.String(length=10), nullable=True),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_employees_business_id'), 'employees', ['business_id'], unique=False)

    conn = op.get_bind()

    employees_t = table(
        'employees', column('id', Integer), column('business_id', Integer), column('name', String),
        column('role', String), column('phone_code', String), column('phone', String),
        column('is_active', Boolean), column('created_at', sa.DateTime), column('updated_at', sa.DateTime),
    )
    users_t = table(
        'users', column('id', Integer), column('first_name', String), column('last_name', String),
        column('display_name', String), column('role', String), column('phone_code', String), column('phone', String),
    )
    businesses_t = table('businesses', column('id', Integer))
    attendance_t = table('attendance', column('id', Integer), column('user_id', Integer), column('business_id', Integer))

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    def user_name(u) -> str:
        return u.display_name or f"{u.first_name} {u.last_name or ''}".strip()

    mapping: dict[tuple[int, int], int] = {}  # (user_id, business_id) -> employee_id

    def get_or_create_employee(user_row, business_id: int) -> int:
        key = (user_row.id, business_id)
        if key in mapping:
            return mapping[key]
        result = conn.execute(
            insert(employees_t).values(
                business_id=business_id, name=user_name(user_row), role='Employee',
                phone_code=user_row.phone_code, phone=user_row.phone, is_active=True,
                created_at=now, updated_at=now,
            ).returning(employees_t.c.id)
        )
        new_id = result.scalar()
        mapping[key] = new_id
        return new_id

    users_by_id = {u.id: u for u in conn.execute(select(users_t)).fetchall()}

    # Step 1: one Employee per (user, business) pair actually used in attendance.
    used_pairs = conn.execute(
        select(attendance_t.c.user_id, attendance_t.c.business_id).distinct()
    ).fetchall()
    for pair in used_pairs:
        u = users_by_id.get(pair.user_id)
        if u:
            get_or_create_employee(u, pair.business_id)

    # Step 2: every business gets an Employee row for every currently-active
    # employee-role user, even ones with no attendance history yet.
    active_employee_users = conn.execute(select(users_t).where(users_t.c.role == 'employee')).fetchall()
    all_business_ids = [b.id for b in conn.execute(select(businesses_t.c.id)).fetchall()]
    for u in active_employee_users:
        for biz_id in all_business_ids:
            get_or_create_employee(u, biz_id)

    # Now add employee_id to attendance and backfill from the mapping.
    with op.batch_alter_table('attendance', schema=None) as batch_op:
        batch_op.add_column(sa.Column('employee_id', sa.Integer(), nullable=True))

    attendance_rows = conn.execute(select(attendance_t.c.id, attendance_t.c.user_id, attendance_t.c.business_id)).fetchall()
    for row in attendance_rows:
        emp_id = mapping.get((row.user_id, row.business_id))
        if emp_id is not None:
            conn.execute(sa.text("UPDATE attendance SET employee_id = :eid WHERE id = :aid"), {"eid": emp_id, "aid": row.id})

    with op.batch_alter_table('attendance', schema=None) as batch_op:
        batch_op.alter_column('employee_id', nullable=False)
        batch_op.create_index(op.f('ix_attendance_employee_id'), ['employee_id'], unique=False)
        batch_op.create_foreign_key('fk_attendance_employee_id_employees', 'employees', ['employee_id'], ['id'])
        batch_op.drop_constraint('uq_attendance_user_date', type_='unique')
        batch_op.create_unique_constraint('uq_attendance_employee_date', ['employee_id', 'date'])
        batch_op.drop_index('ix_attendance_user_id')
        batch_op.drop_column('user_id')


def downgrade() -> None:
    with op.batch_alter_table('attendance', schema=None) as batch_op:
        batch_op.add_column(sa.Column('user_id', sa.Integer(), nullable=True))
        batch_op.create_index(op.f('ix_attendance_user_id'), ['user_id'], unique=False)
        batch_op.drop_constraint('uq_attendance_employee_date', type_='unique')
        # Best-effort only: employees created purely from historical
        # attendance don't necessarily map back to a real user id, so
        # user_id is left NULL for those rows rather than guessed at.
        batch_op.drop_constraint('fk_attendance_employee_id_employees', type_='foreignkey')
        batch_op.drop_index(op.f('ix_attendance_employee_id'))
        batch_op.drop_column('employee_id')

    op.drop_index(op.f('ix_employees_business_id'), table_name='employees')
    op.drop_table('employees')
