"""Biblioteca de problemas y soluciones."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from database import get_db
from deps import get_current_user, _check_catalog
import models
import schemas

router = APIRouter()


# --- BIBLIOTECA DE PROBLEMAS Y SOLUCIONES ---

# Roles que pueden publicar (los empleados solo leen)
STAFF_ROLES = (models.RoleEnum.technician, models.RoleEnum.admin)


@router.post("/library/", response_model=schemas.ArticleResponse, status_code=status.HTTP_201_CREATED)
def create_article(
    article: schemas.ArticleCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # REGLA DE NEGOCIO: solo técnicos y admins publican en la biblioteca
    if current_user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="Solo técnicos y administradores pueden publicar en la biblioteca")

    if article.ticket_id is not None:
        db_ticket = db.query(models.Ticket).filter(models.Ticket.id == article.ticket_id).first()
        if not db_ticket:
            raise HTTPException(status_code=404, detail="Ticket no encontrado")
        # Solo tiene sentido archivar tickets ya resueltos o cerrados
        if db_ticket.status not in (models.StatusEnum.solved, models.StatusEnum.closed):
            raise HTTPException(status_code=400, detail="Solo se pueden archivar tickets resueltos o cerrados")
        # Una sola entrada por ticket (evita duplicados)
        ya_existe = db.query(models.KnowledgeArticle).filter(
            models.KnowledgeArticle.ticket_id == article.ticket_id
        ).first()
        if ya_existe:
            raise HTTPException(status_code=409, detail="Este ticket ya está en la biblioteca")
    _check_catalog(db, models.Category, article.category, "Categoría no válida")

    db_article = models.KnowledgeArticle(
        ticket_id=article.ticket_id,
        title=article.title,
        problem=article.problem,
        solution=article.solution,
        category=article.category,
        created_by=current_user.id,
    )
    db.add(db_article)
    db.commit()
    db.refresh(db_article)
    return db_article


@router.get("/library/", response_model=schemas.Page[schemas.ArticleResponse])
def get_articles(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    q: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    ticket_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Lectura abierta a cualquier usuario autenticado: los empleados pueden
    # consultar la biblioteca para autoservicio.
    query = db.query(models.KnowledgeArticle)

    if q and q.strip():
        patron = f"%{q.strip()}%"
        query = query.filter(
            models.KnowledgeArticle.title.ilike(patron)
            | models.KnowledgeArticle.problem.ilike(patron)
            | models.KnowledgeArticle.solution.ilike(patron)
        )
    if category is not None:
        query = query.filter(models.KnowledgeArticle.category == category)
    if ticket_id is not None:
        query = query.filter(models.KnowledgeArticle.ticket_id == ticket_id)

    total = query.count()
    # Orden estable con id como desempate (el mismo criterio que el resto de listados)
    articles = query.order_by(
        models.KnowledgeArticle.created_at.desc(),
        models.KnowledgeArticle.id.desc(),
    ).offset(offset).limit(limit).all()
    return {"items": articles, "total": total}


@router.get("/library/{article_id}", response_model=schemas.ArticleResponse)
def get_article(
    article_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_article = db.query(models.KnowledgeArticle).filter(models.KnowledgeArticle.id == article_id).first()
    if not db_article:
        raise HTTPException(status_code=404, detail="Artículo no encontrado")
    return db_article


@router.patch("/library/{article_id}", response_model=schemas.ArticleResponse)
def update_article(
    article_id: int,
    article: schemas.ArticleUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_article = db.query(models.KnowledgeArticle).filter(models.KnowledgeArticle.id == article_id).first()
    if not db_article:
        raise HTTPException(status_code=404, detail="Artículo no encontrado")

    # REGLA DE NEGOCIO: solo el autor o un admin editan
    if current_user.role != models.RoleEnum.admin and db_article.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Solo el autor o un administrador pueden editar este artículo")

    # Cambiar a otra categoría exige que exista y esté activa; conservar una dada de baja se permite
    if article.category is not None and article.category != db_article.category:
        _check_catalog(db, models.Category, article.category, "Categoría no válida")

    # exclude_none: un null explícito no puede vaciar columnas NOT NULL
    for campo, valor in article.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(db_article, campo, valor)
    db.commit()
    db.refresh(db_article)
    return db_article


@router.delete("/library/{article_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_article(
    article_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    db_article = db.query(models.KnowledgeArticle).filter(models.KnowledgeArticle.id == article_id).first()
    if not db_article:
        raise HTTPException(status_code=404, detail="Artículo no encontrado")

    # REGLA DE NEGOCIO: solo el autor o un admin eliminan
    if current_user.role != models.RoleEnum.admin and db_article.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Solo el autor o un administrador pueden eliminar este artículo")

    db.delete(db_article)
    db.commit()
    return None
