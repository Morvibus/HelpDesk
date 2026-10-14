"""estado pendiente y observacion en historial

Revision ID: d5bbf2d714eb
Revises: 20429e279349
Create Date: 2026-10-14 16:59:59.358363

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd5bbf2d714eb'
down_revision: Union[str, Sequence[str], None] = '20429e279349'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columnas(bind):
    return {c['name'] for c in sa.inspect(bind).get_columns('ticket_history')}


def upgrade() -> None:
    """Agrega 'pending' a statusenum y ticket_history.comment.

    Guards: IF NOT EXISTS en el enum y chequeo de columna (DB creada por create_all ya los tiene).
    """
    bind = op.get_bind()
    if not sa.inspect(bind).has_table('tickets'):
        return
    op.execute("ALTER TYPE statusenum ADD VALUE IF NOT EXISTS 'pending'")
    if 'comment' not in _columnas(bind):
        op.add_column('ticket_history', sa.Column('comment', sa.Text(), nullable=True))


def downgrade() -> None:
    """Quita ticket_history.comment y 'pending' (Postgres no borra valores: se recrea el tipo)."""
    bind = op.get_bind()
    if not sa.inspect(bind).has_table('tickets'):
        return
    if 'comment' in _columnas(bind):
        op.drop_column('ticket_history', 'comment')
    # Los pendientes vuelven a 'in_process' (siguen abiertos e iniciados)
    op.execute("UPDATE tickets SET status = 'in_process' WHERE status = 'pending'")
    op.execute("CREATE TYPE statusenum_new AS ENUM ('created', 'assigned', 'in_process', 'solved', 'closed')")
    op.execute("ALTER TABLE tickets ALTER COLUMN status DROP DEFAULT")
    op.execute(
        "ALTER TABLE tickets ALTER COLUMN status "
        "TYPE statusenum_new USING (status::text::statusenum_new)"
    )
    op.execute("DROP TYPE statusenum")
    op.execute("ALTER TYPE statusenum_new RENAME TO statusenum")
