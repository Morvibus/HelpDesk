import os
import shutil
from uuid import uuid4
from typing import List
from typing import Optional
from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware
from app import security, models, schemas, crud
from app.database import engine, get_db
from fastapi import Form, File, UploadFile
from typing import Optional
from fastapi.staticfiles import StaticFiles
from app.routes import usuarios as usuarios_router
from app.whatsapp import router as whatsapp_router
from app.routes import tickets as tickets


app = FastAPI(
    title="Sistema de Gestión de Tickets TI",
    description="API RESTful utilizando arquitectura Maestro-Detalle con PostgreSQL y FastAPI",
    version="1.0.0"
)

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://192.168.123.2:5173"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Crear las tablas en la base de datos automáticamente al iniciar
models.Base.metadata.create_all(bind=engine)

app.mount("/uploads", StaticFiles(directory="/app/uploads"), name="uploads")

app.include_router(usuarios_router.router)

app.include_router(whatsapp_router)

app.include_router(tickets.router)

# Crear carpeta para almacenar archivos subidos
UPLOADS_DIR = "uploads"
os.makedirs(UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")


@app.get("/", tags=["Root"])
def root():
    return {"mensaje": "API de Tickets activa. Visita /docs para ver la documentación interactiva."}


# ==========================================
# ENDPOINTS DE AUTENTICACIÓN
# ==========================================

@app.post("/auth/registro", response_model=schemas.UsuarioResponse, status_code=status.HTTP_201_CREATED, tags=["Autenticación"])
def registrar_usuario(usuario: schemas.UsuarioCreate, db: Session = Depends(get_db)):
    if crud.obtener_usuario_por_correo(db, correo=usuario.correo):
        raise HTTPException(status_code=400, detail="El correo ya se encuentra registrado.")
    return crud.crear_usuario(db=db, usuario=usuario)

@app.post("/auth/login", response_model=schemas.Token, tags=["Autenticación"])
def login_por_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(), 
    db: Session = Depends(get_db)
):
    usuario = crud.obtener_usuario_por_correo(db, correo=form_data.username)
    if not usuario or not security.verificar_password(form_data.password, usuario.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Creamos el token (puedes guardar el correo o el id en "sub")
    token = security.crear_token_acceso(data={"sub": usuario.correo, "rol": usuario.rol})
    
    # Devolvemos el token junto con los datos clave del usuario
    return {
        "access_token": token, 
        "token_type": "bearer",
        "id": usuario.id,
        "correo": usuario.correo,
        "rol": usuario.rol,
        "departamento_id": usuario.departamento_id
    }

# ==========================================
# ENDPOINTS DEL MAESTRO (TICKETS)
# ==========================================

@app.post("/tickets/", response_model=schemas.TicketResponse, status_code=status.HTTP_201_CREATED, tags=["Tickets (Maestro)"])
def crear_ticket(
    ticket: schemas.TicketCreate, 
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual)
):
    # Asignar automáticamente al usuario autenticado como solicitante
    ticket.solicitante_id = usuario_actual.id
    return crud.crear_ticket(db=db, ticket=ticket)


@app.get("/tickets/", response_model=List[schemas.TicketResponse], tags=["Tickets (Maestro)"])
def listar_tickets(
    skip: int = 0, 
    limit: int = 100, 
    estado_id: Optional[int] = None,
    prioridad_id: Optional[int] = None,
    departamento_id: Optional[int] = None,
    busqueda: Optional[str] = None,
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual)
):
    return crud.obtener_tickets(
        db=db, 
        skip=skip, 
        limit=limit,
        estado_id=estado_id,
        prioridad_id=prioridad_id,
        departamento_id=departamento_id,
        busqueda=busqueda
    )


@app.get("/tickets/{ticket_id}", response_model=schemas.TicketResponse, tags=["Tickets (Maestro)"])
def obtener_ticket(
    ticket_id: int, 
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual)
):
    ticket_db = crud.obtener_ticket_por_id(db=db, ticket_id=ticket_id)
    if not ticket_db:
        raise HTTPException(status_code=404, detail="Ticket no encontrado.")
    return ticket_db


@app.patch("/tickets/{ticket_id}/estado", response_model=schemas.TicketResponse, tags=["Tickets (Maestro)"])
def cambiar_estado_ticket(
    ticket_id: int, 
    nuevo_estado_id: int, 
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual)
):
    ticket_db = crud.actualizar_estado_ticket(db=db, ticket_id=ticket_id, nuevo_estado_id=nuevo_estado_id)
    if not ticket_db:
        raise HTTPException(status_code=404, detail="Ticket no encontrado.")
    return ticket_db


