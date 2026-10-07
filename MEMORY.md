# MEMORY.md — HelpDesk

Memoria del proyecto entre sesiones. Máximo ~50 líneas: resume o elimina lo que ya no aporte.
Regla permanente → proponer moverla a `AGENTS.md`. Nunca guardar claves, tokens ni datos personales.

## Estado actual (2026-10-07)

- Fase 1 (P0 de seguridad) implementada y verificada; **pendiente de commit**. Push previo: `origin/main` en `e51bec6`.
- P0 aplicados:
  1. `POST /users/` libre solo con tabla vacía (bootstrap del 1er usuario); después exige token admin.
  2. `PATCH /tickets/{id}`: el empleado solo modifica sus propios tickets.
  3. `GET /tickets/{id}/messages`: pertenencia obligatoria; el endpoint duplicado muerto se eliminó.
  4. `SECRET_KEY` obligatoria (`RuntimeError` sin ella) — compose la inyecta vía `env_file: ./backend/.env`.
  5. Upload: 5 MB en chunks (basura se borra), extensión derivada del content-type validado;
     `old_password` verificado al cambiar la propia contraseña (admin resetea la de otros sin ella).
  6. WebSockets con JWT en `Sec-WebSocket-Protocol: "auth", <token>` (antes `?token=`, ahora 403).
- Verificado con la pila Docker viva: handshakes WS 101/403, pertenencia REST 200/403/401, upload
  413/400/200, fail-fast de SECRET_KEY, `npm run lint` (0 warnings) y `npm run build` OK.
- Sin dependencias ni archivos nuevos en Fase 1 (solo edición de archivos existentes).

## Decisiones (y por qué)

- Registro en bootstrap abierto a propósito: sin él no se podría crear el primer admin.
- `old_password: Optional` en schema: obligatorio solo al cambiar la propia contraseña; el endpoint es
  solo-admin y quien resetea la contraseña de otra persona no la conoce.
- Fase 2/3 (P1/P2) intactas: sesión WS bloqueando el event loop, bug multi-tab de notificaciones,
  Alembic sin configurar, tests, paginación, requisitos sin pinar.

## Aprendizajes y errores a evitar

- Nunca `git add -A`; stagear rutas explícitas (commitear el WIP del usuario antes que el trabajo propio).
- Cambios en modelos no migran tablas existentes: `docker compose down -v` (borra datos) o SQL manual.
- Notas privadas se filtran en dos sitios (query REST y `ConnectionManager.broadcast`): actualizar ambos.
- Fuera de Docker, `DATABASE_URL` debe apuntar a `localhost` (`.env` apunta al hostname `db`).
- FastAPI valida el body antes de ejecutar la ruta: para probar `POST /users/` hace falta `name` (no `full_name`).
- `/upload-image/` existe en el backend pero ningún componente del frontend lo usa ni renderiza imágenes.

## Próximos pasos

- Commitear la Fase 1 (push solo si lo pide el usuario); después, Fase 2 (P1).
