"""Autenticación, login y registro (bootstrap del primer usuario)."""
from conftest import PASSWORD, auth_headers, create_user

NUEVO_USUARIO = {"name": "Nuevo", "email": "nuevo@helpdesk-mock.com", "password": "x1234567"}


def test_primer_usuario_se_crea_sin_token(client, db):
    # Con la tabla vacía cualquiera puede crear el primer usuario (bootstrap)
    r = client.post("/users/", json=NUEVO_USUARIO)
    assert r.status_code == 200
    assert r.json()["role"] == "employee"


def test_registro_cerrado_tras_el_bootstrap(client, db):
    create_user(db)
    r = client.post("/users/", json={**NUEVO_USUARIO, "email": "otro@helpdesk-mock.com"})
    assert r.status_code == 401


def test_registro_con_token_de_empleado_prohibido(client, db):
    empleado = create_user(db, "employee")
    r = client.post(
        "/users/",
        json={**NUEVO_USUARIO, "email": "otro@helpdesk-mock.com"},
        headers=auth_headers(empleado),
    )
    assert r.status_code == 403


def test_registro_con_token_de_admin(client, db):
    admin = create_user(db, "admin")
    r = client.post(
        "/users/",
        json={**NUEVO_USUARIO, "email": "otro@helpdesk-mock.com"},
        headers=auth_headers(admin),
    )
    assert r.status_code == 200
    assert r.json()["role"] == "employee"


def test_registro_con_token_invalido(client, db):
    create_user(db)
    r = client.post("/users/", json=NUEVO_USUARIO, headers={"Authorization": "Bearer no.es.token"})
    assert r.status_code == 401


def test_login_form_encoded(client, db):
    user = create_user(db)
    r = client.post("/login", data={"username": user.email, "password": PASSWORD})
    assert r.status_code == 200
    assert r.json()["token_type"] == "bearer"


def test_login_con_password_incorrecta(client, db):
    user = create_user(db)
    r = client.post("/login", data={"username": user.email, "password": "mala"})
    assert r.status_code == 401


def test_endpoints_protegidos_sin_token(client, db):
    create_user(db)
    assert client.get("/tickets/").status_code == 401
    assert client.get("/users/").status_code == 401
    assert client.get("/metrics/").status_code == 401
