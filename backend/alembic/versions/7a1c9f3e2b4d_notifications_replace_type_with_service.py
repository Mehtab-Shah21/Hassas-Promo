"""notifications: replace notification_type reference with service reference

Preserves existing notification rows: adds the new service_id column and
drops type_id/notification_types only after the column exists, so no
notifications, reminders, or their history are lost. Existing rows simply
end up with service_id = NULL (there is no reliable type->service mapping),
which the API already treats as "no service set".

Revision ID: 7a1c9f3e2b4d
Revises: fd62a101e215
Create Date: 2026-08-31 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7a1c9f3e2b4d'
down_revision: Union[str, None] = 'fd62a101e215'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('notifications', schema=None) as batch_op:
        batch_op.add_column(sa.Column('service_id', sa.Integer(), nullable=True))
        batch_op.create_index(op.f('ix_notifications_service_id'), ['service_id'], unique=False)
        batch_op.create_foreign_key('fk_notifications_service_id_services', 'services', ['service_id'], ['id'])
        batch_op.drop_column('type_id')

    op.drop_table('notification_types')


def downgrade() -> None:
    # Best-effort only: notification_types content and each row's original
    # type assignment cannot be recovered, since that data was discarded on
    # upgrade by design (the type concept was removed by the client).
    op.create_table(
        'notification_types',
        sa.Column('business_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=150), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_notification_types_business_id'), 'notification_types', ['business_id'], unique=False)

    with op.batch_alter_table('notifications', schema=None) as batch_op:
        batch_op.add_column(sa.Column('type_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_notifications_type_id_notification_types', 'notification_types', ['type_id'], ['id'])
        batch_op.drop_constraint('fk_notifications_service_id_services', type_='foreignkey')
        batch_op.drop_index(op.f('ix_notifications_service_id'))
        batch_op.drop_column('service_id')
