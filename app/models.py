from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class Departamento(Base):
    __tablename__ = "departamentos"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), unique=True, nullable=False)

    usuarios = relationship("Usuario", back_populates="departamento")
    tickets = relationship("Ticket", back_populates="departamento")

class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False)
    correo = Column(String(150), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    rol = Column(String(30), nullable=False, default="cliente") # cliente, tecnico, admin
    departamento_id = Column(Integer, ForeignKey("departamentos.id", ondelete="SET NULL"), nullable=True)

    departamento = relationship("Departamento", back_populates="usuarios")
    tickets_solicitados = relationship("Ticket", foreign_keys="[Ticket.solicitante_id]", back_populates="solicitante")
    tickets_asignados = relationship("Ticket", foreign_keys="[Ticket.tecnico_id]", back_populates="tecnico")

class TicketEstado(Base):
    __tablename__ = "ticket_estados"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(50), unique=True, nullable=False)

class TicketPrioridad(Base):
    __tablename__ = "ticket_prioridades"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(50), unique=True, nullable=False)

# TABLA MAESTRO: Tickets
class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(20), unique=True, nullable=False)
    titulo = Column(String(150), nullable=False)
    descripcion_inicial = Column(Text, nullable=False)
    
    solicitante_id = Column(Integer, ForeignKey("usuarios.id", ondelete="RESTRICT"), nullable=False)
    tecnico_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    departamento_id = Column(Integer, ForeignKey("departamentos.id", ondelete="RESTRICT"), nullable=False)
    estado_id = Column(Integer, ForeignKey("ticket_estados.id"), nullable=False, default=1)
    prioridad_id = Column(Integer, ForeignKey("ticket_prioridades.id"), nullable=False, default=2)

    tecnico_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now())
    fecha_actualizacion = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    solicitante = relationship("Usuario", foreign_keys=[solicitante_id], back_populates="tickets_solicitados")
    tecnico = relationship("Usuario", foreign_keys=[tecnico_id], back_populates="tickets_asignados")
    departamento = relationship("Departamento", back_populates="tickets")
    estado = relationship("TicketEstado")
    prioridad = relationship("TicketPrioridad")
    
    # Relación Maestro-Detalle con cascada de eliminación
    detalles = relationship("TicketDetalle", back_populates="ticket", cascade="all, delete-orphan")

# TABLA DETALLE: Respuestas / Historial de conversación
class TicketDetalle(Base):
    __tablename__ = "ticket_detalles"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="RESTRICT"), nullable=False)
    mensaje = Column(Text, nullable=False)
    es_nota_interna = Column(Boolean, default=False, nullable=False)
    fecha_creacion = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    ticket = relationship("Ticket", back_populates="detalles")
    usuario = relationship("Usuario")
    adjuntos = relationship("TicketAdjunto", back_populates="detalle", cascade="all, delete-orphan")

class TicketAdjunto(Base):
    __tablename__ = "ticket_adjuntos"

    id = Column(Integer, primary_key=True, index=True)
    detalle_id = Column(Integer, ForeignKey("ticket_detalles.id", ondelete="CASCADE"), nullable=False)
    nombre_archivo = Column(String(255), nullable=False)
    ruta_archivo = Column(String(500), nullable=False)
    tipo_mime = Column(String(100), nullable=True)
    fecha_subida = Column(DateTime(timezone=True), server_default=func.now())

    detalle = relationship("TicketDetalle", back_populates="adjuntos")

