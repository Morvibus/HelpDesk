# HelpDesk SESCO - Sistema de Gestión de Requerimientos

Plataforma web multi-departamento desarrollada bajo una arquitectura **Maestro-Detalle** para optimizar la trazabilidad, gestión y resolución de requerimientos internos y de clientes.

## 🚀 Tecnologías Utilizadas

* **Frontend:** React (Vite), Tailwind CSS, Lucide Icons, Axios.
* **Backend:** FastAPI (Python), Pydantic, SQLAlchemy, JWT (JSON Web Tokens).
* **Base de Datos:** PostgreSQL.
* **Infraestructura & Despliegue:** Contenedores Docker y Docker Compose sobre servidores **Rocky Linux**.

---

## 👥 Roles del Sistema

1. **Cliente:** Creación de tickets propios, seguimiento en tablero Kanban, chat en tiempo real y carga de archivos adjuntos.
2. **Técnico:** Gestión de requerimientos por departamento, autoasignación mediante el botón "Tomar Ticket", resolución de casos y redacción de notas internas privadas.
3. **Administrador:** Visibilidad global de todos los tickets del sistema, administración completa de catálogos (departamentos y usuarios) y acceso al panel ejecutivo de métricas y reportes.

---

## ⚙️ Despliegue en Producción (Rocky Linux & Docker)

1. **Clonar el repositorio:**
   ```bash
   git clone [https://github.com/tu-usuario/nombre-repositorio.git](https://github.com/tu-usuario/nombre-repositorio.git)
   cd nombre-repositorio
