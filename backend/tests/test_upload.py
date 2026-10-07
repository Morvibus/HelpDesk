"""Validación de /upload-image/: content-type, tamaño y extensión."""
import io
import os

import main
from conftest import auth_headers, create_user


def _upload(client, headers=None, data=b"\xff\xd8\xff\xe0", content_type="image/jpeg", filename="t.bin"):
    return client.post(
        "/upload-image/",
        files={"file": (filename, io.BytesIO(data), content_type)},
        headers=headers or {},
    )


def test_upload_requiere_token(client, db):
    assert _upload(client).status_code == 401


def test_upload_rechaza_content_type_no_imagen(client, db):
    headers = auth_headers(create_user(db))
    r = _upload(client, headers, data=b"hola", content_type="text/plain")
    assert r.status_code == 400


def test_upload_rechaza_archivos_grandes(client, db, monkeypatch):
    # Bajamos el límite en vez de subir 5 MB de verdad
    monkeypatch.setattr(main, "MAX_UPLOAD_BYTES", 1024)
    headers = auth_headers(create_user(db))
    r = _upload(client, headers, data=b"\xff\xd8" + b"x" * 4096)
    assert r.status_code == 413


def test_upload_usa_extension_del_content_type(client, db):
    headers = auth_headers(create_user(db))
    antes = set(os.listdir(main.UPLOAD_DIR))
    r = _upload(client, headers, data=b"\xff\xd8\xff\xe0contenido", filename="t.bin")
    assert r.status_code == 200

    url = r.json()["image_url"]
    nombre = url.rsplit("/", 1)[-1]
    ruta = os.path.join(main.UPLOAD_DIR, nombre)
    try:
        assert url.startswith("/static/")
        assert nombre.endswith(".jpg")  # la extensión viene del content-type...
        assert not nombre.endswith(".bin")  # ...nunca del filename
        assert os.path.exists(ruta)
    finally:
        if os.path.exists(ruta):
            os.remove(ruta)
    assert set(os.listdir(main.UPLOAD_DIR)) == antes
