import os
import shutil
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from app import schemas, models, security
from app.database import get_db

router = APIRouter(prefix="/tickets", tags=["Tickets"])

UPLOAD_DIRECTORY = "/app/uploads"   # Directorio dentro del contenedor Docker
os.makedirs(UPLOAD_DIRECTORY, exist_ok=True)


# 1. Obtener un ticket específico con su historial y adjuntos
@router.get("/{ticket_id}", response_model=schemas.TicketResponse)
def obtener_ticket(ticket_id: int, db: Session = Depends(get_db)):
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    return ticket

# 2. Agregar un mensaje/respuesta al historial del ticket
@router.post("/{ticket_id}/detalles/", response_model=schemas.TicketDetalleResponse)
def crear_detalle_ticket(
    ticket_id: int, 
    detalle: schemas.TicketDetalleCreate, 
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual)
):
    # Validar que el ticket exista
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    
    # Crear el nuevo detalle vinculado al ticket usando el usuario autenticado
    nuevo_detalle = models.TicketDetalle(
        ticket_id=ticket_id,
        usuario_id=usuario_actual.id,
        mensaje=detalle.mensaje,
        es_nota_interna=detalle.es_nota_interna
    )
    
    db.add(nuevo_detalle)
    db.commit()
    db.refresh(nuevo_detalle)
    return nuevo_detalle

@router.post("/{detalle_id}/adjuntos/", response_model=schemas.TicketAdjuntoResponse)
def subir_adjunto(
    detalle_id: int,
    archivo: UploadFile = File(...), # Cambiado de 'file' a 'archivo' para que coincida con el frontend
    db: Session = Depends(get_db),
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual)
):
    # 1. Validar que el detalle (mensaje) al que se adjunta exista
    detalle = db.query(models.TicketDetalle).filter(models.TicketDetalle.id == detalle_id).first()
    if not detalle:
        raise HTTPException(status_code=404, detail="El detalle del ticket no existe")
    
    # 2. Generar una ruta única para evitar colisiones de nombres
    nombre_archivo_seguro = f"{detalle_id}_{archivo.filename}"
    ruta_destino = os.path.join(UPLOAD_DIRECTORY, nombre_archivo_seguro)
    
    # 3. Guardar el archivo físicamente en el disco/volumen
    try:
        with open(ruta_destino, "wb") as buffer:
            shutil.copyfileobj(archivo.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al guardar el archivo: {str(e)}")
    
    # 4. Registrar la referencia en la base de datos
    nuevo_adjunto = models.TicketAdjunto(
        detalle_id=detalle_id,
        nombre_archivo=archivo.filename,
        ruta_archivo=f"/uploads/{nombre_archivo_seguro}", # Guardamos la ruta pública relativa
        tipo_mime=archivo.content_type
    )
    
    db.add(nuevo_adjunto)
    db.commit()
    db.refresh(nuevo_adjunto)
    
    return nuevo_adjunto

@router.get("/departamento/{departamento_id}", response_model=List[schemas.TicketResponse])
def listar_tickets_por_departamento(departamento_id: int, db: Session = Depends(get_db)):
    """
    Obtiene los tickets que deben ser atendidos por un departamento específico.
    """
    tickets = db.query(models.Ticket).filter(models.Ticket.departamento_id == departamento_id).all()
    return tickets

@router.get("/usuario/{usuario_id}", response_model=List[schemas.TicketResponse])
def listar_tickets_por_usuario(usuario_id: int, db: Session = Depends(get_db)):
    """
    Obtiene los tickets creados por un usuario específico (para clientes).
    """
    tickets = db.query(models.Ticket).filter(models.Ticket.solicitante_id == usuario_id).all()
    return tickets

@router.post("/{ticket_id}/tomar/")
def tomar_ticket(
    ticket_id: int, 
    db: Session = Depends(get_db), 
    usuario_actual: models.Usuario = Depends(security.obtener_usuario_actual)
):
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    
    # Cambia esto al nombre exacto que tenga tu columna en models.py (ej. tecnico_id o tecnico_asignado_id)
    if ticket.tecnico_id:
        raise HTTPException(status_code=400, detail="Este ticket ya está siendo atendido por otro técnico.")
    
    ticket.tecnico_id = usuario_actual.id
    ticket.estado_id = 2 
    
    db.commit()
    db.refresh(ticket)
    return {"message": "Ticket asignado correctamente"}

# Corregido: Sin duplicar "/tickets" en el decorador y usando models.Ticket correctamente
@router.patch("/{ticket_id}/reabrir")
async def reabrir_ticket(ticket_id: int, db: Session = Depends(get_db)):
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")
    
    # Cambiamos el estado de vuelta a Abierto (ID 1)
    ticket.estado_id = 1  
    
    db.commit()
    db.refresh(ticket)
    
    return {"message": f"El ticket {ticket_id} ha sido reabierto exitosamente"}

