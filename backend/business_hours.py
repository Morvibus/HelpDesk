"""Horas hábiles: única fuente del cálculo (tickets, métricas y semáforo del frontend)."""
from datetime import datetime, timezone, timedelta, time


# --- HORARIO LABORAL (métricas en horas hábiles) ---
# Los timestamps se guardan en UTC (DateTime sin timezone => naive = UTC). La jornada
# aplica en la zona local de la empresa: lun-vie 07:30-17:00 (9.5 h), sáb 07:30-12:00 (4.5 h),
# domingo sin jornada. Si cambia la zona o la jornada se ajusta SOLO acá.
LOCAL_TZ = timezone(timedelta(hours=-6))
WORK_WINDOWS = {
    0: (time(7, 30), time(17, 0)),  # lunes
    1: (time(7, 30), time(17, 0)),  # martes
    2: (time(7, 30), time(17, 0)),  # miércoles
    3: (time(7, 30), time(17, 0)),  # jueves
    4: (time(7, 30), time(17, 0)),  # viernes
    5: (time(7, 30), time(12, 0)),  # sábado
    6: None,                        # domingo
}


def _as_utc(dt):
    """Los timestamps de Postgres (DateTime plano) vuelven naive: se asumen UTC."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def business_hours_between(start, end):
    """Horas hábiles transcurridas entre start y end (NaN si no hay solape o end <= start)."""
    s = _as_utc(start).astimezone(LOCAL_TZ)
    e = _as_utc(end).astimezone(LOCAL_TZ)
    if e <= s:
        return 0.0

    total = 0.0
    day = s.date()
    while day <= e.date():
        window = WORK_WINDOWS.get(day.weekday())
        if window is not None:
            day_start = datetime.combine(day, window[0], tzinfo=LOCAL_TZ)
            day_end = datetime.combine(day, window[1], tzinfo=LOCAL_TZ)
            seg_start = max(s, day_start)
            seg_end = min(e, day_end)
            if seg_start < seg_end:
                total += (seg_end - seg_start).total_seconds() / 3600
        day += timedelta(days=1)

    return round(total, 2)


# SLA: un ticket abierto está "vencido" cuando pasa este umbral en horas hábiles según su prioridad.
# Es el mismo semáforo del frontend (AGE_THRESHOLDS en AdminPanel.jsx): cambiar ambos a la vez.
SLA_HOURS = {"high": 20, "medium": 30, "low": 48}
OPEN_STATUSES = ("created", "assigned", "in_process", "pending")


def is_overdue(ticket, now):
    status = getattr(ticket.status, "value", ticket.status)
    priority = getattr(ticket.priority, "value", ticket.priority)
    if status not in OPEN_STATUSES:
        return False
    return business_hours_between(ticket.created_at, now) > SLA_HOURS.get(priority, 48)


def local_day_bounds(date_from=None, date_to=None):
    """Fechas locales (inclusive) -> límites naive UTC [inicio, fin) para filtrar timestamps."""
    def utc(d, extra_days=0):
        local = datetime.combine(d, time.min, tzinfo=LOCAL_TZ) + timedelta(days=extra_days)
        return local.astimezone(timezone.utc).replace(tzinfo=None)
    return (utc(date_from) if date_from else None, utc(date_to, 1) if date_to else None)
