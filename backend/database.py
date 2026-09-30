from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

# Carga las variables de entorno (como tu contraseña de la base de datos)
load_dotenv()

# Esta es la dirección de tu base de datos.
# Cuando usemos Docker, "db" será el nombre del contenedor de PostgreSQL.
SQLALCHEMY_DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql://postgres:admin123@db:5432/helpdesk_db"
)

# El "engine" es el motor que maneja la comunicación con PostgreSQL
engine = create_engine(SQLALCHEMY_DATABASE_URL)

# La "SessionLocal" es lo que usarás en tus endpoints para hacer consultas (SELECT, INSERT, etc.)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Esta función se la pasaremos a FastAPI para que cada petición tenga su propia conexión a la BD
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
