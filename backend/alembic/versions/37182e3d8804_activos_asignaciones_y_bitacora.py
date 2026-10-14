"""activos asignaciones y bitacora

Revision ID: 37182e3d8804
Revises: 74788f3d22d1
Create Date: 2026-10-14 17:57:27.983109

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '37182e3d8804'
down_revision: Union[str, Sequence[str], None] = '74788f3d22d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Copia fija (las migraciones no importan models)
TIPOS = [
    ("computer", "Computadora"), ("monitor", "Monitor"), ("printer", "Impresora"), ("ups", "UPS"),
    ("network", "Equipo de red"), ("camera", "Cámara"), ("mobile", "Dispositivo móvil"), ("other", "Otro"),
]


def upgrade() -> None:
    """Activos (RF-06/07/08): tipos, inventario, asignaciones, bitácora y tickets.asset_id.

    Guards: una DB creada por create_all ya trae estas tablas (se crean siempre juntas).
    """
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table('tickets'):
        return
    op.execute("ALTER TYPE actionenum ADD VALUE IF NOT EXISTS 'asset_linked'")
    if insp.has_table('assets'):
        return

    tipos = op.create_table('asset_types',
    sa.Column('key', sa.String(), nullable=False),
    sa.Column('name', sa.String(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.PrimaryKeyConstraint('key'),
    sa.UniqueConstraint('name')
    )
    op.bulk_insert(tipos, [{"key": k, "name": n, "is_active": True} for k, n in TIPOS])
    op.create_table('assets',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('tag', sa.String(), nullable=False),
    sa.Column('asset_type', sa.String(), nullable=False),
    sa.Column('brand', sa.String(), nullable=True),
    sa.Column('model', sa.String(), nullable=True),
    sa.Column('serial', sa.String(), nullable=True),
    sa.Column('status', sa.Enum('active', 'in_repair', 'retired', name='assetstatusenum'), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['asset_type'], ['asset_types.key'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('tag')
    )
    op.create_index(op.f('ix_assets_id'), 'assets', ['id'], unique=False)
    op.create_table('asset_assignments',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('asset_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('department_id', sa.Integer(), nullable=True),
    sa.Column('location', sa.String(), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('assigned_by', sa.Integer(), nullable=False),
    sa.Column('assigned_at', sa.DateTime(), nullable=True),
    sa.Column('returned_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['asset_id'], ['assets.id'], ),
    sa.ForeignKeyConstraint(['assigned_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['department_id'], ['departments.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_asset_assignments_asset_id'), 'asset_assignments', ['asset_id'], unique=False)
    op.create_index(op.f('ix_asset_assignments_id'), 'asset_assignments', ['id'], unique=False)
    op.create_table('asset_events',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('asset_id', sa.Integer(), nullable=False),
    sa.Column('action', sa.String(), nullable=False),
    sa.Column('old_value', sa.String(), nullable=True),
    sa.Column('new_value', sa.String(), nullable=True),
    sa.Column('comment', sa.Text(), nullable=True),
    sa.Column('changed_by', sa.Integer(), nullable=False),
    sa.Column('timestamp', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['asset_id'], ['assets.id'], ),
    sa.ForeignKeyConstraint(['changed_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_asset_events_asset_id'), 'asset_events', ['asset_id'], unique=False)
    op.create_index(op.f('ix_asset_events_id'), 'asset_events', ['id'], unique=False)
    op.add_column('tickets', sa.Column('asset_id', sa.Integer(), nullable=True))
    op.create_foreign_key('tickets_asset_id_fkey', 'tickets', 'assets', ['asset_id'], ['id'])


def downgrade() -> None:
    """Quita activos y tickets.asset_id. El valor 'asset_linked' de actionenum se deja
    (Postgres no borra valores de enum); sus filas de historial se eliminan."""
    if not sa.inspect(op.get_bind()).has_table('assets'):
        return
    op.execute("DELETE FROM ticket_history WHERE action = 'asset_linked'")
    op.drop_constraint('tickets_asset_id_fkey', 'tickets', type_='foreignkey')
    op.drop_column('tickets', 'asset_id')
    op.drop_index(op.f('ix_asset_events_id'), table_name='asset_events')
    op.drop_index(op.f('ix_asset_events_asset_id'), table_name='asset_events')
    op.drop_table('asset_events')
    op.drop_index(op.f('ix_asset_assignments_id'), table_name='asset_assignments')
    op.drop_index(op.f('ix_asset_assignments_asset_id'), table_name='asset_assignments')
    op.drop_table('asset_assignments')
    op.drop_index(op.f('ix_assets_id'), table_name='assets')
    op.drop_table('assets')
    op.drop_table('asset_types')
    op.execute("DROP TYPE IF EXISTS assetstatusenum")
