"""Centro de notificaciones: los avisos con sonido se guardan para su destinatario aunque no esté conectado."""
from datetime import datetime, timedelta, timezone

import models
from conftest import auth_headers, create_ticket, create_user, token_for


def _avisos(client, user):
    return client.get("/notifications/", headers=auth_headers(user)).json()


def test_aviso_queda_guardado_para_quien_no_esta_conectado(client, db):
    empleado = create_user(db, "employee")
    tecnico = create_user(db, "technician")
    admin = create_user(db, "admin")
    inactivo = create_user(db, "technician")
    inactivo.is_active = False
    db.commit()

    # Nadie tiene la app abierta cuando se crea el ticket
    ticket = client.post("/tickets/", json={"title": "Sin red", "description": "d"}, headers=auth_headers(empleado)).json()

    for staff in (tecnico, admin):
        r = _avisos(client, staff)
        assert r["unread"] == 1
        assert (r["items"][0]["sound"], r["items"][0]["link"]) == ("work", f"/ticket/{ticket['id']}")
    assert _avisos(client, empleado)["total"] == 0  # el emisor no se auto-notifica
    assert db.query(models.Notification).filter_by(user_id=inactivo.id).count() == 0


def test_refrescos_de_fondo_no_se_guardan(client, db):
    empleado = create_user(db, "employee")
    tecnico = create_user(db, "technician")
    otro = create_user(db, "technician")
    ticket = create_ticket(db, empleado.id)

    client.patch(f"/tickets/{ticket.id}", json={"status": "in_process"}, headers=auth_headers(tecnico))
    # Al resto de I&T solo le llega un refresco (sin sonido): no se guarda
    assert _avisos(client, otro)["total"] == 0
    # Al solicitante sí: es una novedad de lo que pidió
    assert _avisos(client, empleado)["items"][0]["sound"] == "message"


def test_nota_privada_nunca_se_guarda_para_el_empleado(client, db):
    empleado = create_user(db, "employee")
    tecnico = create_user(db, "technician")
    admin = create_user(db, "admin")
    ticket = create_ticket(db, empleado.id, assigned_to=tecnico.id)

    with client.websocket_connect(f"/ws/tickets/{ticket.id}/chat", subprotocols=["auth", token_for(tecnico)]) as chat:
        chat.send_json({"content": "nota interna", "is_private_note": True})
        chat.receive_json()
    assert _avisos(client, empleado)["total"] == 0
    assert _avisos(client, admin)["total"] == 1  # el admin está desconectado y aun así le queda


def test_marcar_leidas_solo_las_propias(client, db):
    empleado = create_user(db, "employee")
    tecnico = create_user(db, "technician")
    otro = create_user(db, "technician")
    t1 = client.post("/tickets/", json={"title": "a", "description": "d"}, headers=auth_headers(empleado)).json()
    client.post("/tickets/", json={"title": "b", "description": "d"}, headers=auth_headers(empleado))
    mio = _avisos(client, tecnico)["items"]

    # El aviso de otro no se puede marcar (ni se revela que existe)
    assert client.post(f"/notifications/{mio[0]['id']}/read", headers=auth_headers(otro)).status_code == 404
    # Abrir un ticket marca solo sus avisos
    client.post("/notifications/read-all", params={"link": f"/ticket/{t1['id']}"}, headers=auth_headers(tecnico))
    assert _avisos(client, tecnico)["unread"] == 1
    assert client.post("/notifications/read-all", headers=auth_headers(tecnico)).json() == {"marked": 1}
    assert _avisos(client, tecnico)["unread"] == 0
    assert _avisos(client, otro)["unread"] == 2  # lo del otro no se tocó


def test_avisos_de_mas_de_30_dias_se_borran_solos(client, db):
    empleado = create_user(db, "employee")
    tecnico = create_user(db, "technician")
    db.add(models.Notification(user_id=tecnico.id, title="viejo", created_at=datetime.now(timezone.utc) - timedelta(days=31)))
    db.commit()
    client.post("/tickets/", json={"title": "nuevo", "description": "d"}, headers=auth_headers(empleado))
    assert [a["title"] for a in _avisos(client, tecnico)["items"]] == ["Nuevo Ticket Creado"]
