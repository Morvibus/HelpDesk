"""accesos separados de tickets

Revision ID: e41eb1bbbe1a
Revises: 96dea0d39db6
Create Date: 2026-10-14 19:01:44.228958

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e41eb1bbbe1a'
down_revision: Union[str, Sequence[str], None] = '96dea0d39db6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TIPOS_SIN_ACCESO = ('incident', 'service_request', 'maintenance', 'inquiry')


def _columnas(insp, tabla):
    return {c['name'] for c in insp.get_columns(tabla)}


def _tiene_label(bind, tipo, label):
    return bool(bind.execute(sa.text(
        "SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid "
        "WHERE t.typname = :tipo AND e.enumlabel = :label"
    ), {"tipo": tipo, "label": label}).scalar())


def upgrade() -> None:
    """Las solicitudes de acceso dejan de ser tickets (decisión del usuario).

    - access_events: historial + comentarios de cada solicitud.
    - access_requests: ticket_id -> requested_by/department_id (copiados del ticket de origen); su
      historial access_change pasa de ticket_history a access_events.
    - tickettypeenum pierde 'access_request': esos tickets (que conservan su chat) pasan a service_request.
    Guards en cada paso: una DB creada por create_all ya está en el estado final.
    """
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table('access_requests'):
        return

    if not insp.has_table('access_events'):
        op.create_table(
            'access_events',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('access_request_id', sa.Integer(), nullable=False),
            sa.Column('action', sa.String(), nullable=False),
            sa.Column('old_value', sa.String(), nullable=True),
            sa.Column('new_value', sa.String(), nullable=True),
            sa.Column('comment', sa.Text(), nullable=True),
            sa.Column('changed_by', sa.Integer(), nullable=False),
            sa.Column('timestamp', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['access_request_id'], ['access_requests.id']),
            sa.ForeignKeyConstraint(['changed_by'], ['users.id']),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(op.f('ix_access_events_id'), 'access_events', ['id'], unique=False)
        op.create_index(op.f('ix_access_events_access_request_id'), 'access_events', ['access_request_id'], unique=False)

    if 'ticket_id' in _columnas(insp, 'access_requests'):
        op.add_column('access_requests', sa.Column('requested_by', sa.Integer(), nullable=True))
        op.add_column('access_requests', sa.Column('department_id', sa.Integer(), nullable=True))
        op.execute(
            "UPDATE access_requests ar SET requested_by = t.created_by, department_id = t.department_id "
            "FROM tickets t WHERE t.id = ar.ticket_id"
        )
        # Historial: alta + cada paso access_change que vivía en el ticket
        op.execute(
            "INSERT INTO access_events (access_request_id, action, new_value, changed_by, timestamp) "
            "SELECT id, 'created', 'pending', requested_by, created_at FROM access_requests"
        )
        op.execute(
            "INSERT INTO access_events (access_request_id, action, old_value, new_value, comment, changed_by, timestamp) "
            "SELECT ar.id, CASE th.new_value WHEN 'enabled' THEN 'enabled' WHEN 'revoked' THEN 'revoked' ELSE 'decision' END, "
            "th.old_value, th.new_value, th.comment, th.changed_by, th.timestamp "
            "FROM ticket_history th JOIN access_requests ar ON ar.ticket_id = th.ticket_id "
            "WHERE th.action::text = 'access_change'"  # ::text: el valor pudo añadirse en esta misma transacción
        )
        op.execute("DELETE FROM ticket_history WHERE action::text = 'access_change'")
        op.alter_column('access_requests', 'requested_by', nullable=False)
        op.create_index(op.f('ix_access_requests_requested_by'), 'access_requests', ['requested_by'], unique=False)
        op.create_foreign_key('access_requests_requested_by_fkey', 'access_requests', 'users', ['requested_by'], ['id'])
        op.create_foreign_key('access_requests_department_id_fkey', 'access_requests', 'departments', ['department_id'], ['id'])
        op.drop_column('access_requests', 'ticket_id')  # se lleva su índice único y su FK

    if _tiene_label(bind, 'tickettypeenum', 'access_request'):
        op.execute("UPDATE tickets SET ticket_type = 'service_request' WHERE ticket_type = 'access_request'")
        op.execute(f"CREATE TYPE tickettypeenum_new AS ENUM {TIPOS_SIN_ACCESO}")
        op.execute("ALTER TABLE tickets ALTER COLUMN ticket_type TYPE tickettypeenum_new USING (ticket_type::text::tickettypeenum_new)")
        op.execute("DROP TYPE tickettypeenum")
        op.execute("ALTER TYPE tickettypeenum_new RENAME TO tickettypeenum")


def downgrade() -> None:
    """Vuelve al esquema anterior. Las solicitudes de acceso NO se pueden volver a ligar a tickets:
    se eliminan (con su historial). El tipo 'access_request' vuelve al enum, sin tickets que lo usen."""
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table('access_events'):
        return
    op.drop_index(op.f('ix_access_events_access_request_id'), table_name='access_events')
    op.drop_index(op.f('ix_access_events_id'), table_name='access_events')
    op.drop_table('access_events')
    op.execute("DELETE FROM access_requests")
    op.drop_constraint('access_requests_requested_by_fkey', 'access_requests', type_='foreignkey')
    op.drop_constraint('access_requests_department_id_fkey', 'access_requests', type_='foreignkey')
    op.drop_index(op.f('ix_access_requests_requested_by'), table_name='access_requests')
    op.drop_column('access_requests', 'requested_by')
    op.drop_column('access_requests', 'department_id')
    op.add_column('access_requests', sa.Column('ticket_id', sa.Integer(), sa.ForeignKey('tickets.id'), nullable=False))
    op.create_index(op.f('ix_access_requests_ticket_id'), 'access_requests', ['ticket_id'], unique=True)
    op.execute("ALTER TYPE tickettypeenum ADD VALUE IF NOT EXISTS 'access_request'")
