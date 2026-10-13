from fastapi import FastAPI, Depends, HTTPException, Query, status, WebSocket, WebSocketDisconnect, UploadFile, File, BackgroundTasks
from typing import Optional
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import get_db
from jose import JWTError, jwt 
from datetime import datetime, timezone, timedelta, time
from security import SECRET_KEY, ALGORITHM
import models
import schemas
import security
import json
import os
import uuid
import asyncio

# El schema lo gestiona Alembic (ver entrypoint.sh): `alembic upgrade head`
# al arrancar el contenedor. `create_all` ya no se usa.

app = FastAPI(title="HelpDesk API", description="Canal oficial de resolución de problemas")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONFIGURACIÓN DE CARGA DE IMÁGENES ---
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Montamos la carpeta para que las imágenes sean accesibles vía URL
app.mount("/static", StaticFiles(directory=UPLOAD_DIR), name="static")

# Límite de tamaño y formatos permitidos. La extensión se deriva del content-type
# validado (nunca del filename) para que no se sirva HTML/JS desde /static.
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_IMAGE_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp"}

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

# Configuración de OAuth2 para que Swagger entienda dónde pedir el token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")
# Variante opcional: sin cabecera Authorization devuelve None en vez de fallar con 401
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="login", auto_error=False)


def get_optional_user(token: str = Depends(oauth2_scheme_optional), db: Session = Depends(get_db)):
    """Como get_current_user, pero devuelve None si no hay token o si no es válido."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            return None
    except JWTError:
        return None
    return db.query(models.User).filter(models.User.id == int(user_id)).first()

# --- ENDPOINTS DE AUTENTICACIÓN ---
@app.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # Nota: OAuth2 usa el campo 'username' por defecto, pero nosotros le pasaremos el correo.
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    
    if not user or not security.verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Cuenta desactivada por un administrador: se bloquea el acceso
    if user.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tu cuenta está desactivada. Contacta a un administrador.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # El token guardará el ID del usuario y su rol
    access_token = security.create_access_token(
        data={"sub": str(user.id), "role": user.role.value}
    )
    return {"access_token": access_token, "token_type": "bearer"}

# --- ENDPOINTS DE USUARIOS ---
@app.post("/users/", response_model=schemas.UserResponse)
def create_user(
    user: schemas.UserCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_optional_user)
):
    # REGLA DE SEGURIDAD: el registro público solo sirve para crear el PRIMER usuario.
    # A partir de ahí, crear usuarios (y elegir su rol) requiere token de administrador.
    if db.query(models.User).count() > 0:
        if current_user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Autenticación requerida",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if current_user.role != models.RoleEnum.admin:
            raise HTTPException(status_code=403, detail="Solo los administradores pueden crear usuarios")

    # Verificamos si el correo ya existe
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="El correo ya está registrado")

    # Encriptamos la contraseña antes de guardarla
    hashed_password = security.get_password_hash(user.password)
    
    new_user = models.User(
        name=user.name, 
        email=user.email, 
        password_hash=hashed_password, 
        role=user.role
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudieron validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # Decodificamos el token usando la misma clave secreta
        payload = jwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = db.query(models.User).filter(models.User.id == int(user_id)).first()
    if user is None:
        raise credentials_exception
    # Un usuario desactivado pierde acceso al instante, aunque su JWT no haya vencido
    if user.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tu cuenta está desactivada. Contacta a un administrador.",
        )
    return user

# --- ENDPOINTS DE TICKETS PROTEGIDOS ---
@app.post("/tickets/", response_model=schemas.TicketResponse)
def create_ticket(
    ticket: schemas.TicketCreate, 
    background_tasks: BackgroundTasks, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.role != models.RoleEnum.employee:
        raise HTTPException(status_code=403, detail="Solo los empleados pueden crear tickets")
        
    new_ticket = models.Ticket(
        title=ticket.title,
        description=ticket.description,
        priority=ticket.priority,
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
        "refresh" 
    )
    
    return new_ticket

# mostrar todos los empleados, técnicos y administradores 

@app.get("/users/", response_model=schemas.Page[schemas.UserResponse])
def get_users(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # REGLA DE NEGOCIO: Solo los administradores pueden ver la lista de usuarios
    if current_user.role != models.RoleEnum.admin:
        raise HTTPException(status_code=403, detail="No tienes permisos para ver la lista de usuarios")

    query = db.query(models.User)
    total = query.count()
    users = query.order_by(models.User.id.asc()).offset(offset).limit(limit).all()
    return {"items": users, "total": total}

# actualizar rol y estado de activación de un usuario (solo admin)
@app.patch("/users/{user_id}", response_model=schemas.UserResponse)
def update_user(
    user_id: int,
    user_update: schemas.UserUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # REGLA DE NEGOCIO: Solo los administradores pueden modificar usuarios
    if current_user.role != models.RoleEnum.admin:
        raise HTTPException(status_code=403, detail="No tienes permisos para modificar usuarios")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # ANTI LOCKOUT: un admin no puede desactivarse a sí mismo ni quitarse el rol admin
    if user_id == current_user.id:
        desactiva = user_update.is_active is False
        autodegrada = user_update.role is not None and user_update.role != models.RoleEnum.admin
        if desactiva or autodegrada:
            raise HTTPException(
                status_code=400,
                detail="No puedes desactivarte ni quitarte el rol de administrador a ti mismo",
            )

    # Estado resultante: si se desactiva o se degrada a empleado, sus tickets abiertos quedarían
    # sin nadie que los atienda (los técnicos solo ven los no asignados + los propios).
    role_resultante = user_update.role if user_update.role is not None else user.role
    activo_resultante = user_update.is_active if user_update.is_active is not None else user.is_active
    queda_huerfano = (not activo_resultante) or (role_resultante == models.RoleEnum.employee)

    tickets_afectados = []
    if queda_huerfano:
        tickets_afectados = (
            db.query(models.Ticket).filter(
                models.Ticket.assigned_to == user_id,
                models.Ticket.status.in_([
                    models.StatusEnum.created,
                    models.StatusEnum.assigned,
                    models.StatusEnum.in_process,
                ]),
            ).all()
        )

    # Validación temprana del destino (antes de mutar): técnico/admin activo y distinto del afectado
    reassign_to = user_update.reassign_to
    if reassign_to is not None and tickets_afectados:
        destino = db.query(models.User).filter(models.User.id == reassign_to).first()
        if (
            destino is None
            or not destino.is_active
            or destino.role not in (models.RoleEnum.technician, models.RoleEnum.admin)
            or destino.id == user_id
        ):
            raise HTTPException(
                status_code=400,
                detail="El técnico destino de la reasignación no es válido",
            )

    if user_update.role is not None:
        user.role = user_update.role
    if user_update.is_active is not None:
        user.is_active = user_update.is_active
    if user_update.name is not None:
        user.name = user_update.name
    if user_update.email is not None:
        # Unicidad del correo: puede repetir el propio, pero no el de otro usuario
        exists = (
            db.query(models.User)
            .filter(models.User.email == user_update.email, models.User.id != user_id)
            .first()
        )
        if exists:
            raise HTTPException(status_code=400, detail="El correo ya está registrado")
        user.email = user_update.email

    # Tickets abiertos: reasignar al técnico destino, o devolverlos al pool (sin asignar).
    # Los 'in_process' se conservan (señalan que ya estaban iniciados); el resto vuelve a 'created'.
    # Nunca se tocan solved/closed: ahí vive la atribución histórica de las métricas.
    for t in tickets_afectados:
        anterior = t.assigned_to
        if reassign_to is not None:
            t.assigned_to = reassign_to
            if t.status == models.StatusEnum.created:
                t.status = models.StatusEnum.assigned
        else:
            t.assigned_to = None
            if t.status != models.StatusEnum.in_process:
                t.status = models.StatusEnum.created
        db.add(models.TicketHistory(
            ticket_id=t.id,
            action=models.ActionEnum.status_change,
            changed_by=current_user.id,
            old_value=str(anterior),
            new_value=str(t.assigned_to),
        ))

    db.commit()
    db.refresh(user)

    # Aviso a los técnicos para que refresquen el tablero (los recién liberados aparecen sin asignar)
    if tickets_afectados:
        if reassign_to is not None:
            mensaje = f"{len(tickets_afectados)} ticket(s) reasignado(s) de {user.name}"
        else:
            mensaje = f"{len(tickets_afectados)} ticket(s) de {user.name} volvieron al pool"
        background_tasks.add_task(
            notifier.notify_techs,
            "Tickets actualizados",
            mensaje,
            "🔁",
            "refresh",
            None,
            current_user.id,
        )

    return user

# modificar password de un usuario (solo admin puede cambiar el password de otros usuarios)
@app.patch("/users/{user_id}/password", response_model=schemas.UserResponse)
def update_user_password(
    user_id: int, 
    password_update: schemas.UserPasswordUpdate, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # REGLA DE NEGOCIO: Solo los administradores pueden cambiar la contraseña de otros usuarios
    if current_user.role != models.RoleEnum.admin:
        raise HTTPException(status_code=403, detail="No tienes permisos para cambiar la contraseña de otros usuarios")
    
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # REGLA DE SEGURIDAD: si cambias TU contraseña tienes que demostrar la actual.
    # Un administrador reseteando la de otra persona no la conoce, por eso no aplica.
    if user_id == current_user.id:
        if not password_update.old_password or not security.verify_password(password_update.old_password, user.password_hash):
            raise HTTPException(status_code=400, detail="La contraseña actual no es correcta")

    # Encriptamos la nueva contraseña antes de guardarla
    hashed_password = security.get_password_hash(password_update.new_password)
    user.password_hash = hashed_password
    db.commit()
    db.refresh(user)
    
    return user

@app.get("/tickets/", response_model=schemas.Page[schemas.TicketResponse])
def get_tickets(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    status: Optional[models.StatusEnum] = Query(None),
    priority: Optional[models.PriorityEnum] = Query(None),
    assigned_to: Optional[int] = Query(None),
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

    return {"items": tickets, "total": total}

@app.get("/tickets/{ticket_id}", response_model=schemas.TicketResponse)
def get_ticket(
    ticket_id: int, 
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(get_current_user)
):
    # Buscamos el ticket en la base de datos
    db_ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    
    if not db_ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
        
    # REGLA DE SEGURIDAD: Un empleado solo puede ver sus propios tickets
    if current_user.role == models.RoleEnum.employee and db_ticket.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="No tienes permisos para ver este ticket")
        
    return db_ticket

@app.get("/tickets/{ticket_id}/messages", response_model=schemas.Page[schemas.MessageResponse])
def get_ticket_messages(
    ticket_id: int,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # REGLA DE SEGURIDAD: el empleado solo puede leer mensajes de SUS tickets
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    if current_user.role == models.RoleEnum.employee and ticket.created_by != current_user.id:
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

@app.patch("/tickets/{ticket_id}", response_model=schemas.TicketResponse)
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

    # REGLA DE SEGURIDAD: un empleado solo puede modificar sus propios tickets
    if current_user.role == models.RoleEnum.employee and db_ticket.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="No tienes permisos para modificar este ticket")

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

    # Aplicamos la asignación y registramos el historial
    if assigned_to is not None:
        if current_user.role == models.RoleEnum.employee:
            raise HTTPException(status_code=403, detail="Los empleados no pueden asignarse tickets")
        
        history = models.TicketHistory(
            ticket_id=ticket_id, action=models.ActionEnum.status_change,
            changed_by=current_user.id, old_value=str(db_ticket.assigned_to), new_value=str(assigned_to)
        )
        db.add(history)
        db_ticket.assigned_to = assigned_to
        if db_ticket.status == models.StatusEnum.created:
            db_ticket.status = models.StatusEnum.assigned

    if ticket_update.status is not None:
        history = models.TicketHistory(
            ticket_id=ticket_id, action=models.ActionEnum.status_change,
            changed_by=current_user.id, old_value=db_ticket.status.value, new_value=ticket_update.status.value
        )
        db.add(history)
        db_ticket.status = ticket_update.status
        
        from datetime import datetime, timezone
        if ticket_update.status in [models.StatusEnum.solved, models.StatusEnum.closed]:
            db_ticket.closed_at = datetime.now(timezone.utc)

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
            db_ticket.id
        )

    

    return db_ticket


@app.post("/upload-image/")
async def upload_image(
    file: UploadFile = File(...), 
    current_user: models.User = Depends(get_current_user)
):
    # Validamos que sea una imagen (content-type real declarado por el cliente)
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Formato de archivo no permitido")

    # Generamos un nombre único con la extensión derivada del content-type validado
    unique_filename = f"{uuid.uuid4()}.{ALLOWED_IMAGE_TYPES[file.content_type]}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    # Guardamos en disco por chunks, cortando si supera el límite (basura = se borra)
    try:
        total = 0
        with open(file_path, "wb") as buffer:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="La imagen supera el límite de 5 MB")
                buffer.write(chunk)
    except Exception:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise

    # Devolvemos la ruta relativa; el frontend la resuelve con API_URL (src/api.js)
    image_url = f"/static/{unique_filename}"
    return {"image_url": image_url}


# WebSocket

# Conexiones

class ConnectionManager:
    def __init__(self):
        # Guardaremos diccionarios: {"ws": websocket, "role": role}
        self.active_connections: dict[int, list[dict]] = {}

    async def connect(self, websocket: WebSocket, ticket_id: int, role: str, subprotocol: str = None):
        await websocket.accept(subprotocol=subprotocol)
        if ticket_id not in self.active_connections:
            self.active_connections[ticket_id] = []
        self.active_connections[ticket_id].append({"ws": websocket, "role": role})

    def disconnect(self, websocket: WebSocket, ticket_id: int):
        if ticket_id in self.active_connections:
            self.active_connections[ticket_id] = [
                c for c in self.active_connections[ticket_id] if c["ws"] != websocket
            ]

    async def broadcast(self, message: dict, ticket_id: int):
        for connection in list(self.active_connections.get(ticket_id, [])):
            # REGLA DE SEGURIDAD: Si es nota privada, omitimos a los empleados
            if message.get("is_private_note") and connection["role"] == "employee":
                continue
            try:
                await connection["ws"].send_json(message)
            except Exception:
                # Socket muerto: lo retiramos sin abortar el envío al resto
                self.disconnect(connection["ws"], ticket_id)

manager = ConnectionManager()

# --- MENSAJERÍA: CANAL DE CHAT EN VIVO (WebSocket) ---

def _ws_subprotocol_token(websocket: WebSocket) -> tuple[str, str]:
    """Lee Sec-WebSocket-Protocol esperando 'auth, <jwt>'.

    El token viaja como subprotocolo (no en la query string) para que no quede
    registrado en logs de proxies o servidores. Devuelve (subprotocolo, token).
    """
    header = websocket.headers.get("sec-websocket-protocol", "")
    parts = [p.strip() for p in header.split(",") if p.strip()]
    if len(parts) == 2 and parts[0] == "auth":
        return parts[0], parts[1]
    return None, None


def _save_chat_message(db, ticket_id: int, user_id: int, content: str, is_private: bool) -> models.Message:
    """Guarda un mensaje de chat (síncrono; llamar con asyncio.to_thread).

    El refresh final pobla todos los atributos para que el hilo del event loop
    pueda leerlos sin disparar una consulta lazy.
    """
    new_message = models.Message(
        ticket_id=ticket_id,
        sender_id=user_id,
        content=content,
        is_private_note=is_private
    )
    db.add(new_message)
    db.commit()
    db.refresh(new_message)
    return new_message


@app.websocket("/ws/tickets/{ticket_id}/chat")
async def chat_websocket(
    websocket: WebSocket, 
    ticket_id: int, 
    db: Session = Depends(get_db)
):
    from jose import jwt
    subprotocol, token = _ws_subprotocol_token(websocket)
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
        user_role = payload.get("role")
    except Exception as e:
        print(f" [Chat] Error al decodificar token: {e}")
        await websocket.close(code=1008)
        return

    # REGLA DE SEGURIDAD: solo el dueño del ticket o técnicos/administradores entran al chat
    # (la sesión SQL es síncrona: se consulta con to_thread para no bloquear el event loop;
    #  el uso es secuencial, así que la misma sesión no se comparte en paralelo)
    ticket = await asyncio.to_thread(
        lambda: db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    )
    if ticket is None or (ticket.created_by != user_id and user_role not in ("technician", "admin")):
        print(f" [Chat] Acceso denegado al ticket #{ticket_id} para usuario {user_id}")
        await websocket.close(code=1008)
        return

    await manager.connect(websocket, ticket_id, user_role, subprotocol)
    print(f" [Chat] Usuario {user_id} ({user_role}) conectado al ticket #{ticket_id}")

    try:
        while True:
            data = await websocket.receive_json()
            
            # 1. Guardamos en base de datos (síncrono → fuera del event loop)
            is_private = data.get("is_private_note", False)
            new_message = await asyncio.to_thread(
                _save_chat_message, db, ticket_id, user_id, data["content"], is_private
            )
            
            # 2. El broadcast para los que están viendo el chat
            await manager.broadcast({
                "id": new_message.id,
                "sender_id": new_message.sender_id,
                "content": new_message.content,
                "is_private_note": new_message.is_private_note,
                "created_at": new_message.created_at.isoformat()
            }, ticket_id)
            
            # 3. ALERTA GLOBAL PARA LOS QUE ESTÁN EN EL DASHBOARD
            db_ticket = await asyncio.to_thread(
                lambda: db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
            )
            msg_resumen = new_message.content[:30] + "..." if len(new_message.content) > 30 else new_message.content

            if is_private:
                titulo, icono = f"Nota Interna (Ticket #{ticket_id})", "🔒"
            elif user_role == "employee":
                titulo, icono = f"Nuevo mensaje (Ticket #{ticket_id})", "💬"
            else:
                titulo, icono = f"Soporte IT (Ticket #{ticket_id})", "💬"

            await notifier.notify_ticket_message(
                db_ticket.created_by,
                db_ticket.assigned_to,
                titulo,
                msg_resumen,
                icono,
                "new_message",
                ticket_id,
                exclude_user_id=user_id,
                is_private=is_private,
            )
            
    except WebSocketDisconnect:
        # El cliente cerró la pestaña
        pass
    finally:
        # Siempre damos de baja la conexión, aunque salga por un error distinto
        manager.disconnect(websocket, ticket_id)

# Metricas

@app.get("/metrics/", response_model=schemas.MetricsResponse)
def get_metrics(
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(get_current_user)
):
    # Alcance por rol: el empleado solo cuenta SUS tickets; tech/admin ven todo el tablero.
    if current_user.role == models.RoleEnum.employee:
        query = db.query(models.Ticket).filter(models.Ticket.created_by == current_user.id)
        resolved_by_tech = {}
        avg_resolution_by_tech = {}
        avg_business_by_tech = {}
    else:
        query = db.query(models.Ticket)
        resolved_by_tech = {
            name: count for name, count in db.query(models.User.name, func.count(models.Ticket.id))
            .join(models.Ticket, models.User.id == models.Ticket.assigned_to)
            .filter(models.Ticket.status.in_([models.StatusEnum.solved, models.StatusEnum.closed]))
            .group_by(models.User.name).all()
        }

        # Promedio de horas de resolución por técnico (closed_at - created_at)
        resolution_rows = (
            db.query(
                models.User.name,
                func.avg(func.extract("epoch", models.Ticket.closed_at - models.Ticket.created_at)) / 3600,
            )
            .join(models.Ticket, models.User.id == models.Ticket.assigned_to)
            .filter(models.Ticket.status.in_([models.StatusEnum.solved, models.StatusEnum.closed]))
            .group_by(models.User.name)
            .all()
        )
        avg_resolution_by_tech = {name: round(avg, 2) for name, avg in resolution_rows if avg is not None}
        avg_business_by_tech = {}

    # 1. Total histórico de tickets (del alcance)
    total_tickets = query.count()

    # 2. Conteo de tickets agrupados por su estado actual
    status_counts = (
        query.with_entities(models.Ticket.status, func.count(models.Ticket.id))
        .group_by(models.Ticket.status).all()
    )
    tickets_by_status = {status.value: count for status, count in status_counts}

    # 3. Cálculo de tiempo promedio de resolución (en horas) sobre el alcance
    resolved_tickets = query.filter(models.Ticket.closed_at.isnot(None)).all()
    avg_time_hours = 0.0
    if resolved_tickets:
        total_seconds = sum((t.closed_at - t.created_at).total_seconds() for t in resolved_tickets)
        avg_time_hours = (total_seconds / len(resolved_tickets)) / 3600

    # 3b. Promedios en horas hábiles (business_hours_between no es agregable en SQL:
    # se calculan en Python sobre los tickets resueltos del alcance).
    avg_business_hours = 0.0
    if resolved_tickets:
        business_times = [
            business_hours_between(t.created_at, t.closed_at)
            for t in resolved_tickets
            if t.closed_at is not None and t.created_at is not None
        ]
        if business_times:
            avg_business_hours = sum(business_times) / len(business_times)

        if current_user.role != models.RoleEnum.employee:
            user_names = dict(db.query(models.User.id, models.User.name).all())
            per_tech_business = {}
            for t in resolved_tickets:
                if t.assigned_to is None or t.created_at is None or t.closed_at is None:
                    continue
                name = user_names.get(t.assigned_to)
                if name is None:
                    continue
                per_tech_business.setdefault(name, []).append(
                    business_hours_between(t.created_at, t.closed_at)
                )
            avg_business_by_tech = {
                name: round(sum(values) / len(values), 2)
                for name, values in per_tech_business.items()
            }

    return {
        "total_tickets": total_tickets,
        "tickets_by_status": tickets_by_status,
        "average_resolution_time_hours": round(avg_time_hours, 2),
        "average_resolution_business_hours": round(avg_business_hours, 2),
        "resolved_by_technician": resolved_by_tech,
        "avg_resolution_by_technician": avg_resolution_by_tech,
        "avg_resolution_by_technician_business": avg_business_by_tech,
    }


@app.post("/tickets/{ticket_id}/reopen", response_model=schemas.TicketResponse)
def reopen_ticket(
    ticket_id: int, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # 1. Buscamos el ticket
    db_ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not db_ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
        
    # 2. Validamos que el empleado sea el dueño del ticket
    if current_user.role == models.RoleEnum.employee and db_ticket.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="No puedes reabrir un ticket que no te pertenece")
        
    # 3. Validamos que el ticket esté realmente cerrado o solucionado
    if db_ticket.status not in [models.StatusEnum.solved, models.StatusEnum.closed]:
        raise HTTPException(status_code=400, detail="Solo se pueden reabrir tickets solucionados o cerrados")
        
    # 4. REGLA DE NEGOCIO: Límite de 72 horas para reabrir

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
        new_value=models.StatusEnum.in_process.value
    )
    db.add(history)
    
    # 6. Actualizamos el ticket: Lo devolvemos a proceso y limpiamos la fecha de cierre
    db_ticket.status = models.StatusEnum.in_process
    db_ticket.closed_at = None 
    
    db.commit()
    db.refresh(db_ticket)
    return db_ticket

# --- BIBLIOTECA DE PROBLEMAS Y SOLUCIONES ---

# Roles que pueden publicar (los empleados solo leen)
STAFF_ROLES = (models.RoleEnum.technician, models.RoleEnum.admin)


@app.post("/library/", response_model=schemas.ArticleResponse, status_code=status.HTTP_201_CREATED)
def create_article(
    article: schemas.ArticleCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # REGLA DE NEGOCIO: solo técnicos y admins publican en la biblioteca
    if current_user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="Solo técnicos y administradores pueden publicar en la biblioteca")

    if article.ticket_id is not None:
        db_ticket = db.query(models.Ticket).filter(models.Ticket.id == article.ticket_id).first()
        if not db_ticket:
            raise HTTPException(status_code=404, detail="Ticket no encontrado")
        # Solo tiene sentido archivar tickets ya resueltos o cerrados
        if db_ticket.status not in (models.StatusEnum.solved, models.StatusEnum.closed):
            raise HTTPException(status_code=400, detail="Solo se pueden archivar tickets resueltos o cerrados")
        # Una sola entrada por ticket (evita duplicados)
        ya_existe = db.query(models.KnowledgeArticle).filter(
            models.KnowledgeArticle.ticket_id == article.ticket_id
        ).first()
        if ya_existe:
            raise HTTPException(status_code=409, detail="Este ticket ya está en la biblioteca")

    db_article = models.KnowledgeArticle(
        ticket_id=article.ticket_id,
        title=article.title,
        problem=article.problem,
        solution=article.solution,
        category=article.category,
        created_by=current_user.id,
    )
    db.add(db_article)
    db.commit()
    db.refresh(db_article)
    return db_article


@app.get("/library/", response_model=schemas.Page[schemas.ArticleResponse])
def get_articles(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    q: Optional[str] = Query(None),
    category: Optional[models.CategoryEnum] = Query(None),
    ticket_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Lectura abierta a cualquier usuario autenticado: los empleados pueden
    # consultar la biblioteca para autoservicio.
    query = db.query(models.KnowledgeArticle)

    if q and q.strip():
        patron = f"%{q.strip()}%"
        query = query.filter(
            models.KnowledgeArticle.title.ilike(patron)
            | models.KnowledgeArticle.problem.ilike(patron)
            | models.KnowledgeArticle.solution.ilike(patron)
        )
    if category is not None:
        query = query.filter(models.KnowledgeArticle.category == category)
    if ticket_id is not None:
        query = query.filter(models.KnowledgeArticle.ticket_id == ticket_id)

    total = query.count()
    # Orden estable con id como desempate (el mismo criterio que el resto de listados)
    articles = query.order_by(
        models.KnowledgeArticle.created_at.desc(),
        models.KnowledgeArticle.id.desc(),
    ).offset(offset).limit(limit).all()
    return {"items": articles, "total": total}


@app.get("/library/{article_id}", response_model=schemas.ArticleResponse)
def get_article(
    article_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_article = db.query(models.KnowledgeArticle).filter(models.KnowledgeArticle.id == article_id).first()
    if not db_article:
        raise HTTPException(status_code=404, detail="Artículo no encontrado")
    return db_article


@app.patch("/library/{article_id}", response_model=schemas.ArticleResponse)
def update_article(
    article_id: int,
    article: schemas.ArticleUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_article = db.query(models.KnowledgeArticle).filter(models.KnowledgeArticle.id == article_id).first()
    if not db_article:
        raise HTTPException(status_code=404, detail="Artículo no encontrado")

    # REGLA DE NEGOCIO: solo el autor o un admin editan
    if current_user.role != models.RoleEnum.admin and db_article.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Solo el autor o un administrador pueden editar este artículo")

    for campo, valor in article.model_dump(exclude_unset=True).items():
        setattr(db_article, campo, valor)
    db.commit()
    db.refresh(db_article)
    return db_article


@app.delete("/library/{article_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_article(
    article_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_article = db.query(models.KnowledgeArticle).filter(models.KnowledgeArticle.id == article_id).first()
    if not db_article:
        raise HTTPException(status_code=404, detail="Artículo no encontrado")

    # REGLA DE NEGOCIO: solo el autor o un admin eliminan
    if current_user.role != models.RoleEnum.admin and db_article.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Solo el autor o un administrador pueden eliminar este artículo")

    db.delete(db_article)
    db.commit()
    return None


# --- GESTOR DE NOTIFICACIONES GLOBALES ---
class NotificationManager:
    def __init__(self):
        # Un usuario puede tener varias pestañas abiertas: lista de conexiones por usuario
        self.active_connections: dict[int, list[dict]] = {}

    async def connect(self, websocket: WebSocket, user_id: int, role: str, subprotocol: str = None):
        await websocket.accept(subprotocol=subprotocol)
        self.active_connections.setdefault(user_id, []).append({"ws": websocket, "role": role})

    def disconnect(self, websocket: WebSocket, user_id: int):
        # Solo se retira LA pestaña que se desconecta; las demás siguen vivas
        conns = self.active_connections.get(user_id, [])
        conns[:] = [c for c in conns if c["ws"] is not websocket]
        if not conns:
            self.active_connections.pop(user_id, None)

    async def _send_safe(self, user_id: int, conn: dict, payload: dict):
        try:
            await conn["ws"].send_json(payload)
        except Exception:
            # Socket muerto: se da de baja sin romper el resto de envíos
            self.disconnect(conn["ws"], user_id)

    async def notify_user(self, user_id: int, title: str, message: str, icon: str = "🔔", msg_type: str = "toast", ticket_id: int = None, exclude_user_id: int = None):
        # Verificamos que el destinatario no sea la misma persona que originó el mensaje
        if user_id == exclude_user_id:
            return
        payload = {"type": msg_type, "title": title, "message": message, "icon": icon, "ticket_id": ticket_id}
        for conn in list(self.active_connections.get(user_id, [])):
            await self._send_safe(user_id, conn, payload)

    async def notify_techs(self, title: str, message: str, icon: str = "🔔", msg_type: str = "toast", ticket_id: int = None, exclude_user_id: int = None):
        payload = {"type": msg_type, "title": title, "message": message, "icon": icon, "ticket_id": ticket_id}
        for uid, conns in list(self.active_connections.items()):
            # Filtramos para que no le llegue a los empleados NI al usuario que originó el mensaje
            if uid == exclude_user_id:
                continue
            for conn in list(conns):
                if conn["role"] != "employee":
                    await self._send_safe(uid, conn, payload)

    async def notify_ticket_message(
        self,
        created_by: int,
        assigned_to: int = None,
        title: str = "",
        message: str = "",
        icon: str = "💬",
        msg_type: str = "new_message",
        ticket_id: int = None,
        exclude_user_id: int = None,
        is_private: bool = False,
    ):
        """Reparte el aviso de un mensaje de chat según su visibilidad.

        Se recorre cada conexión una sola vez: así nadie recibe el aviso duplicado
        aunque cumpla varios criterios (asignado que además es admin). Reglas:
        - Nota privada: solo staff (técnicos y admins); JAMÁS un empleado.
        - Mensaje público: creador + asignado + (técnicos si no hay asignado) + admins.
        El emisor nunca se auto-notifica.
        """
        payload = {"type": msg_type, "title": title, "message": message, "icon": icon, "ticket_id": ticket_id}
        for uid, conns in list(self.active_connections.items()):
            if uid == exclude_user_id:
                continue
            for conn in list(conns):
                role = conn["role"]
                if is_private:
                    # La nota privada nunca debe llegar a un empleado
                    if role in ("technician", "admin"):
                        await self._send_safe(uid, conn, payload)
                    continue
                if uid == created_by:
                    await self._send_safe(uid, conn, payload)
                elif assigned_to is not None and uid == assigned_to:
                    await self._send_safe(uid, conn, payload)
                elif assigned_to is None and role in ("technician", "admin"):
                    await self._send_safe(uid, conn, payload)
                elif role == "admin":
                    await self._send_safe(uid, conn, payload)


notifier = NotificationManager()

# --- ENDPOINT WEBSOCKET DE ALERTAS ---
@app.websocket("/ws/notifications")
async def global_notifications(websocket: WebSocket):
    from jose import jwt
    subprotocol, token = _ws_subprotocol_token(websocket)
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
        user_role = payload.get("role") # Extraemos el rol
    except Exception as e:
        print(f"🚨 [Notificaciones] Error al decodificar: {e}")
        await websocket.close(code=1008) 
        return

    # Pasamos el rol y el subprotocolo acordado al aceptar la conexión
    await notifier.connect(websocket, user_id, user_role, subprotocol)
    print(f"✅ [Notificaciones] Usuario {user_id} ({user_role}) conectado.")
    
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        notifier.disconnect(websocket, user_id)
