# 🚀 HelpDesk SESCO

**Sistema Integral de Gestión de Requerimientos**
*Plataforma de soporte técnico multi-departamental diseñada para la eficiencia operativa.*

## 📋 Descripción

Aplicación de gestión de tickets de soporte técnico: los empleados reportan incidentes,
los técnicos los atienden y los administradores controlan usuarios y métricas.
Comunicación en tiempo real por chat (WebSocket), notificaciones globales y notas privadas internas.

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

## 🚀 Inicio Rápido

```bash
# 1. Clonar el repositorio
git clone https://github.com/Morvibus/HelpDesk.git
cd HelpDesk

# 2. Levantar los servicios (Postgres + API + Frontend)
docker compose up -d --build
```

| Servicio | URL |
| :--- | :--- |
| Frontend | http://localhost:5173 |
| API / Swagger | http://localhost:8000/docs |
| PostgreSQL | localhost:5432 (credenciales en `docker-compose.yml`) |

El login usa el correo electrónico; el endpoint `POST /login` recibe datos
`application/x-www-form-urlencoded` (así lo exige el flujo OAuth2 de Swagger).

## 🧑‍💻 Desarrollo

```bash
# Frontend (Vite con hot-reload)
cd frontend
npm install
npm run dev        # servidor en :5173
npm run lint       # oxlint (sin configuración, reglas por defecto)
npm run build      # build de producción

# Backend fuera de Docker: requiere apuntar la DB a localhost
cd backend
set DATABASE_URL=postgresql://helpdesk_user:helpdesk_password@localhost:5432/helpdesk_db
uvicorn main:app --reload
```

**Sin tests ni CI en el repo:** la verificación real del frontend es `npm run lint` + `npm run build`,
y del backend la revisión manual vía Swagger (`/docs`).

> ⚠️ El esquema de la base de datos se crea con `create_all` al arrancar el backend.
> Cambios en los modelos **no** migran tablas existentes: recrear el volumen
> (`docker compose down -v`, borra datos) o aplicar SQL manual.

## 📂 Estructura

```
HelpDesk/
├── docker-compose.yml      # Postgres + backend (:8000) + frontend (:5173)
├── backend/                # FastAPI — todo en main.py (rutas), models.py, schemas.py, security.py
├── frontend/               # React — src/pages, src/components, src/store (zustand)
├── AGENTS.md               # Instrucciones para agentes de código
└── MEMORY.md               # Estado y decisiones del proyecto entre sesiones
```

## 📜 Licencia

Uso interno — SESCO.
