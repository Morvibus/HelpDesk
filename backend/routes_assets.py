"""Activos tecnológicos (RF-06/07/08): inventario, asignaciones con historial y bitácora.

Solo I&T (técnicos y admins). Los activos no se borran: se dan de baja (status=retired),
porque tickets y asignaciones viejas los siguen citando.
"""
from datetime import date, datetime, timezone
from typing import Optional
from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import get_db
from deps import get_current_user, _check_catalog, _require_staff, _valid_assignee
import models
import schemas

router = APIRouter()

# Campos editables que quedan en la bitácora cuando cambian
CAMPOS_AUDITADOS = ("tag", "asset_type", "brand", "model", "serial", "notes", "status")


def _get_asset(db, asset_id):
    asset = db.get(models.Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Activo no encontrado")
    return asset


def _vigente(db, asset_id):
    """Asignación vigente (sin devolución), o None si el activo está disponible."""
    return db.query(models.AssetAssignment).filter(
        models.AssetAssignment.asset_id == asset_id,
        models.AssetAssignment.returned_at.is_(None),
    ).first()


def _clean_tag(db, tag, actual=None):
    """Código de inventario obligatorio y único (sin distinguir mayúsculas)."""
    tag = (tag or "").strip()
    if not tag:
        raise HTTPException(status_code=400, detail="El código de inventario es obligatorio")
    existente = db.query(models.Asset).filter(func.lower(models.Asset.tag) == tag.lower()).first()
    if existente is not None and existente is not actual:
        raise HTTPException(status_code=400, detail="Ya existe un activo con ese código")
    return tag


def _event(db, asset_id, user_id, action, old=None, new=None, comment=None):
    db.add(models.AssetEvent(
        asset_id=asset_id, changed_by=user_id, action=action,
        old_value=None if old is None else str(getattr(old, "value", old)),
        new_value=None if new is None else str(getattr(new, "value", new)),
        comment=(comment or "").strip() or None,
    ))


def _out(asset, vigente):
    """AssetResponse con la asignación vigente ya resuelta (evita N+1 en el listado)."""
    data = schemas.AssetResponse.model_validate(asset)
    data.current_assignment = vigente and schemas.AssignmentResponse.model_validate(vigente)
    return data


@router.get("/assets/", response_model=schemas.Page[schemas.AssetResponse])
def list_assets(
    q: Optional[str] = Query(None),
    asset_type: Optional[str] = Query(None),
    status_: Optional[models.AssetStatusEnum] = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    _require_staff(current_user)
    query = db.query(models.Asset)
    if q and q.strip():
        patron = f"%{q.strip()}%"
        query = query.filter(
            models.Asset.tag.ilike(patron) | models.Asset.brand.ilike(patron)
            | models.Asset.model.ilike(patron) | models.Asset.serial.ilike(patron)
        )
    if asset_type:
        query = query.filter(models.Asset.asset_type == asset_type)
    if status_ is not None:
        query = query.filter(models.Asset.status == status_)

    total = query.count()
    assets = query.order_by(models.Asset.tag, models.Asset.id).offset(offset).limit(limit).all()
    vigentes = {
        a.asset_id: a for a in db.query(models.AssetAssignment).filter(
            models.AssetAssignment.asset_id.in_([x.id for x in assets]),
            models.AssetAssignment.returned_at.is_(None),
        )
    }
    return {"items": [_out(a, vigentes.get(a.id)) for a in assets], "total": total}


@router.post("/assets/", response_model=schemas.AssetResponse, status_code=status.HTTP_201_CREATED)
def create_asset(
    data: schemas.AssetCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    _require_staff(current_user)
    _check_catalog(db, models.AssetType, data.asset_type, "Tipo de activo no válido")
    asset = models.Asset(
        tag=_clean_tag(db, data.tag), asset_type=data.asset_type,
        brand=data.brand, model=data.model, serial=data.serial, notes=data.notes,
    )
    db.add(asset)
    db.flush()
    _event(db, asset.id, current_user.id, "created", new=asset.tag)
    db.commit()
    db.refresh(asset)
    return _out(asset, None)


@router.get("/assets/{asset_id}", response_model=schemas.AssetDetail)
def get_asset(asset_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    _require_staff(current_user)
    asset = _get_asset(db, asset_id)
    AA, AE, T, M = models.AssetAssignment, models.AssetEvent, models.Ticket, models.Maintenance
    return schemas.AssetDetail(
        **_out(asset, _vigente(db, asset_id)).model_dump(),
        assignments=db.query(AA).filter(AA.asset_id == asset_id).order_by(AA.assigned_at.desc(), AA.id.desc()).all(),
        events=db.query(AE).filter(AE.asset_id == asset_id).order_by(AE.timestamp.desc(), AE.id.desc()).all(),
        tickets=db.query(T).filter(T.asset_id == asset_id).order_by(T.created_at.desc(), T.id.desc()).all(),
        maintenances=db.query(M).filter(M.asset_id == asset_id).order_by(M.scheduled_for.desc(), M.id.desc()).all(),
    )


@router.patch("/assets/{asset_id}", response_model=schemas.AssetResponse)
def update_asset(
    asset_id: int,
    data: schemas.AssetUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    _require_staff(current_user)
    asset = _get_asset(db, asset_id)
    vigente = _vigente(db, asset_id)
    cambios = data.model_dump(exclude_unset=True, exclude={"comment"})
    # null explícito no vacía campos obligatorios (el tag vacío lo rechaza _clean_tag)
    for campo in ("asset_type", "status"):
        if campo in cambios and cambios[campo] is None:
            del cambios[campo]

    if "tag" in cambios:
        cambios["tag"] = _clean_tag(db, cambios["tag"], actual=asset)
    if "asset_type" in cambios and cambios["asset_type"] != asset.asset_type:
        _check_catalog(db, models.AssetType, cambios["asset_type"], "Tipo de activo no válido")
    # Un activo de baja no puede estar en manos de nadie: primero se registra la devolución
    if cambios.get("status") == models.AssetStatusEnum.retired and vigente is not None:
        raise HTTPException(status_code=400, detail="Registra la devolución antes de dar de baja el activo")

    for campo in CAMPOS_AUDITADOS:
        if campo in cambios and cambios[campo] != getattr(asset, campo):
            _event(db, asset_id, current_user.id, campo, getattr(asset, campo), cambios[campo], data.comment)
            setattr(asset, campo, cambios[campo])
    db.commit()
    db.refresh(asset)
    return _out(asset, vigente)


@router.post("/assets/{asset_id}/assign", response_model=schemas.AssetResponse)
def assign_asset(
    asset_id: int,
    data: schemas.AssignmentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Entrega (RF-08). Si ya estaba asignado, la asignación anterior se cierra: es un movimiento."""
    _require_staff(current_user)
    asset = _get_asset(db, asset_id)
    if asset.status == models.AssetStatusEnum.retired:
        raise HTTPException(status_code=400, detail="Un activo dado de baja no se puede asignar")
    location = (data.location or "").strip() or None
    if data.user_id is None and data.department_id is None and location is None:
        raise HTTPException(status_code=400, detail="Indica una persona, un departamento o una ubicación")
    if data.user_id is not None:
        destino = db.get(models.User, data.user_id)
        if destino is None or not destino.is_active:
            raise HTTPException(status_code=400, detail="La persona no existe o está desactivada")
    if data.department_id is not None:
        _check_catalog(db, models.Department, data.department_id, "Departamento no válido")

    ahora = datetime.now(timezone.utc)
    anterior = _vigente(db, asset_id)
    if anterior is not None:
        anterior.returned_at = ahora
    nueva = models.AssetAssignment(
        asset_id=asset_id, user_id=data.user_id, department_id=data.department_id,
        location=location, notes=(data.notes or "").strip() or None,
        assigned_by=current_user.id, assigned_at=ahora,
    )
    db.add(nueva)
    db.commit()
    db.refresh(asset)
    db.refresh(nueva)
    return _out(asset, nueva)


@router.post("/assets/{asset_id}/return", response_model=schemas.AssetResponse)
def return_asset(
    asset_id: int,
    comment: Optional[str] = Body(None, embed=True),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Devolución: cierra la asignación vigente; el activo queda disponible."""
    _require_staff(current_user)
    asset = _get_asset(db, asset_id)
    vigente = _vigente(db, asset_id)
    if vigente is None:
        raise HTTPException(status_code=400, detail="El activo no tiene una asignación vigente")
    vigente.returned_at = datetime.now(timezone.utc)
    _event(db, asset_id, current_user.id, "returned", comment=comment)
    db.commit()
    db.refresh(asset)
    return _out(asset, None)


@router.post("/assets/{asset_id}/notes", response_model=schemas.AssetEventResponse, status_code=status.HTTP_201_CREATED)
def add_asset_note(
    asset_id: int,
    data: schemas.AssetNote,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Observación libre en la bitácora (RF-07)."""
    _require_staff(current_user)
    _get_asset(db, asset_id)
    if not data.comment.strip():
        raise HTTPException(status_code=400, detail="La observación está vacía")
    evento = models.AssetEvent(asset_id=asset_id, changed_by=current_user.id, action="note", comment=data.comment.strip())
    db.add(evento)
    db.commit()
    db.refresh(evento)
    return evento


# --- MANTENIMIENTOS (RF-09, CA-05) ---

def _check_maintenance_refs(db, responsible_id, ticket_id):
    """Responsable = técnico/admin activo; ticket de origen debe existir."""
    if responsible_id is not None and not _valid_assignee(db, responsible_id):
        raise HTTPException(status_code=400, detail="El responsable debe ser un técnico o admin activo")
    if ticket_id is not None and db.get(models.Ticket, ticket_id) is None:
        raise HTTPException(status_code=400, detail="Ticket no encontrado")


@router.get("/maintenances/", response_model=schemas.Page[schemas.MaintenanceResponse])
def list_maintenances(
    status_: Optional[models.MaintenanceStatusEnum] = Query(None, alias="status"),
    kind: Optional[models.MaintenanceKindEnum] = Query(None),
    asset_id: Optional[int] = Query(None),
    date_from: Optional[date] = Query(None, alias="from"),
    date_to: Optional[date] = Query(None, alias="to"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Consulta de mantenimientos (CA-05). from/to filtran por fecha programada (inclusive).
    Los programados salen del más próximo al más lejano; el resto, del más reciente al más viejo."""
    _require_staff(current_user)
    M = models.Maintenance
    query = db.query(M)
    if status_ is not None:
        query = query.filter(M.status == status_)
    if kind is not None:
        query = query.filter(M.kind == kind)
    if asset_id is not None:
        query = query.filter(M.asset_id == asset_id)
    if date_from is not None:
        query = query.filter(M.scheduled_for >= date_from)
    if date_to is not None:
        query = query.filter(M.scheduled_for <= date_to)

    total = query.count()
    if status_ == models.MaintenanceStatusEnum.scheduled:
        orden = (M.scheduled_for.asc(), M.id.asc())
    else:
        orden = (M.scheduled_for.desc(), M.id.desc())
    return {"items": query.order_by(*orden).offset(offset).limit(limit).all(), "total": total}


@router.post("/assets/{asset_id}/maintenances", response_model=schemas.MaintenanceResponse, status_code=status.HTTP_201_CREATED)
def create_maintenance(
    asset_id: int,
    data: schemas.MaintenanceCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    _require_staff(current_user)
    asset = _get_asset(db, asset_id)
    if asset.status == models.AssetStatusEnum.retired:
        raise HTTPException(status_code=400, detail="No se programa mantenimiento a un activo dado de baja")
    _check_maintenance_refs(db, data.responsible_id, data.ticket_id)
    mant = models.Maintenance(**data.model_dump(), asset_id=asset_id, created_by=current_user.id)
    db.add(mant)
    db.commit()
    db.refresh(mant)
    return mant


@router.patch("/maintenances/{maintenance_id}", response_model=schemas.MaintenanceResponse)
def update_maintenance(
    maintenance_id: int,
    data: schemas.MaintenanceUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Reprogramar/reasignar o cerrar (done/cancelled). Cerrado = final: ya no se edita."""
    _require_staff(current_user)
    mant = db.get(models.Maintenance, maintenance_id)
    if mant is None:
        raise HTTPException(status_code=404, detail="Mantenimiento no encontrado")
    if mant.status != models.MaintenanceStatusEnum.scheduled:
        raise HTTPException(status_code=400, detail="Este mantenimiento ya está cerrado")

    cambios = data.model_dump(exclude_unset=True)
    for campo in ("kind", "scheduled_for", "status"):  # obligatorios: null explícito no los vacía
        if campo in cambios and cambios[campo] is None:
            del cambios[campo]
    for campo in ("findings", "actions"):
        if campo in cambios:
            cambios[campo] = (cambios[campo] or "").strip() or None
    _check_maintenance_refs(db, cambios.get("responsible_id"), cambios.get("ticket_id"))

    nuevo_estado = cambios.get("status")
    if nuevo_estado == models.MaintenanceStatusEnum.done:
        # Documentarlo es lo que lo vuelve "realizado" (RF-09)
        if not (cambios.get("actions") or mant.actions):
            raise HTTPException(status_code=400, detail="Describe las acciones realizadas para cerrarlo")
        mant.completed_at = datetime.now(timezone.utc)
        if mant.responsible_id is None and "responsible_id" not in cambios:
            mant.responsible_id = current_user.id  # quien lo cierra queda como responsable

    for campo, valor in cambios.items():
        setattr(mant, campo, valor)
    db.commit()
    db.refresh(mant)
    return mant
