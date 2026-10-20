import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey, Date, DateTime, Enum, DDL, event
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

# --- ENUMS ---
class RoleEnum(enum.Enum):
    employee = "employee"
    technician = "technician"
    admin = "admin"

class StatusEnum(enum.Enum):
    created = "created"
    assigned = "assigned"
    in_process = "in_process"
    pending = "pending"  # en espera del usuario o de un tercero; cuenta como abierto
    solved = "solved"
    closed = "closed"

class PriorityEnum(enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"

class ActionEnum(enum.Enum):
    status_change = "status_change"
    escalated = "escalated"
    reopened = "reopened"
    asset_linked = "asset_linked"  # old/new = id del activo (o "None")
    access_change = "access_change"  # obsoleto: los accesos ya no son tickets (valor de enum sin uso)

class AssetStatusEnum(enum.Enum):
    """Estado físico del activo. "Disponible" no es un estado: es no tener asignación vigente."""
    active = "active"
    in_repair = "in_repair"
    retired = "retired"

class AccessApprovalEnum(enum.Enum):
    """Decisión registrada por I&T (el aprobador real suele no usar la app)."""
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    not_required = "not_required"

class MaintenanceKindEnum(enum.Enum):
    preventive = "preventive"
    corrective = "corrective"

class MaintenanceStatusEnum(enum.Enum):
    """scheduled es el 'abierto'; done y cancelled son finales."""
    scheduled = "scheduled"
    done = "done"
    cancelled = "cancelled"

class TicketTypeEnum(enum.Enum):
    """Tipos fijos (RF-03). Las solicitudes de acceso NO son tickets: viven en access_requests."""
    incident = "incident"
    service_request = "service_request"
    maintenance = "maintenance"
    inquiry = "inquiry"

# Categorías iniciales: se siembran al crear la tabla (migración y create_all de los tests)
DEFAULT_CATEGORIES = [
    ("network", "Red"), ("hardware", "Hardware"), ("software", "Software"),
    ("access", "Accesos"), ("email", "Correo"), ("other", "Otro"),
]

# --- CATÁLOGOS (administrables por el admin) ---
class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

class Category(Base):
    """Categoría de tickets y biblioteca (RF-03). La clave de texto es el identificador que
    guardan tickets/artículos y viaja en el API, así agregar una no cambia el núcleo."""
    __tablename__ = "categories"

    key = Column(String, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

event.listen(
    Category.__table__, "after_create",
    DDL("INSERT INTO categories (key, name, is_active) VALUES "
        + ", ".join(f"('{k}', '{n}', true)" for k, n in DEFAULT_CATEGORIES)),
)

# Tipos de activo iniciales (RF-06); I&T agrega más desde Catálogos
DEFAULT_ASSET_TYPES = [
    ("computer", "Computadora"), ("monitor", "Monitor"), ("printer", "Impresora"), ("ups", "UPS"),
    ("network", "Equipo de red"), ("camera", "Cámara"), ("mobile", "Dispositivo móvil"), ("other", "Otro"),
]

# Sistemas solicitables en solicitudes de acceso (RF-05); I&T agrega más desde Catálogos
DEFAULT_ACCESS_SYSTEMS = [
    ("sap", "SAP"), ("m365", "Microsoft 365"), ("vpn", "VPN / Fortinet"),
    ("shared_folders", "Carpetas compartidas"), ("other", "Otro"),
]

class AccessSystem(Base):
    """Mismo esquema que Category: clave de texto estable + nombre."""
    __tablename__ = "access_systems"

    key = Column(String, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

event.listen(
    AccessSystem.__table__, "after_create",
    DDL("INSERT INTO access_systems (key, name, is_active) VALUES "
        + ", ".join(f"('{k}', '{n}', true)" for k, n in DEFAULT_ACCESS_SYSTEMS)),
)

class AssetType(Base):
    """Tipo de activo: mismo esquema que Category (clave de texto estable + nombre)."""
    __tablename__ = "asset_types"

    key = Column(String, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

event.listen(
    AssetType.__table__, "after_create",
    DDL("INSERT INTO asset_types (key, name, is_active) VALUES "
        + ", ".join(f"('{k}', '{n}', true)" for k, n in DEFAULT_ASSET_TYPES)),
)

# --- MODELOS ---
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(Enum(RoleEnum), default=RoleEnum.employee, nullable=False)
    tier_level = Column(Integer, default=1) # 1 para técnicos base, 2+ para escalamiento
    is_active = Column(Boolean, default=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)

    # Relaciones
    tickets_created = relationship("Ticket", foreign_keys="[Ticket.created_by]", back_populates="creator")
    tickets_assigned = relationship("Ticket", foreign_keys="[Ticket.assigned_to]", back_populates="assignee")

    @property
    def is_staff(self):
        """I&T (técnico o admin): puede ser responsable de tickets y mantenimientos."""
        return self.role in (RoleEnum.technician, RoleEnum.admin)

class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    status = Column(Enum(StatusEnum), default=StatusEnum.created, nullable=False)
    priority = Column(Enum(PriorityEnum), default=PriorityEnum.low, nullable=False)
    ticket_type = Column(Enum(TicketTypeEnum), default=TicketTypeEnum.incident, nullable=False)
    # Clasificacion opcional (mismas categorias que la biblioteca)
    category = Column(String, ForeignKey("categories.key"), nullable=True)
    # Copia del departamento del solicitante al crear: los reportes no cambian si se muda de área
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=True)  # activo involucrado (CA-03)

    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True) # Puede ser nulo si no está asignado
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    closed_at = Column(DateTime, nullable=True)

    # Relaciones
    creator = relationship("User", foreign_keys=[created_by], back_populates="tickets_created")
    assignee = relationship("User", foreign_keys=[assigned_to], back_populates="tickets_assigned")
    messages = relationship("Message", back_populates="ticket", cascade="all, delete-orphan")
    history = relationship("TicketHistory", back_populates="ticket", cascade="all, delete-orphan")

class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=True) # Podría ser nulo si solo envía una imagen
    image_url = Column(String, nullable=True)
    is_private_note = Column(Boolean, default=False) # Para notas solo visibles entre técnicos
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relaciones
    ticket = relationship("Ticket", back_populates="messages")
    sender = relationship("User")

class TicketHistory(Base):
    __tablename__ = "ticket_history"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False)
    action = Column(Enum(ActionEnum), nullable=False)
    changed_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    old_value = Column(String, nullable=True) # Ej: "in_process"
    new_value = Column(String, nullable=True) # Ej: "solved"
    comment = Column(Text, nullable=True)  # observación del cambio (RF-04)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relaciones
    ticket = relationship("Ticket", back_populates="history")
    user = relationship("User")

