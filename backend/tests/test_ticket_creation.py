"""Alta de tickets: categoria opcional y prioridades validas (sin urgente)."""
import models
from conftest import auth_headers, create_user


def _payload(**extra):
    body = {"title": "Sin red", "description": "No navega desde ayer"}
    body.update(extra)
    return body


def test_empleado_crea_ticket_con_categoria(client, db):
    empleado = create_user(db, "employee")
    r = client.post(
        "/tickets/",
        json=_payload(category="network", priority="high"),
        headers=auth_headers(empleado),
    )
    assert r.status_code == 200
    data = r.json()
    assert data["category"] == "network"
    assert data["priority"] == "high"


def test_categoria_es_opcional(client, db):
    empleado = create_user(db, "employee")
    r = client.post("/tickets/", json=_payload(), headers=auth_headers(empleado))
    assert r.status_code == 200
    assert r.json()["category"] is None


def test_categoria_invalida(client, db):
    empleado = create_user(db, "employee")
    r = client.post("/tickets/", json=_payload(category="fuego"), headers=auth_headers(empleado))
    assert r.status_code == 422


def test_prioridad_urgente_ya_no_existe(client, db):
    empleado = create_user(db, "employee")
    r = client.post("/tickets/", json=_payload(priority="urgent"), headers=auth_headers(empleado))
    assert r.status_code == 422


def test_priority_enum_solo_tres_niveles():
    assert {p.value for p in models.PriorityEnum} == {"low", "medium", "high"}


def test_solo_empleados_crean_tickets(client, db):
    tecnico = create_user(db, "technician")
    r = client.post("/tickets/", json=_payload(), headers=auth_headers(tecnico))
    assert r.status_code == 403
