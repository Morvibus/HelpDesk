from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, UploadFile, File, BackgroundTasks
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import engine, get_db
from jose import JWTError, jwt 
from datetime import datetime, timezone, timedelta
from security import SECRET_KEY, ALGORITHM
import models
import schemas
import security
import json
import os
import shutil
import uuid
import asyncio

models.Base.metadata.create_all(bind=engine)

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

# Configuración de OAuth2 para que Swagger entienda dónde pedir el token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

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
    
    # El token guardará el ID del usuario y su rol
    access_token = security.create_access_token(
        data={"sub": str(user.id), "role": user.role.value}
    )
    return {"access_token": access_token, "token_type": "bearer"}

# --- ENDPOINTS DE USUARIOS ---
@app.post("/users/", response_model=schemas.UserResponse)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
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

@app.get("/users/", response_model=list[schemas.UserResponse])
def get_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # REGLA DE NEGOCIO: Solo los administradores pueden ver la lista de usuarios
    if current_user.role != models.RoleEnum.admin:
        raise HTTPException(status_code=403, detail="No tienes permisos para ver la lista de usuarios")
    
    return db.query(models.User).all()

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
    
    # Encriptamos la nueva contraseña antes de guardarla
    hashed_password = security.get_password_hash(password_update.new_password)
    user.password_hash = hashed_password
    db.commit()
    db.refresh(user)
    
    return user

@app.get("/tickets/", response_model=list[schemas.TicketResponse])
def get_tickets(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user) # <- Requiere token válido
):
    # REGLA DE NEGOCIO: Visibilidad según el rol
    if current_user.role == models.RoleEnum.employee:
        # El empleado solo ve los tickets que él creó
        return db.query(models.Ticket).filter(models.Ticket.created_by == current_user.id).order_by(models.Ticket.priority.desc(), models.Ticket.created_at.desc()).all()
        
    elif current_user.role == models.RoleEnum.technician:
        # El técnico ve los no asignados o los asignados a él
        return db.query(models.Ticket).filter(
            (models.Ticket.assigned_to == None) | (models.Ticket.assigned_to == current_user.id)
        ).order_by(models.Ticket.priority.desc(), models.Ticket.created_at.desc()).all()
        
    # Si es admin, ve todos
    return db.query(models.Ticket).order_by(models.Ticket.priority.desc(), models.Ticket.created_at.desc()).all()

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

