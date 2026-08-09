import random
import string
from sqlalchemy.orm import Session
from app import models, schemas
from app.security import obtener_password_hash
from typing import Optional

# Helper para generar código único de ticket (ej. TCK-8492)
def generar_codigo_ticket() -> str:
    prefijo = "TCK"
    numero_aleatorio = "".join(random.choices(string.digits, k=4))
    return f"{prefijo}-{numero_aleatorio}"

# --- OPERACIONES DE USUARIOS ---
def crear_usuario(db: Session, usuario: schemas.UsuarioCreate):
    password_encriptada = obtener_password_hash(usuario.password)
    db_usuario = models.Usuario(
        nombre=usuario.nombre,
        correo=usuario.correo,
        hashed_password=password_encriptada,
        rol=usuario.rol,
        departamento_id=usuario.departamento_id
    )
    db.add(db_usuario)
    db.commit()
    db.refresh(db_usuario)
    return db_usuario

def obtener_usuario(db: Session, usuario_id: int):
    return db.query(models.Usuario).filter(models.Usuario.id == usuario_id).first()

# --- OPERACIONES DEL MAESTRO (TICKETS) ---
def crear_ticket(db: Session, ticket: schemas.TicketCreate):
    # Generar código único y asignarle el estado inicial 'Abierto' (id 1)
    codigo_unico = generar_codigo_ticket()
    
    db_ticket = models.Ticket(
        codigo=codigo_unico,
        titulo=ticket.titulo,
        descripcion_inicial=ticket.descripcion_inicial,
        solicitante_id=ticket.solicitante_id,
        departamento_id=ticket.departamento_id,
        prioridad_id=ticket.prioridad_id if ticket.prioridad_id else 2,
        estado_id=1  # 1 = Abierto por defecto
    )
    db.add(db_ticket)
    db.commit()
    db.refresh(db_ticket)
    return db_ticket

def obtener_ticket_por_id(db: Session, ticket_id: int):
    return db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()

def obtener_tickets(
    db: Session, 
    skip: int = 0, 
    limit: int = 100,
    estado_id: Optional[int] = None,
    prioridad_id: Optional[int] = None,
    departamento_id: Optional[int] = None,
    busqueda: Optional[str] = None
):
    query = db.query(models.Ticket)

    # Aplicar filtros solo si vienen definidos en los parámetros
    if estado_id:
        query = query.filter(models.Ticket.estado_id == estado_id)
    if prioridad_id:
        query = query.filter(models.Ticket.prioridad_id == prioridad_id)
    if departamento_id:
        query = query.filter(models.Ticket.departamento_id == departamento_id)
    if busqueda:
        # Búsqueda case-insensitive en el código o título del ticket
        patron = f"%{busqueda}%"
        query = query.filter(
            (models.Ticket.titulo.ilike(patron)) | 
            (models.Ticket.codigo.ilike(patron))
        )

    # Ordenar por fecha de creación descendente (los más recientes primero)
    return query.order_by(models.Ticket.fecha_creacion.desc()).offset(skip).limit(limit).all()

def actualizar_estado_ticket(db: Session, ticket_id: int, nuevo_estado_id: int):
    db_ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if db_ticket:
        db_ticket.estado_id = nuevo_estado_id
        db.commit()
        db.refresh(db_ticket)
    return db_ticket

def asignar_tecnico(db: Session, ticket_id: int, tecnico_id: int):
    db_ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if db_ticket:
        db_ticket.tecnico_id = tecnico_id
        db.commit()
        db.refresh(db_ticket)
    return db_ticket

def agregar_detalle_ticket(db: Session, ticket_id: int, detalle):
    is_dict = isinstance(detalle, dict)
    
    db_detalle = models.TicketDetalle(
        ticket_id=ticket_id,
        usuario_id=detalle.get("usuario_id") if is_dict else detalle.usuario_id,
        mensaje=detalle.get("mensaje") if is_dict else detalle.mensaje,
        es_nota_interna=detalle.get("es_nota_interna") if is_dict else detalle.es_nota_interna
    )
    db.add(db_detalle)
    db.commit()
    db.refresh(db_detalle)
    return db_detalle

def obtener_detalles_por_ticket(db: Session, ticket_id: int, incluir_notas_internas: bool = True):
    query = db.query(models.TicketDetalle).filter(models.TicketDetalle.ticket_id == ticket_id)
    if not incluir_notas_internas:
        query = query.filter(models.TicketDetalle.es_nota_interna == False)
    return query.order_by(models.TicketDetalle.fecha_creacion.asc()).all()

def guardar_adjunto_detalle(db: Session, detalle_id: int, nombre_archivo: str, ruta_archivo: str, tipo_mime: str):
    db_adjunto = models.TicketAdjunto(
        detalle_id=detalle_id,
        nombre_archivo=nombre_archivo,
        ruta_archivo=ruta_archivo,
        tipo_mime=tipo_mime
    )
    db.add(db_adjunto)
    db.commit()
    db.refresh(db_adjunto)
    return db_adjunto

def obtener_usuario_por_correo(db: Session, correo: str):
    return db.query(models.Usuario).filter(models.Usuario.correo == correo).first()
