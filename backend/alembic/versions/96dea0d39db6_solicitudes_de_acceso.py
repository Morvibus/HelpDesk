"""solicitudes de acceso

Revision ID: 96dea0d39db6
Revises: 1360c4fa87d6
Create Date: 2026-10-14 18:33:38.998667

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '96dea0d39db6'
down_revision: Union[str, Sequence[str], None] = '1360c4fa87d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Copia fija (las migraciones no importan models)
SISTEMAS = [
    ("sap", "SAP"), ("m365", "Microsoft 365"), ("vpn", "VPN / Fortinet"),
    ("shared_folders", "Carpetas compartidas"), ("other", "Otro"),
]


def upgrade() -> None:
    """Solicitudes de acceso (RF-05): catálogo de sistemas, ficha por ticket y acción access_change.

    Guards: una DB creada por create_all ya trae las tablas (se crean siempre juntas).
    """
    bind = op.get_bind()
    if not sa.inspect(bind).has_table('tickets'):
        return
    op.execute("ALTER TYPE actionenum ADD VALUE IF NOT EXISTS 'access_change'")
    if sa.inspect(bind).has_table('access_requests'):
        return

    sistemas = op.create_table('access_systems',
    sa.Column('key', sa.String(), nullable=False),
    sa.Column('name', sa.String(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.PrimaryKeyConstraint('key'),
    sa.UniqueConstraint('name')
    )
    op.bulk_insert(sistemas, [{"key": k, "name": n, "is_active": True} for k, n in SISTEMAS])
    op.create_table('access_requests',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('ticket_id', sa.Integer(), nullable=False),
    sa.Column('system', sa.String(), nullable=False),
    sa.Column('justification', sa.Text(), nullable=False),
    sa.Column('approval', sa.Enum('pending', 'approved', 'rejected', 'not_required', name='accessapprovalenum'), nullable=False),
    sa.Column('approver_name', sa.String(), nullable=True),
    sa.Column('approval_comment', sa.Text(), nullable=True),
    sa.Column('approval_recorded_by', sa.Integer(), nullable=True),
    sa.Column('approval_at', sa.DateTime(), nullable=True),
    sa.Column('enabled_at', sa.DateTime(), nullable=True),
    sa.Column('enabled_by', sa.Integer(), nullable=True),
    sa.Column('revoked_at', sa.DateTime(), nullable=True),
    sa.Column('revoked_by', sa.Integer(), nullable=True),
    sa.Column('revoke_reason', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['approval_recorded_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['enabled_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['revoked_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['system'], ['access_systems.key'], ),
    sa.ForeignKeyConstraint(['ticket_id'], ['tickets.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_access_requests_id'), 'access_requests', ['id'], unique=False)
    op.create_index(op.f('ix_access_requests_ticket_id'), 'access_requests', ['ticket_id'], unique=True)


def downgrade() -> None:
    """Quita la ficha de acceso y el catálogo. 'access_change' queda en actionenum (Postgres no
    borra valores de enum); sus filas de historial se eliminan."""
    if not sa.inspect(op.get_bind()).has_table('access_requests'):
        return
    op.execute("DELETE FROM ticket_history WHERE action = 'access_change'")
    op.drop_index(op.f('ix_access_requests_ticket_id'), table_name='access_requests')
    op.drop_index(op.f('ix_access_requests_id'), table_name='access_requests')
    op.drop_table('access_requests')
    op.drop_table('access_systems')
    op.execute("DROP TYPE IF EXISTS accessapprovalenum")
