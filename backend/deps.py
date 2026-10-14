"""Autenticación y permisos compartidos por los routers (JWT, visibilidad por rol, catálogos)."""
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from jose import JWTError, jwt
from database import get_db
import models
import security
import os
import re


# Configuración de OAuth2 para que Swagger entienda dónde pedir el token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")
# Variante opcional: sin cabecera Authorization devuelve None en vez de fallar con 401
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="login", auto_error=False)


def _user_from_token(token, db):
    """Usuario dueño del JWT, o None si el token falta, no es válido o el usuario no existe.

    Única fuente del decode para REST y WebSockets: el rol y el estado se leen de la DB,
    nunca del token (un usuario degradado o desactivado pierde acceso al instante).
    """
    if not token:
        return None
    try:
        payload = jwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, TypeError, ValueError):
        return None
    return db.query(models.User).filter(models.User.id == user_id).first()


def _can_see_ticket(user, ticket) -> bool:
    """Visibilidad por rol: empleado = sus tickets; técnico = sin asignar + los suyos; admin = todos."""
    if user.role == models.RoleEnum.employee:
        return ticket.created_by == user.id
    if user.role == models.RoleEnum.technician:
        return ticket.assigned_to in (None, user.id)
    return True


def _valid_assignee(db, user_id) -> bool:
    """Un ticket solo se asigna a un técnico o admin activo."""
    destino = db.query(models.User).filter(models.User.id == user_id).first()
    return (
        destino is not None
        and destino.is_active
        and destino.role in (models.RoleEnum.technician, models.RoleEnum.admin)
    )


def _check_catalog(db, model, pk, detalle):
    """400 si el departamento/categoría no existe o está inactivo (no se asignan los dados de baja)."""
    obj = db.get(model, pk)
    if obj is None or not obj.is_active:
        raise HTTPException(status_code=400, detail=detalle)


def get_optional_user(token: str = Depends(oauth2_scheme_optional), db: Session = Depends(get_db)):
    """Como get_current_user, pero devuelve None si no hay token, no es válido o la cuenta está desactivada."""
    user = _user_from_token(token, db)
    if user is None or user.is_active is False:
        return None
    return user

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudieron validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    user = _user_from_token(token, db)
    if user is None:
        raise credentials_exception
    # Un usuario desactivado pierde acceso al instante, aunque su JWT no haya vencido
    if user.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tu cuenta está desactivada. Contacta a un administrador.",
        )
    return user


def _require_admin(user):
    if user.role != models.RoleEnum.admin:
        raise HTTPException(status_code=403, detail="Solo los administradores gestionan los catálogos")


def _require_staff(user):
    """I&T (técnicos y admins): activos y directorio de personas."""
    if user.role not in (models.RoleEnum.technician, models.RoleEnum.admin):
        raise HTTPException(status_code=403, detail="Solo el personal de I&T tiene acceso")


# Adjuntos (RF-02): carpeta de subidas y validación de las rutas que llegan por el chat.
UPLOAD_DIR = "uploads"
_ATTACHMENT_RE = re.compile(r"^/static/[0-9a-f-]{36}\.(jpg|png|gif|webp|pdf)$")


def _valid_attachment(url):
    """Solo rutas generadas por /upload-image/ y que existen: nada de URLs externas en el chat."""
    return isinstance(url, str) and bool(_ATTACHMENT_RE.match(url)) and os.path.exists(
        os.path.join(UPLOAD_DIR, url.rsplit("/", 1)[-1])
    )
