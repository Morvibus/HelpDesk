# MEMORY.md — HelpDesk

Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.
Regla permanente → proponer moverla a `AGENTS.md`. Nunca guardar claves, tokens ni datos personales.

## Estado actual (2026-10-14)

- `origin/main` = `9ea24fc`. TODO lo de 2026-10-14 sigue sin commitear (migraciones `20429e279349` →
  `d5bbf2d714eb` → `74788f3d22d1` → `37182e3d8804` → `1360c4fa87d6` → `96dea0d39db6`: auditoría, pendiente,
  catálogos, activos, mantenimientos, accesos; routers; proxy `/api`; búsqueda + reportes; accesos
  separados de tickets `e41eb1bbbe1a`). 153 tests; lint 0; build OK.
- UI: menú lateral (`Layout.jsx`, lista `SECCIONES` con roles; panel deslizable bajo 1024 px; antes en
  móvil no había navegación) y ojo para ver la contraseña en el login. Adjuntos: imágenes + PDF, solo en
  el chat (decisión del usuario).
- `CLAUDE.md` solo importa `@AGENTS.md` y `@MEMORY.md`: no duplicar contenido ahí.

## Decisiones (y por qué)

- KPIs: única fuente = `/metrics/`. Filtros de `GET /tickets/` siempre DESPUÉS de la visibilidad por rol.
- Horas hábiles: UTC-6 fijo; lun-vie 07:30-17:00, sáb 07:30-12:00; naive = UTC. Semáforo 20/30/48 h.
  Pendiente NO pausa el reloj (no se pidió).
- Huérfanos: al desactivar/degradar se reasignan o vuelven al pool; nunca se tocan `solved/closed`.
  "En Proceso" agrupa `assigned` legacy + `in_process` + `pending`; no se migran datos.
- Migraciones con guards (`has_table`/`get_columns`/`ADD VALUE IF NOT EXISTS`) por el test de
  compatibilidad. Quitar un valor de enum = recrear el tipo a mano. Un valor de enum añadido en una
  migración no se puede usar en otra de la misma corrida: comparar con `columna::text`.
- Tema: escala `gray` de Tailwind redefinida (slate/teal) para que el dark sea coherente.
- Decisiones del usuario: técnico abre por id solo sin asignar + suyos; auditoría solo admin
  (listado de tickets → detalle con chat + historial); activos gestionados por técnicos+admins, tipos
  como catálogo, vínculo ticket→activo solo I&T, asignación a persona/depto/ubicación, sección propia;
  mantenimiento = registro propio del activo, `next_date` solo anotada, consulta como pestaña en Activos.
  Accesos: sección propia para todos (ya NO son tickets, cambio pedido 2026-10-14), comentarios en la
  solicitud, aprobación la registra I&T, sistemas como catálogo.
  Búsqueda en pestaña del panel (todos los roles); reportes para I&T con CSV; vencido = semáforo.
- `/upload-image/` se mantiene (planeado para adjuntos, RF-02). En `ticket_history` las asignaciones
  van como `status_change` con ids: el frontend las distingue porque el valor no es un estado.

## Aprendizajes y errores a evitar

- Modelos → `alembic revision --autogenerate` + revisar diff (nada de `docker compose down -v`).
- `atob` puro rompe con base64url: usar `decodeToken` del authStore.
- Componentes que no dependan del padre → scope de módulo (remounts, oxlint).
- "Pantalla en blanco" tras editar frontend: Ctrl+Shift+R; si persiste, `docker compose restart frontend`.
  (2026-10-14: `vite.config.js` tenía `usepolling` mal escrito, ya es `usePolling`; vigilar si se repite.)
- `git commit -m` en PowerShell mutila acentos: mensaje en archivo UTF-8 + `git commit -F`.
  El historial viene sin acentos (gestion, movil...): mantener ese estilo.
- No hay Python en el host: scripts/verificaciones de backend siempre vía `docker compose run`.
  Pasar scripts por stdin desde **bash** (`... python - < script.py`): la tubería de PowerShell rompe los acentos.
- Tests "colgados" en `DROP TABLE`: suele ser un contenedor `helpdesk-backend-run-*` viejo con una
  transacción abierta. `docker ps` + `docker rm -f` y relanzar; no es el código.

## Próximos pasos

- Roadmap vs `necesidades.md`: CA-01..CA-06 y RF-01, RF-03..RF-12, RNF-01/02/03/05/06 cubiertos.
  Hecho RF-02 (adjuntos imagen/PDF en el chat). Quedan: RNF-04 responsive sin verificar en móvil real,
  CSV del historial de un activo (hoy solo en pantalla), filtro por activo en la UI de Buscar.
- Bundle del frontend pasó 500 kB: si molesta, partir rutas con `React.lazy` (sin dependencias nuevas).
- Dar de baja un activo no cancela sus mantenimientos programados (avisado al usuario, sin decidir).
- Vigilar httpx → httpx2 cuando Starlette quite el soporte a httpx en testclient.
- `tier_level`/`ActionEnum.escalated` sin uso: se dejan (quitar = migración + recrear enum).
