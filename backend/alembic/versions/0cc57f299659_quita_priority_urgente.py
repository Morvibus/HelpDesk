"""quita priority urgente

Revision ID: 0cc57f299659
Revises: 99713097ea4d
Create Date: 2026-10-13 17:00:54.281647

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0cc57f299659'
down_revision: Union[str, Sequence[str], None] = '99713097ea4d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _tiene_urgent(bind) -> bool:
    return bool(bind.execute(sa.text(
        "SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid "
        "WHERE t.typname = 'priorityenum' AND e.enumlabel = 'urgent'"
    )).scalar())


def upgrade() -> None:
    """Quita 'urgent' del enum priorityenum.

    Postgres no permite borrar valores de un enum, asi que se recrea el tipo.
    Guard: si 'urgent' ya no existe (p. ej. DB creada por create_all con los
    models actuales) no hace nada.
    """
    bind = op.get_bind()
    if not sa.inspect(bind).has_table('tickets'):
        return
    if not _tiene_urgent(bind):
        return

    # Los tickets urgentes pasan a high (high queda como el nivel mas alto)
    op.execute("UPDATE tickets SET priority = 'high' WHERE priority = 'urgent'")
    op.execute("CREATE TYPE priorityenum_new AS ENUM ('low', 'medium', 'high')")
    op.execute(
        "ALTER TABLE tickets ALTER COLUMN priority "
        "TYPE priorityenum_new USING (priority::text::priorityenum_new)"
    )
    op.execute("DROP TYPE priorityenum")
    op.execute("ALTER TYPE priorityenum_new RENAME TO priorityenum")


def downgrade() -> None:
    """Restaura el valor 'urgent' en priorityenum."""
    bind = op.get_bind()
    if not sa.inspect(bind).has_table('tickets'):
        return
    if _tiene_urgent(bind):
        return

    op.execute("CREATE TYPE priorityenum_new AS ENUM ('low', 'medium', 'high', 'urgent')")
    op.execute(
        "ALTER TABLE tickets ALTER COLUMN priority "
        "TYPE priorityenum_new USING (priority::text::priorityenum_new)"
    )
    op.execute("DROP TYPE priorityenum")
    op.execute("ALTER TYPE priorityenum_new RENAME TO priorityenum")
