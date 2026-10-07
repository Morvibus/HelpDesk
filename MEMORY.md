# MEMORY.md — HelpDesk

Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.
Regla permanente → proponer moverla a `AGENTS.md`. Nunca guardar claves, tokens ni datos personales.

## Estado actual (2026-10-07)

- Fases commiteadas (sin push): Fase 1 (P0) `0571924`, Fase 2 (P1) `d91ac83`, docs `236375c`,
  **Fase 3 (P2) `68fab0d`**. `origin/main` sigue en `e51bec6`: push solo cuando el usuario lo indique.
- Fase 3 (P2) implementada y verificada:
  1. Alembic configurado: `alembic.ini` + `alembic/` (env.py lee `DATABASE_URL` del entorno y
     apunta a `models.Base.metadata`). Migración inicial `4abf7e7a664b` con guards por tabla:
     las DBs creadas con el `create_all` antiguo quedan en `head` sin tocar datos.
  2. `entrypoint.sh` → `alembic upgrade head` antes de uvicorn (si falla, no arranca); `create_all`
     eliminado de `main.py`.
  3. Paginación `{items, total}` con `limit` (1-200, def. 50) / `offset >= 0` en `/tickets/`,
     `/users/` y `/tickets/{id}/messages`; orden estable con id como desempate; mensajes más
     recientes primero.
  4. Frontend: Dashboard con "Cargar más" (y total real en "Total Histórico"); TicketDetail invierte
     el historial del chat, añade "cargar anteriores" preservando el scroll, keys por `msg.id`.
  5. Tests: 53 en verde (`+test_pagination`, `+test_migrations` que valida la migración contra DB
     vacía y contra DB previa de create_all).
- Verificado: pytest 53/53 (EXIT=0), lint 0 warnings, build OK, smoke en vivo (`limit=2`→200,
  `limit=999`→422, `offset=1000`→vacío, `helpdesk_db` en `head` con datos intactos).

## Decisiones (y por qué)

- Migraciones automáticas en el entrypoint: sin CI ni Python local, un paso manual se olvidaría;
  una sola ejecución antes del fork de gunicorn evita carreras.
- Guards por tabla solo en la migración inicial (deuda de que `create_all` fue el mecanismo hasta hoy).
- `limit/offset` + `{items, total}` y no cursores: volumen pequeño; el orden estable evita
  solapes/saltos entre páginas.
- Mensajes orden desc en la API: la primera página es la cola del chat; el frontend invierte.
- Tests de migraciones en `helpdesk_migrate_test` (creada y borrada por el propio test).
- httpx en vez de httpx2 (lo aprobó el usuario); starlette 1.7 avisa de deprecación — vigilar.

## Aprendizajes y errores a evitar

- Nunca `git add -A`; stagear rutas explícitas (commitear el WIP del usuario antes que el trabajo propio).
- Cambios en modelos → `alembic revision --autogenerate` + revisar diff (nada de `docker compose down -v`).
- Notas privadas se filtran en dos sitios (query REST y `ConnectionManager.broadcast`): actualizar ambos.
- Fuera de Docker, `DATABASE_URL` debe apuntar a `localhost` (`.env` apunta al hostname `db`).
- FastAPI valida el body antes de ejecutar la ruta: para probar `POST /users/` hace falta `name` (no `full_name`).
- `email-validator` rechaza dominios reservados (`.local`, `.test`...): en datos de prueba usar
  dominios inventados como `@helpdesk-mock.com`.
- `/upload-image/` existe en el backend pero ningún componente del frontend lo usa ni renderiza imágenes.

## Próximos pasos

- Push a `origin` solo cuando el usuario lo indique (locales: `0571924`, `d91ac83`, `236375c`, `68fab0d`).
- Vigilar httpx → httpx2 cuando Starlette quite el soporte a httpx en testclient.
