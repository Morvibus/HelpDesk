"""Activos (RF-06/07/08, CA-03): permisos, inventario, asignaciones, bitácora y vínculo con tickets."""
import models
from conftest import auth_headers, create_ticket, create_user


def _alta(client, h, tag="PC-001", asset_type="computer", **extra):
    return client.post("/assets/", json={"tag": tag, "asset_type": asset_type, **extra}, headers=h)


def test_solo_it_accede_a_activos(client, db):
    empleado = create_user(db, "employee")
    tecnico = create_user(db, "technician")
    h = auth_headers(empleado)
    assert client.get("/assets/", headers=h).status_code == 403
    assert _alta(client, h).status_code == 403
    assert _alta(client, auth_headers(tecnico)).status_code == 201  # técnicos sí gestionan


def test_alta_valida_codigo_y_tipo(client, db):
    h = auth_headers(create_user(db, "technician"))
    r = _alta(client, h, tag="  PC-001 ", brand="Dell")
    assert r.status_code == 201
    assert r.json()["tag"] == "PC-001" and r.json()["status"] == "active" and r.json()["current_assignment"] is None
    assert _alta(client, h, tag="pc-001").status_code == 400  # duplicado sin importar mayúsculas
    assert _alta(client, h, tag="   ").status_code == 400
    assert _alta(client, h, tag="X-1", asset_type="tostadora").status_code == 400
    # tipos sembrados desde el catálogo
    assert {"computer", "printer", "ups", "other"} <= {t["key"] for t in client.get("/asset-types/", headers=h).json()}


def test_asignar_mover_y_devolver_conserva_historial(client, db):
    tecnico = create_user(db, "technician")
    ana = create_user(db, "employee", name="Ana")
    ventas = models.Department(name="Ventas")
    db.add(ventas)
    db.commit()
    h = auth_headers(tecnico)
    asset = _alta(client, h).json()

    assert client.post(f"/assets/{asset['id']}/assign", json={}, headers=h).status_code == 400  # sin destino
    r = client.post(f"/assets/{asset['id']}/assign", json={"user_id": ana.id, "notes": "con cargador"}, headers=h)
    assert r.json()["current_assignment"]["user_id"] == ana.id
    # Mover a una ubicación cierra la asignación anterior
    r = client.post(f"/assets/{asset['id']}/assign", json={"department_id": ventas.id, "location": "Sala 2"}, headers=h)
    assert r.json()["current_assignment"]["location"] == "Sala 2"

    ficha = client.get(f"/assets/{asset['id']}", headers=h).json()
    assert [a["user_id"] for a in ficha["assignments"]] == [None, ana.id]  # más reciente primero
    assert ficha["assignments"][1]["returned_at"] is not None and ficha["assignments"][0]["returned_at"] is None

    r = client.post(f"/assets/{asset['id']}/return", json={"comment": "fin de proyecto"}, headers=h)
    assert r.json()["current_assignment"] is None
    assert client.post(f"/assets/{asset['id']}/return", headers=h).status_code == 400  # ya disponible
    eventos = client.get(f"/assets/{asset['id']}", headers=h).json()["events"]
    assert (eventos[0]["action"], eventos[0]["comment"]) == ("returned", "fin de proyecto")


def test_asignacion_rechaza_usuario_inactivo_y_activo_de_baja(client, db):
    h = auth_headers(create_user(db, "admin"))
    inactivo = create_user(db, "employee")
    inactivo.is_active = False
    db.commit()
    asset = _alta(client, h).json()
    assert client.post(f"/assets/{asset['id']}/assign", json={"user_id": inactivo.id}, headers=h).status_code == 400

    # No se da de baja algo asignado; tras devolverlo sí, y ya no se puede asignar
    client.post(f"/assets/{asset['id']}/assign", json={"location": "Bodega"}, headers=h)
    assert client.patch(f"/assets/{asset['id']}", json={"status": "retired"}, headers=h).status_code == 400
    client.post(f"/assets/{asset['id']}/return", headers=h)
    assert client.patch(f"/assets/{asset['id']}", json={"status": "retired"}, headers=h).status_code == 200
    assert client.post(f"/assets/{asset['id']}/assign", json={"location": "Bodega"}, headers=h).status_code == 400


