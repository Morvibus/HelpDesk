"""Biblioteca de problemas y soluciones: permisos, alta desde ticket y CRUD."""
import models
from conftest import auth_headers, create_ticket, create_user


def _articulo(title="Sin internet", problem="No navega", solution="Reiniciar router",
              category="network", ticket_id=None):
    body = {"title": title, "problem": problem, "solution": solution, "category": category}
    if ticket_id is not None:
        body["ticket_id"] = ticket_id
    return body


def _solved_ticket(db, created_by, assigned_to=None):
    ticket = create_ticket(db, created_by, assigned_to=assigned_to)
    ticket.status = models.StatusEnum.solved
    db.commit()
    db.refresh(ticket)
    return ticket


# --- Permisos de publicación ---

def test_empleado_no_puede_publicar(client, db):
    empleado = create_user(db, "employee")
    r = client.post("/library/", json=_articulo(), headers=auth_headers(empleado))
    assert r.status_code == 403


def test_tecnico_publica_libremente_sin_ticket(client, db):
    tecnico = create_user(db, "technician")
    r = client.post("/library/", json=_articulo(), headers=auth_headers(tecnico))
    assert r.status_code == 201
    data = r.json()
    assert data["ticket_id"] is None
    assert data["category"] == "network"
    assert data["created_by"] == tecnico.id


def test_tecnico_publica_desde_ticket_resuelto(client, db):
    empleado = create_user(db, "employee")
    tecnico = create_user(db, "technician")
    ticket = _solved_ticket(db, empleado.id, assigned_to=tecnico.id)

    r = client.post("/library/", json=_articulo(ticket_id=ticket.id), headers=auth_headers(tecnico))
    assert r.status_code == 201
    assert r.json()["ticket_id"] == ticket.id


def test_no_se_publica_ticket_abierto(client, db):
    empleado = create_user(db, "employee")
    tecnico = create_user(db, "technician")
    ticket = create_ticket(db, empleado.id)  # status created

    r = client.post("/library/", json=_articulo(ticket_id=ticket.id), headers=auth_headers(tecnico))
    assert r.status_code == 400


def test_ticket_inexistente(client, db):
    tecnico = create_user(db, "technician")
    r = client.post("/library/", json=_articulo(ticket_id=999999), headers=auth_headers(tecnico))
    assert r.status_code == 404


def test_una_sola_entrada_por_ticket(client, db):
    empleado = create_user(db, "employee")
    tecnico = create_user(db, "technician")
    ticket = _solved_ticket(db, empleado.id, assigned_to=tecnico.id)

    assert client.post("/library/", json=_articulo(ticket_id=ticket.id), headers=auth_headers(tecnico)).status_code == 201
    r = client.post("/library/", json=_articulo(ticket_id=ticket.id), headers=auth_headers(tecnico))
    assert r.status_code == 409


# --- Lectura ---

def test_empleado_puede_leer_la_biblioteca(client, db):
    tecnico = create_user(db, "technician")
    empleado = create_user(db, "employee")
    client.post("/library/", json=_articulo(), headers=auth_headers(tecnico))

    r = client.get("/library/", headers=auth_headers(empleado))
    assert r.status_code == 200
    assert r.json()["total"] == 1


def test_busqueda_por_texto(client, db):
    tecnico = create_user(db, "technician")
    client.post("/library/", json=_articulo(title="Impresora rota"), headers=auth_headers(tecnico))
    client.post("/library/", json=_articulo(title="Correo caído"), headers=auth_headers(tecnico))

    r = client.get("/library/", params={"q": "impresora"}, headers=auth_headers(tecnico))
    assert r.json()["total"] == 1
    assert r.json()["items"][0]["title"] == "Impresora rota"


def test_filtro_por_categoria(client, db):
    tecnico = create_user(db, "technician")
    client.post("/library/", json=_articulo(category="network"), headers=auth_headers(tecnico))
    client.post("/library/", json=_articulo(category="hardware"), headers=auth_headers(tecnico))

    r = client.get("/library/", params={"category": "hardware"}, headers=auth_headers(tecnico))
    assert r.json()["total"] == 1
    assert r.json()["items"][0]["category"] == "hardware"


def test_paginacion(client, db):
    tecnico = create_user(db, "technician")
    for i in range(3):
        client.post("/library/", json=_articulo(title=f"Caso {i}"), headers=auth_headers(tecnico))

    r = client.get("/library/", params={"limit": 2, "offset": 0}, headers=auth_headers(tecnico))
    assert r.json()["total"] == 3
    assert len(r.json()["items"]) == 2


# --- Edición / borrado ---

def test_editar_solo_autor_o_admin(client, db):
    autor = create_user(db, "technician")
    otro = create_user(db, "technician")
    admin = create_user(db, "admin")
    article_id = client.post("/library/", json=_articulo(), headers=auth_headers(autor)).json()["id"]

    r = client.patch(f"/library/{article_id}", json={"solution": "Otra"}, headers=auth_headers(otro))
    assert r.status_code == 403

    r = client.patch(f"/library/{article_id}", json={"solution": "Otra"}, headers=auth_headers(autor))
    assert r.status_code == 200
    assert r.json()["solution"] == "Otra"

    r = client.patch(f"/library/{article_id}", json={"title": "Admin"}, headers=auth_headers(admin))
    assert r.status_code == 200


def test_eliminar_solo_autor_o_admin(client, db):
    autor = create_user(db, "technician")
    otro = create_user(db, "technician")
    article_id = client.post("/library/", json=_articulo(), headers=auth_headers(autor)).json()["id"]

    r = client.delete(f"/library/{article_id}", headers=auth_headers(otro))
    assert r.status_code == 403

    r = client.delete(f"/library/{article_id}", headers=auth_headers(autor))
    assert r.status_code == 204

    assert client.get(f"/library/{article_id}", headers=auth_headers(autor)).status_code == 404


def test_editar_con_null_no_vacia_campos(client, db):
    tecnico = create_user(db, "technician")
    creado = client.post("/library/", json=_articulo(), headers=auth_headers(tecnico)).json()

    r = client.patch(f"/library/{creado['id']}", json={"title": None}, headers=auth_headers(tecnico))
    assert r.status_code == 200
    assert r.json()["title"] == "Sin internet"
