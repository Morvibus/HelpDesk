# MEMORY.md — HelpDesk

Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.
Regla permanente → proponer moverla a `AGENTS.md`. Nunca guardar claves, tokens ni datos personales.

## Estado actual (2026-10-12)

- Todo el trabajo previo está pusheado (`origin/main` = `a2c07c5`): F1 `80b3fc7`, docs `4560053`,
  F5+oxlint `4de827f`, docs `a2c07c5`. Los commits nuevos quedan sin push hasta que el usuario lo diga.
- Backend Fase 3: Alembic (`4abf7e7a664b` con guards) + entrypoint automático + paginación
  `{items,total}` en los 3 listados. 53 tests en verde (Starlette depreca `httpx` → vigilar httpx2).
- Frontend F1-F3: interceptor 401, exp en `ProtectedRoute`, `initTheme` en `main.jsx`, reconexión
  WS con backoff 1s-15s + toast, AbortController, error boundary, errores reales de login, badge
  `urgent`, `decodeToken` centralizado, a11y, `/login` redirige con sesión válida.
- F5: `/metrics/` por rol (empleado: solo sus tickets; tech/admin: todo); el Dashboard usa
  `/metrics/` como única fuente de KPIs. `.oxlintrc.json` estricto: lint 0 warnings; `TicketCard`
  y `ColumnEmptyState` en scope de módulo.
- **Responsive R1+R2 (esta sesión)**: navbar ya no desborda en móvil y el chat tiene altura
  adaptable. Verificado: lint 0 + build OK.
- **Asignaciones**: el tablero pasó a 2 columnas (Nuevos + En Proceso). La columna "Asignados"
  estaba muerta: ningún flujo produce tickets `assigned` (tomar ya va directo a `in_process` vía
  "Tomar y Atender Ticket"). Tickets legacy `assigned` se muestran dentro de En Proceso (sin
  migrar datos). Verificado: lint 0 + build OK.
- **Vista de administrador (/admin)**: gestión completa de usuarios. Backend: `PATCH /users/{id}`
  (rol y `is_active`, solo admin, anti-lockout propio), login y `get_current_user` rechazan
  cuentas desactivadas. Frontend: `AdminPanel.jsx` (nuevo) + ruta `/admin` con `AdminRoute` y
  link "Admin" en el header (solo admins). 61 tests en verde; lint 0 + build OK.

## Decisiones (y por qué)

- KPIs del Dashboard: única fuente de verdad = `/metrics/`, nunca contar sobre la página cargada.
- Gestión de usuarios: rol y activación vía `PATCH /users/{id}` (solo admin). Anti-lockout: un
  admin no puede desactivarse ni quitarse el rol admin a sí mismo; desactivar bloquea login y
  JWT al instante (`is_active` chequeado en login y `get_current_user`).
- "En Proceso" (columna y KPI) incluye `assigned` legacy para no perder tickets viejos de vista;
  no se migran datos (nada de UPDATE en Alembic mientras el backend siga aceptando `assigned`).
- Header móvil: identidad = Avatar; email solo ≥`md` (truncado 180px), rol solo ≥`sm`; botón
  "Nuevo Ticket" icon-only <`sm` con `aria-label` (sin perder accesibilidad); espaciados compactos
  (`space-x-1 sm:space-x-4`).
- Chat TicketDetail: `h-[55vh] min-h-[400px] lg:h-[600px]` — 600px fijos en móvil obligaban a
  scroll excesivo para llegar al chat.
- oxlint: off en `react-in-jsx-scope` / `set-state-in-effect` / `react-hooks/exhaustive-deps`
  (detalles en el propio `.oxlintrc.json`); `react/exhaustive-effect-dependencies` warn con
  disables comentados en deps intencionales (refreshTrigger/token/messages).
- Reconexión WS 1s→15s; 401 global → logout; `initTheme()` en `main.jsx` antes del render.
- Migraciones automáticas en entrypoint; guards solo en la migración inicial (deuda de `create_all`).
- Error boundary como clase en `App.jsx` (React no permite boundaries funcionales).

## Aprendizajes y errores a evitar

- Nunca `git add -A`; stagear rutas explícitas; commitear el WIP del usuario antes que lo propio.
- Modelos → `alembic revision --autogenerate` + revisar diff (nada de `docker compose down -v`).
- Notas privadas se filtran en REST y en `ConnectionManager.broadcast`: actualizar ambos.
- Fuera de Docker, `DATABASE_URL` apunta a localhost (`.env` usa el hostname `db`).
- `email-validator` rechaza dominios reservados: usar `@helpdesk-mock.com` en datos de prueba.
- `atob` puro rompe con base64url: usar `decodeToken` del authStore.
- Componentes que no dependan de props/estado del padre → scope de módulo (remounts, oxlint).
- "Pantalla en blanco" tras editar frontend suele ser HMR viejo en la pestaña: Ctrl+Shift+R
  primero; solo si persiste, `docker compose restart frontend`.
- El watcher de Vite en bind mounts de Windows puede no detectar un cambio y servir el módulo
  viejo (incluso con `?t=`): verificar con `docker compose exec frontend cat /app/...` y, si el
  archivo está bien pero el servido no, `docker compose restart frontend`.

## Próximos pasos

- Vigilar httpx → httpx2 cuando Starlette quite el soporte a httpx en testclient.
- Push de los commits locales (responsive + asignaciones + vista admin) cuando el usuario lo indique.