"""Paginación de los listados: limit/offset, total y validación de parámetros."""
import models
from conftest import auth_headers, create_ticket, create_user


def test_tickets_limit_offset_y_total(client, db):
    admin = create_user(db, "admin")
    creador = create_user(db, "employee")
    for i in range(7):
        create_ticket(db, creador.id, title=f"Ticket {i}")

    headers = auth_headers(admin)
    pagina1 = client.get("/tickets/?limit=3", headers=headers).json()
    pagina2 = client.get("/tickets/?limit=3&offset=3", headers=headers).json()
    pagina3 = client.get("/tickets/?limit=3&offset=6", headers=headers).json()

    assert pagina1["total"] == 7
    assert [len(p["items"]) for p in (pagina1, pagina2, pagina3)] == [3, 3, 1]

    ids = [t["id"] for p in (pagina1, pagina2, pagina3) for t in p["items"]]
    assert len(ids) == 7 == len(set(ids))  # sin solapes ni saltos


def test_tickets_offset_fuera_de_rango_devuelve_vacio(client, db):
    admin = create_user(db, "admin")
    create_ticket(db, create_user(db, "employee").id)

    r = client.get("/tickets/?offset=100", headers=auth_headers(admin))
    assert r.status_code == 200
    assert r.json() == {"items": [], "total": 1}


def test_tickets_parametros_invalidos(client, db):
    admin = create_user(db, "admin")
    headers = auth_headers(admin)
    assert client.get("/tickets/?limit=0", headers=headers).status_code == 422
    assert client.get("/tickets/?limit=201", headers=headers).status_code == 422
    assert client.get("/tickets/?offset=-1", headers=headers).status_code == 422


def test_tickets_default_limit_50(client, db):
    admin = create_user(db, "admin")
    creador = create_user(db, "employee")
    for i in range(55):
        create_ticket(db, creador.id, title=f"Ticket {i}")

    r = client.get("/tickets/", headers=auth_headers(admin)).json()
    assert r["total"] == 55
    assert len(r["items"]) == 50


def test_mensajes_mas_recientes_primero_y_paginacion(client, db):
    empleado = create_user(db, "employee")
    ticket = create_ticket(db, empleado.id)
    for i in range(5):
        db.add(models.Message(ticket_id=ticket.id, sender_id=empleado.id, content=f"m{i}"))
    db.commit()

    headers = auth_headers(empleado)
    r = client.get(f"/tickets/{ticket.id}/messages?limit=2", headers=headers).json()
    assert r["total"] == 5
    # La primera página es la cola del chat: los dos más recientes
    assert [m["content"] for m in r["items"]] == ["m4", "m3"]

    r2 = client.get(f"/tickets/{ticket.id}/messages?limit=2&offset=4", headers=headers).json()
    assert [m["content"] for m in r2["items"]] == ["m0"]


def test_usuarios_paginados_solo_admin(client, db):
    admin = create_user(db, "admin")
    empleado = create_user(db, "employee")
    for _ in range(3):
        create_user(db, "employee")

    assert client.get("/users/?limit=1", headers=auth_headers(empleado)).status_code == 403

    r = client.get("/users/?limit=2", headers=auth_headers(admin)).json()
    assert r["total"] == 5  # admin + 4 empleados
    assert len(r["items"]) == 2
    ids = [u["id"] for u in r["items"]]
    assert ids == sorted(ids)  # orden estable por id
