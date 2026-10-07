from pydantic import BaseModel, EmailStr
from typing import Generic, Optional, TypeVar
from datetime import datetime
from models import StatusEnum, PriorityEnum, RoleEnum, ActionEnum

# --- PAGINACIÓN ---
ItemT = TypeVar("ItemT")


class Page(BaseModel, Generic[ItemT]):
    """Respuesta paginada: los items de la página actual y el total de resultados."""
    items: list[ItemT]
    total: int

# --- SCHEMAS DE USUARIO ---
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: RoleEnum = RoleEnum.employee

class UserResponse(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: RoleEnum
    
    class Config:
        from_attributes = True

# para actualizar la contraseña del usuario
class UserPasswordUpdate(BaseModel):
    # Obligatoria al cambiar la propia contraseña; opcional cuando un admin resetea otra
    old_password: Optional[str] = None
    new_password: str

# --- SCHEMAS DE TICKET ---
class TicketCreate(BaseModel):
    title: str
    description: str
    priority: PriorityEnum = PriorityEnum.low
    
   
class TicketResponse(BaseModel):
    id: int
    title: str
    description: str
    status: StatusEnum
    priority: PriorityEnum
    created_by: int
    assigned_to: Optional[int] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

class TicketUpdate(BaseModel):
    status: Optional[StatusEnum] = None
    assigned_to: Optional[int] = None
    
class TicketHistoryResponse(BaseModel):
    id: int
    action: ActionEnum
    changed_by: int
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    timestamp: datetime
    
    class Config:
        from_attributes = True

class MessageCreate(BaseModel):
    content: str
    is_private_note: bool = False
    image_url: Optional[str] = None

class MessageResponse(BaseModel):
    id: int
    sender_id: int
    content: str
    image_url: str | None = None
    is_private_note: bool
    created_at: datetime

    class Config:
        from_attributes = True

# Metricas

class MetricsResponse(BaseModel):
    total_tickets: int
    tickets_by_status: dict[str, int]
    average_resolution_time_hours: float
    resolved_by_technician: dict[str, int]
