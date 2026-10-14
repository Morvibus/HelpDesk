"""Validación de /upload-image/ (adjuntos RF-02): tipo, firma del contenido, tamaño y extensión."""
import io
import os

import routes_tickets
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
    monkeypatch.setattr(routes_tickets, "MAX_UPLOAD_BYTES", 1024)
    headers = auth_headers(create_user(db))
    r = _upload(client, headers, data=b"\xff\xd8\xff" + b"x" * 4096)  # firma JPEG válida: lo que falla es el tamaño
    assert r.status_code == 413


def test_upload_usa_extension_del_content_type(client, db):
    headers = auth_headers(create_user(db))
    antes = set(os.listdir(routes_tickets.UPLOAD_DIR))
    r = _upload(client, headers, data=b"\xff\xd8\xff\xe0contenido", filename="t.bin")
    assert r.status_code == 200

    url = r.json()["image_url"]
    nombre = url.rsplit("/", 1)[-1]
    ruta = os.path.join(routes_tickets.UPLOAD_DIR, nombre)
    try:
        assert url.startswith("/static/")
        assert nombre.endswith(".jpg")  
        assert not nombre.endswith(".bin") 
        assert os.path.exists(ruta)
    finally:
        if os.path.exists(ruta):
            os.remove(ruta)
    assert set(os.listdir(routes_tickets.UPLOAD_DIR)) == antes


def test_upload_acepta_pdf_y_verifica_firma(client, db):
    headers = auth_headers(create_user(db))
    r = _upload(client, headers, data=b"%PDF-1.7 contenido", content_type="application/pdf", filename="manual.pdf")
    assert r.status_code == 200 and r.json()["image_url"].endswith(".pdf")
    os.remove(os.path.join(routes_tickets.UPLOAD_DIR, r.json()["image_url"].rsplit("/", 1)[-1]))
    # Declarar un tipo y mandar otro contenido: rechazado (y no queda basura en disco)
    antes = set(os.listdir(routes_tickets.UPLOAD_DIR))
    assert _upload(client, headers, data=b"<html>hola</html>", content_type="application/pdf").status_code == 400
    assert _upload(client, headers, data=b"MZ\x90\x00", content_type="image/png").status_code == 400
    assert set(os.listdir(routes_tickets.UPLOAD_DIR)) == antes
