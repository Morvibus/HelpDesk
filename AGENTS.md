# AGENTS.md

HelpDesk: aplicación de soporte de tickets. Dos apps + Postgres, orquestadas por `docker-compose.yml`.
**No hay CI ni typecheck**; el backend sí tiene tests con pytest (unitarios + integración), el frontend no.
El `README.md` cubre uso y desarrollo; los comandos de abajo son todo lo que existe.

## Estructura

- `backend/` — FastAPI con estructura **plana de módulos** (sin paquetes, imports son planos: `import models`).
  Todas las rutas viven en `backend/main.py`. Modelos: `models.py`, schemas Pydantic: `schemas.py`,
  JWT/bcrypt: `security.py`, engine/session: `database.py`. Entrada de la app: `main:app`.
- `frontend/` — React 19 + Vite + Tailwind v4 (JSX puro, sin TypeScript).
  Páginas en `src/pages`, componentes en `src/components`, stores zustand en `src/store` (`authStore`, `themeStore`, `uiStore`).
  **Todas** las llamadas al API pasan por `src/api.js`.
- Los roles son `employee | technician | admin` (`RoleEnum` en `models.py`). Los permisos se verifican
  **inline en cada endpoint** — cualquier endpoint nuevo necesita su propio chequeo explícito de rol.

## Comandos

- Stack completo: `docker compose up --build`
  → frontend http://localhost:5173, API http://localhost:8000 (Swagger en `/docs`), Postgres en 5432.
- Solo frontend: `cd frontend && npm install && npm run dev`
- Verificación del frontend (las únicas checks que existen, en este orden):
  - `npm run lint` — oxlint **sin archivo de configuración**, así que usa reglas por defecto
  - `npm run build`
- Tests del backend (45 tests; requiere `db` levantado; usan la base `helpdesk_test`, nunca `helpdesk_db`):
  `docker compose run --rm backend python -m pytest`
  Usa `python -m pytest` (no `pytest`) para que `/app` entre en `sys.path`; un solo test:
  `docker compose run --rm backend python -m pytest tests/test_auth.py::test_login_form_encoded`.
  Estructura: `backend/tests/` (`conftest.py` + auth, permisos, upload, websockets).
- No hay lint en el backend; verificación puntual: `cd backend && python -c "import main"` (con DB alcanzable).

## Gotchas de entorno / base de datos

- `backend/.env` y el fallback de `database.py` apuntan al hostname `db` (el nombre del servicio Docker).
  Correr uvicorn fuera de Docker falla hasta exportar:
  `DATABASE_URL=postgresql://helpdesk_user:helpdesk_password@localhost:5432/helpdesk_db`
- El schema viene **solo** de `models.Base.metadata.create_all(bind=engine)` al importar `main.py`.
  Alembic está en `requirements.txt` pero NO está configurado (no hay `alembic.ini` ni versions).
  Cambios en los modelos NO alteran una tabla existente — recrear la DB
  (`docker compose down -v`, destruye datos) o aplicar SQL manual.
- Dentro del contenedor, el `DATABASE_URL` de compose (usuario `helpdesk_user`) tiene prioridad sobre
  `backend/.env` (usuario `postgres`); difieren a propósito.
- `SECRET_KEY` es obligatoria: `security.py` lanza `RuntimeError` al importar si falta (ya no hay fallback).
  Compose la inyecta con `env_file: ./backend/.env` (archivo local, no trackeado); sin ese archivo,
  `docker compose up` falla al arrancar el backend.
- `email-validator` rechaza dominios reservados en campos `EmailStr` (`.local`, `.test`, `.example`...):
  para datos de prueba usar dominios inventados como `@helpdesk-mock.com`.

## Rarezas de la API

- Para llamar al API desde el frontend usar `frontend/src/api.js`: `api` (axios con `baseURL` e interceptor
  JWT automático) y `wsUrl()` para WebSockets; la base sale de `VITE_API_URL` con fallback
  `http://localhost:8000` (`frontend/.env.example`). **Nunca** URLs absolutas ni headers `Authorization` manuales.
- `POST /login` es OAuth2 **form-encoded** (`application/x-www-form-urlencoded`, campo `username` = email),
  no JSON. El rol para la UI se lee del payload del JWT en el cliente.
- Auth: Bearer JWT (`sub` = id de usuario, el claim `role` maneja los permisos). Los endpoints WebSocket
  (`/ws/notifications`, `/ws/tickets/{id}/chat`) reciben el JWT en `Sec-WebSocket-Protocol: "auth", <token>`
  y responden con subprotocolo `auth`; `?token=` en la query se rechaza (403).
- CORS permite solo `http://localhost:5173`.
- `notifier` (el `NotificationManager`) está definido abajo al final de `main.py` pero lo usan endpoints
  anteriores. Funciona porque la resolución ocurre en tiempo de petición — no "arreglarlo" reordenando código.
- Las imágenes subidas quedan en `backend/uploads/` y se sirven en `/static`; el backend devuelve rutas
  **relativas** (`/static/...`) — resolverlas con `API_URL` en el frontend.
- Upload limitado a 5 MB (se corta por chunks) y tipos `image/jpeg|png|gif|webp`; la extensión se deriva
  del content-type validado, nunca del filename.

## Reglas de negocio a preservar

- Los empleados ven solo sus tickets; los técnicos ven los sin asignar + los suyos; los admins ven todos.
- Las notas privadas (`is_private_note`) se ocultan a los empleados en **ambos** lugares: la query REST de
  mensajes y `ConnectionManager.broadcast`. Cualquier nueva regla de visibilidad de mensajes debe aplicarse en ambos.
- Solo los empleados crean tickets; técnicos/admins los toman vía `PATCH /tickets`.
- `POST /users/` crea el primer usuario sin token **solo** si la tabla está vacía (bootstrap);
  después exige token de administrador.
- Reabrir solo dentro de las 72 h del cierre; `/metrics/` es solo para técnicos/admins.

## Higiene de Git

- `.gitignore` y `.gitattributes` (`* text=auto`) están activos: `node_modules`, `__pycache__`, `uploads` y
  `.env` ya NO están trackeados (antes ocupaban ~6800 archivos del repo). No volver a agregarlos.
- Aun así, stagear **rutas explícitas**; nunca `git add -A`.
- El working tree puede traer cambios sin commitear del usuario: no commitearlos ni revertirlos sin confirmar.
  Si hay que construir encima, commitear primero su WIP como commit propio (preguntar).
- Los mensajes de commit se escriben en español.

## Memoria

- Al empezar, lee `MEMORY.md` para conocer el estado del proyecto y las decisiones tomadas.
- Al terminar una tarea, actualízalo: estado actual, decisiones importantes (con su porqué) y errores a evitar.
- Mantenlo breve (máximo ~50 líneas): resume o elimina lo que ya no aporte.
- Si algo se convierte en una regla permanente, propón moverlo a `AGENTS.md` en lugar de dejarlo en la memoria.
- No guardes nunca datos sensibles (claves, tokens, datos personales).


## Limites

Siempre: 
  -actualizar `MEMORY.md` al terminar cada tarea.
Pregunta antes:
  -crear archivos nuevos, cambiar el formato de los datos guardados.
Nunca: 
  -preguntar si hacer un push, (los push solo se haran cuando el usuario lo indique)
  -añadir dependencias, frameworks o un paso de build
  -borrar algo de proximos pasos en 'MEMORY.md' si no ha sido reuelto o descartado
