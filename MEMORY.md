# MEMORY.md — HelpDesk

Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.
Regla permanente → proponer moverla a `AGENTS.md`. Nunca guardar claves, tokens ni datos personales.

## Estado actual (2026-10-07)

- Fase 1 (P0 seguridad) commiteada en `0571924`; Fase 2 (P1) commiteada en `d91ac83`.
  Push pendiente: `origin/main` sigue en `e51bec6` (push solo cuando el usuario lo indique).
- Fase 1 (P0): bootstrap de registro solo con tabla vacía; pertenencia en `PATCH /tickets/{id}`
  y `GET /tickets/{id}/messages`; `SECRET_KEY` obligatoria; upload 5 MB + extensión del content-type;
  WS autenticados por `Sec-WebSocket-Protocol: "auth", <token>` (con `?token=` → 403).
- Fase 2 (P1):
  1. `NotificationManager` multi-tab: lista de conexiones por usuario; cerrar una pestaña no apaga
     la otra; envíos tolerantes a sockets muertos (también en `ConnectionManager.broadcast`).
  2. Chat WS no bloquea el event loop: membership, guardado y recarga con `asyncio.to_thread`
     (sesión usada secuencialmente, con `refresh` para evitar lazy-loads en el hilo principal).
  3. Tests: 45 en verde en `backend/tests/` (auth, permisos, upload, websockets) sobre la base
     `helpdesk_test`; corren con `docker compose run --rm backend python -m pytest`.
  4. `requirements.txt` pineado a las versiones reales de la imagen + `pytest==9.1.1` + `httpx==0.28.1`.
- Verificado: pytest 45/45 (EXIT=0), `npm run lint` 0 warnings, `npm run build` OK,
  smoke en vivo con imagen nueva (`/docs` 200, WS 101/403/403).

## Decisiones (y por qué)

- Tests en `helpdesk_test`: `conftest.py` la crea y redirige `DATABASE_URL` antes de importar la
  app — jamás se toca `helpdesk_db`. `python -m pytest` (no `pytest`) para que `/app` esté en `sys.path`.
- Registro en bootstrap abierto a propósito; `old_password` obligatorio solo al cambiar la propia.
- httpx en vez de httpx2 (lo aprobó el usuario); starlette 1.7 avisa de deprecación — vigilar.
- Fase 3 pendiente: Alembic (sin configurar) y paginación de listados.

## Aprendizajes y errores a evitar

- Nunca `git add -A`; stagear rutas explícitas (commitear el WIP del usuario antes que el trabajo propio).
- Cambios en modelos no migran tablas existentes: `docker compose down -v` (borra datos) o SQL manual.
- Notas privadas se filtran en dos sitios (query REST y `ConnectionManager.broadcast`): actualizar ambos.
- Fuera de Docker, `DATABASE_URL` debe apuntar a `localhost` (`.env` apunta al hostname `db`).
- FastAPI valida el body antes de ejecutar la ruta: para probar `POST /users/` hace falta `name` (no `full_name`).
- `email-validator` rechaza dominios reservados (`.local`, `.test`...): en datos de prueba usar
  dominios inventados como `@helpdesk-mock.com`.
- `/upload-image/` existe en el backend pero ningún componente del frontend lo usa ni renderiza imágenes.

## Próximos pasos

- Push a `origin` solo cuando el usuario lo indique (locales: `0571924`, `d91ac83` y docs).
- Fase 3: configurar Alembic (pedir permiso: `alembic.ini` + carpeta `versions/`) y paginación de listados.
