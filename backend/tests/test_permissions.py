"""Visibilidad y pertenencia de tickets/mensajes/acciones según el rol."""
import uuid
from datetime import datetime, timedelta

import models
from conftest import PASSWORD, auth_headers, create_ticket, create_user
from business_hours import business_hours_between


def test_empleado_solo_ve_sus_tickets(client, db):
    mio = create_user(db, "employee")
    ajeno = create_user(db, "employee")
    t_mio = create_ticket(db, mio.id)
    create_ticket(db, ajeno.id)

    ids = [t["id"] for t in client.get("/tickets/", headers=auth_headers(mio)).json()["items"]]
    assert ids == [t_mio.id]


def test_tecnico_ve_no_asignados_y_los_suyos(client, db):
    empleado = create_user(db, "employee")
    tecnico = create_user(db, "technician")
    otro_tecnico = create_user(db, "technician")
    sin_asignar = create_ticket(db, empleado.id)
    mio = create_ticket(db, empleado.id, assigned_to=tecnico.id)
    create_ticket(db, empleado.id, assigned_to=otro_tecnico.id)

    ids = [t["id"] for t in client.get("/tickets/", headers=auth_headers(tecnico)).json()["items"]]
    assert sorted(ids) == sorted([sin_asignar.id, mio.id])


def test_admin_ve_todos_los_tickets(client, db):
    empleado = create_user(db, "employee")
    admin = create_user(db, "admin")
    t1 = create_ticket(db, empleado.id)
    t2 = create_ticket(db, empleado.id)

    ids = [t["id"] for t in client.get("/tickets/", headers=auth_headers(admin)).json()["items"]]
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

    como_empleado = client.get(f"/tickets/{ticket.id}/messages", headers=auth_headers(empleado)).json()["items"]
    assert [m["content"] for m in como_empleado] == ["respuesta publica"]

    como_tecnico = client.get(f"/tickets/{ticket.id}/messages", headers=auth_headers(tecnico)).json()["items"]
    assert sorted(m["content"] for m in como_tecnico) == ["nota interna", "respuesta publica"]


def test_metricas_empleado_solo_cuentan_sus_tickets(client, db):
    empleado = create_user(db, "employee")
    otro_empleado = create_user(db, "employee")
    create_ticket(db, empleado.id)
    create_ticket(db, empleado.id)
    create_ticket(db, otro_empleado.id)  # ajeno: no debe contar

    r = client.get("/metrics/", headers=auth_headers(empleado))
    assert r.status_code == 200
    data = r.json()
    assert data["total_tickets"] == 2
    assert data["tickets_by_status"]["created"] == 2
    assert data["resolved_by_technician"] == {}
    assert data["avg_resolution_by_technician"] == {}
    assert data["avg_resolution_by_technician_business"] == {}
    assert data["average_resolution_business_hours"] == 0.0


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


# --- ADMIN: gestión de usuarios (rol y activación) ---

def test_admin_cambia_rol_de_usuario(client, db):
    admin = create_user(db, "admin")
    empleado = create_user(db, "employee")

    r = client.patch(f"/users/{empleado.id}", json={"role": "technician"}, headers=auth_headers(admin))
    assert r.status_code == 200
    assert r.json()["role"] == "technician"
    assert r.json()["is_active"] is True


def test_admin_desactiva_usuario(client, db):
    admin = create_user(db, "admin")
    objetivo = create_user(db, "employee")

    r = client.patch(f"/users/{objetivo.id}", json={"is_active": False}, headers=auth_headers(admin))
    assert r.status_code == 200
    assert r.json()["is_active"] is False


def test_usuario_desactivado_no_puede_loguear(client, db):
    admin = create_user(db, "admin")
    objetivo = create_user(db, "employee")
    client.patch(f"/users/{objetivo.id}", json={"is_active": False}, headers=auth_headers(admin))

    r = client.post("/login", data={"username": objetivo.email, "password": PASSWORD})
    assert r.status_code == 403


def test_usuario_desactivado_no_accede_a_endpoints(client, db):
    admin = create_user(db, "admin")
    objetivo = create_user(db, "employee")
    client.patch(f"/users/{objetivo.id}", json={"is_active": False}, headers=auth_headers(admin))

    r = client.get("/tickets/", headers=auth_headers(objetivo))
    assert r.status_code == 403


