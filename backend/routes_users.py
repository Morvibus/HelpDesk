"""Login y gestión de usuarios (alta, listado, edición, contraseña)."""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from database import get_db
from deps import get_current_user, get_optional_user, _valid_assignee, _check_catalog, _require_staff
from realtime import notifier
import models
import schemas
import security

router = APIRouter()


# --- ENDPOINTS DE AUTENTICACIÓN ---
@router.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # Nota: OAuth2 usa el campo 'username' por defecto, pero nosotros le pasaremos el correo.
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    
    if not user or not security.verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Cuenta desactivada por un administrador: se bloquea el acceso
    if user.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tu cuenta está desactivada. Contacta a un administrador.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # El token guardará el ID del usuario y su rol
    access_token = security.create_access_token(
        data={"sub": str(user.id), "role": user.role.value}
    )
    return {"access_token": access_token, "token_type": "bearer"}

# --- ENDPOINTS DE USUARIOS ---
@router.post("/users/", response_model=schemas.UserResponse)
def create_user(
    user: schemas.UserCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_optional_user)
):
    # REGLA DE SEGURIDAD: el registro público solo sirve para crear el PRIMER usuario.
    # A partir de ahí, crear usuarios (y elegir su rol) requiere token de administrador.
    if db.query(models.User).count() > 0:
        if current_user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Autenticación requerida",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if current_user.role != models.RoleEnum.admin:
            raise HTTPException(status_code=403, detail="Solo los administradores pueden crear usuarios")

    # Verificamos si el correo ya existe
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="El correo ya está registrado")

    if user.department_id is not None:
        _check_catalog(db, models.Department, user.department_id, "Departamento no válido")

    # Encriptamos la contraseña antes de guardarla
    hashed_password = security.get_password_hash(user.password)

    new_user = models.User(
        name=user.name,
        email=user.email,
        password_hash=hashed_password,
        role=user.role,
        department_id=user.department_id,
    )
    db.add(new_user)
    db.flush()  # id del nuevo usuario para la auditoría, misma transacción
    db.add(models.UserAuditLog(
        user_id=new_user.id, action="created",
        changed_by=current_user.id if current_user else None, new_value=new_user.role.value,
    ))
    db.commit()
    db.refresh(new_user)
    return new_user

# mostrar todos los empleados, técnicos y administradores 

