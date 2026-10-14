"""Reportes e indicadores de I&T (RF-11/12, CA-06). Solo técnicos y admins.

Un solo endpoint de resumen: el período filtra lo creado/resuelto; lo "actual" (abiertos, vencidos,
mantenimientos, accesos vigentes) es una foto del momento. El frontend exporta cada tabla a CSV.
"""
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from business_hours import LOCAL_TZ, OPEN_STATUSES, business_hours_between, is_overdue, local_day_bounds
from database import get_db
from deps import get_current_user, _require_staff
import models
import schemas

router = APIRouter()


def _buckets(filas, nombres, sin):
    """[(key, count)] -> buckets ordenados por conteo, con etiqueta legible."""
    return [
        {"key": None if k is None else str(getattr(k, "value", k)), "count": c,
         "label": sin if k is None else nombres.get(k, str(getattr(k, "value", k)))}
        for k, c in sorted(filas, key=lambda f: (-f[1], str(f[0])))
    ]


@router.get("/reports/summary", response_model=schemas.ReportSummary)
def report_summary(
    date_from: Optional[date] = Query(None, alias="from"),
    date_to: Optional[date] = Query(None, alias="to"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    _require_staff(current_user)
    T = models.Ticket
    desde, hasta = local_day_bounds(date_from, date_to)

    def en_periodo(query, columna):
        if desde is not None:
            query = query.filter(columna >= desde)
        if hasta is not None:
            query = query.filter(columna < hasta)
        return query

    creados = en_periodo(db.query(T), T.created_at)
    agrupar = lambda col: creados.with_entities(col, func.count(T.id)).group_by(col).all()

    categorias = dict(db.query(models.Category.key, models.Category.name).all())
    departamentos = dict(db.query(models.Department.id, models.Department.name).all())
    usuarios = dict(db.query(models.User.id, models.User.name).all())
    sistemas = dict(db.query(models.AccessSystem.key, models.AccessSystem.name).all())

    # Resueltos en el período: por técnico, con promedio de horas hábiles (misma regla que /metrics/)
    resueltos = en_periodo(
        db.query(T).filter(T.status.in_([models.StatusEnum.solved, models.StatusEnum.closed]), T.closed_at.isnot(None)),
        T.closed_at,
    ).all()
    por_tecnico = {}
    for t in resueltos:
        acc = por_tecnico.setdefault(t.assigned_to, [0, 0.0])
        acc[0] += 1
        acc[1] += business_hours_between(t.created_at, t.closed_at)
    by_technician = _buckets([(k, v[0]) for k, v in por_tecnico.items()], usuarios, "Sin asignar")
    for b in by_technician:
        cuenta, horas = por_tecnico[None if b["key"] is None else int(b["key"])]
        b["avg_business_hours"] = round(horas / cuenta, 2)

    # Activos con más incidencias (tickets vinculados creados en el período)
    filas_activos = creados.filter(T.asset_id.isnot(None)).with_entities(T.asset_id, func.count(T.id)).group_by(T.asset_id).all()
    tags = dict(db.query(models.Asset.id, models.Asset.tag).filter(models.Asset.id.in_([a for a, _ in filas_activos])).all())
    top_assets = _buckets(filas_activos, tags, "")[:10]

    # Foto actual
    ahora = datetime.now(timezone.utc)
    abiertos = db.query(T).filter(T.status.in_(OPEN_STATUSES)).all()
    hoy = datetime.now(LOCAL_TZ).date()
    M = models.Maintenance
    programados = db.query(M).filter(M.status == models.MaintenanceStatusEnum.scheduled)
    A = models.AccessRequest
    vigentes = db.query(A.system, func.count(A.id)).filter(A.enabled_at.isnot(None), A.revoked_at.is_(None)).group_by(A.system).all()

    return {
        "created": creados.count(),
        "resolved": len(resueltos),
        "by_status": _buckets(agrupar(T.status), {}, ""),
        "by_type": _buckets(agrupar(T.ticket_type), {}, ""),
        "by_category": _buckets(agrupar(T.category), categorias, "Sin categoría"),
        "by_department": _buckets(agrupar(T.department_id), departamentos, "Sin departamento"),
        "by_technician": by_technician,
        "top_assets": top_assets,
        "open_now": len(abiertos),
        "overdue_now": sum(is_overdue(t, ahora) for t in abiertos),
        "pending_now": sum(t.status == models.StatusEnum.pending for t in abiertos),
        "maintenances_overdue": programados.filter(M.scheduled_for < hoy).count(),
        "maintenances_upcoming": programados.filter(M.scheduled_for >= hoy, M.scheduled_for <= hoy + timedelta(days=30)).count(),
        "access_enabled_by_system": _buckets(vigentes, sistemas, ""),
    }
