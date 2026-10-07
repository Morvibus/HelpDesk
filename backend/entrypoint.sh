#!/bin/sh
# Migraciones antes de arrancar: Alembic es el único mecanismo de schema
# (create_all se eliminó de main.py). Si falla, el contenedor no arranca.
set -e
alembic upgrade head
exec "$@"
