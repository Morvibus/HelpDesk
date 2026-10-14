"""Alta de tickets: tipo, categoria (catalogo), departamento y prioridades validas."""
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
    assert r.status_code == 400  # se valida contra el catalogo de categorias


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


def test_tipo_por_defecto_y_explicito(client, db):
    empleado = create_user(db, "employee")
    h = auth_headers(empleado)
    assert client.post("/tickets/", json=_payload(), headers=h).json()["ticket_type"] == "incident"
    r = client.post("/tickets/", json=_payload(ticket_type="service_request"), headers=h)
    assert r.json()["ticket_type"] == "service_request"
    assert client.post("/tickets/", json=_payload(ticket_type="otro"), headers=h).status_code == 422


def test_categoria_desactivada_no_se_usa_en_tickets_nuevos(client, db):
    empleado = create_user(db, "employee")
    db.get(models.Category, "email").is_active = False
    db.commit()
    r = client.post("/tickets/", json=_payload(category="email"), headers=auth_headers(empleado))
    assert r.status_code == 400


def test_ticket_copia_el_departamento_del_solicitante(client, db):
    ventas, compras = models.Department(name="Ventas"), models.Department(name="Compras")
    db.add_all([ventas, compras])
    db.commit()
    empleado = create_user(db, "employee")
    empleado.department_id = ventas.id
    db.commit()

    ticket = client.post("/tickets/", json=_payload(), headers=auth_headers(empleado)).json()
    assert ticket["department_id"] == ventas.id

    # Mudarse de área no reescribe el histórico
    empleado.department_id = compras.id
    db.commit()
    db.expire_all()
    assert db.get(models.Ticket, ticket["id"]).department_id == ventas.id
