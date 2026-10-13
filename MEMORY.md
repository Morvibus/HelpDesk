# MEMORY.md — HelpDesk

Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.
Regla permanente → proponer moverla a `AGENTS.md`. Nunca guardar claves, tokens ni datos personales.

## Estado actual (2026-10-13)

- Todo pusheado: `origin/main` = `a0c3f55`. 105 tests OK; lint 0 + build OK.
- Hecho: Alembic + paginación `{items,total}`, admin (`/admin`, 3 pestañas), horas hábiles,
  tickets huérfanos, hub de notificaciones, biblioteca (`/biblioteca`), wizard de alta y tema oscuro.
- `CLAUDE.md` solo importa `@AGENTS.md` y `@MEMORY.md`: no duplicar contenido ahí.

## Decisiones (y por qué)

- KPIs: única fuente = `/metrics/`, nunca contar sobre la página cargada.
- `PATCH /users/{id}` (solo admin) con anti-lockout; desactivar bloquea login y JWT al instante.
  Cambiar el correo no invalida el JWT (el token no lleva email).
- Filtros `status`/`priority`/`assigned_to` de `GET /tickets/` siempre DESPUÉS de la visibilidad por rol.
- Horas hábiles: `business_hours_between` en `main.py` es la única fuente (el frontend consume
  `business_age_hours`). UTC-6 fijo; lun-vie 07:30-17:00, sáb 07:30-12:00. Timestamps naive = UTC.
  Semáforo en horas hábiles (alta 20 / media 30 / baja 48).
- Tickets huérfanos: al desactivar o degradar a `employee`, los abiertos se reasignan (`reassign_to`)
  o vuelven al pool; nunca se tocan `solved/closed` (ahí vive la atribución de métricas).
  "Ya iniciado sin asignar" es derivado (`in_process` + sin asignar); no se muta `priority`.
- "En Proceso" incluye `assigned` legacy; no se migran datos.
- Avisos de chat: `notify_ticket_message` decide destinatarios en UNA pasada (evita duplicados).
  Privada → técnicos+admins. WS de notificaciones vive en `App` (en `Layout` perdía avisos al navegar).
- Migraciones con guards (`has_table`/`get_columns`/label de enum) si crean algo que `create_all`
  ya pudo crear (lo exige el test de compatibilidad). Quitar un valor de enum = recrear el tipo a mano.
- Biblioteca: publican técnicos/admins, leen todos; una entrada por ticket; nunca copiar notas privadas.
- Tema: la escala `gray` de Tailwind se redefine (slate con tinte teal) porque toda la app la usa
  para superficies; así el dark es coherente sin tocar cientos de clases.
- Error boundary como clase en `App.jsx` (React no permite boundaries funcionales).

## Aprendizajes y errores a evitar

- Modelos → `alembic revision --autogenerate` + revisar diff (nada de `docker compose down -v`).
- `atob` puro rompe con base64url: usar `decodeToken` del authStore.
- Componentes que no dependan del padre → scope de módulo (remounts, oxlint).
- "Pantalla en blanco" tras editar frontend: Ctrl+Shift+R; si persiste, `docker compose restart frontend`
  (el watcher de Vite en bind mounts de Windows puede servir el módulo viejo).
- `git commit -m` en PowerShell mutila acentos: mensaje en archivo UTF-8 + `git commit -F`.
  El historial viene sin acentos (gestion, movil...): mantener ese estilo.

## Próximos pasos

- Vigilar httpx → httpx2 cuando Starlette quite el soporte a httpx en testclient.
