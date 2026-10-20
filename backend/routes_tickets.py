"""Tickets: alta, listado, detalle, mensajes, cambios de estado, reapertura, métricas e imágenes."""
from datetime import date, datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, Body, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session
from business_hours import business_hours_between, is_overdue, local_day_bounds
from database import get_db
from deps import get_current_user, _can_see_ticket, _valid_assignee, _check_catalog, UPLOAD_DIR
from realtime import notifier
import models
import schemas
import os
import uuid

router = APIRouter()


# --- CONFIGURACIÓN DE CARGA DE IMÁGENES ---
# UPLOAD_DIR viene de deps (el chat valida contra la misma carpeta)
os.makedirs(UPLOAD_DIR, exist_ok=True)


# Límite de tamaño y formatos permitidos. La extensión se deriva del content-type
# validado (nunca del filename) para que no se sirva HTML/JS desde /static.
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB
# Adjuntos (RF-02): imágenes y PDF. Tipo declarado -> (extensión, firma de los primeros bytes).
# La firma confirma el contenido real: el content-type lo declara el cliente y podría mentir.
ALLOWED_UPLOAD_TYPES = {
    "image/jpeg": ("jpg", lambda b: b[:3] == b"\xff\xd8\xff"),
    "image/png": ("png", lambda b: b[:8] == b"\x89PNG\r\n\x1a\n"),
    "image/gif": ("gif", lambda b: b[:4] == b"GIF8"),
    "image/webp": ("webp", lambda b: b[:4] == b"RIFF" and b[8:12] == b"WEBP"),
    "application/pdf": ("pdf", lambda b: b[:5] == b"%PDF-"),
}

# --- ENDPOINTS DE TICKETS PROTEGIDOS ---
@router.post("/tickets/", response_model=schemas.TicketResponse)
def create_ticket(
    ticket: schemas.TicketCreate, 
    background_tasks: BackgroundTasks, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.role != models.RoleEnum.employee:
        raise HTTPException(status_code=403, detail="Solo los empleados pueden crear tickets")
    if ticket.category is not None:
        _check_catalog(db, models.Category, ticket.category, "Categoría no válida")

    new_ticket = models.Ticket(
        title=ticket.title,
        description=ticket.description,
        priority=ticket.priority,
        ticket_type=ticket.ticket_type,
        category=ticket.category,
        department_id=current_user.department_id,  # copia: no cambia si el usuario se muda de área
        created_by=current_user.id
    )
    db.add(new_ticket)
    db.commit()
    db.refresh(new_ticket)
    
    background_tasks.add_task(
        notifier.notify_techs,
        "Nuevo Ticket Creado",
        f"#{new_ticket.id}: {new_ticket.title}",
        "🆕",
        "refresh",
        ticket_id=new_ticket.id,
        sound="work",  # trabajo nuevo para I&T
    )
    
    return new_ticket

@router.get("/tickets/", response_model=schemas.Page[schemas.TicketResponse])
def get_tickets(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    status: Optional[models.StatusEnum] = Query(None),
    priority: Optional[models.PriorityEnum] = Query(None),
    assigned_to: Optional[int] = Query(None),
    # Búsqueda (RF-10). q: número de ticket (si es solo dígitos) o texto en título/descripción
    q: Optional[str] = Query(None),
    created_by: Optional[int] = Query(None),
    category: Optional[str] = Query(None),
    department_id: Optional[int] = Query(None),
    asset_id: Optional[int] = Query(None),
    ticket_type: Optional[models.TicketTypeEnum] = Query(None),
    date_from: Optional[date] = Query(None),  # fechas locales de creación, inclusive
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user) # <- Requiere token válido
):
    # REGLA DE NEGOCIO: Visibilidad según el rol
    if current_user.role == models.RoleEnum.employee:
        # El empleado solo ve los tickets que él creó
        query = db.query(models.Ticket).filter(models.Ticket.created_by == current_user.id)
    elif current_user.role == models.RoleEnum.technician:
        # El técnico ve los no asignados o los asignados a él
        query = db.query(models.Ticket).filter(
            (models.Ticket.assigned_to == None) | (models.Ticket.assigned_to == current_user.id)
        )
    else:
        # Si es admin, ve todos
        query = db.query(models.Ticket)

    # Filtros opcionales: se aplican SIEMPRE después de la visibilidad por rol
    if status is not None:
        query = query.filter(models.Ticket.status == status)
    if priority is not None:
        query = query.filter(models.Ticket.priority == priority)
    if assigned_to is not None:
        query = query.filter(models.Ticket.assigned_to == assigned_to)
    if q and q.strip():
        texto = q.strip().lstrip("#")
        patron = f"%{texto}%"
        coincide = models.Ticket.title.ilike(patron) | models.Ticket.description.ilike(patron)
        if texto.isdigit():
            coincide = coincide | (models.Ticket.id == int(texto))
        query = query.filter(coincide)
    for columna, valor in (
        (models.Ticket.created_by, created_by), (models.Ticket.category, category),
        (models.Ticket.department_id, department_id), (models.Ticket.asset_id, asset_id),
        (models.Ticket.ticket_type, ticket_type),
    ):
        if valor is not None:
            query = query.filter(columna == valor)
    desde, hasta = local_day_bounds(date_from, date_to)
    if desde is not None:
        query = query.filter(models.Ticket.created_at >= desde)
    if hasta is not None:
        query = query.filter(models.Ticket.created_at < hasta)

    total = query.count()
    # Orden estable con id como desempate: así offset no salta/repite filas entre páginas
    tickets = query.order_by(
        models.Ticket.priority.desc(),
        models.Ticket.created_at.desc(),
        models.Ticket.id.desc(),
    ).offset(offset).limit(limit).all()

    # Antigüedad en horas hábiles por ticket (solo lectura; no persiste nada):
    # abierto => created_at -> now; cerrado => created_at -> closed_at
    now_utc = datetime.now(timezone.utc)
    for t in tickets:
        t.business_age_hours = business_hours_between(t.created_at, t.closed_at or now_utc)
        t.overdue = is_overdue(t, now_utc)

    return {"items": tickets, "total": total}

