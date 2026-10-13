"""categoria en tickets

Revision ID: 7d9423ec204c
Revises: 0cc57f299659
Create Date: 2026-10-13 17:02:13.361221

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7d9423ec204c'
down_revision: Union[str, Sequence[str], None] = '0cc57f299659'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columnas(bind):
    return {c['name'] for c in sa.inspect(bind).get_columns('tickets')}


def upgrade() -> None:
    """Agrega tickets.category (guard: DB creada por create_all ya la tiene)."""
    bind = op.get_bind()
    if 'category' in _columnas(bind):
        return
    op.add_column('tickets', sa.Column('category', sa.Enum('network', 'hardware', 'software', 'access', 'email', 'other', name='categoryenum'), nullable=True))


def downgrade() -> None:
    """Quita tickets.category."""
    bind = op.get_bind()
    if 'category' not in _columnas(bind):
        return
    op.drop_column('tickets', 'category')
