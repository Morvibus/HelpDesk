from datetime import datetime, timedelta, timezone
from jose import jwt
import bcrypt
import os
from dotenv import load_dotenv

load_dotenv()

# REGLA DE SEGURIDAD: sin secreto no hay arranque (evita el fallback "super_secreto_..."
# con el que todos los entornos compartirían la misma clave).
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY no está definida. Define la variable de entorno antes de arrancar "
        "(en Docker: backend/.env vía env_file en docker-compose.yml)."
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

def get_password_hash(password: str) -> str:
    # Genera una "sal" aleatoria y encripta la contraseña
    salt = bcrypt.gensalt()
    hashed_password = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed_password.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    # Compara la contraseña en texto plano con el hash guardado
    return bcrypt.checkpw(
        plain_password.encode('utf-8'), 
        hashed_password.encode('utf-8')
    )

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
