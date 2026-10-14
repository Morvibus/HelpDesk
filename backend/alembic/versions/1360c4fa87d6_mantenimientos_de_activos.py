"""mantenimientos de activos

Revision ID: 1360c4fa87d6
Revises: 37182e3d8804
Create Date: 2026-10-14 18:12:20.265869

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1360c4fa87d6'
down_revision: Union[str, Sequence[str], None] = '37182e3d8804'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Mantenimientos de activos (RF-09). Guard: una DB creada por create_all ya la trae."""
    if sa.inspect(op.get_bind()).has_table('maintenances'):
        return
    op.create_table('maintenances',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('asset_id', sa.Integer(), nullable=False),
    sa.Column('kind', sa.Enum('preventive', 'corrective', name='maintenancekindenum'), nullable=False),
    sa.Column('status', sa.Enum('scheduled', 'done', 'cancelled', name='maintenancestatusenum'), nullable=False),
    sa.Column('scheduled_for', sa.Date(), nullable=False),
    sa.Column('responsible_id', sa.Integer(), nullable=True),
    sa.Column('ticket_id', sa.Integer(), nullable=True),
    sa.Column('findings', sa.Text(), nullable=True),
    sa.Column('actions', sa.Text(), nullable=True),
    sa.Column('next_date', sa.Date(), nullable=True),
    sa.Column('completed_at', sa.DateTime(), nullable=True),
    sa.Column('created_by', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['asset_id'], ['assets.id'], ),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['responsible_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['ticket_id'], ['tickets.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_maintenances_asset_id'), 'maintenances', ['asset_id'], unique=False)
    op.create_index(op.f('ix_maintenances_id'), 'maintenances', ['id'], unique=False)


def downgrade() -> None:
    """Quita maintenances y sus tipos enum."""
    if not sa.inspect(op.get_bind()).has_table('maintenances'):
        return
    op.drop_index(op.f('ix_maintenances_id'), table_name='maintenances')
    op.drop_index(op.f('ix_maintenances_asset_id'), table_name='maintenances')
    op.drop_table('maintenances')
    op.execute("DROP TYPE IF EXISTS maintenancekindenum")
    op.execute("DROP TYPE IF EXISTS maintenancestatusenum")
