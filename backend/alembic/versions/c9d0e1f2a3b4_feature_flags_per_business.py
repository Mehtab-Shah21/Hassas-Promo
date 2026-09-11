"""feature flags become per-business

Data-preserving: adds a nullable business_id column and migrates each
existing module flag (coupons/notifications/attendance/design_studio) from
one global row into one row per existing business, carrying over its
current `enabled` value for every business (so behavior is unchanged
immediately after migrating — Main and IIM simply both start from what the
flag used to be, and can be toggled independently from then on). The
global row is removed only after its value has been copied to every
business. "iim" stays a single global row (business_id NULL) — it's not a
per-business module, it's whether the IIM business exists at all.

Also seeds the three newly-toggleable modules (quotations, reconciliation,
reports) as enabled=True per business, since that's the current (pre-flag)
behavior — nothing changes for existing installs until an admin flips one.

Revision ID: c9d0e1f2a3b4
Revises: b7c8d9e0f1a2
Create Date: 2026-09-12 00:00:00.000000

"""
from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9d0e1f2a3b4'
down_revision: Union[str, None] = 'b7c8d9e0f1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Keys that become per-business (fanned out from their existing global row).
PER_BUSINESS_KEYS = ["coupons", "notifications", "attendance", "design_studio"]
# Newly-toggleable modules with no prior row at all — seeded enabled.
NEW_KEYS = [
    ("quotations", "Quotations"),
    ("reconciliation", "Reconciliation"),
    ("reports", "Reports"),
]


def upgrade() -> None:
    with op.batch_alter_table('feature_flags', schema=None) as batch_op:
        batch_op.drop_index('ix_feature_flags_key')
        batch_op.add_column(sa.Column('business_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            'fk_feature_flags_business_id', 'businesses', ['business_id'], ['id']
        )
        batch_op.create_index('ix_feature_flags_key', ['key'])
        batch_op.create_unique_constraint('uq_feature_flags_business_key', ['business_id', 'key'])

    bind = op.get_bind()
    now = datetime.now(timezone.utc)
    businesses_t = sa.table('businesses', sa.column('id', sa.Integer))
    flags_t = sa.table(
        'feature_flags',
        sa.column('id', sa.Integer),
        sa.column('business_id', sa.Integer),
        sa.column('key', sa.String),
        sa.column('enabled', sa.Boolean),
        sa.column('label', sa.String),
        sa.column('created_at', sa.DateTime),
        sa.column('updated_at', sa.DateTime),
    )

    business_ids = [row[0] for row in bind.execute(sa.select(businesses_t.c.id)).all()]

    for key in PER_BUSINESS_KEYS:
        existing = bind.execute(
            sa.select(flags_t.c.id, flags_t.c.enabled, flags_t.c.label)
            .where(flags_t.c.key == key, flags_t.c.business_id.is_(None))
        ).first()
        if existing is None:
            continue
        _, enabled, label = existing
        for business_id in business_ids:
            bind.execute(
                flags_t.insert().values(
                    business_id=business_id, key=key, enabled=enabled, label=label,
                    created_at=now, updated_at=now,
                )
            )
        bind.execute(flags_t.delete().where(flags_t.c.key == key, flags_t.c.business_id.is_(None)))

    for key, label in NEW_KEYS:
        for business_id in business_ids:
            bind.execute(
                flags_t.insert().values(
                    business_id=business_id, key=key, enabled=True, label=label,
                    created_at=now, updated_at=now,
                )
            )


def downgrade() -> None:
    bind = op.get_bind()
    now = datetime.now(timezone.utc)
    flags_t = sa.table(
        'feature_flags',
        sa.column('id', sa.Integer),
        sa.column('business_id', sa.Integer),
        sa.column('key', sa.String),
        sa.column('enabled', sa.Boolean),
        sa.column('label', sa.String),
        sa.column('created_at', sa.DateTime),
        sa.column('updated_at', sa.DateTime),
    )
    # Collapse each per-business key back to a single global row (enabled
    # if it was enabled for ANY business, matching the pre-migration "one
    # switch for everyone" semantics as closely as a lossy downgrade can).
    for key in PER_BUSINESS_KEYS:
        rows = bind.execute(
            sa.select(flags_t.c.enabled, flags_t.c.label).where(flags_t.c.key == key)
        ).all()
        if not rows:
            continue
        enabled = any(r[0] for r in rows)
        label = rows[0][1]
        bind.execute(flags_t.delete().where(flags_t.c.key == key))
        bind.execute(
            flags_t.insert().values(
                business_id=None, key=key, enabled=enabled, label=label,
                created_at=now, updated_at=now,
            )
        )
    for key, _label in NEW_KEYS:
        bind.execute(flags_t.delete().where(flags_t.c.key == key))

    with op.batch_alter_table('feature_flags', schema=None) as batch_op:
        batch_op.drop_constraint('uq_feature_flags_business_key', type_='unique')
        batch_op.drop_index('ix_feature_flags_key')
        batch_op.drop_constraint('fk_feature_flags_business_id', type_='foreignkey')
        batch_op.drop_column('business_id')
        batch_op.create_index('ix_feature_flags_key', ['key'], unique=True)
