# MEMORY.md — HelpDesk

Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.
Regla permanente → proponer moverla a `AGENTS.md`. Nunca guardar claves, tokens ni datos personales.

## Estado actual (2026-10-13)

- `origin/main` = `7aa951f` (responsive, asignaciones, vista admin, admin potenciado y horas hábiles).
  **Sin pushear**: tickets huérfanos (3 commits `adaabe3`/`4461f53`/`0de12b3`) + mejora de
  notificaciones (esta sesión).
- Fase 3: Alembic (`4abf7e7a664b` con guards) + entrypoint + paginación `{items,total}`.
- **Biblioteca de soluciones** (nueva, sin pushear): `/library/` + página `/biblioteca`. Publican
  técnicos/admins (auto al marcar Solucionado + botón manual en tickets solved/closed); leen todos.
  Una entrada por ticket (409 al duplicar). Migración `99713097ea4d` con guard. 99 tests OK.
- **Alta de tickets** (nueva, sin pushear): wizard de 2 pasos (categoría+título → descripción+prioridad)
  con sugerencias de la biblioteca. `Ticket.category` opcional y `urgent` eliminado del sistema
  (`urgent→high`); migraciones `0cc57f299659` y `7d9423ec204c`, ambas con guard. 105 tests OK.
- Base ya pusheada: Frontend F1-F5 (interceptor 401, error boundary, reconexión WS, initTheme,
  `/metrics/` por rol, `.oxlintrc.json` 0 warnings), responsive (navbar móvil, chat
  `h-[55vh] min-h-[400px] lg:h-[600px]`, tablero 2 columnas), vista admin (`PATCH /users/{id}`
  con anti-lockout, `AdminPanel.jsx` + ruta /admin) y admin potenciado (3 pestañas: Usuarios ·
  Tickets · Rendimiento, editar nombre/correo, filtros `status`/`priority`, reasignar tickets).
- **Horas hábiles**: `/metrics/` agrega `average_resolution_business_hours` y
  `avg_resolution_by_technician_business`; `TicketResponse.business_age_hours` por ticket; el panel
  admin mide en horas hábiles (con el calendario como referencia).
- **Tickets huérfanos (sin pushear)**: al desactivar o degradar a `employee`, los tickets abiertos
  del usuario se reasignan (`reassign_to`) o vuelven al pool; los `in_process` se conservan como
  "ya iniciado" (badge ámbar + fijados arriba); `solved/closed` intactos. Filtro `assigned_to` en
  `GET /tickets/`. Modal `OrphanTicketsModal`. 81 tests; lint 0 + build OK.
- **Notificaciones (sin commitear)**: `notify_ticket_message` reparte el aviso del chat recorriendo
  las conexiones una sola vez; los admins reciben TODOS los mensajes y un público también llega al
  asignado. WS + `Toaster` viven en `NotificationsHub` (montado en `App`, no por página) → no se
  pierden avisos al navegar. Badge de no leídos en la navbar. 87 tests; lint 0 + build OK.

## Decisiones (y por qué)

- KPIs: única fuente de verdad = `/metrics/`, nunca contar sobre la página cargada.
- Gestión de usuarios: `PATCH /users/{id}` (solo admin) con anti-lockout propio; desactivar bloquea
  login y JWT al instante. También edita `name`/`email`: unicidad de correo excluyendo al propio
  (400 si choca). Cambiar el correo no invalida el JWT del otro (el token no lleva email).
- Admin = pestañas dentro de `/admin` (una página, sin rutas extra).
- Filtros `status`/`priority`/`assigned_to` en `GET /tickets/` siempre DESPUÉS de la visibilidad por rol.
- Reasignar (admin) usa `PATCH /tickets/{id}` con `assigned_to`; en un `created` queda `assigned`
  y se ve en "En Proceso" vía filtro legacy hasta que el técnico lo atienda.
- Nombres en tablas admin se resuelven en frontend con `GET /users/` (página solo-admin; no se toca
  `TicketResponse`).
