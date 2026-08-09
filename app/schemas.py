from pydantic import BaseModel, EmailStr
from typing import List, Optional
from datetime import datetime

# --- 1. ESQUEMAS DE ADJUNTOS ---
class TicketAdjuntoResponse(BaseModel):
    id: int
    nombre_archivo: str
    ruta_archivo: str
    tipo_mime: Optional[str] = None
    fecha_subida: datetime

    class Config:
        from_attributes = True

# --- 2. ESQUEMAS DEL DETALLE (Respuestas) ---
class TicketDetalleCreate(BaseModel):
    mensaje: str
    es_nota_interna: bool = False

class TicketDetalleResponse(BaseModel):
    id: int
    ticket_id: int
    usuario_id: int
    mensaje: str
    es_nota_interna: bool
    fecha_creacion: datetime
    adjuntos: List[TicketAdjuntoResponse] = []
    
    class Config:
        from_attributes = True

# --- 3. ESQUEMAS DEL MAESTRO (Tickets) ---
class TicketCreate(BaseModel):
    titulo: str
    descripcion_inicial: str
    solicitante_id: int
    departamento_id: int
    prioridad_id: Optional[int] = 2

class TicketResponse(BaseModel):
    id: int
    codigo: Optional[str] = None
    titulo: str
    descripcion_inicial: str
    solicitante_id: int
    tecnico_id: Optional[int] = None
    departamento_id: int
    estado_id: int
    prioridad_id: int
    fecha_creacion: datetime
    fecha_actualizacion: datetime
    
    # Incluye el listado de detalles (Respuestas/Notas) en la misma respuesta
    detalles: List[TicketDetalleResponse] = []

    class Config:
        from_attributes = True

# --- 4. ESQUEMAS DE USUARIO Y OTROS ---
class UsuarioBase(BaseModel):
    nombre: str
    correo: EmailStr
    rol: str = "cliente"

class UsuarioResponse(UsuarioBase):
    id: int
    departamento_id: Optional[int] = None

    class Config:
        from_attributes = True

class UsuarioCreate(BaseModel):
    nombre: str
    correo: EmailStr
    password: str
    rol: Optional[str] = "cliente"
    departamento_id: Optional[int] = None

class Token(BaseModel):
    access_token: str
    token_type: str
    id: int
    correo: str
    rol: str
    departamento_id: Optional[int] = None

class DepartamentoResponse(BaseModel):
    id: int
    nombre: str

    class Config:
        from_attributes = True