@app.get("/tickets/{ticket_id}/messages", response_model=list[schemas.MessageResponse])
def get_ticket_messages(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Buscamos los mensajes
    query = db.query(models.Message).filter(models.Message.ticket_id == ticket_id)
    
    # REGLA DE NEGOCIO: Si es empleado, ocultamos las notas privadas de los técnicos
    if current_user.role == models.RoleEnum.employee:
        query = query.filter(models.Message.is_private_note == False)
        
    return query.order_by(models.Message.created_at.asc()).all()

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
    # Validamos que sea una imagen
    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Formato de archivo no permitido")
    
    # Generamos un nombre único (ej: 123e4567-e89b-12d3...png)
    file_extension = file.filename.split(".")[-1]
    unique_filename = f"{uuid.uuid4()}.{file_extension}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)
    
    # Guardamos el archivo en disco
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Devolvemos la ruta pública. (Usa la variable de entorno VITE_API_URL en React para formar la URL completa)
    image_url = f"http://localhost:8000/static/{unique_filename}"
    return {"image_url": image_url}


# WebSocket

# Conexiones

class ConnectionManager:
    def __init__(self):
        # Guardaremos diccionarios: {"ws": websocket, "role": role}
        self.active_connections: dict[int, list[dict]] = {}

    async def connect(self, websocket: WebSocket, ticket_id: int, role: str):
        await websocket.accept()
        if ticket_id not in self.active_connections:
            self.active_connections[ticket_id] = []
        self.active_connections[ticket_id].append({"ws": websocket, "role": role})

    def disconnect(self, websocket: WebSocket, ticket_id: int):
        if ticket_id in self.active_connections:
            self.active_connections[ticket_id] = [
                c for c in self.active_connections[ticket_id] if c["ws"] != websocket
            ]

    async def broadcast(self, message: dict, ticket_id: int):
        if ticket_id in self.active_connections:
            for connection in self.active_connections[ticket_id]:
                # REGLA DE SEGURIDAD: Si es nota privada, omitimos a los empleados
                if message.get("is_private_note") and connection["role"] == "employee":
                    continue
                await connection["ws"].send_json(message)

manager = ConnectionManager()

# --- ENDPOINTS DE MENSAJERÍA ---

# 1. Obtener historial del chat (REST normal)
@app.get("/tickets/{ticket_id}/messages", response_model=list[schemas.MessageResponse])
def get_messages(ticket_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    query = db.query(models.Message).filter(models.Message.ticket_id == ticket_id)
    
    # REGLA DE NEGOCIO: Los empleados no pueden ver las notas privadas de los técnicos
    if current_user.role == models.RoleEnum.employee:
        query = query.filter(models.Message.is_private_note == False)
        
    return query.order_by(models.Message.created_at.asc()).all()

# 2. Canal de chat en vivo (WebSocket)

@app.websocket("/ws/tickets/{ticket_id}/chat")
async def chat_websocket(
    websocket: WebSocket, 
    ticket_id: int, 
    token: str, 
    db: Session = Depends(get_db)
):
    from jose import jwt
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
        user_role = payload.get("role")
    except Exception as e:
        print(f" [Chat] Error al decodificar token: {e}")
        await websocket.close(code=1008)
        return
            
    await manager.connect(websocket, ticket_id, user_role)
    print(f" [Chat] Usuario {user_id} ({user_role}) conectado al ticket #{ticket_id}")

    try:
        while True:
            data = await websocket.receive_json()
            
            # 1. Guardamos en base de datos
            is_private = data.get("is_private_note", False)
            new_message = models.Message(
                ticket_id=ticket_id,
                sender_id=user_id,
                content=data["content"],
                is_private_note=is_private
            )
            db.add(new_message)
            db.commit()
            db.refresh(new_message)
            
            # 2. El broadcast para los que están viendo el chat
            await manager.broadcast({
                "id": new_message.id,
                "sender_id": new_message.sender_id,
                "content": new_message.content,
                "is_private_note": new_message.is_private_note,
                "created_at": new_message.created_at.isoformat()
            }, ticket_id)
            
            # 3. ALERTA GLOBAL PARA LOS QUE ESTÁN EN EL DASHBOARD
            # (¡Ahora está correctamente dentro del while True!)
            db_ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
            msg_resumen = new_message.content[:30] + "..." if len(new_message.content) > 30 else new_message.content
                    
            if user_role == "employee":
                if db_ticket.assigned_to:
                    await notifier.notify_user(db_ticket.assigned_to, f"Nuevo mensaje (Ticket #{ticket_id})", msg_resumen, "💬", "new_message", ticket_id, exclude_user_id=user_id)
                else:
                    await notifier.notify_techs(f"Nuevo mensaje (Ticket #{ticket_id})", msg_resumen, "💬", "new_message", ticket_id, exclude_user_id=user_id)
            else:
                if is_private:
                    await notifier.notify_techs(f"Nota Interna (Ticket #{ticket_id})", msg_resumen, "🔒", "new_message", ticket_id, exclude_user_id=user_id)
                else:
                    await notifier.notify_user(db_ticket.created_by, f"Soporte IT (Ticket #{ticket_id})", msg_resumen, "💬", "new_message", ticket_id, exclude_user_id=user_id)  
            
    except WebSocketDisconnect:
        # Esto es lo único que debe pasar al salir
        manager.disconnect(websocket, ticket_id)

# Metricas

@app.get("/metrics/", response_model=schemas.MetricsResponse)
def get_metrics(
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(get_current_user)
):
    # REGLA DE NEGOCIO: Solo técnicos y administradores pueden ver el dashboard
    if current_user.role == models.RoleEnum.employee:
        raise HTTPException(status_code=403, detail="No tienes permisos para ver el dashboard")

    # 1. Total histórico de tickets
    total_tickets = db.query(models.Ticket).count()

    # 2. Conteo de tickets agrupados por su estado actual
    status_counts = db.query(models.Ticket.status, func.count(models.Ticket.id)).group_by(models.Ticket.status).all()
    tickets_by_status = {status.value: count for status, count in status_counts}

    # 3. Cálculo de tiempo promedio de resolución (en horas)
    resolved_tickets = db.query(models.Ticket).filter(models.Ticket.closed_at.isnot(None)).all()
    avg_time_hours = 0.0
    if resolved_tickets:
        total_seconds = sum((t.closed_at - t.created_at).total_seconds() for t in resolved_tickets)
        avg_time_hours = (total_seconds / len(resolved_tickets)) / 3600

    # 4. Productividad: Tickets solucionados o cerrados por cada técnico
    tech_counts = db.query(models.User.name, func.count(models.Ticket.id))\
        .join(models.Ticket, models.User.id == models.Ticket.assigned_to)\
        .filter(models.Ticket.status.in_([models.StatusEnum.solved, models.StatusEnum.closed]))\
        .group_by(models.User.name).all()
    resolved_by_tech = {name: count for name, count in tech_counts}

    return {
        "total_tickets": total_tickets,
        "tickets_by_status": tickets_by_status,
        "average_resolution_time_hours": round(avg_time_hours, 2),
        "resolved_by_technician": resolved_by_tech
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

# --- GESTOR DE NOTIFICACIONES GLOBALES ---
class NotificationManager:
    def __init__(self):
        self.active_connections: dict[int, dict] = {}

    async def connect(self, websocket: WebSocket, user_id: int, role: str):
        await websocket.accept()
        self.active_connections[user_id] = {"ws": websocket, "role": role}

    def disconnect(self, user_id: int):
        self.active_connections.pop(user_id, None)

# Añadimos el parámetro exclude_user_id
    async def notify_user(self, user_id: int, title: str, message: str, icon: str = "🔔", msg_type: str = "toast", ticket_id: int = None, exclude_user_id: int = None):
        # Verificamos que el destinatario no sea la misma persona que originó el mensaje
        if user_id in self.active_connections and user_id != exclude_user_id:
            await self.active_connections[user_id]["ws"].send_json({
                "type": msg_type, "title": title, "message": message, "icon": icon, "ticket_id": ticket_id
            })

    async def notify_techs(self, title: str, message: str, icon: str = "🔔", msg_type: str = "toast", ticket_id: int = None, exclude_user_id: int = None):
        for uid, conn in self.active_connections.items():
            # Filtramos para que no le llegue a los empleados NI al técnico que envió el mensaje
            if conn["role"] != "employee" and uid != exclude_user_id:
                await conn["ws"].send_json({
                    "type": msg_type, "title": title, "message": message, "icon": icon, "ticket_id": ticket_id
                })


notifier = NotificationManager()

# --- ENDPOINT WEBSOCKET DE ALERTAS ---
@app.websocket("/ws/notifications")
async def global_notifications(websocket: WebSocket, token: str):
    from jose import jwt
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
        user_role = payload.get("role") # Extraemos el rol
    except Exception as e:
        print(f"🚨 [Notificaciones] Error al decodificar: {e}")
        await websocket.close(code=1008) 
        return

    # Pasamos el rol a la conexión
    await notifier.connect(websocket, user_id, user_role)
    print(f"✅ [Notificaciones] Usuario {user_id} ({user_role}) conectado.")
    
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        notifier.disconnect(user_id)
