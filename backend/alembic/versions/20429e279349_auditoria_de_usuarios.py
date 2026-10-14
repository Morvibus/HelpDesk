"""auditoria de usuarios

Revision ID: 20429e279349
Revises: 7d9423ec204c
Create Date: 2026-10-14 16:36:32.171484

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20429e279349'
down_revision: Union[str, Sequence[str], None] = '7d9423ec204c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Crea user_audit_log (guard: DB creada por create_all ya la tiene)."""
    if sa.inspect(op.get_bind()).has_table('user_audit_log'):
        return
    op.create_table('user_audit_log',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('action', sa.String(), nullable=False),
    sa.Column('changed_by', sa.Integer(), nullable=True),
    sa.Column('old_value', sa.String(), nullable=True),
    sa.Column('new_value', sa.String(), nullable=True),
    sa.Column('timestamp', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['changed_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_user_audit_log_id'), 'user_audit_log', ['id'], unique=False)


def downgrade() -> None:
    """Quita user_audit_log."""
    if not sa.inspect(op.get_bind()).has_table('user_audit_log'):
        return
    op.drop_index(op.f('ix_user_audit_log_id'), table_name='user_audit_log')
    op.drop_table('user_audit_log')