def test_edicion_registra_solo_cambios_reales_en_bitacora(client, db):
    h = auth_headers(create_user(db, "technician"))
    asset = _alta(client, h, brand="Dell").json()
    client.patch(f"/assets/{asset['id']}", json={"brand": "Dell", "status": "in_repair", "comment": "no enciende"}, headers=h)
    client.post(f"/assets/{asset['id']}/notes", json={"comment": "se cambió la fuente"}, headers=h)
    assert client.post(f"/assets/{asset['id']}/notes", json={"comment": "  "}, headers=h).status_code == 400

    eventos = client.get(f"/assets/{asset['id']}", headers=h).json()["events"]
    assert [(e["action"], e["old_value"], e["new_value"], e["comment"]) for e in eventos] == [
        ("note", None, None, "se cambió la fuente"),
        ("status", "active", "in_repair", "no enciende"),  # brand igual: no se registra
        ("created", None, "PC-001", None),
    ]


def test_listado_filtra_y_resuelve_asignacion_vigente(client, db):
    h = auth_headers(create_user(db, "technician"))
    pc = _alta(client, h, tag="PC-001").json()
    _alta(client, h, tag="IMP-001", asset_type="printer", brand="HP")
    client.post(f"/assets/{pc['id']}/assign", json={"location": "Recepción"}, headers=h)

    todos = client.get("/assets/", headers=h).json()
    assert todos["total"] == 2
    assert {a["tag"]: (a["current_assignment"] or {}).get("location") for a in todos["items"]} == {
        "IMP-001": None, "PC-001": "Recepción",
    }
    assert [a["tag"] for a in client.get("/assets/", params={"q": "hp"}, headers=h).json()["items"]] == ["IMP-001"]
    assert client.get("/assets/", params={"asset_type": "printer"}, headers=h).json()["total"] == 1


def test_vincular_ticket_a_activo(client, db):
    tecnico = create_user(db, "technician")
    empleado = create_user(db, "employee")
    ticket = create_ticket(db, empleado.id)
    h = auth_headers(tecnico)
    asset = _alta(client, h).json()

    # El empleado no vincula activos; un activo inexistente se rechaza
    assert client.patch(f"/tickets/{ticket.id}", json={"asset_id": asset["id"]}, headers=auth_headers(empleado)).status_code == 403
    assert client.patch(f"/tickets/{ticket.id}", json={"asset_id": 9999}, headers=h).status_code == 400

    r = client.patch(f"/tickets/{ticket.id}", json={"asset_id": asset["id"], "comment": "falla de disco"}, headers=h)
    assert r.status_code == 200 and r.json()["asset_id"] == asset["id"]
    # CA-03: la ficha del activo muestra el ticket
    assert [t["id"] for t in client.get(f"/assets/{asset['id']}", headers=h).json()["tickets"]] == [ticket.id]

    # Desvincular con null explícito; omitirlo no lo toca
    client.patch(f"/tickets/{ticket.id}", json={"status": "in_process"}, headers=h)
    assert client.get(f"/tickets/{ticket.id}", headers=h).json()["asset_id"] == asset["id"]
    assert client.patch(f"/tickets/{ticket.id}", json={"asset_id": None}, headers=h).json()["asset_id"] is None

    admin = create_user(db, "admin")
    historial = client.get("/audit/", params={"ticket_id": ticket.id}, headers=auth_headers(admin)).json()["items"]
    vinculos = [(e["old_value"], e["new_value"], e["comment"]) for e in historial if e["action"] == "asset_linked"]
    assert vinculos == [(str(asset["id"]), "None", None), ("None", str(asset["id"]), "falla de disco")]


def test_directorio_de_personas_solo_it_y_sin_datos_sensibles(client, db):
    empleado = create_user(db, "employee", name="Ana")
    tecnico = create_user(db, "technician")
    assert client.get("/users/directory/", headers=auth_headers(empleado)).status_code == 403
    r = client.get("/users/directory/", headers=auth_headers(tecnico))
    assert r.status_code == 200
    assert set(r.json()[0]) == {"id", "name", "department_id", "is_active", "is_staff"}  # sin email ni rol


# --- Mantenimientos (RF-09, CA-05) ---

def _programar(client, h, asset_id, **extra):
    body = {"kind": "preventive", "scheduled_for": "2026-11-02", **extra}
    return client.post(f"/assets/{asset_id}/maintenances", json=body, headers=h)


def test_mantenimientos_solo_it(client, db):
    tecnico = create_user(db, "technician")
    asset = _alta(client, auth_headers(tecnico)).json()
    h = auth_headers(create_user(db, "employee"))
    assert client.get("/maintenances/", headers=h).status_code == 403
    assert _programar(client, h, asset["id"]).status_code == 403


