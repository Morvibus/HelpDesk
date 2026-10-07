# MEMORY.md — HelpDesk

Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.
Regla permanente → proponer moverla a `AGENTS.md`. Nunca guardar claves, tokens ni datos personales.

## Estado actual (2026-10-07)

- App de tickets: FastAPI (`backend/main.py`) + React/Vite (`frontend/`) + Postgres 15 vía `docker-compose.yml`.
- Último commit: `9a7c906` "Actualizacion front end" (2026-09-30).
- Cambios sin commitear en `frontend/*`; sin trackear: `.gitignore` (vacío), `AGENTS.md`, `MEMORY.md`. No tocar sin confirmar.
- `README.md` fue eliminado (commits "Limpieza"); hoy `AGENTS.md` es la única guía.
- Sin tests ni CI; verificación real: `npm run lint` + `npm run build`.
- La sección "Memoria" de `AGENTS.md` (agregada este día) define el flujo de lectura/escritura de este archivo.

## Decisiones (y por qué)

- Backend plano en un solo `main.py` con imports planos: proyecto pequeño; separar en paquetes solo si crece.
- Esquema por `create_all` y no Alembic: más rápido en desarrollo; Alembic quedó en `requirements.txt` sin configurar.
- Login form-encoded (`username` = email): lo exige `OAuth2PasswordRequestForm` de FastAPI.
- Frontend hardcodea `http://localhost:8000` en axios/WebSocket: así se construyó; `VITE_API_URL` de compose quedó sin usar.
- Comentarios, UI y mensajes de commit en español.

## Aprendizajes y errores a evitar

- Nunca `git add -A`: ~6800 archivos de `node_modules` + `__pycache__` + `.env` + `uploads` están trackeados y `.gitignore` está vacío.
- Cambios en modelos no migran tablas existentes: `docker compose down -v` (borra datos) o SQL manual.
- Notas privadas se filtran en dos sitios (query REST y `ConnectionManager.broadcast`): actualizar ambos.
- `GET /tickets/{id}/messages` está definido dos veces: editar la primera (~línea 208).
- Fuera de Docker el backend necesita `DATABASE_URL` apuntando a `localhost`: `.env` apunta al hostname `db`.
- El contenido previo de este archivo era de otro proyecto (tracker de sesiones) y se reemplazó.

## Próximos pasos (propuestos, no ejecutados)

- Poblar `.gitignore` y decidir si se des-trackea `node_modules`/`__pycache__`/`uploads`.
- Definir si vuelve el `README.md`.
- Unificar la URL del API (`VITE_API_URL`) o eliminar la variable de compose.
