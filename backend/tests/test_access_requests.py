"""Solicitudes de acceso (RF-05, CA-04), separadas de los tickets: alta, permisos, flujo y comentarios."""
import models
from conftest import auth_headers, create_user


def _solicitar(client, user, system="sap", justification="Necesito ver reportes de ventas"):
    return client.post("/access-requests/", json={"system": system, "justification": justification}, headers=auth_headers(user))


def test_alta_independiente_de_tickets_y_sin_contrasenas(client, db):
    ventas = models.Department(name="Ventas")
    db.add(ventas)
    db.commit()
    empleado = create_user(db, "employee")
    empleado.department_id = ventas.id
    db.commit()

    r = _solicitar(client, empleado)
    assert r.status_code == 201
    acceso = r.json()
    assert (acceso["requested_by"], acceso["department_id"], acceso["state"]) == (empleado.id, ventas.id, "pending")
    assert [e["action"] for e in acceso["events"]] == ["created"]
    assert db.query(models.Ticket).count() == 0  # ya no crea ningún ticket
    # CA-04: ningún campo de contraseña, ni en el API ni en las tablas
    assert not any("pass" in campo for campo in acceso)
    for tabla in (models.AccessRequest, models.AccessEvent):
        assert not any("pass" in c.name for c in tabla.__table__.columns)
    # El tipo de ticket "acceso" ya no existe
    r = client.post("/tickets/", json={"title": "t", "description": "d", "ticket_type": "access_request"}, headers=auth_headers(empleado))
    assert r.status_code == 422


def test_alta_valida_sistema_y_justificacion(client, db):
    empleado = create_user(db, "employee")
    assert _solicitar(client, empleado, system="nasa").status_code == 400
    assert _solicitar(client, empleado, justification="   ").status_code == 400


def test_visibilidad_empleado_ve_solo_las_suyas(client, db):
    ana = create_user(db, "employee")
    beto = create_user(db, "employee")
    tecnico = create_user(db, "technician")
    a = _solicitar(client, ana).json()["id"]
    _solicitar(client, beto)

    assert [x["id"] for x in client.get("/access-requests/", headers=auth_headers(ana)).json()["items"]] == [a]
    assert client.get(f"/access-requests/{a}", headers=auth_headers(beto)).status_code == 403
    assert client.get("/access-requests/", headers=auth_headers(tecnico)).json()["total"] == 2  # I&T ve todas
    # El solicitante no registra decisiones
    assert client.post(f"/access-requests/{a}/decision", json={"decision": "not_required"}, headers=auth_headers(ana)).status_code == 403


def test_flujo_completo_y_filtro_por_estado(client, db):
    empleado = create_user(db, "employee")
    admin = create_user(db, "admin")
    h = auth_headers(admin)
    aid = _solicitar(client, empleado).json()["id"]
    url = f"/access-requests/{aid}"

    # Orden obligatorio
    assert client.post(f"{url}/enable", json={}, headers=h).status_code == 400
    assert client.post(f"{url}/decision", json={"decision": "approved"}, headers=h).status_code == 400  # falta aprobador
    r = client.post(f"{url}/decision", json={"decision": "approved", "approver_name": "Jefa de Ventas", "comment": "ok por correo"}, headers=h)
    assert (r.json()["state"], r.json()["approver_name"], r.json()["approval_recorded_by"]) == ("approved", "Jefa de Ventas", admin.id)
    assert client.post(f"{url}/decision", json={"decision": "rejected", "approver_name": "x"}, headers=h).status_code == 400
    assert [x["id"] for x in client.get("/access-requests/", params={"state": "approved"}, headers=h).json()["items"]] == [aid]

    client.post(f"{url}/enable", json={"comment": "usuario creado en SAP"}, headers=h)
    assert client.post(f"{url}/revoke", json={"comment": "  "}, headers=h).status_code == 400  # motivo obligatorio
    r = client.post(f"{url}/revoke", json={"comment": "baja del proyecto"}, headers=h).json()
    assert (r["state"], r["revoke_reason"]) == ("revoked", "baja del proyecto")
    assert [(e["action"], e["old_value"], e["new_value"], e["comment"]) for e in r["events"]] == [
        ("created", None, "pending", None),
        ("decision", "pending", "approved", "ok por correo"),
        ("enabled", "approved", "enabled", "usuario creado en SAP"),
        ("revoked", "enabled", "revoked", "baja del proyecto"),
    ]
    assert client.get("/access-requests/", params={"state": "nada"}, headers=h).status_code == 400


def test_no_requiere_rechazo_y_comentarios(client, db):
    empleado = create_user(db, "employee")
    otro = create_user(db, "employee")
    h = auth_headers(create_user(db, "technician"))
    a = _solicitar(client, empleado).json()["id"]
    assert client.post(f"/access-requests/{a}/decision", json={"decision": "not_required"}, headers=h).json()["state"] == "approved"
    assert client.post(f"/access-requests/{a}/enable", json={}, headers=h).json()["state"] == "enabled"

    b = _solicitar(client, empleado).json()["id"]
    client.post(f"/access-requests/{b}/decision", json={"decision": "rejected", "approver_name": "Dueño de SAP"}, headers=h)
    assert client.post(f"/access-requests/{b}/enable", json={}, headers=h).status_code == 400

    # Comentarios: solicitante e I&T conversan; un tercero no; vacío no
    assert client.post(f"/access-requests/{b}/comments", json={"comment": "¿por qué?"}, headers=auth_headers(empleado)).status_code == 200
    r = client.post(f"/access-requests/{b}/comments", json={"comment": "falta visto bueno"}, headers=h).json()
    assert [(e["action"], e["comment"]) for e in r["events"][-2:]] == [("comment", "¿por qué?"), ("comment", "falta visto bueno")]
    assert client.post(f"/access-requests/{b}/comments", json={"comment": "hola"}, headers=auth_headers(otro)).status_code == 403
    assert client.post(f"/access-requests/{b}/comments", json={"comment": " "}, headers=h).status_code == 400


def test_catalogo_de_sistemas(client, db):
    empleado = create_user(db, "employee")
    assert {"sap", "m365", "vpn"} <= {s["key"] for s in client.get("/access-systems/", headers=auth_headers(empleado)).json()}
    assert client.post("/access-systems/", json={"name": "CRM"}, headers=auth_headers(create_user(db, "technician"))).status_code == 403
    assert client.post("/access-systems/", json={"name": "CRM"}, headers=auth_headers(create_user(db, "admin"))).json()["key"] == "crm"
