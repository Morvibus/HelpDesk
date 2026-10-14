from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import realtime
import routes_access
import routes_admin
import routes_assets
import routes_reports
import routes_library
import routes_tickets
import routes_users

# El schema lo gestiona Alembic (ver entrypoint.sh): `alembic upgrade head`
# al arrancar el contenedor. `create_all` ya no se usa.
# Las rutas viven en routes_*.py y realtime.py; los permisos compartidos en deps.py.

app = FastAPI(title="HelpDesk API", description="Canal oficial de resolución de problemas")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Imágenes subidas accesibles vía URL (el directorio lo crea routes_tickets)
app.mount("/static", StaticFiles(directory=routes_tickets.UPLOAD_DIR), name="static")

for modulo in (routes_users, routes_tickets, routes_access, routes_library, routes_admin, routes_assets, routes_reports, realtime):
    app.include_router(modulo.router)