class UserAuditLog(Base):
    """Auditoría de acciones sobre usuarios. action es texto libre (created, role, is_active,
    name, email, password) para no arrastrar migraciones de enum al añadir acciones."""
    __tablename__ = "user_audit_log"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)  # usuario afectado
    action = Column(String, nullable=False)
    changed_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # None = bootstrap
    old_value = Column(String, nullable=True)
    new_value = Column(String, nullable=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class KnowledgeArticle(Base):
    """Entrada de la biblioteca de problemas y soluciones.

    Nace a partir de un ticket resuelto/cerrado (opcional) o de forma libre.
    `ticket_id` es unico: una sola entrada por ticket (evita duplicados).
    """
    __tablename__ = "knowledge_articles"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=True, unique=True, index=True)
    title = Column(String, nullable=False)
    problem = Column(Text, nullable=False)
    solution = Column(Text, nullable=False)
    category = Column(String, ForeignKey("categories.key"), default="other", nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relaciones
    ticket = relationship("Ticket")
    author = relationship("User")

# --- ACTIVOS (RF-06/07/08) ---
class Asset(Base):
    __tablename__ = "assets"

    id = Column(Integer, primary_key=True, index=True)
    tag = Column(String, unique=True, nullable=False)  # código de inventario
    asset_type = Column(String, ForeignKey("asset_types.key"), nullable=False)
    brand = Column(String, nullable=True)
    model = Column(String, nullable=True)
    serial = Column(String, nullable=True)
    status = Column(Enum(AssetStatusEnum), default=AssetStatusEnum.active, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class AssetAssignment(Base):
    """Entrega de un activo (RF-08): persona y/o departamento y/o ubicación libre.
    La vigente es la que no tiene returned_at; el resto es el historial de movimientos."""
    __tablename__ = "asset_assignments"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    location = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    assigned_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    returned_at = Column(DateTime, nullable=True)

class AssetEvent(Base):
    """Bitácora del activo (RF-07): alta, cambios de campos/estado y observaciones.
    action es texto (created, status, tag, brand..., note) como en user_audit_log."""
    __tablename__ = "asset_events"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False, index=True)
    action = Column(String, nullable=False)
    old_value = Column(String, nullable=True)
    new_value = Column(String, nullable=True)
    comment = Column(Text, nullable=True)
    changed_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class Maintenance(Base):
    """Mantenimiento de un activo (RF-09): se programa y luego se documenta (hallazgos, acciones).
    next_date es solo una sugerencia anotada: no programa nada por sí sola (decisión del usuario)."""
    __tablename__ = "maintenances"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False, index=True)
    kind = Column(Enum(MaintenanceKindEnum), nullable=False)
    status = Column(Enum(MaintenanceStatusEnum), default=MaintenanceStatusEnum.scheduled, nullable=False)
    scheduled_for = Column(Date, nullable=False)
    responsible_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=True)  # correctivo originado por un ticket
    findings = Column(Text, nullable=True)
    actions = Column(Text, nullable=True)
    next_date = Column(Date, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    asset = relationship("Asset")

    @property
    def asset_tag(self):
        return self.asset.tag if self.asset else None

# --- SOLICITUDES DE ACCESO (RF-05, CA-04) ---
class AccessRequest(Base):
    """Solicitud de acceso (RF-05), independiente de los tickets. NUNCA guarda contraseñas: no hay
    campo para ello y la UI lo advierte. El estado se deriva de las fechas/decisión (ver `state`)."""
    __tablename__ = "access_requests"

    id = Column(Integer, primary_key=True, index=True)
    requested_by = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # Copia del departamento del solicitante al crear (como en tickets)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    system = Column(String, ForeignKey("access_systems.key"), nullable=False)
    justification = Column(Text, nullable=False)

    approval = Column(Enum(AccessApprovalEnum), default=AccessApprovalEnum.pending, nullable=False)
    approver_name = Column(String, nullable=True)  # quien aprobó/rechazó (puede no ser usuario)
    approval_comment = Column(Text, nullable=True)
    approval_recorded_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approval_at = Column(DateTime, nullable=True)

    enabled_at = Column(DateTime, nullable=True)  # fecha de habilitación
    enabled_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    revoked_at = Column(DateTime, nullable=True)
    revoked_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    revoke_reason = Column(Text, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    @property
    def state(self):
        """pending | rejected | approved | enabled | revoked (approved incluye 'no requiere')."""
        if self.revoked_at:
            return "revoked"
        if self.enabled_at:
            return "enabled"
        if self.approval == AccessApprovalEnum.rejected:
            return "rejected"
        if self.approval in (AccessApprovalEnum.approved, AccessApprovalEnum.not_required):
            return "approved"
        return "pending"

class AccessEvent(Base):
    """Historial y comentarios de una solicitud de acceso, en un solo hilo.
    action: created | decision | enabled | revoked (old/new = estado) | comment (solo texto)."""
    __tablename__ = "access_events"

    id = Column(Integer, primary_key=True, index=True)
    access_request_id = Column(Integer, ForeignKey("access_requests.id"), nullable=False, index=True)
    action = Column(String, nullable=False)
    old_value = Column(String, nullable=True)
    new_value = Column(String, nullable=True)
    comment = Column(Text, nullable=True)
    changed_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))

# --- CENTRO DE NOTIFICACIONES ---
class Notification(Base):
    """Aviso guardado para su destinatario (esté conectado o no). Solo se guardan los que llevan
    sonido; los refrescos de fondo no. Se borran solos a los 30 días (ver realtime.py)."""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    message = Column(Text, nullable=True)
    icon = Column(String, nullable=True)
    sound = Column(String, nullable=True)  # work | message
    link = Column(String, nullable=True)   # ruta del frontend: /ticket/5, /accesos/3
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
