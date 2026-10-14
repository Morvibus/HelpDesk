"""Catálogos (departamentos y categorías) y auditoría."""
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import get_db
from deps import get_current_user, _require_admin
import models
import schemas
import re
import unicodedata

router = APIRouter()


# --- CATÁLOGOS: departamentos y categorías ---
# Lectura para cualquier usuario autenticado (el alta de tickets y la biblioteca los usan);
# alta/edición solo admin. No se borran: se desactivan (los tickets viejos los siguen citando).


def _catalog_name(db, model, name, exclude=None):
    """Nombre limpio y único dentro del catálogo (400 si viene vacío o repetido)."""
    name = (name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="El nombre es obligatorio")
    existente = db.query(model).filter(func.lower(model.name) == name.lower()).first()
    if existente is not None and existente is not exclude:  # renombrarse a sí mismo (mayúsculas) vale
        raise HTTPException(status_code=400, detail="Ya existe un registro con ese nombre")
    return name


def _catalog_update(db, model, obj, update):
    if update.name is not None:
        obj.name = _catalog_name(db, model, update.name, exclude=obj)
    if update.is_active is not None:
        obj.is_active = update.is_active
    db.commit()
    db.refresh(obj)
    return obj


@router.get("/departments/", response_model=list[schemas.DepartmentResponse])
def list_departments(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.Department).order_by(models.Department.name).all()


@router.post("/departments/", response_model=schemas.DepartmentResponse, status_code=status.HTTP_201_CREATED)
def create_department(
    data: schemas.CatalogCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    _require_admin(current_user)
    dep = models.Department(name=_catalog_name(db, models.Department, data.name))
    db.add(dep)
    db.commit()
    db.refresh(dep)
    return dep


@router.patch("/departments/{department_id}", response_model=schemas.DepartmentResponse)
def update_department(
    department_id: int,
    data: schemas.CatalogUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    _require_admin(current_user)
    dep = db.get(models.Department, department_id)
    if dep is None:
        raise HTTPException(status_code=404, detail="Departamento no encontrado")
    return _catalog_update(db, models.Department, dep, data)


def _create_keyed(db, model, raw_name):
    """Alta en un catálogo con clave de texto."""
    name = _catalog_name(db, model, raw_name)
    # Clave estable derivada del nombre ("Cámaras IP" -> "camaras_ip"); no cambia al renombrar
    key = re.sub(r"[^a-z0-9]+", "_", unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()).strip("_")
    if not key or db.get(model, key):
        raise HTTPException(status_code=400, detail="No se pudo generar una clave única para ese nombre")
    obj = model(key=key, name=name)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def _keyed_catalog_routes(path, model, no_encontrado):
    """GET (todos) / POST y PATCH (admin) de un catálogo con clave de texto: categorías,
    tipos de activo y sistemas de acceso comparten esquema y reglas."""

    @router.get(path, response_model=list[schemas.CategoryResponse], name=f"list {path}")
    def listar(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
        return db.query(model).order_by(model.name).all()

    @router.post(path, response_model=schemas.CategoryResponse, status_code=status.HTTP_201_CREATED, name=f"create {path}")
    def crear(data: schemas.CatalogCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
        _require_admin(current_user)
        return _create_keyed(db, model, data.name)

    @router.patch(path + "{key}", response_model=schemas.CategoryResponse, name=f"update {path}")
    def editar(key: str, data: schemas.CatalogUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
        _require_admin(current_user)
        obj = db.get(model, key)
        if obj is None:
            raise HTTPException(status_code=404, detail=no_encontrado)
        return _catalog_update(db, model, obj, data)


_keyed_catalog_routes("/categories/", models.Category, "Categoría no encontrada")
_keyed_catalog_routes("/asset-types/", models.AssetType, "Tipo de activo no encontrado")
_keyed_catalog_routes("/access-systems/", models.AccessSystem, "Sistema no encontrado")


# Auditoría (solo admin): tickets = ticket_history, users = user_audit_log
@router.get("/audit/", response_model=schemas.Page[schemas.AuditEntry])
def get_audit(
    kind: Literal["tickets", "users"] = Query("tickets"),
    ticket_id: Optional[int] = Query(None),  # historial de un solo ticket (solo kind=tickets)
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.role != models.RoleEnum.admin:
        raise HTTPException(status_code=403, detail="Solo los administradores pueden ver la auditoría")

    modelo = models.TicketHistory if kind == "tickets" else models.UserAuditLog
    query = db.query(modelo)
    if kind == "tickets" and ticket_id is not None:
        query = query.filter(modelo.ticket_id == ticket_id)
    total = query.count()
    filas = query.order_by(modelo.timestamp.desc(), modelo.id.desc()).offset(offset).limit(limit).all()
    items = [{
        "id": f.id,
        "target_id": f.ticket_id if kind == "tickets" else f.user_id,
        "action": getattr(f.action, "value", f.action),
        "changed_by": f.changed_by,
        "old_value": f.old_value,
        "new_value": f.new_value,
        "comment": getattr(f, "comment", None),  # solo ticket_history tiene observación
        "timestamp": f.timestamp,
    } for f in filas]
    return {"items": items, "total": total}
