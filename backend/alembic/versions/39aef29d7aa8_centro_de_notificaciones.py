"""centro de notificaciones

Revision ID: 39aef29d7aa8
Revises: e41eb1bbbe1a
Create Date: 2026-10-20 16:26:47.457834

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '39aef29d7aa8'
down_revision: Union[str, Sequence[str], None] = 'e41eb1bbbe1a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Centro de notificaciones: avisos guardados por destinatario (30 días). Guard: create_all ya la trae."""
    if sa.inspect(op.get_bind()).has_table('notifications'):
        return
    op.create_table('notifications',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(), nullable=False),
    sa.Column('message', sa.Text(), nullable=True),
    sa.Column('icon', sa.String(), nullable=True),
    sa.Column('sound', sa.String(), nullable=True),
    sa.Column('link', sa.String(), nullable=True),
    sa.Column('read_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_notifications_created_at'), 'notifications', ['created_at'], unique=False)
    op.create_index(op.f('ix_notifications_id'), 'notifications', ['id'], unique=False)
    op.create_index(op.f('ix_notifications_user_id'), 'notifications', ['user_id'], unique=False)


def downgrade() -> None:
    """Quita notifications (los avisos guardados se pierden; el historial real vive en tickets/accesos)."""
    if not sa.inspect(op.get_bind()).has_table('notifications'):
        return
    op.drop_index(op.f('ix_notifications_user_id'), table_name='notifications')
    op.drop_index(op.f('ix_notifications_id'), table_name='notifications')
    op.drop_index(op.f('ix_notifications_created_at'), table_name='notifications')
    op.drop_table('notifications')
