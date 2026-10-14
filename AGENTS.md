# AGENTS.md

HelpDesk: aplicación de soporte de tickets. Dos apps + Postgres, orquestadas por `docker-compose.yml`.
**No hay CI ni typecheck**; el backend sí tiene tests con pytest (unitarios + integración), el frontend no.
El `README.md` cubre uso y desarrollo; los comandos de abajo son todo lo que existe.

## Estructura

- `backend/` — FastAPI con estructura **plana de módulos** (sin paquetes, imports son planos: `import models`).
  `main.py` solo arma la app (CORS, `/static`, `include_router`). Rutas por dominio en `routes_users.py`
  (login + usuarios), `routes_tickets.py` (tickets, mensajes, reopen, métricas, upload), `routes_access.py` (solicitudes de acceso), `routes_library.py`,
  `routes_admin.py` (catálogos + auditoría), `routes_assets.py` (activos + mantenimientos), `routes_reports.py` y `realtime.py` (WebSockets + `manager`/`notifier`).
  Permisos/auth compartidos en `deps.py` (`get_current_user`, `_can_see_ticket`, `_valid_assignee`,
  `_check_catalog`, `_require_admin`, `_require_staff`); horas hábiles en `business_hours.py`. Dependencias en una sola
  dirección: `routes_*` → `realtime`/`deps` → `models`; `deps` nunca importa routers.
  Modelos: `models.py`, schemas Pydantic: `schemas.py`, JWT/bcrypt: `security.py`, engine/session:
  `database.py`. Entrada de la app: `main:app`. Un endpoint nuevo va al `routes_*.py` de su dominio.
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
  - `npm run lint` — oxlint con `frontend/.oxlintrc.json` (plugins react/react_perf/react_hooks;
    correctness = error, suspicious = warn); objetivo: 0 warnings
  - `npm run build`
- Tests del backend (153 tests; requiere `db` levantado; usan la base `helpdesk_test`, nunca `helpdesk_db`):
  `docker compose run --rm backend python -m pytest`
  Usa `python -m pytest` (no `pytest`) para que `/app` entre en `sys.path`; un solo test:
  `docker compose run --rm backend python -m pytest tests/test_auth.py::test_login_form_encoded`.
  Estructura: `backend/tests/` (auth, permisos, upload, websockets, paginación, migraciones,
  biblioteca, alta de tickets, activos, solicitudes de acceso, reportes y búsqueda).
- Migraciones (Alembic): se aplican solas al arrancar (`entrypoint.sh` → `alembic upgrade head`).
  Al cambiar modelos: `docker compose run --rm backend alembic revision --autogenerate -m "qué cambia"`
  → revisar el diff en `backend/alembic/versions/` → commit. Validación:
  `docker compose run --rm backend alembic check` debe decir "No new upgrade operations detected".
- No hay lint en el backend; verificación puntual: `cd backend && python -c "import main"` (con DB alcanzable).

## Gotchas de entorno / base de datos

- `backend/.env` y el fallback de `database.py` apuntan al hostname `db` (el nombre del servicio Docker).
  Correr uvicorn fuera de Docker falla hasta exportar:
  `DATABASE_URL=postgresql://helpdesk_user:helpdesk_password@localhost:5432/helpdesk_db`
- El schema lo gestiona Alembic: `entrypoint.sh` ejecuta `alembic upgrade head` antes de uvicorn y,
  si falla, el contenedor no arranca. `main.py` ya no crea tablas al importar; los tests solo usan
  `create_all` para limpiar `helpdesk_test`. La migración inicial `4abf7e7a664b` lleva guards por
  tabla: las DBs creadas con el `create_all` antiguo quedan en `head` sin tocar datos.
- Dentro del contenedor, el `DATABASE_URL` de compose (usuario `helpdesk_user`) tiene prioridad sobre
  `backend/.env` (usuario `postgres`); difieren a propósito.
- `SECRET_KEY` es obligatoria: `security.py` lanza `RuntimeError` al importar si falta (ya no hay fallback).
  Compose la inyecta con `env_file: ./backend/.env` (archivo local, no trackeado); sin ese archivo,
  `docker compose up` falla al arrancar el backend.
- `email-validator` rechaza dominios reservados en campos `EmailStr` (`.local`, `.test`, `.example`...):
  para datos de prueba usar dominios inventados como `@helpdesk-mock.com`.

## Rarezas de la API

