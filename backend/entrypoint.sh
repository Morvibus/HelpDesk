#!/bin/sh
# Migraciones antes de arrancar: Alembic es el único mecanismo de schema
# (create_all ya no se usa en la app). Si falla, el contenedor no arranca.
set -e
alembic upgrade head
exec "$@"