def test_admin_no_puede_desactivarse_a_si_mismo(client, db):
    admin = create_user(db, "admin")

    r = client.patch(f"/users/{admin.id}", json={"is_active": False}, headers=auth_headers(admin))
    assert r.status_code == 400


def test_admin_no_puede_quitarse_el_rol_admin(client, db):
    admin = create_user(db, "admin")

    r = client.patch(f"/users/{admin.id}", json={"role": "technician"}, headers=auth_headers(admin))
    assert r.status_code == 400


def test_modificar_usuario_solo_admin(client, db):
    empleado = create_user(db, "employee")
    otro = create_user(db, "employee")

    r = client.patch(f"/users/{otro.id}", json={"role": "technician"}, headers=auth_headers(empleado))
    assert r.status_code == 403


def test_actualizar_usuario_inexistente_404(client, db):
    admin = create_user(db, "admin")

    r = client.patch("/users/99999", json={"role": "technician"}, headers=auth_headers(admin))
    assert r.status_code == 404


def test_admin_edita_nombre_y_correo_de_usuario(client, db):
    admin = create_user(db, "admin")
    objetivo = create_user(db, "employee")
    nuevo_email = f"editado-{uuid.uuid4().hex[:12]}@helpdesk-mock.com"

    r = client.patch(
        f"/users/{objetivo.id}",
        json={"name": "Nombre Editado", "email": nuevo_email},
        headers=auth_headers(admin),
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Nombre Editado"
    assert r.json()["email"] == nuevo_email


def test_admin_no_puede_repetir_correo_de_otro(client, db):
    admin = create_user(db, "admin")
    a = create_user(db, "employee")
    b = create_user(db, "employee")

    r = client.patch(f"/users/{b.id}", json={"email": a.email}, headers=auth_headers(admin))
    assert r.status_code == 400


def test_get_tickets_filtra_por_estado(client, db):
    admin = create_user(db, "admin")
    empleado = create_user(db, "employee")
    t_abierto = create_ticket(db, empleado.id)
    t_cerrado = create_ticket(db, empleado.id)
    t_cerrado.status = models.StatusEnum.solved
    db.commit()

    r = client.get("/tickets/?status=solved", headers=auth_headers(admin))
    ids = [t["id"] for t in r.json()["items"]]
    assert ids == [t_cerrado.id]
    assert t_abierto.id not in ids


def test_get_tickets_filtro_respeta_visibilidad_empleado(client, db):
    empleado = create_user(db, "employee")
    ajeno = create_user(db, "employee")
    mio = create_ticket(db, empleado.id)
    create_ticket(db, ajeno.id)

    r = client.get("/tickets/?status=created", headers=auth_headers(empleado))
    ids = [t["id"] for t in r.json()["items"]]
    assert ids == [mio.id]


def test_metricas_promedio_resolucion_por_tecnico(client, db):
    admin = create_user(db, "admin")
    tecnico = create_user(db, "technician")
    empleado = create_user(db, "employee")
    ticket = create_ticket(db, empleado.id, assigned_to=tecnico.id)
    ticket.status = models.StatusEnum.solved
    ticket.closed_at = ticket.created_at + timedelta(hours=2)
    db.commit()

    data = client.get("/metrics/", headers=auth_headers(admin)).json()
    assert data["avg_resolution_by_technician"] == {tecnico.name: 2.0}


# --- Horas hábiles (jornada lun-vie 07:30-17:00, sáb 07:30-12:00, en UTC-6) ---

def test_business_hours_mismo_dia():
    # lunes 13:30-16:00 UTC = 07:30-10:00 local => 2.5 h
    assert business_hours_between(datetime(2026, 10, 12, 13, 30), datetime(2026, 10, 12, 16, 0)) == 2.5


def test_business_hours_clampa_inicio_fuera_de_jornada():
    # inicio 06:00 UTC = 00:00 local: cuenta desde las 07:30 local => 2.5 h
    assert business_hours_between(datetime(2026, 10, 12, 6, 0), datetime(2026, 10, 12, 16, 0)) == 2.5


def test_business_hours_jornada_completa():
    # 07:30-17:00 local => 9.5 h
    assert business_hours_between(datetime(2026, 10, 12, 13, 30), datetime(2026, 10, 12, 23, 30)) == 9.5


def test_business_hours_viernes_a_lunes_incluye_sabado():
    # viernes 16:00 UTC (10:00 local) -> lunes 14:00 UTC (08:00 local):
    # vie 10:00-17:00 (7 h) + sáb 07:30-12:00 (4.5 h) + lun 07:30-08:00 (0.5 h) = 12 h
    assert business_hours_between(datetime(2026, 10, 16, 16, 0), datetime(2026, 10, 19, 14, 0)) == 12.0


def test_business_hours_sabado_medio_dia():
    # sábado 13:00 UTC (07:00 local) -> 19:30 UTC (13:30 local): ventana 07:30-12:00 => 4.5 h
    assert business_hours_between(datetime(2026, 10, 17, 13, 0), datetime(2026, 10, 17, 19, 30)) == 4.5


def test_business_hours_domingo_es_cero():
    assert business_hours_between(datetime(2026, 10, 18, 14, 0), datetime(2026, 10, 18, 20, 0)) == 0.0


def test_business_hours_fin_menor_o_igual_inicio_es_cero():
    assert business_hours_between(datetime(2026, 10, 12, 16, 0), datetime(2026, 10, 12, 13, 30)) == 0.0
    assert business_hours_between(datetime(2026, 10, 12, 13, 30), datetime(2026, 10, 12, 13, 30)) == 0.0


def test_metricas_resolucion_en_horas_habiles(client, db):
    admin = create_user(db, "admin")
    tecnico = create_user(db, "technician")
    empleado = create_user(db, "employee")
    ticket = create_ticket(db, empleado.id, assigned_to=tecnico.id)
    # Creado vie 16/10 16:00 UTC (10:00 local), resuelto lun 19/10 14:30 UTC (08:30 local)
    ticket.status = models.StatusEnum.solved
    ticket.created_at = datetime(2026, 10, 16, 16, 0)
    ticket.closed_at = datetime(2026, 10, 19, 14, 30)
    db.commit()

    data = client.get("/metrics/", headers=auth_headers(admin)).json()
    # vie 7 h + sáb 4.5 h + lun 1 h = 12.5 h hábiles; en calendario son 70.5 h
    assert data["average_resolution_business_hours"] == 12.5
    assert data["avg_resolution_by_technician_business"] == {tecnico.name: 12.5}
    assert data["average_resolution_time_hours"] > 12.5


def test_get_tickets_incluye_antiguedad_en_horas_habiles(client, db):
    admin = create_user(db, "admin")
    empleado = create_user(db, "employee")
    ticket = create_ticket(db, empleado.id)
    # Creado vie 16/10 14:00 UTC (08:00 local), cerrado 16:30 UTC (10:30 local) => 2.5 h hábiles
    ticket.status = models.StatusEnum.solved
    ticket.created_at = datetime(2026, 10, 16, 14, 0)
    ticket.closed_at = datetime(2026, 10, 16, 16, 30)
    db.commit()

    r = client.get("/tickets/", headers=auth_headers(admin))
    item = next(t for t in r.json()["items"] if t["id"] == ticket.id)
    assert item["business_age_hours"] == 2.5


# --- Tickets huérfanos al desactivar o degradar a un técnico ---

def test_desactivar_tecnico_devuelve_tickets_abiertos_al_pool(client, db):
    admin = create_user(db, "admin")
    tecnico = create_user(db, "technician")
    empleado = create_user(db, "employee")

    t_asignado = create_ticket(db, empleado.id, assigned_to=tecnico.id)
    t_asignado.status = models.StatusEnum.assigned
    t_en_proceso = create_ticket(db, empleado.id, assigned_to=tecnico.id)
    t_en_proceso.status = models.StatusEnum.in_process
    t_pendiente = create_ticket(db, empleado.id, assigned_to=tecnico.id)
    t_pendiente.status = models.StatusEnum.pending
    t_resuelto = create_ticket(db, empleado.id, assigned_to=tecnico.id)
    t_resuelto.status = models.StatusEnum.solved
    db.commit()

    r = client.patch(f"/users/{tecnico.id}", json={"is_active": False}, headers=auth_headers(admin))
    assert r.status_code == 200
    assert r.json()["is_active"] is False

    db.expire_all()
    # Los no iniciados vuelven al pool como 'created'
    assert db.get(models.Ticket, t_asignado.id).assigned_to is None
    assert db.get(models.Ticket, t_asignado.id).status == models.StatusEnum.created
    # El que ya estaba iniciado conserva 'in_process' (marcador de "ya iniciado") y queda sin asignar
    assert db.get(models.Ticket, t_en_proceso.id).assigned_to is None
    assert db.get(models.Ticket, t_en_proceso.id).status == models.StatusEnum.in_process
    # El pendiente también es abierto: vuelve al pool conservando 'pending'
    assert db.get(models.Ticket, t_pendiente.id).assigned_to is None
    assert db.get(models.Ticket, t_pendiente.id).status == models.StatusEnum.pending
    # Los resueltos no se tocan (ahí vive la atribución de las métricas)
    assert db.get(models.Ticket, t_resuelto.id).assigned_to == tecnico.id
    assert db.get(models.Ticket, t_resuelto.id).status == models.StatusEnum.solved


def test_degradar_tecnico_a_empleado_devuelve_al_pool(client, db):
    admin = create_user(db, "admin")
    tecnico = create_user(db, "technician")
    empleado = create_user(db, "employee")
    ticket = create_ticket(db, empleado.id, assigned_to=tecnico.id)
    ticket.status = models.StatusEnum.in_process
    db.commit()

    r = client.patch(f"/users/{tecnico.id}", json={"role": "employee"}, headers=auth_headers(admin))
    assert r.status_code == 200
    assert r.json()["role"] == "employee"

    db.expire_all()
    actualizado = db.get(models.Ticket, ticket.id)
    assert actualizado.assigned_to is None
    assert actualizado.status == models.StatusEnum.in_process


def test_reasignar_tickets_al_desactivar(client, db):
    admin = create_user(db, "admin")
    tecnico = create_user(db, "technician")
    relevo = create_user(db, "technician")
    empleado = create_user(db, "employee")
    ticket = create_ticket(db, empleado.id, assigned_to=tecnico.id)
    ticket.status = models.StatusEnum.in_process
    db.commit()

    r = client.patch(
        f"/users/{tecnico.id}",
        json={"is_active": False, "reassign_to": relevo.id},
        headers=auth_headers(admin),
    )
    assert r.status_code == 200

    db.expire_all()
    actualizado = db.get(models.Ticket, ticket.id)
    assert actualizado.assigned_to == relevo.id
    assert actualizado.status == models.StatusEnum.in_process


def test_reasignar_a_destino_invalido_da_400(client, db):
    admin = create_user(db, "admin")
    tecnico = create_user(db, "technician")
    empleado = create_user(db, "employee")
    inactivo = create_user(db, "technician")
    inactivo.is_active = False
    db.commit()
    ticket = create_ticket(db, empleado.id, assigned_to=tecnico.id)
    db.commit()

    # Empleado, técnico inactivo, id inexistente y el propio técnico: todos inválidos
    for destino in (empleado.id, inactivo.id, 999999, tecnico.id):
        r = client.patch(
            f"/users/{tecnico.id}",
            json={"is_active": False, "reassign_to": destino},
            headers=auth_headers(admin),
        )
        assert r.status_code == 400, f"destino {destino} debería ser inválido"

    # Nada se aplicó: el técnico sigue activo y el ticket sigue con él
    db.expire_all()
    assert db.get(models.User, tecnico.id).is_active is True
    assert db.get(models.Ticket, ticket.id).assigned_to == tecnico.id


def test_get_tickets_filtra_por_asignado(client, db):
    admin = create_user(db, "admin")
    tecnico = create_user(db, "technician")
    otro = create_user(db, "technician")
    empleado = create_user(db, "employee")
    propio = create_ticket(db, empleado.id, assigned_to=tecnico.id)
    ajeno = create_ticket(db, empleado.id, assigned_to=otro.id)
    create_ticket(db, empleado.id)  # sin asignar
    db.commit()

    r = client.get(f"/tickets/?assigned_to={tecnico.id}", headers=auth_headers(admin))
    ids = [t["id"] for t in r.json()["items"]]
    assert ids == [propio.id]
    assert ajeno.id not in ids


def test_filtro_asignado_respeta_visibilidad_tecnico(client, db):
    tecnico = create_user(db, "technician")
    otro = create_user(db, "technician")
    empleado = create_user(db, "employee")
    create_ticket(db, empleado.id, assigned_to=otro.id)
    db.commit()

    # El técnico no ve el ticket de otro técnico aunque filtre por su id
    r = client.get(f"/tickets/?assigned_to={otro.id}", headers=auth_headers(tecnico))
    assert r.json()["items"] == []


# --- Hallazgos de la auditoría (auth, reapertura, asignación, visibilidad) ---

def test_admin_desactivado_no_crea_usuarios(client, db):
    admin = create_user(db, "admin")
    headers = auth_headers(admin)  # token emitido antes de desactivarlo
    admin.is_active = False
    db.commit()

    r = client.post(
        "/users/",
        json={"name": "Nuevo", "email": f"n-{uuid.uuid4().hex[:8]}@helpdesk-mock.com",
              "password": PASSWORD, "role": "admin"},
        headers=headers,
    )
    assert r.status_code == 401


def test_patch_no_reabre_ticket_cerrado(client, db):
    empleado = create_user(db, "employee")
    ticket = create_ticket(db, empleado.id)
    ticket.status = models.StatusEnum.closed
    ticket.closed_at = datetime.utcnow() - timedelta(days=30)
    db.commit()

    r = client.patch(f"/tickets/{ticket.id}", json={"status": "in_process"}, headers=auth_headers(empleado))
    assert r.status_code == 400
    db.refresh(ticket)
    assert ticket.status == models.StatusEnum.closed


def test_tecnico_no_asigna_a_inexistente_ni_a_empleado(client, db):
    empleado = create_user(db, "employee")
    tecnico = create_user(db, "technician")
    ticket = create_ticket(db, empleado.id)

    for destino in (999999, empleado.id):
        r = client.patch(f"/tickets/{ticket.id}", json={"assigned_to": destino}, headers=auth_headers(tecnico))
        assert r.status_code == 400
    db.refresh(ticket)
    assert ticket.assigned_to is None


def test_tecnico_no_abre_ni_toma_ticket_de_otro_tecnico(client, db):
    empleado = create_user(db, "employee")
    tecnico_a = create_user(db, "technician")
    tecnico_b = create_user(db, "technician")
    ticket = create_ticket(db, empleado.id, assigned_to=tecnico_a.id)
    headers_b = auth_headers(tecnico_b)

    assert client.get(f"/tickets/{ticket.id}", headers=headers_b).status_code == 403
    assert client.get(f"/tickets/{ticket.id}/messages", headers=headers_b).status_code == 403
    r = client.patch(f"/tickets/{ticket.id}", json={"assigned_to": tecnico_b.id}, headers=headers_b)
    assert r.status_code == 403
    # el dueño de la asignación y el admin sí lo ven
    assert client.get(f"/tickets/{ticket.id}", headers=auth_headers(tecnico_a)).status_code == 200
    assert client.get(f"/tickets/{ticket.id}", headers=auth_headers(create_user(db, "admin"))).status_code == 200


def test_metricas_separan_tecnicos_homonimos(client, db):
    admin = create_user(db, "admin")
    empleado = create_user(db, "employee")
    tecnicos = [create_user(db, "technician", name="Juan"), create_user(db, "technician", name="Juan")]
    for horas, tecnico in zip((2, 4), tecnicos):
        ticket = create_ticket(db, empleado.id, assigned_to=tecnico.id)
        ticket.status = models.StatusEnum.solved
        ticket.closed_at = ticket.created_at + timedelta(hours=horas)
    db.commit()

    data = client.get("/metrics/", headers=auth_headers(admin)).json()
    assert data["avg_resolution_by_technician"] == {
        f"Juan (#{tecnicos[0].id})": 2.0,
        f"Juan (#{tecnicos[1].id})": 4.0,
    }
    assert data["resolved_by_technician"] == {f"Juan (#{t.id})": 1 for t in tecnicos}


# --- Auditoría (solo admin) ---

def test_auditoria_solo_admin(client, db):
    for rol in ("employee", "technician"):
        u = create_user(db, rol)
        for kind in ("tickets", "users"):
            assert client.get("/audit/", params={"kind": kind}, headers=auth_headers(u)).status_code == 403


def test_auditoria_de_usuarios_registra_cambios_reales(client, db):
    admin = create_user(db, "admin")
    h = auth_headers(admin)
    nuevo = client.post("/users/", headers=h, json={
        "name": "Ana", "email": "ana@helpdesk-mock.com", "password": "secreta1", "role": "employee",
    }).json()
    # role cambia; name igual al actual no debe registrarse
    client.patch(f"/users/{nuevo['id']}", headers=h, json={"role": "technician", "name": "Ana"})
    client.patch(f"/users/{nuevo['id']}/password", headers=h, json={"new_password": "otra-secreta"})

    r = client.get("/audit/", params={"kind": "users"}, headers=h).json()
    assert r["total"] == 3
    # más recientes primero
    assert [(e["action"], e["old_value"], e["new_value"]) for e in r["items"]] == [
        ("password", None, None),
        ("role", "employee", "technician"),
        ("created", None, "employee"),
    ]
    assert all(e["target_id"] == nuevo["id"] and e["changed_by"] == admin.id for e in r["items"])


def test_auditoria_de_tickets_y_paginacion(client, db):
    admin = create_user(db, "admin")
    empleado = create_user(db, "employee")
    ticket = create_ticket(db, empleado.id)
    h = auth_headers(admin)
    client.patch(f"/tickets/{ticket.id}", headers=h, json={"status": "in_process"})
    client.patch(f"/tickets/{ticket.id}", headers=h, json={"status": "solved"})

    todo = client.get("/audit/", headers=h).json()  # kind=tickets por defecto
    assert todo["total"] >= 2 and all(e["target_id"] == ticket.id for e in todo["items"])
    assert todo["items"][0]["new_value"] == "solved"
    pagina = client.get("/audit/", params={"limit": 1, "offset": 1}, headers=h).json()
    assert pagina["items"] == todo["items"][1:2]

    # Filtro por ticket: el historial de otro ticket no se mezcla
    otro = create_ticket(db, empleado.id)
    client.patch(f"/tickets/{otro.id}", headers=h, json={"status": "pending"})
    solo_otro = client.get("/audit/", params={"ticket_id": otro.id}, headers=h).json()
    assert solo_otro["total"] >= 1 and all(e["target_id"] == otro.id for e in solo_otro["items"])
    assert client.get("/audit/", params={"ticket_id": ticket.id}, headers=h).json()["total"] == todo["total"]


# --- Observación en cambios de estado (RF-04) ---

def test_cambio_de_estado_guarda_observacion(client, db):
    admin = create_user(db, "admin")
    empleado = create_user(db, "employee")
    ticket = create_ticket(db, empleado.id)
    h = auth_headers(admin)

    r = client.patch(f"/tickets/{ticket.id}", headers=h, json={"status": "pending", "comment": "  espera repuesto  "})
    assert r.status_code == 200 and r.json()["status"] == "pending"
    client.patch(f"/tickets/{ticket.id}", headers=h, json={"status": "solved", "comment": "   "})
    client.post(f"/tickets/{ticket.id}/reopen", headers=h, json={"comment": "falla otra vez"})

    items = client.get("/audit/", headers=h).json()["items"]
    por_estado = {(e["action"], e["new_value"]): e["comment"] for e in items}
    assert por_estado[("status_change", "pending")] == "espera repuesto"  # recortada
    assert por_estado[("status_change", "solved")] is None  # en blanco = sin observación
    assert por_estado[("reopened", "in_process")] == "falla otra vez"


def test_reabrir_sin_cuerpo_sigue_funcionando(client, db):
    empleado = create_user(db, "employee")
    ticket = create_ticket(db, empleado.id)
    ticket.status = models.StatusEnum.solved
    ticket.closed_at = datetime.utcnow()
    db.commit()

    r = client.post(f"/tickets/{ticket.id}/reopen", headers=auth_headers(empleado))
    assert r.status_code == 200 and r.json()["status"] == "in_process"


# --- Catálogos: departamentos y categorías ---

def test_catalogos_lectura_para_todos_escritura_solo_admin(client, db):
    empleado = create_user(db, "employee")
    tecnico = create_user(db, "technician")
    for u in (empleado, tecnico):
        h = auth_headers(u)
        assert client.get("/categories/", headers=h).status_code == 200
        assert client.get("/departments/", headers=h).status_code == 200
        assert client.post("/categories/", json={"name": "X"}, headers=h).status_code == 403
        assert client.post("/departments/", json={"name": "X"}, headers=h).status_code == 403
        assert client.patch("/categories/other", json={"name": "Y"}, headers=h).status_code == 403


def test_categorias_sembradas_y_alta_con_clave_derivada(client, db):
    admin = create_user(db, "admin")
    h = auth_headers(admin)
    claves = {c["key"] for c in client.get("/categories/", headers=h).json()}
    assert claves == {"network", "hardware", "software", "access", "email", "other"}

    r = client.post("/categories/", json={"name": "  Cámaras IP "}, headers=h)
    assert r.status_code == 201 and r.json() == {"key": "camaras_ip", "name": "Cámaras IP", "is_active": True}
    # nombre repetido (sin importar mayúsculas) o vacío
    assert client.post("/categories/", json={"name": "cámaras ip"}, headers=h).status_code == 400
    assert client.post("/categories/", json={"name": "   "}, headers=h).status_code == 400
    # renombrar no cambia la clave; renombrarse con otras mayúsculas vale
    r = client.patch("/categories/camaras_ip", json={"name": "CÁMARAS IP", "is_active": False}, headers=h)
    assert r.json() == {"key": "camaras_ip", "name": "CÁMARAS IP", "is_active": False}
    assert client.patch("/categories/camaras_ip", json={"name": "Red"}, headers=h).status_code == 400


def test_departamento_de_usuario_validado_y_auditado(client, db):
    admin = create_user(db, "admin")
    h = auth_headers(admin)
    ventas = client.post("/departments/", json={"name": "Ventas"}, headers=h).json()
    baja = client.post("/departments/", json={"name": "Baja"}, headers=h).json()
    client.patch(f"/departments/{baja['id']}", json={"is_active": False}, headers=h)
    empleado = create_user(db, "employee")

    assert client.patch(f"/users/{empleado.id}", json={"department_id": 9999}, headers=h).status_code == 400
    assert client.patch(f"/users/{empleado.id}", json={"department_id": baja["id"]}, headers=h).status_code == 400
    r = client.patch(f"/users/{empleado.id}", json={"department_id": ventas["id"]}, headers=h)
    assert r.json()["department_id"] == ventas["id"]
    # omitirlo no lo toca; null explícito lo quita
    assert client.patch(f"/users/{empleado.id}", json={"name": "Otro"}, headers=h).json()["department_id"] == ventas["id"]
    assert client.patch(f"/users/{empleado.id}", json={"department_id": None}, headers=h).json()["department_id"] is None

    acciones = [(e["action"], e["new_value"]) for e in client.get("/audit/", params={"kind": "users"}, headers=h).json()["items"]
                if e["action"] == "department_id"]
    assert acciones == [("department_id", "None"), ("department_id", str(ventas["id"]))]


def test_articulo_conserva_categoria_desactivada_pero_no_cambia_a_una(client, db):
    tecnico = create_user(db, "technician")
    h = auth_headers(tecnico)
    art = client.post("/library/", json={"title": "t", "problem": "p", "solution": "s", "category": "email"}, headers=h).json()
    db.get(models.Category, "email").is_active = False
    db.commit()
    assert client.patch(f"/library/{art['id']}", json={"title": "t2", "category": "email"}, headers=h).status_code == 200
    assert client.patch(f"/library/{art['id']}", json={"category": "nada"}, headers=h).status_code == 400
