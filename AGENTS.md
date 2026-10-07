# AGENTS.md

HelpDesk: aplicación de soporte de tickets. Dos apps + Postgres, orquestadas por `docker-compose.yml`.
**No hay README, CI, tests, typecheck ni otros archivos de instrucciones** — los comandos de abajo son todo lo que existe.

## Estructura

- `backend/` — FastAPI con estructura **plana de módulos** (sin paquetes, imports son planos: `import models`).
  Todas las rutas viven en `backend/main.py`. Modelos: `models.py`, schemas Pydantic: `schemas.py`,
  JWT/bcrypt: `security.py`, engine/session: `database.py`. Entrada de la app: `main:app`.
- `frontend/` — React 19 + Vite + Tailwind v4 (JSX puro, sin TypeScript).
  Páginas en `src/pages`, componentes en `src/components`, stores zustand en `src/store` (`authStore`, `themeStore`, `uiStore`).
- Los roles son `employee | technician | admin` (`RoleEnum` en `models.py`). Los permisos se verifican
  **inline en cada endpoint** — cualquier endpoint nuevo necesita su propio chequeo explícito de rol.

## Comandos

- Stack completo: `docker compose up --build`
  → frontend http://localhost:5173, API http://localhost:8000 (Swagger en `/docs`), Postgres en 5432.
- Solo frontend: `cd frontend && npm install && npm run dev`
- Verificación del frontend (las únicas checks que existen, en este orden):
  - `npm run lint` — oxlint **sin archivo de configuración**, así que usa reglas por defecto
  - `npm run build`
- El backend no tiene lint ni tests. La verificación más rápida es importar la app con una DB alcanzable:
  `cd backend && python -c "import main"` (ejecuta `create_all` al importar).
- No existe forma de correr un solo test — no hay tests. La verificación manual es por Swagger en `/docs`.

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

## Rarezas de la API

- El frontend **hardcodea** `http://localhost:8000` / `ws://localhost:8000` en cada llamada axios y WebSocket.
  `VITE_API_URL` definido en `docker-compose.yml` no se lee en ningún lado — no depender de él.
- `POST /login` es OAuth2 **form-encoded** (`application/x-www-form-urlencoded`, campo `username` = email),
  no JSON. El rol para la UI se lee del payload del JWT en el cliente.
- Auth: Bearer JWT (`sub` = id de usuario, el claim `role` maneja los permisos). Los endpoints WebSocket
  (`/ws/notifications`, `/ws/tickets/{id}/chat`) reciben el JWT como query param `?token=...`.
- CORS permite solo `http://localhost:5173`.
- `GET /tickets/{id}/messages` está definido **dos veces** en `main.py` (~línea 208 y ~línea 377). FastAPI usa
  el primer registro; el segundo es código muerto. Editar el primero.
- `notifier` (el `NotificationManager`) está definido abajo al final de `main.py` pero lo usan endpoints
  anteriores. Funciona porque la resolución ocurre en tiempo de petición — no "arreglarlo" reordenando código.
- Las imágenes subidas quedan en `backend/uploads/` y se sirven en `/static`; la respuesta del upload hardcodea
  `http://localhost:8000/static/...`.

## Reglas de negocio a preservar

- Los empleados ven solo sus tickets; los técnicos ven los sin asignar + los suyos; los admins ven todos.
- Las notas privadas (`is_private_note`) se ocultan a los empleados en **ambos** lugares: la query REST de
  mensajes y `ConnectionManager.broadcast`. Cualquier nueva regla de visibilidad de mensajes debe aplicarse en ambos.
- Solo los empleados crean tickets; técnicos/admins los toman vía `PATCH /tickets`.
- Reabrir solo dentro de las 72 h del cierre; `/metrics/` es solo para técnicos/admins.

## Higiene de Git

- `frontend/node_modules/` (~6800 archivos), `backend/__pycache__/`, `backend/.env` y `backend/uploads/`
  están **trackeados**, y `.gitignore` está vacío. `git status` siempre es ruidoso — nunca `git add -A`;
  stagear rutas explícitas.
- El working tree suele traer cambios sin commitear del usuario (ahora en `frontend/`). No commitear ni
  revertir sin que lo pidan.
- Los mensajes de commit se escriben en español.

## Memoria

- Al empezar, lee `MEMORY.md` para conocer el estado del proyecto y las decisiones tomadas.
- Al terminar una tarea, actualízalo: estado actual, decisiones importantes (con su porqué) y errores a evitar.
- Mantenlo breve (máximo ~50 líneas): resume o elimina lo que ya no aporte.
- Si algo se convierte en una regla permanente, propón moverlo a `AGENTS.md` en lugar de dejarlo en la memoria.
- No guardes nunca datos sensibles (claves, tokens, datos personales).
