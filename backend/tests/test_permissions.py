"""Visibilidad y pertenencia de tickets/mensajes/acciones según el rol."""
import models
from conftest import auth_headers, create_ticket, create_user


def test_empleado_solo_ve_sus_tickets(client, db):
    mio = create_user(db, "employee")
    ajeno = create_user(db, "employee")
    t_mio = create_ticket(db, mio.id)
    create_ticket(db, ajeno.id)

    ids = [t["id"] for t in client.get("/tickets/", headers=auth_headers(mio)).json()]
    assert ids == [t_mio.id]


def test_tecnico_ve_no_asignados_y_los_suyos(client, db):
    empleado = create_user(db, "employee")
    tecnico = create_user(db, "technician")
    otro_tecnico = create_user(db, "technician")
    sin_asignar = create_ticket(db, empleado.id)
    mio = create_ticket(db, empleado.id, assigned_to=tecnico.id)
    create_ticket(db, empleado.id, assigned_to=otro_tecnico.id)

    ids = [t["id"] for t in client.get("/tickets/", headers=auth_headers(tecnico)).json()]
    assert sorted(ids) == sorted([sin_asignar.id, mio.id])


def test_admin_ve_todos_los_tickets(client, db):
    empleado = create_user(db, "employee")
    admin = create_user(db, "admin")
    t1 = create_ticket(db, empleado.id)
    t2 = create_ticket(db, empleado.id)

    ids = [t["id"] for t in client.get("/tickets/", headers=auth_headers(admin)).json()]
    assert sorted(ids) == sorted([t1.id, t2.id])


def test_empleado_no_modifica_ticket_ajeno(client, db):
    mio = create_user(db, "employee")
    ajeno = create_user(db, "employee")
    t_ajeno = create_ticket(db, ajeno.id)

    r = client.patch(f"/tickets/{t_ajeno.id}", json={"status": "in_process"}, headers=auth_headers(mio))
    assert r.status_code == 403


def test_empleado_modifica_su_ticket(client, db):
    empleado = create_user(db, "employee")
    ticket = create_ticket(db, empleado.id)

    r = client.patch(f"/tickets/{ticket.id}", json={"status": "in_process"}, headers=auth_headers(empleado))
    assert r.status_code == 200
    assert r.json()["status"] == "in_process"


def test_empleado_no_puede_asignarse_tickets(client, db):
    empleado = create_user(db, "employee")
    ticket = create_ticket(db, empleado.id)

    r = client.patch(f"/tickets/{ticket.id}", json={"assigned_to": empleado.id}, headers=auth_headers(empleado))
    assert r.status_code == 403


def test_tecnico_toma_ticket_sin_asignar(client, db):
    empleado = create_user(db, "employee")
    tecnico = create_user(db, "technician")
    ticket = create_ticket(db, empleado.id)

    r = client.patch(f"/tickets/{ticket.id}", json={"status": "in_process"}, headers=auth_headers(tecnico))
    assert r.status_code == 200
    assert r.json()["assigned_to"] == tecnico.id


def test_mensajes_de_ticket_ajeno_prohibido(client, db):
    mio = create_user(db, "employee")
    ajeno = create_user(db, "employee")
    t_ajeno = create_ticket(db, ajeno.id)

    r = client.get(f"/tickets/{t_ajeno.id}/messages", headers=auth_headers(mio))
    assert r.status_code == 403


def test_mensajes_de_ticket_inexistente(client, db):
    empleado = create_user(db, "employee")
    r = client.get("/tickets/9999/messages", headers=auth_headers(empleado))
    assert r.status_code == 404


def test_notas_privadas_ocultas_para_el_empleado(client, db):
    tecnico = create_user(db, "technician")
    empleado = create_user(db, "employee")
    ticket = create_ticket(db, empleado.id, assigned_to=tecnico.id)
    db.add(models.Message(ticket_id=ticket.id, sender_id=tecnico.id, content="respuesta publica"))
    db.add(
        models.Message(
            ticket_id=ticket.id, sender_id=tecnico.id, content="nota interna", is_private_note=True
        )
    )
    db.commit()

    como_empleado = client.get(f"/tickets/{ticket.id}/messages", headers=auth_headers(empleado)).json()
    assert [m["content"] for m in como_empleado] == ["respuesta publica"]

    como_tecnico = client.get(f"/tickets/{ticket.id}/messages", headers=auth_headers(tecnico)).json()
    assert sorted(m["content"] for m in como_tecnico) == ["nota interna", "respuesta publica"]


def test_metricas_prohibidas_para_empleado(client, db):
    empleado = create_user(db, "employee")
    assert client.get("/metrics/", headers=auth_headers(empleado)).status_code == 403


def test_metricas_permitidas_para_tecnico_y_admin(client, db):
    tecnico = create_user(db, "technician")
    admin = create_user(db, "admin")
    assert client.get("/metrics/", headers=auth_headers(tecnico)).status_code == 200
    assert client.get("/metrics/", headers=auth_headers(admin)).status_code == 200


def test_cambio_password_solo_admin(client, db):
    empleado = create_user(db, "employee")
    objetivo = create_user(db, "employee")

    r = client.patch(
        f"/users/{objetivo.id}/password",
        json={"new_password": "nueva1234"},
        headers=auth_headers(empleado),
    )
    assert r.status_code == 403


def test_cambio_password_propia_requiere_la_actual(client, db):
    admin = create_user(db, "admin")
    url = f"/users/{admin.id}/password"
    headers = auth_headers(admin)

    sin_actual = client.patch(url, json={"new_password": "nueva1234"}, headers=headers)
    incorrecta = client.patch(url, json={"old_password": "mala", "new_password": "nueva1234"}, headers=headers)
    assert sin_actual.status_code == 400
    assert incorrecta.status_code == 400
