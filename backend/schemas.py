from pydantic import BaseModel, EmailStr
from typing import Generic, Optional, TypeVar
from datetime import date, datetime
from models import StatusEnum, PriorityEnum, RoleEnum, TicketTypeEnum, AssetStatusEnum, MaintenanceKindEnum, MaintenanceStatusEnum, AccessApprovalEnum

# --- PAGINACIÓN ---
ItemT = TypeVar("ItemT")


class Page(BaseModel, Generic[ItemT]):
    """Respuesta paginada: los items de la página actual y el total de resultados."""
    items: list[ItemT]
    total: int

# --- AUDITORÍA ---
class AuditEntry(BaseModel):
    """Fila de auditoría: target_id es el ticket (kind=tickets) o el usuario afectado (kind=users)."""
    id: int
    target_id: int
    action: str
    changed_by: Optional[int] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    comment: Optional[str] = None
    timestamp: datetime

# --- CATÁLOGOS (departamentos y categorías) ---
class CatalogCreate(BaseModel):
    name: str

class CatalogUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None

class DepartmentResponse(BaseModel):
    id: int
    name: str
    is_active: bool

    class Config:
        from_attributes = True

class CategoryResponse(BaseModel):
    key: str
    name: str
    is_active: bool

    class Config:
        from_attributes = True

# --- SCHEMAS DE USUARIO ---
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: RoleEnum = RoleEnum.employee
    department_id: Optional[int] = None

