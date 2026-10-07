"""Configuración común de los tests de HelpDesk.

Los tests corren contra una base `helpdesk_test` en el Postgres de compose:
se crea si no existe y DATABASE_URL se redirige ANTES de importar la app, así
ni el engine de `database.py` ni el `create_all` de `main.py` tocan `helpdesk_db`.

Ejecución:  docker compose run --rm backend python -m pytest
"""
import os
import uuid
from urllib.parse import urlsplit, urlunsplit

import psycopg
import pytest

# 1) URL de tests derivada de la del contenedor (ANTES de importar la app)
_base = urlsplit(os.environ.get("DATABASE_URL", "postgresql://postgres:admin123@db:5432/helpdesk_db"))
TEST_DB = "helpdesk_test"
TEST_URL = urlunsplit((_base.scheme, _base.netloc, f"/{TEST_DB}", _base.query, _base.fragment))
_admin_url = urlunsplit((_base.scheme, _base.netloc, "/postgres", "", ""))

with psycopg.connect(_admin_url, autocommit=True) as _conn:
    if _conn.execute("SELECT 1 FROM pg_database WHERE datname = %s", (TEST_DB,)).fetchone() is None:
        _conn.execute(f'CREATE DATABASE "{TEST_DB}"')

os.environ["DATABASE_URL"] = TEST_URL

# 2) Import de la app YA apuntando a la base de tests
import models  # noqa: E402
import security  # noqa: E402
from database import SessionLocal, engine  # noqa: E402
from main import app  # noqa: E402
from starlette.testclient import TestClient  # noqa: E402

# Una sola hash bcrypt para todos los tests (bcrypt es lento a propósito)
PASSWORD = "secret123"
PASSWORD_HASH = security.get_password_hash(PASSWORD)


@pytest.fixture(autouse=True)
def _estado_limpio():
    """Schema nuevo antes de cada test: los tests nunca comparten datos."""
    models.Base.metadata.drop_all(bind=engine)
    models.Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture()
def db():
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client


def create_user(db, role="employee", name="Test"):
    user = models.User(
        name=name,
        email=f"{role}-{uuid.uuid4().hex[:12]}@helpdesk-mock.com",
        password_hash=PASSWORD_HASH,
        role=models.RoleEnum(role),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_ticket(db, created_by, assigned_to=None, title="Ticket de prueba"):
    ticket = models.Ticket(
        title=title,
        description="Descripción de prueba",
        created_by=created_by,
        assigned_to=assigned_to,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return ticket


def token_for(user):
    return security.create_access_token({"sub": str(user.id), "role": user.role.value})


def auth_headers(user):
    return {"Authorization": f"Bearer {token_for(user)}"}
