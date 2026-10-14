"""Solicitudes de acceso (RF-05, CA-04), separadas de los tickets (decisión del usuario).

Cualquier usuario pide accesos y ve los suyos; I&T (técnicos y admins) ve todas y registra la
decisión (el aprobador real suele no usar la app), la habilitación y la revocación. Flujo solo
hacia adelante: pending -> approved (incluye "no requiere") / rejected -> enabled -> revoked.
Historial y comentarios van en un solo hilo (access_events). Nunca se guardan contraseñas.
"""
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from database import get_db
from deps import get_current_user, _check_catalog, _require_staff
from realtime import notifier
import models
import schemas

router = APIRouter()

STAFF = (models.RoleEnum.technician, models.RoleEnum.admin)
AR, AE, APR = models.AccessRequest, models.AccessEvent, models.AccessApprovalEnum
# Estado derivado -> condición SQL equivalente a AccessRequest.state (para filtrar el listado)
STATE_FILTERS = {
    "pending": AR.approval == APR.pending,
    "rejected": AR.approval == APR.rejected,
    "approved": AR.approval.in_([APR.approved, APR.not_required]) & AR.enabled_at.is_(None),
    "enabled": AR.enabled_at.isnot(None) & AR.revoked_at.is_(None),
    "revoked": AR.revoked_at.isnot(None),
}


def _get(db, access_id, user, staff_only=False):
    """Solicitud visible para el usuario: la propia o, para I&T, cualquiera."""
    acceso = db.get(AR, access_id)
    if acceso is None:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    if staff_only:
        _require_staff(user)
    elif user.role not in STAFF and acceso.requested_by != user.id:
        raise HTTPException(status_code=403, detail="No tienes permisos sobre esta solicitud")
    return acceso


def _detail(db, acceso):
    eventos = db.query(AE).filter(AE.access_request_id == acceso.id).order_by(AE.timestamp, AE.id).all()
    return schemas.AccessRequestDetail(**schemas.AccessRequestResponse.model_validate(acceso).model_dump(), events=eventos)


def _event(db, acceso, user, action, old=None, comment=None):
    db.add(AE(
        access_request_id=acceso.id, changed_by=user.id, action=action,
        old_value=old, new_value=None if action == "comment" else acceso.state,
        comment=(comment or "").strip() or None,
    ))


def _avisar(background_tasks, acceso, user, titulo, mensaje):
    """El solicitante se entera de lo que hace I&T; I&T, de lo que hace el solicitante."""
    if user.id == acceso.requested_by:
        background_tasks.add_task(notifier.notify_techs, titulo, mensaje, "🔑", "refresh", None, user.id)
    else:
        background_tasks.add_task(notifier.notify_user, acceso.requested_by, titulo, mensaje, "🔑", "refresh", None, user.id)