- Semáforo de antigüedad en HORAS HÁBILES (alta 20 / media 30 / baja 48);
  rojo > umbral, ámbar > mitad, verde <= mitad.
- Horas hábiles: helper `business_hours_between` en `main.py` es la única fuente (el frontend NO
  duplica la lógica: consume `business_age_hours`). Zona `UTC-6` fija; jornada lun-vie 07:30-17:00
  (9.5 h) y sáb 07:30-12:00 (4.5 h); domingo 0. Los timestamps de Postgres (DateTime plano, naive)
  se asumen UTC. El sábado cuenta: un ticket de viernes a lunes acumula el medio día del sábado.
- Métricas de resolución: se conservan las de calendario y se agregan las hábiles
  (`average_resolution_business_hours`, `avg_resolution_by_technician_business`); admin muestra la
  hábil como principal y la calendario como referencia.
- Tickets huérfanos: al desactivar o degradar a `employee` (`PATCH /users/{id}`), los tickets
  ABIERTOS del usuario se reasignan a un técnico/admin activo (`reassign_to`) o vuelven al pool
  (sin `reassign_to`). Nunca se tocan `solved/closed` (ahí vive la atribución de las métricas).
  Dispara solo si `is_active→false` o `role→employee`. `in_process` se conserva (ya iniciado).
- "Ya iniciado sin asignar" es derivado (`status == in_process && assigned_to == null`): badge ámbar
  y se fija arriba en la columna En Proceso; NO se muta la `priority` guardada.
- "En Proceso" (columna y KPI) incluye `assigned` legacy; no se migran datos.
- Avisos de chat: `notify_ticket_message` decide destinatarios en UNA sola pasada (evita duplicados
  si el asignado además es admin). Privada → técnicos+admins (nunca empleados). Pública → creador +
  asignado + (técnicos si no hay asignado) + admins. `notify_techs`/`notify_user` siguen para el resto.
- El WS de notificaciones salió de `Layout` (se remontaba por página y perdía avisos al navegar):
  ahora es un hub único en `App`. El badge de la navbar cuenta `unreadTickets` (solo `new_message`).
- oxlint: off en `react-in-jsx-scope` / `set-state-in-effect` / `react-hooks/exhaustive-deps`;
  `react/exhaustive-effect-dependencies` warn con disables comentados en deps intencionales.
- Reconexión WS 1s→15s; 401 global → logout; `initTheme()` en `main.jsx` antes del render.
- Migraciones automáticas en entrypoint; guards (`has_table`/`get_columns`/label de enum) en la
  inicial y en toda migración que cree algo que `create_all` ya pudo crear (lo exige su test de
  compatibilidad). Quitar un valor de enum (p. ej. `urgent`) obliga a recrear el tipo a mano:
  Postgres no borra valores y Alembic no lo autogenera.
- Biblioteca: publican técnicos/admins y leen todos (autoservicio). `ticket_id` único (una entrada
  por ticket); la solución se redacta a mano (nunca se copian notas privadas). Categorías enum fijo
  (network/hardware/software/access/email/other). Editar/borrar = autor o admin. Al resolver se
  abre el modal prefiltrado con título/descripción del ticket.
- Alta de tickets: wizard de 2 pasos (categoría+título → descripción/prioridad), con soluciones
  sugeridas por categoría en el paso 2. `Ticket.category` reutiliza `CategoryEnum` y es nullable.
  Prioridades low/medium/high (sin `urgent`). El botón "Nuevo Ticket" solo se muestra a empleados.
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
- `git commit -m`/pipe de PowerShell mutila los acentos de los mensajes (técnico→t?cnico):
  escribir el mensaje en un archivo UTF-8 y usar `git commit -F <archivo>`. El historial del repo
  ya viene sin acentos (gestion, movil...), mantener ese estilo.

## Próximos pasos

- Vigilar httpx → httpx2 cuando Starlette quite el soporte a httpx en testclient.