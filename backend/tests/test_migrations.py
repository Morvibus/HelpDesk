"""Las migraciones de Alembic deben llevar una DB vacía al schema de models.py.

Se ejecutan contra una base propia (`helpdesk_migrate_test`), nunca contra
`helpdesk_db` ni `helpdesk_test`.
"""
import os
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import psycopg
import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

import models

BACKEND_DIR = Path(__file__).resolve().parents[1]
MIGRATE_DB = "helpdesk_migrate_test"


def _url_con_db(nombre: str) -> str:
    # Partimos de la DATABASE_URL ya fijada por conftest (helpdesk_test en `db`)
    parts = urlsplit(os.environ["DATABASE_URL"])
    return urlunsplit((parts.scheme, parts.netloc, f"/{nombre}", "", ""))


def _gestionar_db(sql: str):
    with psycopg.connect(_url_con_db("postgres"), autocommit=True) as conn:
        conn.execute(sql)


@pytest.fixture()
def db_vacia():
    _gestionar_db(f'DROP DATABASE IF EXISTS "{MIGRATE_DB}" WITH (FORCE)')
    _gestionar_db(f'CREATE DATABASE "{MIGRATE_DB}"')
    yield
    _gestionar_db(f'DROP DATABASE IF EXISTS "{MIGRATE_DB}" WITH (FORCE)')


def _alembic(accion, *args):
    """Ejecuta una operación de Alembic apuntando a la DB de migraciones."""
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    url_anterior = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = _url_con_db(MIGRATE_DB)
    try:
        accion(cfg, *args)
    finally:
        os.environ["DATABASE_URL"] = url_anterior


def test_migracion_crea_el_schema_completo(db_vacia):
    _alembic(command.upgrade, "head")

    engine = sa.create_engine(_url_con_db(MIGRATE_DB))
    try:
        inspector = sa.inspect(engine)
        tablas = set(inspector.get_table_names()) - {"alembic_version"}
        assert tablas == set(models.Base.metadata.tables)

        for nombre, tabla in models.Base.metadata.tables.items():
            columnas = {c["name"] for c in inspector.get_columns(nombre)}
            assert columnas == set(tabla.columns.keys()), f"columnas distintas en '{nombre}'"
    finally:
        engine.dispose()

    # Y no queda ninguna operación pendiente: schema migrado == models.py
    _alembic(command.check)


def test_migracion_es_compatible_con_db_creada_por_create_all(db_vacia):
    # Simula la DB existente de las versiones previas: schema sin versionar
    engine = sa.create_engine(_url_con_db(MIGRATE_DB))
    try:
        models.Base.metadata.create_all(bind=engine)
    finally:
        engine.dispose()

    # Los guards por tabla deben evitar chocar y dejar la DB en `head`
    _alembic(command.upgrade, "head")

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    head = ScriptDirectory.from_config(cfg).get_current_head()
    with psycopg.connect(_url_con_db(MIGRATE_DB)) as conn:
        version = conn.execute("SELECT version_num FROM alembic_version").fetchone()[0]
    assert version == head
