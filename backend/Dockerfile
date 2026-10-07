
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y gcc libpq-dev && rm -rf /var/lib/apt/lists/*


COPY requirements.txt .


RUN pip install --no-cache-dir -r requirements.txt

COPY . .


EXPOSE 8000


# Migraciones (Alembic) antes de arrancar; `sh` evita depender del bit de ejecución
# (con el bind mount de Windows el archivo puede montarse sin +x).
ENTRYPOINT ["sh", "/app/entrypoint.sh"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