@router.get("/access-requests/", response_model=schemas.Page[schemas.AccessRequestResponse])
def list_access_requests(
    state: Optional[str] = Query(None),
    system: Optional[str] = Query(None),
    requested_by: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    query = db.query(AR)
    if current_user.role not in STAFF:  # el empleado solo ve las suyas (antes de cualquier filtro)
        query = query.filter(AR.requested_by == current_user.id)
    if state is not None:
        if state not in STATE_FILTERS:
            raise HTTPException(status_code=400, detail="Estado no válido")
        query = query.filter(STATE_FILTERS[state])
    if system is not None:
        query = query.filter(AR.system == system)
    if requested_by is not None:
        query = query.filter(AR.requested_by == requested_by)
    total = query.count()
    items = query.order_by(AR.created_at.desc(), AR.id.desc()).offset(offset).limit(limit).all()
    return {"items": items, "total": total}


@router.post("/access-requests/", response_model=schemas.AccessRequestDetail, status_code=status.HTTP_201_CREATED)
def create_access_request(
    data: schemas.AccessRequestCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    _check_catalog(db, models.AccessSystem, data.system, "Sistema no válido")
    justificacion = data.justification.strip()
    if not justificacion:
        raise HTTPException(status_code=400, detail="La justificación es obligatoria")
    acceso = AR(
        requested_by=current_user.id, department_id=current_user.department_id,
        system=data.system, justification=justificacion,
    )
    db.add(acceso)
    db.flush()
    _event(db, acceso, current_user, "created")
    db.commit()
    db.refresh(acceso)
    sistema = db.get(models.AccessSystem, data.system).name
    background_tasks.add_task(notifier.notify_techs, "Nueva solicitud de acceso", f"{current_user.name} pide acceso a {sistema}", "🔑", "refresh", None, current_user.id)
    return _detail(db, acceso)


@router.get("/access-requests/{access_id}", response_model=schemas.AccessRequestDetail)
def get_access_request(access_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return _detail(db, _get(db, access_id, current_user))


@router.post("/access-requests/{access_id}/decision", response_model=schemas.AccessRequestDetail)
def decide_access(
    access_id: int,
    data: schemas.AccessDecision,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    acceso = _get(db, access_id, current_user, staff_only=True)
    if acceso.state != "pending":
        raise HTTPException(status_code=400, detail="La solicitud ya tiene una decisión registrada")
    if data.decision == APR.pending:
        raise HTTPException(status_code=400, detail="La decisión debe ser aprobar, rechazar o no requiere")
    approver = (data.approver_name or "").strip() or None
    if data.decision != APR.not_required and approver is None:
        raise HTTPException(status_code=400, detail="Indica quién aprobó o rechazó la solicitud")

    acceso.approval = data.decision
    acceso.approver_name = approver
    acceso.approval_comment = (data.comment or "").strip() or None
    acceso.approval_recorded_by = current_user.id
    acceso.approval_at = datetime.now(timezone.utc)
    _event(db, acceso, current_user, "decision", "pending", data.comment)
    db.commit()
    db.refresh(acceso)
    _avisar(background_tasks, acceso, current_user, "Solicitud de acceso",
            "Tu solicitud fue rechazada" if acceso.state == "rejected" else "Tu solicitud fue aprobada")
    return _detail(db, acceso)


@router.post("/access-requests/{access_id}/enable", response_model=schemas.AccessRequestDetail)
def enable_access(
    access_id: int,
    data: schemas.AccessNote,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    acceso = _get(db, access_id, current_user, staff_only=True)
    if acceso.state != "approved":
        raise HTTPException(status_code=400, detail="Solo se habilita un acceso aprobado (o que no requiere aprobación)")
    acceso.enabled_at = datetime.now(timezone.utc)
    acceso.enabled_by = current_user.id
    _event(db, acceso, current_user, "enabled", "approved", data.comment)
    db.commit()
    db.refresh(acceso)
    _avisar(background_tasks, acceso, current_user, "Solicitud de acceso", "Tu acceso ya está habilitado")
    return _detail(db, acceso)


@router.post("/access-requests/{access_id}/revoke", response_model=schemas.AccessRequestDetail)
def revoke_access(
    access_id: int,
    data: schemas.AccessNote,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    acceso = _get(db, access_id, current_user, staff_only=True)
    if acceso.state != "enabled":
        raise HTTPException(status_code=400, detail="Solo se revoca un acceso habilitado")
    motivo = (data.comment or "").strip()
    if not motivo:
        raise HTTPException(status_code=400, detail="Indica el motivo de la revocación")
    acceso.revoked_at = datetime.now(timezone.utc)
    acceso.revoked_by = current_user.id
    acceso.revoke_reason = motivo
    _event(db, acceso, current_user, "revoked", "enabled", motivo)
    db.commit()
    db.refresh(acceso)
    _avisar(background_tasks, acceso, current_user, "Solicitud de acceso", "Tu acceso fue revocado")
    return _detail(db, acceso)


@router.post("/access-requests/{access_id}/comments", response_model=schemas.AccessRequestDetail)
def comment_access(
    access_id: int,
    data: schemas.AccessNote,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Hilo simple entre solicitante e I&T (reemplaza el chat del ticket)."""
    acceso = _get(db, access_id, current_user)
    if not (data.comment or "").strip():
        raise HTTPException(status_code=400, detail="El comentario está vacío")
    _event(db, acceso, current_user, "comment", comment=data.comment)
    db.commit()
    _avisar(background_tasks, acceso, current_user, f"Comentario en solicitud de acceso #{acceso.id}", data.comment.strip()[:60])
    return _detail(db, acceso)