# Directorio mínimo para I&T (asignar activos, mostrar nombres): sin correo ni rol.
# Va antes de /users/{user_id} por claridad; incluye inactivos para nombrar historiales viejos.
@router.get("/users/directory/", response_model=list[schemas.UserDirectoryEntry])
def get_user_directory(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    _require_staff(current_user)
    return db.query(models.User).order_by(models.User.name, models.User.id).all()


@router.get("/users/", response_model=schemas.Page[schemas.UserResponse])
def get_users(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # REGLA DE NEGOCIO: Solo los administradores pueden ver la lista de usuarios
    if current_user.role != models.RoleEnum.admin:
        raise HTTPException(status_code=403, detail="No tienes permisos para ver la lista de usuarios")

    query = db.query(models.User)
    total = query.count()
    users = query.order_by(models.User.id.asc()).offset(offset).limit(limit).all()
    return {"items": users, "total": total}

# actualizar rol y estado de activación de un usuario (solo admin)
@router.patch("/users/{user_id}", response_model=schemas.UserResponse)
def update_user(
    user_id: int,
    user_update: schemas.UserUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # REGLA DE NEGOCIO: Solo los administradores pueden modificar usuarios
    if current_user.role != models.RoleEnum.admin:
        raise HTTPException(status_code=403, detail="No tienes permisos para modificar usuarios")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # ANTI LOCKOUT: un admin no puede desactivarse a sí mismo ni quitarse el rol admin
    if user_id == current_user.id:
        desactiva = user_update.is_active is False
        autodegrada = user_update.role is not None and user_update.role != models.RoleEnum.admin
        if desactiva or autodegrada:
            raise HTTPException(
                status_code=400,
                detail="No puedes desactivarte ni quitarte el rol de administrador a ti mismo",
            )

    # Estado resultante: si se desactiva o se degrada a empleado, sus tickets abiertos quedarían
    # sin nadie que los atienda (los técnicos solo ven los no asignados + los propios).
    role_resultante = user_update.role if user_update.role is not None else user.role
    activo_resultante = user_update.is_active if user_update.is_active is not None else user.is_active
    queda_huerfano = (not activo_resultante) or (role_resultante == models.RoleEnum.employee)

    tickets_afectados = []
    if queda_huerfano:
        tickets_afectados = (
            db.query(models.Ticket).filter(
                models.Ticket.assigned_to == user_id,
                models.Ticket.status.in_([
                    models.StatusEnum.created,
                    models.StatusEnum.assigned,
                    models.StatusEnum.in_process,
                    models.StatusEnum.pending,
                ]),
            ).all()
        )

    # Validación temprana del destino (antes de mutar): técnico/admin activo y distinto del afectado
    reassign_to = user_update.reassign_to
    if reassign_to is not None and tickets_afectados:
        if reassign_to == user_id or not _valid_assignee(db, reassign_to):
            raise HTTPException(
                status_code=400,
                detail="El técnico destino de la reasignación no es válido",
            )

    auditados = ("role", "is_active", "name", "email", "department_id")
    antes = {campo: getattr(user, campo) for campo in auditados}

    if user_update.role is not None:
        user.role = user_update.role
    if user_update.is_active is not None:
        user.is_active = user_update.is_active
    if user_update.name is not None:
        user.name = user_update.name
    # department_id admite null explícito (quitar departamento): se mira si vino en el cuerpo
    if "department_id" in user_update.model_fields_set and user_update.department_id != user.department_id:
        if user_update.department_id is not None:
            _check_catalog(db, models.Department, user_update.department_id, "Departamento no válido")
        user.department_id = user_update.department_id
    if user_update.email is not None:
        # Unicidad del correo: puede repetir el propio, pero no el de otro usuario
        exists = (
            db.query(models.User)
            .filter(models.User.email == user_update.email, models.User.id != user_id)
            .first()
        )
        if exists:
            raise HTTPException(status_code=400, detail="El correo ya está registrado")
        user.email = user_update.email

    # Auditoría: solo los campos que de verdad cambiaron (enums como su valor)
    for campo in auditados:
        anterior, nuevo = antes[campo], getattr(user, campo)
        if anterior != nuevo:
            db.add(models.UserAuditLog(
                user_id=user.id, action=campo, changed_by=current_user.id,
                old_value=str(getattr(anterior, "value", anterior)),
                new_value=str(getattr(nuevo, "value", nuevo)),
            ))

    # Tickets abiertos: reasignar al técnico destino, o devolverlos al pool (sin asignar).
    # Los 'in_process'/'pending' se conservan (ya estaban iniciados); el resto vuelve a 'created'.
    # Nunca se tocan solved/closed: ahí vive la atribución histórica de las métricas.
    for t in tickets_afectados:
        anterior = t.assigned_to
        if reassign_to is not None:
            t.assigned_to = reassign_to
            if t.status == models.StatusEnum.created:
                t.status = models.StatusEnum.assigned
        else:
            t.assigned_to = None
            if t.status not in (models.StatusEnum.in_process, models.StatusEnum.pending):
                t.status = models.StatusEnum.created
        db.add(models.TicketHistory(
            ticket_id=t.id,
            action=models.ActionEnum.status_change,
            changed_by=current_user.id,
            old_value=str(anterior),
            new_value=str(t.assigned_to),
        ))

    db.commit()
    db.refresh(user)

    # Aviso a los técnicos para que refresquen el tablero (los recién liberados aparecen sin asignar)
    if tickets_afectados:
        if reassign_to is not None:
            mensaje = f"{len(tickets_afectados)} ticket(s) reasignado(s) de {user.name}"
        else:
            mensaje = f"{len(tickets_afectados)} ticket(s) de {user.name} volvieron al pool"
        background_tasks.add_task(
            notifier.notify_techs,
            "Tickets actualizados",
            mensaje,
            "🔁",
            "refresh",
            None,
            current_user.id,
        )

    return user

# modificar password de un usuario (solo admin puede cambiar el password de otros usuarios)
@router.patch("/users/{user_id}/password", response_model=schemas.UserResponse)
def update_user_password(
    user_id: int, 
    password_update: schemas.UserPasswordUpdate, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # REGLA DE NEGOCIO: Solo los administradores pueden cambiar la contraseña de otros usuarios
    if current_user.role != models.RoleEnum.admin:
        raise HTTPException(status_code=403, detail="No tienes permisos para cambiar la contraseña de otros usuarios")
    
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # REGLA DE SEGURIDAD: si cambias TU contraseña tienes que demostrar la actual.
    # Un administrador reseteando la de otra persona no la conoce, por eso no aplica.
    if user_id == current_user.id:
        if not password_update.old_password or not security.verify_password(password_update.old_password, user.password_hash):
            raise HTTPException(status_code=400, detail="La contraseña actual no es correcta")

    # Encriptamos la nueva contraseña antes de guardarla
    hashed_password = security.get_password_hash(password_update.new_password)
    user.password_hash = hashed_password
    # Se registra el hecho, nunca el valor
    db.add(models.UserAuditLog(user_id=user.id, action="password", changed_by=current_user.id))
    db.commit()
    db.refresh(user)
    
    return user
