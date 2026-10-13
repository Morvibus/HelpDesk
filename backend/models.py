import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Boolean, ForeignKey, DateTime, Enum
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

class CategoryEnum(enum.Enum):
    network = "network"
    hardware = "hardware"
    software = "software"
    access = "access"
    email = "email"
    other = "other"

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

    # Relaciones
    tickets_created = relationship("Ticket", foreign_keys="[Ticket.created_by]", back_populates="creator")
    tickets_assigned = relationship("Ticket", foreign_keys="[Ticket.assigned_to]", back_populates="assignee")

class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    status = Column(Enum(StatusEnum), default=StatusEnum.created, nullable=False)
    priority = Column(Enum(PriorityEnum), default=PriorityEnum.low, nullable=False)
    # Clasificacion opcional (mismas categorias que la biblioteca)
    category = Column(Enum(CategoryEnum), nullable=True)
    
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
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relaciones
    ticket = relationship("Ticket", back_populates="history")
    user = relationship("User")

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
    category = Column(Enum(CategoryEnum), default=CategoryEnum.other, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relaciones
    ticket = relationship("Ticket")
    author = relationship("User")
