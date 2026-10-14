"""departamentos categorias y tipo de ticket

Revision ID: 74788f3d22d1
Revises: d5bbf2d714eb
Create Date: 2026-10-14 17:22:45.111676

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '74788f3d22d1'
down_revision: Union[str, Sequence[str], None] = 'd5bbf2d714eb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Copia fija (las migraciones no importan models): mismas claves que el antiguo categoryenum
CATEGORIAS = [
    ("network", "Red"), ("hardware", "Hardware"), ("software", "Software"),
    ("access", "Accesos"), ("email", "Correo"), ("other", "Otro"),
]
TIPOS = ('incident', 'service_request', 'access_request', 'maintenance', 'inquiry')
# Nombres = los que Postgres pone por defecto, así coinciden con una DB creada por create_all
FKS = [
    ("users_department_id_fkey", "users", "department_id", "departments", "id"),
    ("tickets_department_id_fkey", "tickets", "department_id", "departments", "id"),
    ("tickets_category_fkey", "tickets", "category", "categories", "key"),
    ("knowledge_articles_category_fkey", "knowledge_articles", "category", "categories", "key"),
]


def _columnas(insp, tabla):
    return {c['name']: c for c in insp.get_columns(tabla)}


def _tiene_fk(insp, tabla, columna):
    return any(fk['constrained_columns'] == [columna] for fk in insp.get_foreign_keys(tabla))


def upgrade() -> None:
    """Catálogos de departamentos y categorías, tipo de ticket y departamento en usuario/ticket.

    Las categorías pasan de enum a tabla conservando las claves (los datos no cambian).
    Guards en cada paso: una DB creada por create_all ya trae todo esto.
    """
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table('tickets'):
        return

    if not insp.has_table('departments'):
        op.create_table(
            'departments',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('is_active', sa.Boolean(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('name'),
        )
        op.create_index(op.f('ix_departments_id'), 'departments', ['id'], unique=False)

    if not insp.has_table('categories'):
        categorias = op.create_table(
            'categories',
            sa.Column('key', sa.String(), nullable=False),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('is_active', sa.Boolean(), nullable=False),
            sa.PrimaryKeyConstraint('key'),
            sa.UniqueConstraint('name'),
        )
        op.bulk_insert(categorias, [{"key": k, "name": n, "is_active": True} for k, n in CATEGORIAS])

    if 'department_id' not in _columnas(insp, 'users'):
        op.add_column('users', sa.Column('department_id', sa.Integer(), nullable=True))
    if 'department_id' not in _columnas(insp, 'tickets'):
        op.add_column('tickets', sa.Column('department_id', sa.Integer(), nullable=True))
    if 'ticket_type' not in _columnas(insp, 'tickets'):
        sa.Enum(*TIPOS, name='tickettypeenum').create(bind, checkfirst=True)
        # server_default solo para rellenar los tickets existentes; el modelo pone el default en Python
        op.add_column('tickets', sa.Column(
            'ticket_type', sa.Enum(*TIPOS, name='tickettypeenum', create_type=False),
            nullable=False, server_default='incident',
        ))
        op.alter_column('tickets', 'ticket_type', server_default=None)

    # category: enum -> texto con las mismas claves
    for tabla in ('tickets', 'knowledge_articles'):
        if isinstance(_columnas(insp, tabla)['category']['type'], sa.Enum):
            op.alter_column(tabla, 'category', type_=sa.String(), postgresql_using='category::text')
    op.execute("DROP TYPE IF EXISTS categoryenum")

    for nombre, tabla, columna, ref_tabla, ref_columna in FKS:
        if not _tiene_fk(insp, tabla, columna):
            op.create_foreign_key(nombre, tabla, ref_tabla, [columna], [ref_columna])


def downgrade() -> None:
    """Vuelve al enum de categorías (las creadas después pasan a 'other') y quita catálogos y tipo."""
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table('categories'):
        return

    for nombre, tabla, columna, _, _ in FKS:
        if _tiene_fk(insp, tabla, columna):
            op.drop_constraint(nombre, tabla, type_='foreignkey')

    claves = ", ".join(f"'{k}'" for k, _ in CATEGORIAS)
    op.execute(f"CREATE TYPE categoryenum AS ENUM ({claves})")
    for tabla in ('tickets', 'knowledge_articles'):
        op.execute(f"UPDATE {tabla} SET category = 'other' WHERE category NOT IN ({claves})")
        op.alter_column(tabla, 'category', type_=sa.Enum(*[k for k, _ in CATEGORIAS], name='categoryenum', create_type=False),
                        postgresql_using='category::categoryenum')

    op.drop_column('tickets', 'ticket_type')
    op.execute("DROP TYPE IF EXISTS tickettypeenum")
    op.drop_column('tickets', 'department_id')
    op.drop_column('users', 'department_id')
    op.drop_table('categories')
    op.drop_index(op.f('ix_departments_id'), table_name='departments')
    op.drop_table('departments')