- Para llamar al API desde el frontend usar `frontend/src/api.js`: `api` (axios con `baseURL` e interceptor
  JWT automático) y `wsUrl()` para WebSockets. La base por defecto es `/api` (relativa): el proxy de
  `vite.config.js` la reenvía al backend (`API_PROXY_TARGET`, en compose `http://backend:8000`) incluidos
  `/static` y WebSockets. Mismo origen ⇒ sin CORS y basta exponer el 5173 a otros dispositivos.
  `VITE_API_URL` solo para otro servidor. **Nunca** URLs absolutas ni headers `Authorization` manuales.
- Los listados `GET /tickets/`, `GET /users/` y `GET /tickets/{id}/messages` devuelven
  `{items, total}` paginado: `limit` (1-200, por defecto 50) y `offset >= 0`; fuera de rango → items
  vacíos. Orden estable con `id` como desempate; los mensajes llegan más recientes primero y el
  frontend los invierte para pintar el chat.
- `POST /login` es OAuth2 **form-encoded** (`application/x-www-form-urlencoded`, campo `username` = email),
  no JSON. El rol para la UI se lee del payload del JWT en el cliente.
- Auth: Bearer JWT (`sub` = id de usuario, el claim `role` maneja los permisos). Los endpoints WebSocket
  (`/ws/notifications`, `/ws/tickets/{id}/chat`) reciben el JWT en `Sec-WebSocket-Protocol: "auth", <token>`
  y responden con subprotocolo `auth`; `?token=` en la query se rechaza (403).
- CORS permite solo `http://localhost:5173` (solo aplica si se usa `VITE_API_URL` con URL absoluta).
  Vite acepta IPs de la red local y `*.devtunnels.ms` (`allowedHosts`); otro host → 403 de Vite.
- Las imágenes subidas quedan en `backend/uploads/` y se sirven en `/static`; el backend devuelve rutas
  **relativas** (`/static/...`) — resolverlas con `API_URL` en el frontend.
- Adjuntos (RF-02) por `/upload-image/` (nombre histórico): imágenes `jpeg|png|gif|webp` y **PDF**,
  máx. 5 MB (se corta por chunks). Además del content-type, los primeros bytes deben coincidir con su firma
  (`ALLOWED_UPLOAD_TYPES`); la extensión sale del tipo validado, nunca del filename. En el chat viajan
  como mensaje con `image_url`, y el WS solo acepta rutas `/static/<uuid>.<ext>` que existan
  (`_valid_attachment` en `deps.py`); el texto del mensaje es el nombre del archivo si no hay texto.
  Los archivos de `/static` no piden token (nombres uuid no adivinables).

## Reglas de negocio a preservar

- Los empleados ven solo sus tickets; los técnicos ven los sin asignar + los suyos; los admins ven todos.
  Aplica al listado y, vía `_can_see_ticket` en `deps.py`, al detalle, mensajes, PATCH, reopen y chat WS.
- El JWT solo identifica al usuario: rol y `is_active` se leen siempre de la DB (`_user_from_token`),
  también en los WebSockets. Los WS abren sesiones cortas (`SessionLocal`), nunca `Depends(get_db)`
  (retendrían una conexión del pool mientras la pestaña siga abierta).
- `pending` (Pendiente) es un estado **abierto**: toda lista de estados abiertos (huérfanos, KPIs,
  columnas del tablero) debe incluirlo. `PATCH /tickets` y `/reopen` aceptan `comment` (observación,
  RF-04) que se guarda en cada fila de `ticket_history` de esa petición.
- Un ticket `solved/closed` solo se reabre por `/reopen`; `assigned_to` solo acepta técnicos/admins
  activos (`_valid_assignee`). Las notas privadas de un empleado se guardan como públicas.
- Auditoría (`GET /audit/?kind=tickets|users[&ticket_id=]`, solo admin): tickets lee `ticket_history`,
  usuarios lee `user_audit_log`. En la UI, Auditoría → Tickets lista tickets y el historial se ve en el
  detalle (`/ticket/:id`, tarjeta "Historial", solo admin). La ruta del detalle es `/ticket/`, no `/tickets/`. Toda acción nueva de admin sobre usuarios debe registrar su fila ahí (nunca valores de contraseña).
- Catálogos (`/departments/`, `/categories/`): leen todos, editan solo admins; **no se borran, se
  desactivan** (tickets/artículos viejos los citan). Lo inactivo no se asigna a nada nuevo
  (`_check_catalog`), pero un artículo puede conservar su categoría inactiva. Las categorías se
  identifican por una clave de texto estable (`network`, `camaras_ip`...) que es lo que viaja en el API;
  las 6 iniciales se siembran al crear la tabla (migración y `create_all`). El tipo de ticket
  (`TicketTypeEnum`) es fijo. El ticket guarda una copia del `department_id` del solicitante al crearse.
  En el frontend los catálogos se leen con `fetchCatalog` de `api.js` (caché; `invalidateCatalog` al editar).
