"""employee documents: named, arbitrary-count file attachments

Emirates ID and passport already have their own dedicated columns on
Employee. This adds a place for anything else -- a license, a work permit, a
certificate -- as a name plus a file, with no limit on how many an employee
can have.

Revision ID: r3s4t5u6v7w8
Revises: q2r3s4t5u6v7
Create Date: 2026-09-22 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'r3s4t5u6v7w8'
down_revision: Union[str, None] = 'q2r3s4t5u6v7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'employee_documents',
        sa.Column('business_id', sa.Integer(), nullable=False),
        sa.Column('employee_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=150), nullable=False),
        sa.Column('file_path', sa.String(length=500), nullable=False),
        sa.Column('uploaded_by', sa.Integer(), nullable=True),
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['business_id'], ['businesses.id']),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.id']),
        sa.ForeignKeyConstraint(['uploaded_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_employee_documents_business_id'), 'employee_documents', ['business_id'])
    op.create_index(op.f('ix_employee_documents_employee_id'), 'employee_documents', ['employee_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_employee_documents_employee_id'), table_name='employee_documents')
    op.drop_index(op.f('ix_employee_documents_business_id'), table_name='employee_documents')
    op.drop_table('employee_documents')
