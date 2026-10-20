# 🚀 HelpDesk SESCO

**Sistema Integral de Gestión de Requerimientos**
*Plataforma de soporte técnico multi-departamental diseñada para la eficiencia operativa.*

## 📋 Descripción

Aplicación de gestión de tickets de soporte técnico: los empleados reportan incidentes,
los técnicos los atienden y los administradores controlan usuarios y métricas.
Comunicación en tiempo real por chat (WebSocket), notificaciones globales y notas privadas internas.
El alta de tickets es guiada (categoría y prioridad) y sugiere soluciones ya documentadas.

## 🛠️ Stack Tecnológico

| Capa | Tecnología |
| :--- | :--- |
| **Frontend** | React 19 (Vite), Tailwind CSS v4, zustand, Lucide Icons |
| **Backend** | FastAPI (Python 3.11), SQLAlchemy, Pydantic, JWT (python-jose) |
| **Base de Datos** | PostgreSQL 15 |
| **Infraestructura** | Docker, Docker Compose |

## 👥 Roles y Funcionalidades

- **👨‍💻 Empleado:** crea tickets, ve solo los suyos, chatea con soporte y puede reabrirlos (hasta 72 h después del cierre).
- **🛠️ Técnico:** ve los tickets sin asignar y los suyos, los toma ("Tomar Ticket" / "Reclamar asignación"), los resuelve y usa notas privadas internas.
- **👑 Administrador:** visibilidad global, lista de usuarios, cambio de contraseñas y dashboard de métricas (`/metrics/`).

También existe una **Biblioteca de Soluciones** (`/biblioteca`): técnicos y admins publican las
soluciones de los tickets resueltos (automático al marcar "Solucionado" o desde el detalle del
ticket) y todos los roles pueden consultarlas y buscarlas.

## 🚀 Inicio Rápido

```bash
# 1. Clonar el repositorio
git clone https://github.com/Morvibus/HelpDesk.git
cd HelpDesk

# 2. Configuración: crear backend/.env a partir del ejemplo y poner una SECRET_KEY propia
cp backend/.env.example backend/.env

# 3. Levantar los servicios (Postgres + API + Frontend)
docker compose up -d --build
```

| Servicio | URL |
| :--- | :--- |
| Frontend | http://localhost:5173 |
| API / Swagger | http://localhost:8000/docs |
| PostgreSQL | localhost:5432 (credenciales en `docker-compose.yml`) |

El login usa el correo electrónico; el endpoint `POST /login` recibe datos
`application/x-www-form-urlencoded` (así lo exige el flujo OAuth2 de Swagger).

### 📱 Acceso desde otros dispositivos

El frontend llama al API por `/api` y Vite lo reenvía al backend, así que **solo hace falta exponer el
puerto 5173** (sin tocar CORS):

- **Misma red Wi-Fi:** `http://<IP-del-equipo>:5173` (la IP sale de `ipconfig`). Si no carga, revisar que el
  firewall de Windows permita conexiones entrantes al 5173 en redes privadas.
- **Túnel de VS Code:** panel *Ports* → *Forward a Port* → `5173`, y abrir la URL `https://…devtunnels.ms`.
  Con visibilidad *Private* (por defecto) pide iniciar sesión con la misma cuenta de GitHub/Microsoft;
  *Public* deja la app expuesta a cualquiera con el enlace: usarlo solo para pruebas puntuales.

## 🧑‍💻 Desarrollo

```bash
# Frontend (Vite con hot-reload)
cd frontend
npm install
npm run dev        # servidor en :5173
npm run lint       # oxlint (config en .oxlintrc.json)
npm run build      # build de producción

# Backend fuera de Docker: requiere apuntar la DB a localhost
cd backend
set DATABASE_URL=postgresql://helpdesk_user:helpdesk_password@localhost:5432/helpdesk_db
uvicorn main:app --reload
```

**Verificación (sin CI):** frontend con `npm run lint` + `npm run build`; backend con pytest
(requiere `db` levantado, usa la base `helpdesk_test`):

```bash
docker compose run --rm backend python -m pytest
```

> El esquema lo gestiona **Alembic**: las migraciones se aplican solas al arrancar el backend.
> Al cambiar modelos: `docker compose run --rm backend alembic revision --autogenerate -m "qué cambia"`,
> revisar el archivo generado en `backend/alembic/versions/` y commitearlo.

## 💾 Respaldo y recuperación

Qué respaldar:

| Qué | Dónde | Cómo |
|-----|-------|------|
| Base de datos | volumen `postgres_data` | `pg_dump` (abajo) |
| Imágenes subidas | `backend/uploads/` | copiar la carpeta |
| Configuración y secretos | `backend/.env` | copiar a un lugar seguro, **nunca** al repositorio |

El código y las migraciones ya viven en Git. Los comandos funcionan igual en PowerShell y bash
(se evita `>` porque PowerShell 5.1 corrompe la salida binaria).

**Respaldo** (con el stack levantado):

```bash
docker compose exec db pg_dump -U helpdesk_user -d helpdesk_db -Fc -f /tmp/helpdesk.dump
docker compose cp db:/tmp/helpdesk.dump ./helpdesk-AAAA-MM-DD.dump
docker compose exec db rm /tmp/helpdesk.dump
```

**Recuperación** (reemplaza los datos actuales):

```bash
docker compose stop backend
docker compose cp ./helpdesk-AAAA-MM-DD.dump db:/tmp/restore.dump
docker compose exec db pg_restore -U helpdesk_user -d helpdesk_db --clean --if-exists /tmp/restore.dump
docker compose exec db rm /tmp/restore.dump
docker compose start backend
```

Al arrancar, el backend aplica las migraciones pendientes si el respaldo es de una versión anterior.
Para comprobar un respaldo sin tocar la base real, restáuralo en una base temporal
(`createdb -U helpdesk_user restore_check` → `pg_restore -d restore_check ...` → `dropdb`).
Los archivos `.dump` contienen datos personales: guárdalos fuera del repositorio.

## 📂 Estructura

```
HelpDesk/
├── docker-compose.yml      # Postgres + backend (:8000) + frontend (:5173)
├── backend/                # FastAPI — main.py (app), routes_*.py + realtime.py (rutas), deps.py, models.py, schemas.py
└── frontend/               # React — src/pages, src/components, src/store (zustand)
```

## 📜 Licencia

Uso interno — SESCO.
