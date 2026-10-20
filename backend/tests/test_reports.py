"""Búsqueda de tickets (RF-10), vencidos por SLA y reportes de I&T (RF-11/12, CA-06)."""
from datetime import datetime, timedelta, timezone

import models
from business_hours import LOCAL_TZ, is_overdue
from conftest import auth_headers, create_ticket, create_user


def _ids(client, h, **params):
    return sorted(t["id"] for t in client.get("/tickets/", params=params, headers=h).json()["items"])


def test_busqueda_por_numero_texto_y_campos(client, db):
    ventas = models.Department(name="Ventas")
    db.add(ventas)
    db.commit()
    ana = create_user(db, "employee", name="Ana")
    beto = create_user(db, "employee", name="Beto")
    admin = create_user(db, "admin")
    h = auth_headers(admin)
    t1 = create_ticket(db, ana.id, title="Impresora atascada")
    t2 = create_ticket(db, beto.id, title="Sin correo")
    t2.category, t2.department_id, t2.ticket_type = "email", ventas.id, models.TicketTypeEnum.inquiry
    db.commit()

    assert _ids(client, h, q=str(t1.id)) == [t1.id]  # número
    assert _ids(client, h, q=f"#{t2.id}") == [t2.id]
    assert _ids(client, h, q="IMPRESORA") == [t1.id]  # texto sin distinguir mayúsculas
    assert _ids(client, h, created_by=beto.id) == [t2.id]
    assert _ids(client, h, category="email") == [t2.id]
    assert _ids(client, h, department_id=ventas.id) == [t2.id]
    assert _ids(client, h, ticket_type="inquiry") == [t2.id]


def test_busqueda_respeta_visibilidad_y_fechas(client, db):
    ana = create_user(db, "employee")
    beto = create_user(db, "employee")
    t_ana = create_ticket(db, ana.id, title="Pantalla negra")
    create_ticket(db, beto.id, title="Pantalla rota")
    # El filtro nunca amplía lo que el rol puede ver
    assert _ids(client, auth_headers(ana), q="pantalla") == [t_ana.id]
    assert _ids(client, auth_headers(ana), created_by=beto.id) == []

    viejo = create_ticket(db, ana.id, title="viejo")
    viejo.created_at = datetime.now(timezone.utc) - timedelta(days=40)
    db.commit()
    hoy = datetime.now(LOCAL_TZ).date()  # fecha local, como el backend (no la UTC del contenedor)
    h = auth_headers(create_user(db, "admin"))
    assert viejo.id not in _ids(client, h, date_from=str(hoy - timedelta(days=7)))
    assert _ids(client, h, date_to=str(hoy - timedelta(days=30))) == [viejo.id]


def test_vencido_segun_sla_en_horas_habiles(db):
    ana = create_user(db, "employee")
    t = create_ticket(db, ana.id)
    t.priority = models.PriorityEnum.high
    # Lunes 08:00 local (UTC-6) = 14:00 UTC; tres días hábiles después ya superó 20 h
    t.created_at = datetime(2026, 10, 12, 14, 0)
    assert is_overdue(t, datetime(2026, 10, 12, 20, 0, tzinfo=timezone.utc)) is False
    assert is_overdue(t, datetime(2026, 10, 15, 20, 0, tzinfo=timezone.utc)) is True
    t.status = models.StatusEnum.pending
    assert is_overdue(t, datetime(2026, 10, 15, 20, 0, tzinfo=timezone.utc)) is False  # esperando: no vence
    t.status = models.StatusEnum.solved
    assert is_overdue(t, datetime(2026, 10, 15, 20, 0, tzinfo=timezone.utc)) is False  # cerrado no vence


def test_reportes_solo_it_y_cuentas_verificables(client, db):
    ventas = models.Department(name="Ventas")
    db.add(ventas)
    db.commit()
    ana = create_user(db, "employee")
    tecnico = create_user(db, "technician", name="Tec")
    h = auth_headers(tecnico)
    assert client.get("/reports/summary", headers=auth_headers(ana)).status_code == 403

    asset = client.post("/assets/", json={"tag": "PC-9", "asset_type": "computer"}, headers=h).json()
    a = create_ticket(db, ana.id)
    a.category, a.department_id, a.asset_id = "email", ventas.id, asset["id"]
    b = create_ticket(db, ana.id)
    b.asset_id = asset["id"]
    b.status, b.assigned_to = models.StatusEnum.solved, tecnico.id
    b.closed_at = datetime.now(timezone.utc)
    c = create_ticket(db, ana.id)
    c.status = models.StatusEnum.pending
    c.created_at = datetime.now(timezone.utc) - timedelta(days=30)  # abierto viejo: vencido
    db.commit()
    hoy = datetime.now(LOCAL_TZ).date()  # fecha local, como el backend (no la UTC del contenedor)
    client.post(f"/assets/{asset['id']}/maintenances", json={"kind": "preventive", "scheduled_for": str(hoy - timedelta(days=1))}, headers=h)
    client.post(f"/assets/{asset['id']}/maintenances", json={"kind": "preventive", "scheduled_for": str(hoy + timedelta(days=5))}, headers=h)

    r = client.get("/reports/summary", params={"from": str(hoy - timedelta(days=7)), "to": str(hoy)}, headers=h).json()
    assert (r["created"], r["resolved"]) == (2, 1)  # c quedó fuera del período
    assert {x["key"]: x["count"] for x in r["by_category"]} == {"email": 1, None: 1}
    assert {x["label"]: x["count"] for x in r["by_department"]} == {"Ventas": 1, "Sin departamento": 1}
    assert r["by_technician"] == [{"key": str(tecnico.id), "label": "Tec", "count": 1, "avg_business_hours": r["by_technician"][0]["avg_business_hours"]}]
    assert r["top_assets"] == [{"key": str(asset["id"]), "label": "PC-9", "count": 2, "avg_business_hours": None}]
    # Foto actual: independiente del período
    # c es Pendiente y viejo: cuenta como pendiente pero NO como vencido (Pendiente no vence)
    assert (r["open_now"], r["pending_now"], r["overdue_now"]) == (2, 1, 0)
    assert (r["maintenances_overdue"], r["maintenances_upcoming"]) == (1, 1)
