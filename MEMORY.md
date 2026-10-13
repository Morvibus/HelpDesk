# MEMORY.md — HelpDesk

Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.
Regla permanente → proponer moverla a `AGENTS.md`. Nunca guardar claves, tokens ni datos personales.

## Estado actual (2026-10-12)

- Previo pusheado (`origin/main` = `a2c07c5`): F1, docs, F5+oxlint, docs. Los commits nuevos
  (responsive, asignaciones, vista admin, admin potenciado) quedan sin push.
- Fase 3: Alembic (`4abf7e7a664b` con guards) + entrypoint + paginación `{items,total}`. 53 tests.
- Frontend F1-F3 + F5: interceptor 401, error boundary, reconexión WS, initTheme, `/metrics/` por
  rol (KPIs del Dashboard = única fuente). `.oxlintrc.json`: 0 warnings.
- Responsive R1+R2 + Asignaciones: navbar móvil OK, chat `h-[55vh] min-h-[400px] lg:h-[600px]`,
  tablero a 2 columnas (En Proceso incluye `assigned` legacy). (187b19d, 0dc2790, f5c8fe6, f488619)
- Vista admin: `PATCH /users/{id}` (rol/is_active, anti-lockout), login/get_current_user con
  `is_active`, `AdminPanel.jsx` + ruta /admin. 61 tests. (ead4605, 22556fb, 2578856)
- **Admin potenciado (esta sesión)**: `AdminPanel.jsx` en 3 pestañas (Usuarios · Tickets ·
  Rendimiento); editar nombre/correo; filtros `status`/`priority` en `GET /tickets/`; reasignar
  tickets; promedio de resolución por técnico en `/metrics/`. (1fb3703, 73f84b0, eb1d0d7)
- **Horas hábiles (esta sesión, sin commitear)**: `/metrics/` agrega
  `average_resolution_business_hours` y `avg_resolution_by_technician_business`;
  `TicketResponse.business_age_hours` por ticket; el panel admin mide resolución y antigüedad en
  horas hábiles (con el calendario como referencia). Backend: 75 tests en verde. Frontend: lint 0 +
  build OK + módulo servido verificado.

## Decisiones (y por qué)

- KPIs: única fuente de verdad = `/metrics/`, nunca contar sobre la página cargada.
- Gestión de usuarios: `PATCH /users/{id}` (solo admin) con anti-lockout propio; desactivar bloquea
  login y JWT al instante. También edita `name`/`email`: unicidad de correo excluyendo al propio
  (400 si choca). Cambiar el correo no invalida el JWT del otro (el token no lleva email).
- Admin = pestañas dentro de `/admin` (una página, sin rutas extra).
- Filtros `status`/`priority` en `GET /tickets/` siempre DESPUÉS de la visibilidad por rol.
- Reasignar (admin) usa `PATCH /tickets/{id}` con `assigned_to`; en un `created` queda `assigned`
  y se ve en "En Proceso" vía filtro legacy hasta que el técnico lo atienda.
- Nombres en tablas admin se resuelven en frontend con `GET /users/` (página solo-admin; no se toca
  `TicketResponse`).
- Semáforo de antigüedad: umbrales por prioridad (urgente 24 / alta 48 / media 72 / baja 120 h);
  rojo > umbral, ámbar > mitad, verde <= mitad.
- Horas hábiles: helper `business_hours_between` en `main.py` es la única fuente (el frontend NO
  duplica la lógica: consume `business_age_hours`). Zona `UTC-6` fija; jornada lun-vie 07:30-17:00
  (9.5 h) y sáb 07:30-12:00 (4.5 h); domingo 0. Los timestamps de Postgres (DateTime plano, naive)
  se asumen UTC. El sábado cuenta: un ticket de viernes a lunes acumula el medio día del sábado.
- Métricas de resolución: se conservan las de calendario y se agregan las hábiles
  (`average_resolution_business_hours`, `avg_resolution_by_technician_business`); admin muestra la
  hábil como principal y la calendario como referencia. El semáforo pasa a horas HÁBILES
  (urgente 10 / alta 20 / media 30 / baja 48).
- "En Proceso" (columna y KPI) incluye `assigned` legacy; no se migran datos.
- oxlint: off en `react-in-jsx-scope` / `set-state-in-effect` / `react-hooks/exhaustive-deps`;
  `react/exhaustive-effect-dependencies` warn con disables comentados en deps intencionales.
- Reconexión WS 1s→15s; 401 global → logout; `initTheme()` en `main.jsx` antes del render.
- Migraciones automáticas en entrypoint; guards solo en la migración inicial (deuda de `create_all`).
- Error boundary como clase en `App.jsx` (React no permite boundaries funcionales).

## Aprendizajes y errores a evitar

- Nunca `git add -A`; stagear rutas explícitas; commitear el WIP del usuario antes que lo propio.
- Modelos → `alembic revision --autogenerate` + revisar diff (nada de `docker compose down -v`).
- Notas privadas se filtran en REST y en `ConnectionManager.broadcast`: actualizar ambos.
- Fuera de Docker, `DATABASE_URL` apunta a localhost (`.env` usa el hostname `db`).
- `email-validator` rechaza dominios reservados: usar `@helpdesk-mock.com` en pruebas.
- `atob` puro rompe con base64url: usar `decodeToken` del authStore.
- Componentes que no dependan de props/estado del padre → scope de módulo (remounts, oxlint).
- "Pantalla en blanco" tras editar frontend suele ser HMR viejo: Ctrl+Shift+R primero; si persiste,
  `docker compose restart frontend`.
- Watcher de Vite en bind mounts de Windows puede servir el módulo viejo (incluso con `?t=`):
  verificar el archivo en el contenedor y, si está bien pero no se sirve, `docker compose restart`.

## Próximos pasos

- Vigilar httpx → httpx2 cuando Starlette quite el soporte a httpx en testclient.
- Push de los commits locales (responsive + asignaciones + vista admin + admin potenciado + horas
  hábiles) cuando el usuario lo indique.