@app.patch("/tickets/{ticket_id}/asignar", response_model=schemas.TicketResponse, tags=["Tickets (Maestro)"])
def asignar_tecnico_ticket(
    ticket_id: int, 
    tecnico_id: int, 
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual)
):
    ticket_db = crud.asignar_tecnico(db=db, ticket_id=ticket_id, tecnico_id=tecnico_id)
    if not ticket_db:
        raise HTTPException(status_code=404, detail="Ticket no encontrado.")
    return ticket_db


# ==========================================
# ENDPOINTS DEL DETALLE (HISTORIAL / MENSAJES)
# ==========================================

@app.post("/tickets/{ticket_id}/detalles/", response_model=schemas.TicketDetalleResponse, status_code=status.HTTP_201_CREATED, tags=["Detalles (Historial)"])
def agregar_respuesta_o_nota(
    ticket_id: int, 
    detalle: schemas.TicketDetalleCreate, 
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual)
):
    ticket_db = crud.obtener_ticket_por_id(db=db, ticket_id=ticket_id)
    if not ticket_db:
        raise HTTPException(status_code=404, detail="Ticket no encontrado.")
    
    # Asignar automáticamente el ID del usuario autenticado
    detalle_data = detalle.dict()
    detalle_data["usuario_id"] = usuario_actual.id 
    
    return crud.agregar_detalle_ticket(db=db, ticket_id=ticket_id, detalle=detalle_data)


@app.get("/tickets/{ticket_id}/detalles/", response_model=List[schemas.TicketDetalleResponse], tags=["Detalles (Historial)"])
def obtener_historial_ticket(
    ticket_id: int, 
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual)
):
    ticket_db = crud.obtener_ticket_por_id(db=db, ticket_id=ticket_id)
    if not ticket_db:
        raise HTTPException(status_code=404, detail="Ticket no encontrado.")
    
    # Si el usuario es cliente, no incluimos notas internas
    incluir_notas = usuario_actual.rol in ["tecnico", "admin"]
    return crud.obtener_detalles_por_ticket(db=db, ticket_id=ticket_id, incluir_notas_internas=incluir_notas)


# ==========================================
# ENDPOINT DE ADJUNTOS
# ==========================================

@app.post("/detalles/{detalle_id}/adjuntos/", response_model=schemas.TicketAdjuntoResponse, status_code=status.HTTP_201_CREATED, tags=["Adjuntos"])
def subir_adjunto_a_detalle(
    detalle_id: int, 
    archivo: UploadFile = File(...), 
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual)
):
    extension = os.path.splitext(archivo.filename)[1]
    nombre_unico = f"{uuid4().hex}{extension}"
    ruta_guardado = os.path.join(UPLOADS_DIR, nombre_unico)

    with open(ruta_guardado, "wb") as buffer:
        shutil.copyfileobj(archivo.file, buffer)

    return crud.guardar_adjunto_detalle(
        db=db,
        detalle_id=detalle_id,
        nombre_archivo=archivo.filename,
        ruta_archivo=f"/uploads/{nombre_unico}",
        tipo_mime=archivo.content_type
    )

@app.get("/departamentos/", response_model=List[schemas.DepartamentoResponse], tags=["Catálogos"])
def listar_departamentos(db: Session = Depends(get_db)):
    return db.query(models.Departamento).all()

@app.get("/tickets/usuario/{usuario_id}", response_model=List[schemas.TicketResponse], tags=["Tickets (Maestro)"])
def listar_tickets_por_usuario(
    usuario_id: int, 
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual)
):
    """
    Obtiene los tickets creados por un usuario específico (para clientes).
    """
    tickets = db.query(models.Ticket).filter(models.Ticket.solicitante_id == usuario_id).all()
    return tickets

@app.get("/tickets/departamento/{departamento_id}", response_model=List[schemas.TicketResponse], tags=["Tickets (Maestro)"])
def listar_tickets_por_departamento(
    departamento_id: int, 
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual)
):
    """
    Obtiene los tickets que deben ser atendidos por un departamento específico (para técnicos).
    """
    tickets = db.query(models.Ticket).filter(models.Ticket.departamento_id == departamento_id).all()
    return tickets