class UserResponse(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: RoleEnum
    is_active: bool
    department_id: Optional[int] = None

    class Config:
        from_attributes = True

# para actualizar la contraseña del usuario
class UserDirectoryEntry(BaseModel):
    """Lo mínimo para nombrar y elegir personas (I&T), sin correo ni rol."""
    id: int
    name: str
    department_id: Optional[int] = None
    is_active: bool
    is_staff: bool  # solo para elegir responsables; no expone el rol exacto

    class Config:
        from_attributes = True

class UserPasswordUpdate(BaseModel):
    # Obligatoria al cambiar la propia contraseña; opcional cuando un admin resetea otra
    old_password: Optional[str] = None
    new_password: str

# actualizar nombre, correo, rol y estado de activación de un usuario (solo admin)
class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[RoleEnum] = None
    is_active: Optional[bool] = None
    department_id: Optional[int] = None  # null explícito = quitar departamento
    # Solo al desactivar o degradar a empleado: si tiene tickets abiertos, se reasignan
    # a este técnico. Si se omite, esos tickets vuelven al pool (sin asignar).
    reassign_to: Optional[int] = None

# --- SOLICITUDES DE ACCESO (RF-05): independientes de los tickets, sin ningún campo de contraseña ---
class AccessRequestCreate(BaseModel):
    system: str
    justification: str

class AccessDecision(BaseModel):
    decision: AccessApprovalEnum  # approved | rejected | not_required
    approver_name: Optional[str] = None  # obligatorio si approved/rejected
    comment: Optional[str] = None

class AccessNote(BaseModel):
    comment: Optional[str] = None  # habilitar: opcional; revocar y comentar: obligatorio

class AccessRequestResponse(BaseModel):
    id: int
    requested_by: int
    department_id: Optional[int] = None
    system: str
    justification: str
    state: str  # pending | rejected | approved | enabled | revoked
    approval: AccessApprovalEnum
    approver_name: Optional[str] = None
    approval_comment: Optional[str] = None
    approval_recorded_by: Optional[int] = None
    approval_at: Optional[datetime] = None
    enabled_at: Optional[datetime] = None
    enabled_by: Optional[int] = None
    revoked_at: Optional[datetime] = None
    revoked_by: Optional[int] = None
    revoke_reason: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class AccessEventResponse(BaseModel):
    id: int
    action: str  # created | decision | enabled | revoked | comment
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    comment: Optional[str] = None
    changed_by: int
    timestamp: datetime

    class Config:
        from_attributes = True

class AccessRequestDetail(AccessRequestResponse):
    events: list[AccessEventResponse]  # más antiguo primero: se lee como conversación

# --- SCHEMAS DE TICKET ---
class TicketCreate(BaseModel):
    title: str
    description: str
    priority: PriorityEnum = PriorityEnum.low
    ticket_type: TicketTypeEnum = TicketTypeEnum.incident
    category: Optional[str] = None

   
class TicketResponse(BaseModel):
    id: int
    title: str
    description: str
    status: StatusEnum
    priority: PriorityEnum
    ticket_type: TicketTypeEnum
    category: Optional[str] = None
    department_id: Optional[int] = None
    asset_id: Optional[int] = None
    created_by: int
    assigned_to: Optional[int] = None
    created_at: datetime
    closed_at: Optional[datetime] = None
    # Antigüedad en horas hábiles (created_at -> now si está abierto; -> closed_at si cerró).
    # La calcula el backend al listar; None si no está disponible.
    business_age_hours: Optional[float] = None
    overdue: Optional[bool] = None  # abierto y fuera de SLA (solo en el listado)
    
    class Config:
        from_attributes = True

class TicketUpdate(BaseModel):
    status: Optional[StatusEnum] = None
    assigned_to: Optional[int] = None
    comment: Optional[str] = None  # observación que queda en el historial
    asset_id: Optional[int] = None  # solo I&T; null explícito = desvincular

# --- SCHEMAS DE ACTIVOS ---
class AssetCreate(BaseModel):
    tag: str
    asset_type: str
    brand: Optional[str] = None
    model: Optional[str] = None
    serial: Optional[str] = None
    notes: Optional[str] = None

class AssetUpdate(BaseModel):
    tag: Optional[str] = None
    asset_type: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    serial: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[AssetStatusEnum] = None
    comment: Optional[str] = None  # observación del cambio (queda en la bitácora)

class AssignmentCreate(BaseModel):
    user_id: Optional[int] = None
    department_id: Optional[int] = None
    location: Optional[str] = None
    notes: Optional[str] = None

class AssetNote(BaseModel):
    comment: str

class AssignmentResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    department_id: Optional[int] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    assigned_by: int
    assigned_at: datetime
    returned_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class AssetResponse(BaseModel):
    id: int
    tag: str
    asset_type: str
    brand: Optional[str] = None
    model: Optional[str] = None
    serial: Optional[str] = None
    status: AssetStatusEnum
    notes: Optional[str] = None
    created_at: datetime
    current_assignment: Optional[AssignmentResponse] = None  # None = disponible

    class Config:
        from_attributes = True

class AssetEventResponse(BaseModel):
    id: int
    action: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    comment: Optional[str] = None
    changed_by: int
    timestamp: datetime

    class Config:
        from_attributes = True

class AssetTicket(BaseModel):
    id: int
    title: str
    status: StatusEnum
    created_at: datetime

    class Config:
        from_attributes = True

# --- SCHEMAS DE MANTENIMIENTO (RF-09) ---
class MaintenanceCreate(BaseModel):
    kind: MaintenanceKindEnum
    scheduled_for: date
    responsible_id: Optional[int] = None
    ticket_id: Optional[int] = None

class MaintenanceUpdate(BaseModel):
    """Mientras está programado se reprograma/reasigna; status=done exige `actions`."""
    kind: Optional[MaintenanceKindEnum] = None
    scheduled_for: Optional[date] = None
    responsible_id: Optional[int] = None
    ticket_id: Optional[int] = None
    status: Optional[MaintenanceStatusEnum] = None
    findings: Optional[str] = None
    actions: Optional[str] = None
    next_date: Optional[date] = None

class MaintenanceResponse(BaseModel):
    id: int
    asset_id: int
    kind: MaintenanceKindEnum
    status: MaintenanceStatusEnum
    scheduled_for: date
    responsible_id: Optional[int] = None
    ticket_id: Optional[int] = None
    findings: Optional[str] = None
    actions: Optional[str] = None
    next_date: Optional[date] = None
    completed_at: Optional[datetime] = None
    created_by: int
    created_at: datetime
    asset_tag: Optional[str] = None  # para listar sin otra petición por fila

    class Config:
        from_attributes = True

class AssetDetail(AssetResponse):
    """Ficha del activo con su historial completo (RF-07)."""
    assignments: list[AssignmentResponse]
    events: list[AssetEventResponse]
    tickets: list[AssetTicket]
    maintenances: list[MaintenanceResponse]

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
    average_resolution_business_hours: float
    resolved_by_technician: dict[str, int]
    avg_resolution_by_technician: dict[str, float]
    avg_resolution_by_technician_business: dict[str, float]

# --- SCHEMAS DE BIBLIOTECA (problemas y soluciones) ---
class ArticleCreate(BaseModel):
    ticket_id: Optional[int] = None
    title: str
    problem: str
    solution: str
    category: str = "other"

class ArticleUpdate(BaseModel):
    title: Optional[str] = None
    problem: Optional[str] = None
    solution: Optional[str] = None
    category: Optional[str] = None

class ArticleResponse(BaseModel):
    id: int
    ticket_id: Optional[int] = None
    title: str
    problem: str
    solution: str
    category: str
    created_by: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# --- REPORTES (RF-11/12) ---
class ReportBucket(BaseModel):
    """Fila agregada: key = id/clave (None = "sin ..."), label legible, conteo y promedio opcional."""
    key: Optional[str] = None
    label: str
    count: int
    avg_business_hours: Optional[float] = None

class ReportSummary(BaseModel):
    # Del período (tickets creados en [from, to]; resueltos con cierre en el período)
    created: int
    resolved: int
    by_status: list[ReportBucket]
    by_type: list[ReportBucket]
    by_category: list[ReportBucket]
    by_department: list[ReportBucket]
    by_technician: list[ReportBucket]  # resueltos en el período, con promedio en horas hábiles
    top_assets: list[ReportBucket]      # activos con más tickets en el período (incidencias recurrentes)
    # Foto actual (no depende del período)
    open_now: int
    overdue_now: int
    pending_now: int
    maintenances_overdue: int
    maintenances_upcoming: int  # próximos 30 días
    access_enabled_by_system: list[ReportBucket]
