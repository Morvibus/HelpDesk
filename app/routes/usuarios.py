from fastapi import APIRouter, Depends, HTTPException   
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
router = APIRouter(prefix="/usuarios", tags=["Catálogos - Usuarios"])

@router.get("/", response_model=list[schemas.UsuarioResponse])
def listar_usuarios(db: Session = Depends(get_db)):
    return db.query(models.Usuario).all()

@router.delete("/{usuario_id}")
def eliminar_usuario(usuario_id: int, db: Session = Depends(get_db)):
    user = db.query(models.Usuario).filter(models.Usuario.id == usuario_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    db.delete(user)
    db.commit()
    return {"mensaje": "Usuario eliminado con éxito"}