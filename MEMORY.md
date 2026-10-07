# MEMORY.md — HelpDesk

Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.
Regla permanente → proponer moverla a `AGENTS.md`. Nunca guardar claves, tokens ni datos personales.

## Estado actual (2026-10-07)

- **Todo pusheado** (`origin/main` = `54096d7`): Fase 1 `0571924`, Fase 2 `d91ac83`, Fase 3 `68fab0d`,
  docs `6e28ac7`, y `test_upload.py` (cambio del usuario) incluido en "Actualizacion menor" `54096d7`.
- Backend Fase 3 (P2): Alembic (`4abf7e7a664b` con guards por tabla) + entrypoint automático +
  paginación `{items,total}` en los 3 listados. 53 tests en verde; `helpdesk_db` en `head`.
- Frontend · análisis de prácticas → 3 fases implementadas y verificadas (lint 0 + build OK), **pendientes de commit**:
  - **F1 (P1)**: interceptor 401 (logout+redirect, excluye `/login`), `ProtectedRoute` valida `exp`,
    `initTheme()` en `main.jsx` (el tema oscuro YA persiste al recargar), reconexión WS con backoff
    (1s→15s) en notificaciones y chat + toast si se envía sin socket, `AbortController` en cargas.
  - **F2 (P2)**: error boundary global, Login distingue credenciales vs red/servidor, badge/labels
    para prioridad `urgent`, JWT decode centralizado (`decodeToken`/`isTokenExpired` en authStore).
  - **F3 (P3)**: a11y (`htmlFor`, `aria-label`), `/login` redirige con sesión válida, se quitó
    `apple-touch-icon` inexistente (404).
- Pendientes del análisis frontend: **F5** (KPIs del Dashboard calculados sobre la página cargada)
  y **`.oxlintrc.json`** (reglas estrictas — archivo nuevo, requiere permiso).

## Decisiones (y por qué)

- Migraciones automáticas en entrypoint (sin CI un paso manual se olvidaría); guards solo en la
  migración inicial (deuda de `create_all`).
- Paginación `limit/offset + {items,total}` con id como desempate; mensajes desc (primera página =
  cola del chat), el frontend invierte.
- 401 global → logout en `api.js`: sin eso el usuario queda con sesión zombie tras expirar el JWT.
- `initTheme` se llama en `main.jsx` antes del render: la clase `dark` debe aplicarse al cargar.
- Reconexión WS con backoff: el backend se reinicia con cada migración; sin reconexión el chat muere
  en silencio. El botón deshabilitado no bloquea Enter en un form → el handler revalida el socket.
- Error boundary como clase en `App.jsx` (React no permite boundaries funcionales).
- httpx en vez de httpx2 (lo aprobó el usuario); starlette avisa de deprecación — vigilar.

## Aprendizajes y errores a evitar

- Nunca `git add -A`; stagear rutas explícitas; commitear el WIP del usuario antes que el trabajo propio.
- Modelos → `alembic revision --autogenerate` + revisar diff (nada de `docker compose down -v`).
- Notas privadas se filtran en dos sitios (REST y `ConnectionManager.broadcast`): actualizar ambos.
- Fuera de Docker, `DATABASE_URL` apunta a `localhost` (`.env` usa el hostname `db`).
- `email-validator` rechaza dominios reservados: usar `@helpdesk-mock.com` en datos de prueba.
- `atob` puro rompe con base64url (`-`/`_`): usar `decodeToken` del authStore.
- Tema oscuro: si se define `initTheme()` hay que llamarlo, si no la UI recarga en modo claro.

## Próximos pasos

- Decidir **F5**: métricas del Dashboard (¿usar `/metrics/` para tech/admin? ¿qué ven los empleados?).
- Crear **`.oxlintrc.json`** con reglas estrictas solo si el usuario lo aprueba (archivo nuevo).
- Vigilar httpx → httpx2 cuando Starlette quite el soporte a httpx en testclient.