# MEMORY.md — HelpDesk

Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.
Regla permanente → proponer moverla a `AGENTS.md`. Nunca guardar claves, tokens ni datos personales.

## Estado actual (2026-10-07)

- Working tree **limpio y todo commiteado**: `1cad933` docs → `236b351` artefactos → `e1e6ed5` feat (WIP del usuario)
  → `2222285` .gitattributes → `41aaf4e` README → `2390378` refactor URLs.
- Verificado hoy: `npm run lint` (0 warnings) + `npm run build` OK. `frontend/node_modules` estaba vacío →
  hubo que correr `npm install`.
- README restaurado; el viejo mencionaba Kanban y Rocky Linux, que no existen en el código.
- Pendiente de push a origin (no se hace sin pedir).

## Decisiones (y por qué)

- URL del API unificada en `frontend/src/api.js`: `API_URL` (de `VITE_API_URL`, fallback `http://localhost:8000`),
  cliente `api` (axios con interceptor que adjunta el JWT) y `wsUrl()` para WebSockets. `frontend/.env.example` agregado.
- El backend devuelve rutas relativas (`/static/...`): el host lo decide el frontend, nunca el servidor.
- `.gitattributes` con `* text=auto`: `core.autocrlf=true` generaba 16 "M" fantasma por fin de línea.
- `.gitignore` poblando; des-trackeados `node_modules`, `__pycache__`, `uploads` y `.env` (antes ~6800 archivos en git).
- Backend plano en un solo `main.py`; esquema por `create_all` (Alembic en requirements pero sin configurar);
  login form-encoded por `OAuth2PasswordRequestForm`; español en UI y commits.

## Aprendizajes y errores a evitar

- Nunca `git add -A`; stagear rutas explícitas (y commitear el WIP del usuario antes que el trabajo propio).
- Cambios en modelos no migran tablas existentes: `docker compose down -v` (borra datos) o SQL manual.
- Notas privadas se filtran en dos sitios (query REST y `ConnectionManager.broadcast`): actualizar ambos.
- `GET /tickets/{id}/messages` está duplicado en `main.py`: editar el primero (~línea 208).
- Fuera de Docker, `DATABASE_URL` debe apuntar a `localhost` (`.env` apunta al hostname `db`).
- `/upload-image/` existe en el backend pero ningún componente del frontend lo usa ni renderiza imágenes.

## Próximos pasos

- Configurar Alembic para migraciones reales de `models.py`.
- Decidir el destino de la feature de imágenes (usar `api.js` + `API_URL` o retirarla).