@app.post("/tickets/{ticket_id}/tomar/", tags=["Tickets (Maestro)"])
def tomar_ticket(
    ticket_id: int, 
    db: Session = Depends(get_db), 
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual)
):
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    
    if ticket.tecnico_id:
        raise HTTPException(status_code=400, detail="Este ticket ya está siendo atendido por otro técnico.")
    
    # Asignar técnico actual y cambiar estado a En Progreso (ID 2)
    ticket.tecnico_id = usuario_actual.id
    ticket.estado_id = 2 
    
    db.commit()
    db.refresh(ticket)
    return {"message": "Ticket asignado correctamente"}

# ==========================================
# ENDPOINTS DE CATÁLOGOS (DEPARTAMENTOS Y USUARIOS)
# ==========================================

@app.get("/departamentos/", response_model=List[schemas.DepartamentoResponse], tags=["Catálogos"])
def listar_departamentos(db: Session = Depends(get_db)):
    return db.query(models.Departamento).all()

@app.post("/departamentos/", status_code=status.HTTP_201_CREATED, tags=["Catálogos"])
def crear_departamento(nombre: str, db: Session = Depends(get_db)):
    nuevo_depto = models.Departamento(nombre=nombre)
    db.add(nuevo_depto)
    db.commit()
    db.refresh(nuevo_depto)
    return nuevo_depto

@app.delete("/departamentos/{depto_id}", tags=["Catálogos"])
def eliminar_departamento(depto_id: int, db: Session = Depends(get_db)):
    depto = db.query(models.Departamento).filter(models.Departamento.id == depto_id).first()
    if not depto:
        raise HTTPException(status_code=404, detail="Departamento no encontrado")
    db.delete(depto)
    db.commit()
    return {"mensaje": "Departamento eliminado con éxito"}

# ==========================================
# CICLO DE VIDA DEL TICKET (Escalar, Resolver, Cerrar)
# ==========================================

@app.patch("/tickets/{ticket_id}/escalar", tags=["Tickets (Maestro)"])
def escalar_ticket(
    ticket_id: int, 
    nuevo_departamento_id: int, 
    db: Session = Depends(get_db), 
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual)
):
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    
    # Cambiar departamento y liberar técnico actual para que otro lo tome o se reasigne
    ticket.departamento_id = nuevo_departamento_id
    ticket.tecnico_id = None 
    ticket.estado_id = 1 # Regresa a pendientes (To Do) en el nuevo depto
    
    db.commit()
    db.refresh(ticket)
    return {"message": "Ticket escalado de departamento con éxito"}


@app.patch("/tickets/{ticket_id}/resolver", tags=["Tickets (Maestro)"])
def resolver_ticket(
    ticket_id: int, 
    db: Session = Depends(get_db), 
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual)
):
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    
    # Estado 3 = Resolved / Solucionado
    ticket.estado_id = 3
    db.commit()
    db.refresh(ticket)
    return {"message": "Ticket marcado como resuelto"}


@app.patch("/tickets/{ticket_id}/cerrar", tags=["Tickets (Maestro)"])
def cerrar_ticket(
    ticket_id: int, 
    db: Session = Depends(get_db), 
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual)
):
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    
    # Validar que sea el cliente dueño del ticket o un administrador
    if usuario_actual.rol == "cliente" and ticket.solicitante_id != usuario_actual.id:
        raise HTTPException(status_code=403, detail="No tienes permiso para cerrar este ticket")
    
    # Estado 3 o un estado especial de cerrado (usaremos el 3 de resueltos/cerrados)
    ticket.estado_id = 3
    db.commit()
    db.refresh(ticket)
    return {"message": "Ticket cerrado por el usuario"}

@app.get("/admin/dashboard-stats", tags=["Administración"])
def obtener_estadisticas_admin(
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual)
):
    if usuario_actual.rol != "admin":
        raise HTTPException(status_code=403, detail="Acceso no autorizado")
    
    total_tickets = db.query(models.Ticket).count()
    tickets_abiertos = db.query(models.Ticket).filter(models.Ticket.estado_id == 1).count()
    tickets_en_progreso = db.query(models.Ticket).filter(models.Ticket.estado_id == 2).count()
    tickets_resueltos = db.query(models.Ticket).filter(models.Ticket.estado_id == 3).count()
    
    from sqlalchemy import func
    por_departamento = db.query(
        models.Departamento.nombre, 
        func.count(models.Ticket.id)
    ).join(models.Ticket, models.Departamento.id == models.Ticket.departamento_id)\
    .group_by(models.Departamento.nombre).all()

    return {
        "kpis": {
            "total": total_tickets,
            "abiertos": tickets_abiertos,
            "en_progreso": tickets_en_progreso,
            "resueltos": tickets_resueltos
        },
        "por_departamento": [{"departamento": d[0], "total": d[1]} for d in por_departamento]
    }