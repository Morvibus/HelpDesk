# 🚀 HelpDesk SESCO

**Sistema Integral de Gestión de Requerimientos**  
*Plataforma de soporte técnico multi-departamental diseñada para la eficiencia operativa.*

---

## 📋 Descripción del Proyecto
(Sistema de Gestión de Requerimientos) es una solución robusta desarrollada para optimizar la trazabilidad y resolución de incidentes dentro de una organización. Permite la comunicación fluida entre clientes y equipos técnicos, con una capa administrativa para el control de métricas y gestión de personal.

## 🛠️ Stack Tecnológico

| Capa | Tecnología |
| :--- | :--- |
| **Frontend** | React (Vite), Tailwind CSS, Lucide Icons |
| **Backend** | FastAPI (Python), SQLAlchemy, Pydantic |
| **Base de Datos** | PostgreSQL |
| **Infraestructura** | Docker, Docker Compose, Rocky Linux |

## 👥 Roles y Funcionalidades

- **👨‍💻 Cliente:** Apertura de tickets, seguimiento en tablero Kanban, chat interactivo y adjuntos multimedia.
- **🛠️ Técnico:** Gestión departamental, autoasignación de casos ("Tomar Ticket"), resolución y uso de notas privadas internas.
- **👑 Administrador:** Visibilidad global, gestión de catálogos (usuarios/departamentos) y dashboard ejecutivo de métricas.

## 📊 Arquitectura y Flujo de Trabajo
El sistema utiliza una arquitectura basada en **JWT (JSON Web Tokens)** para la seguridad de sesiones, con un modelo de datos relacional que asegura la integridad de los requerimientos desde su creación hasta su cierre.

## 🚀 Despliegue en Producción
Para desplegar el entorno en **Rocky Linux** utilizando Docker:

```bash
# 1. Clonar el repositorio
git clone [https://github.com/Morvibus/HelpDesk.git](https://github.com/Morvibus/HelpDesk.git)
cd HelpDesk

# 2. Levantar los servicios
docker compose up -d --build