@router.get("/tickets/{ticket_id}", response_model=schemas.TicketResponse)
def get_ticket(
    ticket_id: int, 
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(get_current_user)
):
    # Buscamos el ticket en la base de datos
    db_ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    
    if not db_ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
        
    # REGLA DE SEGURIDAD: la misma visibilidad por rol que el listado
    if not _can_see_ticket(current_user, db_ticket):
        raise HTTPException(status_code=403, detail="No tienes permisos para ver este ticket")
        
    return db_ticket

@router.get("/tickets/{ticket_id}/messages", response_model=schemas.Page[schemas.MessageResponse])
def get_ticket_messages(
    ticket_id: int,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # REGLA DE SEGURIDAD: solo se leen mensajes de los tickets visibles para el rol
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    if not _can_see_ticket(current_user, ticket):
        raise HTTPException(status_code=403, detail="No tienes permisos sobre este ticket")

    # Buscamos los mensajes
    query = db.query(models.Message).filter(models.Message.ticket_id == ticket_id)
    
    # REGLA DE NEGOCIO: Si es empleado, ocultamos las notas privadas de los técnicos
    if current_user.role == models.RoleEnum.employee:
        query = query.filter(models.Message.is_private_note == False)

    total = query.count()
    # Más recientes primero (id como desempate): la primera página es la cola
    # del chat y offset avanza hacia el historial antiguo.
    messages = query.order_by(
        models.Message.created_at.desc(),
        models.Message.id.desc(),
    ).offset(offset).limit(limit).all()
    return {"items": messages, "total": total}

@router.patch("/tickets/{ticket_id}", response_model=schemas.TicketResponse)
def update_ticket(
    ticket_id: int, 
    ticket_update: schemas.TicketUpdate, 
    background_tasks: BackgroundTasks, # 1. Inyectamos la herramienta de FastAPI
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # 1. Buscamos el ticket
    db_ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not db_ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")

    # REGLA DE SEGURIDAD: solo se modifican los tickets visibles para el rol
    if not _can_see_ticket(current_user, db_ticket):
        raise HTTPException(status_code=403, detail="No tienes permisos para modificar este ticket")

    # REGLA DE NEGOCIO: un ticket resuelto/cerrado solo vuelve a abrirse por /reopen (límite de 72 h)
    cerrados = (models.StatusEnum.solved, models.StatusEnum.closed)
    if ticket_update.status is not None and db_ticket.status in cerrados and ticket_update.status not in cerrados:
        raise HTTPException(status_code=400, detail="Para reabrir un ticket usa la opción Reabrir")

    # 2. Si un técnico toma un ticket, la asignación se determina desde el usuario autenticado.
    previous_assignee_id = db_ticket.assigned_to
    assigned_to = ticket_update.assigned_to
    if (
        assigned_to is None
        and ticket_update.status == models.StatusEnum.in_process
        and db_ticket.assigned_to is None
        and current_user.role != models.RoleEnum.employee
    ):
        assigned_to = current_user.id

    # Observación (RF-04): acompaña a cada fila de historial de esta petición
    comment = (ticket_update.comment or "").strip() or None

    # Aplicamos la asignación y registramos el historial
    if assigned_to is not None:
        if current_user.role == models.RoleEnum.employee:
            raise HTTPException(status_code=403, detail="Los empleados no pueden asignarse tickets")
        if not _valid_assignee(db, assigned_to):
            raise HTTPException(status_code=400, detail="El ticket solo puede asignarse a un técnico o admin activo")

        history = models.TicketHistory(
            ticket_id=ticket_id, action=models.ActionEnum.status_change,
            changed_by=current_user.id, old_value=str(db_ticket.assigned_to), new_value=str(assigned_to),
            comment=comment,
        )
        db.add(history)
        db_ticket.assigned_to = assigned_to
        if db_ticket.status == models.StatusEnum.created:
            db_ticket.status = models.StatusEnum.assigned

    if ticket_update.status is not None:
        history = models.TicketHistory(
            ticket_id=ticket_id, action=models.ActionEnum.status_change,
            changed_by=current_user.id, old_value=db_ticket.status.value, new_value=ticket_update.status.value,
            comment=comment,
        )
        db.add(history)
        db_ticket.status = ticket_update.status

        if ticket_update.status in [models.StatusEnum.solved, models.StatusEnum.closed]:
            db_ticket.closed_at = datetime.now(timezone.utc)

    # Activo involucrado (CA-03): solo I&T lo vincula; null explícito desvincula
    if "asset_id" in ticket_update.model_fields_set and ticket_update.asset_id != db_ticket.asset_id:
        if current_user.role == models.RoleEnum.employee:
            raise HTTPException(status_code=403, detail="Solo el personal de I&T vincula activos")
        if ticket_update.asset_id is not None and db.get(models.Asset, ticket_update.asset_id) is None:
            raise HTTPException(status_code=400, detail="Activo no encontrado")
        db.add(models.TicketHistory(
            ticket_id=ticket_id, action=models.ActionEnum.asset_linked, changed_by=current_user.id,
            old_value=str(db_ticket.asset_id), new_value=str(ticket_update.asset_id), comment=comment,
        ))
        db_ticket.asset_id = ticket_update.asset_id

    db.commit()
    db.refresh(db_ticket)
    
    # 3. NOTIFICACIONES SEGURAS EN EL FONDO
    assignment_changed = db_ticket.assigned_to != previous_assignee_id
    if assignment_changed:
        background_tasks.add_task(
            notifier.notify_techs,
            f"Ticket #{db_ticket.id} asignado",
            "Un técnico tomó este ticket.",
            "👤",
            "refresh",
            db_ticket.id,
            current_user.id
        )
        # Al nuevo responsable (si no se lo asignó él mismo): es trabajo nuevo para él
        if db_ticket.assigned_to is not None and db_ticket.assigned_to != current_user.id:
            background_tasks.add_task(
                notifier.notify_user, db_ticket.assigned_to, f"Te asignaron el ticket #{db_ticket.id}",
                db_ticket.title, "👤", "refresh", db_ticket.id, sound="work",
            )

    if current_user.id != db_ticket.created_by:
        mensaje = "Tu ticket ha sido actualizado."
        icono = "🔔"
        
        if assignment_changed:
            mensaje = "Un técnico tomó tu ticket."
            icono = "👤"
        elif ticket_update.status is not None:
            mensaje = f"El estado cambió a: {db_ticket.status.value}"
            icono = "🔄"
            if db_ticket.status == models.StatusEnum.solved:
                icono = "✅"
                mensaje = "¡Tu ticket ha sido solucionado!"
                
        # Delegamos la tarea asíncrona a FastAPI de forma segura
        background_tasks.add_task(
            notifier.notify_user, 
            db_ticket.created_by,
            f"Ticket #{db_ticket.id} Actualizado",
            mensaje,
            icono,
            "refresh",
            db_ticket.id,
            sound="message",
        )

    

    return db_ticket


@router.post("/upload-image/")
async def upload_image(
    file: UploadFile = File(...), 
    current_user: models.User = Depends(get_current_user)
):
    # Imagen o PDF: tipo declarado permitido y contenido que coincide con su firma
    if file.content_type not in ALLOWED_UPLOAD_TYPES:
        raise HTTPException(status_code=400, detail="Formato no permitido: solo imágenes (jpg, png, gif, webp) o PDF")
    extension, firma_ok = ALLOWED_UPLOAD_TYPES[file.content_type]

    # Generamos un nombre único con la extensión derivada del content-type validado
    unique_filename = f"{uuid.uuid4()}.{extension}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    # Guardamos en disco por chunks, cortando si supera el límite (basura = se borra)
    try:
        total = 0
        with open(file_path, "wb") as buffer:
            while chunk := await file.read(1024 * 1024):
                if total == 0 and not firma_ok(chunk):
                    raise HTTPException(status_code=400, detail="El contenido del archivo no coincide con su tipo")
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="El archivo supera el límite de 5 MB")
                buffer.write(chunk)
    except Exception:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise

    # Devolvemos la ruta relativa; el frontend la resuelve con API_URL (src/api.js)
    image_url = f"/static/{unique_filename}"
    return {"image_url": image_url}

# Metricas

@router.get("/metrics/", response_model=schemas.MetricsResponse)
def get_metrics(
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(get_current_user)
):
    # Alcance por rol: el empleado solo cuenta SUS tickets; tech/admin ven todo el tablero.
    if current_user.role == models.RoleEnum.employee:
        query = db.query(models.Ticket).filter(models.Ticket.created_by == current_user.id)
    else:
        query = db.query(models.Ticket)

    # 1. Total histórico de tickets (del alcance)
    total_tickets = query.count()

    # 2. Conteo de tickets agrupados por su estado actual
    status_counts = (
        query.with_entities(models.Ticket.status, func.count(models.Ticket.id))
        .group_by(models.Ticket.status).all()
    )
    tickets_by_status = {status.value: count for status, count in status_counts}

    # 3. Tiempos de resolución (reales y hábiles) en UNA pasada sobre los resueltos del alcance:
    # business_hours_between no es agregable en SQL, así que todo se calcula en Python.
    resolved_tickets = query.filter(
        models.Ticket.status.in_([models.StatusEnum.solved, models.StatusEnum.closed]),
        models.Ticket.closed_at.isnot(None),
        models.Ticket.created_at.isnot(None),
    ).all()
    total_hours, total_business = 0.0, 0.0
    per_tech = {}  # id del técnico -> [conteo, horas reales, horas hábiles]
    for t in resolved_tickets:
        hours = (t.closed_at - t.created_at).total_seconds() / 3600
        business = business_hours_between(t.created_at, t.closed_at)
        total_hours += hours
        total_business += business
        if t.assigned_to is not None:
            acc = per_tech.setdefault(t.assigned_to, [0, 0.0, 0.0])
            acc[0] += 1
            acc[1] += hours
            acc[2] += business

    n = len(resolved_tickets)
    avg_time_hours = total_hours / n if n else 0.0
    avg_business_hours = total_business / n if n else 0.0

    # Por técnico (solo tech/admin): se agrupa por id; el nombre es solo la etiqueta y
    # dos técnicos homónimos se distinguen con su id para no mezclar sus métricas.
    resolved_by_tech, avg_resolution_by_tech, avg_business_by_tech = {}, {}, {}
    if current_user.role != models.RoleEnum.employee and per_tech:
        names = dict(db.query(models.User.id, models.User.name).filter(models.User.id.in_(per_tech)).all())
        repetidos = {name for name in names.values() if list(names.values()).count(name) > 1}
        for uid, (count, hours, business) in per_tech.items():
            label = f"{names[uid]} (#{uid})" if names[uid] in repetidos else names[uid]
            resolved_by_tech[label] = count
            avg_resolution_by_tech[label] = round(hours / count, 2)
            avg_business_by_tech[label] = round(business / count, 2)

    return {
        "total_tickets": total_tickets,
        "tickets_by_status": tickets_by_status,
        "average_resolution_time_hours": round(avg_time_hours, 2),
        "average_resolution_business_hours": round(avg_business_hours, 2),
        "resolved_by_technician": resolved_by_tech,
        "avg_resolution_by_technician": avg_resolution_by_tech,
        "avg_resolution_by_technician_business": avg_business_by_tech,
    }


@router.post("/tickets/{ticket_id}/reopen", response_model=schemas.TicketResponse)
def reopen_ticket(
    ticket_id: int,
    comment: Optional[str] = Body(None, embed=True),  # observación opcional (RF-04)
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # 1. Buscamos el ticket
    db_ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not db_ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
        
    # 2. Solo quien puede ver el ticket lo reabre (el empleado, solo los suyos)
    if not _can_see_ticket(current_user, db_ticket):
        raise HTTPException(status_code=403, detail="No puedes reabrir un ticket que no te pertenece")
        
    # 3. Validamos que el ticket esté realmente cerrado o solucionado
    if db_ticket.status not in [models.StatusEnum.solved, models.StatusEnum.closed]:
        raise HTTPException(status_code=400, detail="Solo se pueden reabrir tickets solucionados o cerrados")
        
    # 4. REGLA DE NEGOCIO: Límite de 72 horas para reabrir
    if db_ticket.closed_at:
        # Limpiamos las zonas horarias (tzinfo=None) de ambas fechas para que Python pueda restarlas sin error
        now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
        ticket_closed_at = db_ticket.closed_at.replace(tzinfo=None)
        
        time_since_closed = now_utc - ticket_closed_at
        
        if time_since_closed > timedelta(hours=72):
            raise HTTPException(status_code=400, detail="El tiempo límite para reabrir este ticket (72 horas) ha expirado")
                
    # 5. Guardamos el historial de auditoría
    history = models.TicketHistory(
        ticket_id=ticket_id,
        action=models.ActionEnum.reopened,
        changed_by=current_user.id,
        old_value=db_ticket.status.value,
        new_value=models.StatusEnum.in_process.value,
        comment=(comment or "").strip() or None,
    )
    db.add(history)
    
    # 6. Actualizamos el ticket: Lo devolvemos a proceso y limpiamos la fecha de cierre
    db_ticket.status = models.StatusEnum.in_process
    db_ticket.closed_at = None 
    
    db.commit()
    db.refresh(db_ticket)
    return db_ticket

