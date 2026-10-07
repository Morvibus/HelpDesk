"""schema inicial

Revision ID: 4abf7e7a664b
Revises: 
Create Date: 2026-10-07 21:11:49.774572

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4abf7e7a664b'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    Guard por tabla: este proyecto usó `models.Base.metadata.create_all` hasta
    esta revisión, así que las DBs existentes (p. ej. `helpdesk_db`) ya tienen
    este schema sin versionar. Si la tabla ya existe se omite su creación y
    Alembic igualmente deja la DB en `head`. Las tablas nuevas (revisiones
    futuras) no necesitan guards.
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table('users'):
        op.create_table('users',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('email', sa.String(), nullable=False),
            sa.Column('password_hash', sa.String(), nullable=False),
            sa.Column('role', sa.Enum('employee', 'technician', 'admin', name='roleenum'), nullable=False),
            sa.Column('tier_level', sa.Integer(), nullable=True),
            sa.Column('is_active', sa.Boolean(), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
        op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)

    if not inspector.has_table('tickets'):
        op.create_table('tickets',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('title', sa.String(), nullable=False),
            sa.Column('description', sa.Text(), nullable=False),
            sa.Column('status', sa.Enum('created', 'assigned', 'in_process', 'solved', 'closed', name='statusenum'), nullable=False),
            sa.Column('priority', sa.Enum('low', 'medium', 'high', 'urgent', name='priorityenum'), nullable=False),
            sa.Column('created_by', sa.Integer(), nullable=False),
            sa.Column('assigned_to', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('closed_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['assigned_to'], ['users.id'], ),
            sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_tickets_id'), 'tickets', ['id'], unique=False)

    if not inspector.has_table('messages'):
        op.create_table('messages',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('ticket_id', sa.Integer(), nullable=False),
            sa.Column('sender_id', sa.Integer(), nullable=False),
            sa.Column('content', sa.Text(), nullable=True),
            sa.Column('image_url', sa.String(), nullable=True),
            sa.Column('is_private_note', sa.Boolean(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['sender_id'], ['users.id'], ),
            sa.ForeignKeyConstraint(['ticket_id'], ['tickets.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_messages_id'), 'messages', ['id'], unique=False)

    if not inspector.has_table('ticket_history'):
        op.create_table('ticket_history',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('ticket_id', sa.Integer(), nullable=False),
            sa.Column('action', sa.Enum('status_change', 'escalated', 'reopened', name='actionenum'), nullable=False),
            sa.Column('changed_by', sa.Integer(), nullable=False),
            sa.Column('old_value', sa.String(), nullable=True),
            sa.Column('new_value', sa.String(), nullable=True),
            sa.Column('timestamp', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['changed_by'], ['users.id'], ),
            sa.ForeignKeyConstraint(['ticket_id'], ['tickets.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_ticket_history_id'), 'ticket_history', ['id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_ticket_history_id'), table_name='ticket_history')
    op.drop_table('ticket_history')
    op.drop_index(op.f('ix_messages_id'), table_name='messages')
    op.drop_table('messages')
    op.drop_index(op.f('ix_tickets_id'), table_name='tickets')
    op.drop_table('tickets')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_table('users')