- Activos (`/assets/`, página `/activos`): solo I&T (`_require_staff`); los empleados no los ven.
  No se borran: se dan de baja (`retired`), y solo si no tienen asignación vigente; uno de baja no se asigna.
  La asignación vigente es la que no tiene `returned_at`; asignar de nuevo cierra la anterior (movimiento).
  Cambios de campos/estado y observaciones van a `asset_events`. El vínculo ticket→activo lo hace solo
  I&T vía `PATCH /tickets` (`asset_id`, null explícito desvincula) y queda en `ticket_history` como `asset_linked`.
  `GET /users/directory/` (I&T) da id/nombre/departamento/`is_staff` sin correo ni rol exacto.
- Solicitudes de acceso (RF-05): **separadas de los tickets** (decisión del usuario; ya no existe el tipo
  de ticket `access_request`). `/access-requests/` + página `/accesos` para todos: el empleado crea y ve
  las suyas, I&T ve todas y es el único que decide/habilita/revoca. **Nunca** un campo de contraseña.
  Estado derivado (`AccessRequest.state`, y `STATE_FILTERS` para filtrar en SQL: mantener ambos iguales):
  pending → approved (incluye "no requiere") / rejected → enabled → revoked; solo hacia adelante. La
  decisión la *registra* I&T (`approver_name` puede no ser usuario); revocar exige motivo. Pasos y
  comentarios van juntos en `access_events`; avisos por el hub (`refresh`). `ActionEnum.access_change`
  quedó sin uso (como `escalated`).
  Catálogos con clave de texto (categorías, tipos de activo, sistemas de acceso) se generan con
  `_keyed_catalog_routes` en `routes_admin.py`: uno nuevo = una línea + su tabla.
- Búsqueda (RF-10): `GET /tickets/` acepta `q` (dígitos = número de ticket, si no texto en
  título/descripción), `created_by`, `category`, `department_id`, `asset_id`, `ticket_type`,
  `date_from`/`date_to` (fechas **locales** de creación, inclusive, vía `local_day_bounds`). Siempre
  después de la visibilidad por rol. UI: pestaña "Buscar" del panel principal (todos los roles).
- "Vencido" = abierto y por encima de `SLA_HOURS` (horas hábiles por prioridad) en `business_hours.py`
  (`is_overdue`); el listado lo devuelve como `overdue`. El semáforo del frontend (`AGE_THRESHOLDS`)
  usa los mismos umbrales: cambiar ambos a la vez.
- Reportes (`GET /reports/summary?from&to`, página `/reportes`, solo I&T): el período filtra creados
  (tablas por estado/tipo/categoría/departamento/activo) y cerrados (resueltos, por técnico); abiertos,
  vencidos, pendientes, mantenimientos y accesos vigentes son foto actual. CSV generado en el navegador
  (`;` + BOM para Excel en español).
- Mantenimientos (`/maintenances/`, pestaña en `/activos` + ficha del activo): solo I&T. `scheduled` es el
  único estado editable; `done` exige `actions` y fija `completed_at`; `done`/`cancelled` son finales.
  Responsable = técnico/admin activo (`_valid_assignee`). `next_date` solo se anota: **no** programa el
  siguiente (decisión del usuario). "Vencido" = programado con fecha < hoy (derivado, no es un estado).
- Las notas privadas (`is_private_note`) se ocultan a los empleados en **ambos** lugares: la query REST de
  mensajes y `ConnectionManager.broadcast`. Cualquier nueva regla de visibilidad de mensajes debe aplicarse en ambos.
- Solo los empleados crean tickets; técnicos/admins los toman vía `PATCH /tickets`.
- `POST /users/` crea el primer usuario sin token **solo** si la tabla está vacía (bootstrap);
  después exige token de administrador.
- Reabrir solo dentro de las 72 h del cierre; `/metrics/` es por rol: el empleado cuenta solo sus
  tickets, técnicos y admins ven el tablero completo.

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
  - Git (commits, staging, push, qué hacer con cambios ajenos) solo cuando el usuario lo indique; no preguntar por ello.
Pregunta antes:
  -crear archivos nuevos, cambiar el formato de los datos guardados.
Nunca: 
  -preguntar si hacer un push, (los push solo se haran cuando el usuario lo indique)
  -añadir dependencias, frameworks o un paso de build
  -borrar algo de proximos pasos en 'MEMORY.md' si no ha sido reuelto o descartado