def test_programar_valida_responsable_ticket_y_activo(client, db):
    tecnico = create_user(db, "technician")
    empleado = create_user(db, "employee")
    h = auth_headers(tecnico)
    asset = _alta(client, h).json()

    assert _programar(client, h, asset["id"], responsible_id=empleado.id).status_code == 400  # no es I&T
    assert _programar(client, h, asset["id"], ticket_id=9999).status_code == 400
    assert _programar(client, h, 9999).status_code == 404
    r = _programar(client, h, asset["id"], responsible_id=tecnico.id)
    assert r.status_code == 201
    assert (r.json()["status"], r.json()["asset_tag"]) == ("scheduled", "PC-001")

    client.patch(f"/assets/{asset['id']}", json={"status": "retired"}, headers=h)
    assert _programar(client, h, asset["id"]).status_code == 400  # dado de baja


def test_realizar_exige_acciones_y_es_final(client, db):
    tecnico = create_user(db, "technician")
    h = auth_headers(tecnico)
    asset = _alta(client, h).json()
    mant = _programar(client, h, asset["id"]).json()

    assert client.patch(f"/maintenances/{mant['id']}", json={"status": "done", "actions": "  "}, headers=h).status_code == 400
    r = client.patch(f"/maintenances/{mant['id']}", json={
        "status": "done", "findings": "polvo en ventiladores", "actions": "limpieza interna", "next_date": "2027-05-02",
    }, headers=h).json()
    assert r["status"] == "done" and r["completed_at"] is not None
    assert r["responsible_id"] == tecnico.id  # quien lo cierra queda como responsable
    assert r["next_date"] == "2027-05-02"
    # Solo se anota: no se programa uno nuevo
    assert client.get("/maintenances/", params={"asset_id": asset["id"]}, headers=h).json()["total"] == 1
    # Cerrado = final
    assert client.patch(f"/maintenances/{mant['id']}", json={"findings": "otra cosa"}, headers=h).status_code == 400


def test_consulta_filtra_y_ordena(client, db):
    h = auth_headers(create_user(db, "admin"))
    pc = _alta(client, h, tag="PC-001").json()
    imp = _alta(client, h, tag="IMP-001", asset_type="printer").json()
    lejos = _programar(client, h, pc["id"], scheduled_for="2026-12-01").json()
    cerca = _programar(client, h, imp["id"], scheduled_for="2026-10-20", kind="corrective").json()
    hecho = _programar(client, h, pc["id"], scheduled_for="2026-09-01").json()
    client.patch(f"/maintenances/{hecho['id']}", json={"status": "done", "actions": "ok"}, headers=h)
    cancelado = _programar(client, h, imp["id"], scheduled_for="2026-10-25").json()
    client.patch(f"/maintenances/{cancelado['id']}", json={"status": "cancelled"}, headers=h)

    ids = lambda **p: [m["id"] for m in client.get("/maintenances/", params=p, headers=h).json()["items"]]
    assert ids(status="scheduled") == [cerca["id"], lejos["id"]]  # el más próximo primero
    assert ids(status="scheduled", to="2026-10-31") == [cerca["id"]]  # rango inclusivo por fecha programada
    assert ids(status="done") == [hecho["id"]]
    assert ids(kind="corrective") == [cerca["id"]]
    assert ids(asset_id=pc["id"]) == [lejos["id"], hecho["id"]]  # sin estado: más reciente primero

    # La ficha del activo incluye sus mantenimientos (historial RF-07 / CA-05)
    ficha = client.get(f"/assets/{imp['id']}", headers=h).json()
    assert {m["id"] for m in ficha["maintenances"]} == {cerca["id"], cancelado["id"]}


def test_dar_de_baja_cancela_mantenimientos_programados(client, db):
    h = auth_headers(create_user(db, "technician"))
    asset = _alta(client, h).json()
    programado = _programar(client, h, asset["id"]).json()
    hecho = _programar(client, h, asset["id"]).json()
    client.patch(f"/maintenances/{hecho['id']}", json={"status": "done", "actions": "ok"}, headers=h)

    assert client.patch(f"/assets/{asset['id']}", json={"status": "retired"}, headers=h).status_code == 200
    ficha = client.get(f"/assets/{asset['id']}", headers=h).json()
    estados = {m["id"]: m["status"] for m in ficha["maintenances"]}
    assert estados == {programado["id"]: "cancelled", hecho["id"]: "done"}  # el realizado no se toca
    assert (ficha["events"][0]["action"], ficha["events"][0]["new_value"]) == ("maintenances_cancelled", "1")
