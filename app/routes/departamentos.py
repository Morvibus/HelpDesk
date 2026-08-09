from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app import models, schemas
from app.database import get_db
# Añade validación de rol de admin si lo requieres en la seguridad

router = APIRouter(prefix="/departamentos", tags=["Catálogos - Departamentos"])

@router.get("/", response_model=list[schemas.DepartamentoResponse])
def listar_departamentos(db: Session = Depends(get_db)):
    return db.query(models.Departamento).all()

@router.post("/", status_code=status.HTTP_201_CREATED)
def crear_departamento(nombre: str, db: Session = Depends(get_db)):
    nuevo = models.Departamento(nombre=nombre)
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return nuevo

@router.delete("/{depto_id}")
def eliminar_departamento(depto_id: int, db: Session = Depends(get_db)):
    depto = db.query(models.Departamento).filter(models.Departamento.id == depto_id).first()
    if not depto:
        raise HTTPException(status_code=404, detail="Departamento no encontrado")
    db.delete(depto)
    db.commit()
    return {"mensaje": "Departamento eliminado con éxito"}