# MEMORY.md — HelpDesk

Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.
Regla permanente → proponer moverla a `AGENTS.md`. Nunca guardar claves, tokens ni datos personales.

## Estado actual (2026-10-07)

- Commits locales sin push: `80b3fc7` (frontend F1-F3), `4560053` (docs memoria) y el de F5+oxlint.
  `origin/main` = `54096d7`. Push solo cuando el usuario lo indique.
- Backend Fase 3: Alembic (`4abf7e7a664b` con guards por tabla) + entrypoint automático +
  paginación `{items,total}` en los 3 listados. 53 tests en verde.
- Frontend F1-F3 commiteadas: interceptor 401 (logout+redirect), `ProtectedRoute` valida `exp`,
  `initTheme()` en `main.jsx` (el tema oscuro persiste), reconexión WS con backoff 1s-15s + toast
  si se envía sin socket, AbortController, error boundary, errores reales de login, badge/labels
  `urgent`, JWT decode centralizado (`decodeToken`/`isTokenExpired`), a11y (htmlFor/aria-label),
  `/login` redirige con sesión válida.
- **F5 (KPIs) resuelto**: `/metrics/` ahora es por rol — el empleado cuenta solo SUS tickets,
  tech/admin ven todo. El Dashboard consume `/metrics/` para los KPIs (antes los calculaba sobre la
  página cargada y contaban de menos). `resolved_by_technician` = `{}` para empleados.
- **`.oxlintrc.json`** creado (reglas estrictas react/react_perf/react_hooks): lint 0 warnings +
  build OK. `TicketCard` y `ColumnEmptyState` pasaron a scope de módulo (antes se redefinían en
  cada render → remounts).

## Decisiones (y por qué)

- KPIs del Dashboard: única fuente de verdad = `/metrics/`, nunca contar sobre la página cargada.
- oxlint: off en `react/react-in-jsx-scope` (Vite usa runtime JSX automático), `react/set-state-in-effect`
  (falso positivo: los setState vienen tras await) y `react-hooks/exhaustive-deps` (duplicada de
  `react/exhaustive-effect-dependencies`). Esta última queda como warn, con `// oxlint-disable
  react/exhaustive-effect-dependencies -- motivo` en los efectos con deps intencionales
  (refreshTrigger/token/messages disparan a propósito).
- Reconexión WS 1s→15s: el backend se reinicia con cada migración; sin reconexión el chat muere en
  silencio. Botón deshabilitado NO bloquea Enter en forms → el handler revalida el socket.
- 401 global → logout en `api.js` (excluye `/login`); `initTheme()` en `main.jsx` antes del render.
- Migraciones automáticas en entrypoint; guards solo en la migración inicial (deuda de `create_all`).
- Error boundary como clase en `App.jsx` (React no permite boundaries funcionales).

## Aprendizajes y errores a evitar

- Nunca `git add -A`; stagear rutas explícitas; commitear el WIP del usuario antes que lo propio.
- Modelos → `alembic revision --autogenerate` + revisar diff (nada de `docker compose down -v`).
- Notas privadas se filtran en REST y en `ConnectionManager.broadcast`: actualizar ambos.
- Fuera de Docker, `DATABASE_URL` apunta a localhost (`.env` usa el hostname `db`).
- `email-validator` rechaza dominios reservados: usar `@helpdesk-mock.com` en datos de prueba.
- `atob` puro rompe con base64url (`-`/`_`): usar `decodeToken` del authStore.
- Al mover componentes de una página, subir a scope de módulo lo que no dependa de props/estado
  del padre: evita remounts y satisface `no-unstable-nested-components`.

## Próximos pasos

- Vigilar httpx → httpx2 cuando Starlette quite el soporte a httpx en testclient.
- Push pendiente (solo cuando el usuario lo indique).