"""Autenticación por subprotocolo, multi-tab y filtros de los managers de WS."""
import asyncio
from types import SimpleNamespace

import pytest
from fastapi import WebSocketDisconnect

import models
from conftest import create_ticket, create_user, token_for
from main import ConnectionManager, NotificationManager, _ws_subprotocol_token


class FakeWS:
    """WebSocket de mentira para los tests unitarios de los managers."""

    def __init__(self, falla=False):
        self.falla = falla
        self.aceptado = None
        self.enviados = []

    async def accept(self, subprotocol=None):
        self.aceptado = subprotocol

    async def send_json(self, data):
        if self.falla:
            raise RuntimeError("socket muerto")
        self.enviados.append(data)


# --- _ws_subprotocol_token ---

def _ws(header):
    return SimpleNamespace(headers={} if header is None else {"sec-websocket-protocol": header})


def test_subprotocol_valido():
    assert _ws_subprotocol_token(_ws("auth, eyJhbGciOi.token")) == ("auth", "eyJhbGciOi.token")


def test_subprotocol_con_espacios():
    assert _ws_subprotocol_token(_ws("auth,   eyJ.token")) == ("auth", "eyJ.token")


def test_subprotocol_sin_token():
    assert _ws_subprotocol_token(_ws("auth")) == (None, None)


def test_subprotocol_protocolo_ajeno():
    assert _ws_subprotocol_token(_ws("foo, eyJ.token")) == (None, None)


def test_subprotocol_ausente():
    assert _ws_subprotocol_token(_ws(None)) == (None, None)


# --- NotificationManager: multi-tab ---

def test_multitab_las_dos_pestanas_reciben():
    n = NotificationManager()
    p1, p2 = FakeWS(), FakeWS()
    asyncio.run(n.connect(p1, 7, "employee", "auth"))
    asyncio.run(n.connect(p2, 7, "employee", "auth"))

    asyncio.run(n.notify_user(7, "Título", "mensaje"))

    assert len(p1.enviados) == 1
    assert len(p2.enviados) == 1
    assert p1.aceptado == "auth"
    assert p1.enviados[0]["title"] == "Título"


def test_cerrar_una_pestana_no_apaga_la_otra():
    n = NotificationManager()
    p1, p2 = FakeWS(), FakeWS()
    asyncio.run(n.connect(p1, 7, "employee"))
    asyncio.run(n.connect(p2, 7, "employee"))

    n.disconnect(p1, 7)
    asyncio.run(n.notify_user(7, "Título", "mensaje"))

    assert p1.enviados == []
    assert len(p2.enviados) == 1
    assert 7 in n.active_connections


def test_cerrar_la_ultima_pestana_libera_al_usuario():
    n = NotificationManager()
    ws = FakeWS()
    asyncio.run(n.connect(ws, 7, "employee"))
    n.disconnect(ws, 7)
    assert 7 not in n.active_connections


def test_notify_techs_no_le_llega_a_empleados_ni_al_emisor():
    n = NotificationManager()
    tecnico, empleado = FakeWS(), FakeWS()
    asyncio.run(n.connect(tecnico, 8, "technician"))
    asyncio.run(n.connect(empleado, 9, "employee"))

    asyncio.run(n.notify_techs("T", "M", exclude_user_id=8))
    assert tecnico.enviados == []  # era el emisor
    assert empleado.enviados == []  # es empleado

    asyncio.run(n.notify_techs("T2", "M2"))
    assert len(tecnico.enviados) == 1
    assert empleado.enviados == []


def test_notify_user_excluye_al_emisor():
    n = NotificationManager()
    ws = FakeWS()
    asyncio.run(n.connect(ws, 7, "employee"))
    asyncio.run(n.notify_user(7, "T", "M", exclude_user_id=7))
    assert ws.enviados == []


def test_socket_muerto_no_rompe_el_envio():
    n = NotificationManager()
    muerto, vivo = FakeWS(falla=True), FakeWS()
    asyncio.run(n.connect(muerto, 7, "employee"))
    asyncio.run(n.connect(vivo, 7, "employee"))

    asyncio.run(n.notify_user(7, "T", "M"))

    assert len(vivo.enviados) == 1  # el sano sí recibe
    assert n.active_connections[7] == [{"ws": vivo, "role": "employee"}]  # el muerto quedó fuera


# --- ConnectionManager: notas privadas y sockets muertos ---

def test_broadcast_filtra_notas_privadas_de_los_empleados():
    m = ConnectionManager()
    empleado, tecnico = FakeWS(), FakeWS()
    asyncio.run(m.connect(empleado, 1, "employee"))
    asyncio.run(m.connect(tecnico, 1, "technician"))

    asyncio.run(m.broadcast({"content": "visible"}, 1))
    asyncio.run(m.broadcast({"content": "privada", "is_private_note": True}, 1))

    assert [x["content"] for x in empleado.enviados] == ["visible"]
    assert [x["content"] for x in tecnico.enviados] == ["visible", "privada"]


def test_broadcast_elimina_sockets_muertos():
    m = ConnectionManager()
    muerto, vivo = FakeWS(falla=True), FakeWS()
    asyncio.run(m.connect(muerto, 1, "employee"))
    asyncio.run(m.connect(vivo, 1, "employee"))

    asyncio.run(m.broadcast({"content": "x"}, 1))

    assert vivo.enviados == [{"content": "x"}]
    assert all(c["ws"] is vivo for c in m.active_connections[1])


# --- Integración con TestClient ---

def test_notificaciones_acepta_subprotocolo(client, db):
    user = create_user(db, "employee")
    with client.websocket_connect("/ws/notifications", subprotocols=["auth", token_for(user)]) as ws:
        assert ws.accepted_subprotocol == "auth"


def test_notificaciones_rechaza_sin_token(client, db):
    create_user(db)
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/notifications"):
            pass


def test_notificaciones_rechaza_token_en_query(client, db):
    # El estilo antiguo (?token=) ya no se acepta
    user = create_user(db, "employee")
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/ws/notifications?token={token_for(user)}"):
            pass


def test_chat_solo_el_dueño_o_soporte_entran(client, db):
    dueno = create_user(db, "employee")
    intruso = create_user(db, "employee")
    tecnico = create_user(db, "technician")
    ticket = create_ticket(db, dueno.id)

    with client.websocket_connect(
        f"/ws/tickets/{ticket.id}/chat", subprotocols=["auth", token_for(dueno)]
    ):
        pass  # el handshake fue aceptado
    with client.websocket_connect(
        f"/ws/tickets/{ticket.id}/chat", subprotocols=["auth", token_for(tecnico)]
    ):
        pass

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(
            f"/ws/tickets/{ticket.id}/chat", subprotocols=["auth", token_for(intruso)]
        ):
            pass


def test_chat_guarda_y_retransmite(client, db):
    dueno = create_user(db, "employee")
    ticket = create_ticket(db, dueno.id)

    with client.websocket_connect(
        f"/ws/tickets/{ticket.id}/chat", subprotocols=["auth", token_for(dueno)]
    ) as chat:
        chat.send_json({"content": "hola", "is_private_note": False})
        assert chat.receive_json()["content"] == "hola"

    assert db.query(models.Message).filter_by(ticket_id=ticket.id).count() == 1


def test_multitab_notificaciones_reciben_las_dos_pestanas(client, db):
    """Regresión del bug multi-tab: cerrar una pestaña no apaga a la otra."""
    empleado = create_user(db, "employee")
    tecnico = create_user(db, "technician")
    ticket = create_ticket(db, empleado.id, assigned_to=tecnico.id)

    with (
        client.websocket_connect(
            f"/ws/tickets/{ticket.id}/chat", subprotocols=["auth", token_for(empleado)]
        ) as chat,
        client.websocket_connect("/ws/notifications", subprotocols=["auth", token_for(tecnico)]) as p1,
        client.websocket_connect("/ws/notifications", subprotocols=["auth", token_for(tecnico)]) as p2,
    ):
        chat.send_json({"content": "mensaje 1", "is_private_note": False})
        assert chat.receive_json()["content"] == "mensaje 1"
        assert p1.receive_json()["message"] == "mensaje 1"
        assert p2.receive_json()["message"] == "mensaje 1"

        p1.close()  # el técnico cierra una pestaña
        chat.send_json({"content": "mensaje 2", "is_private_note": False})
        assert chat.receive_json()["content"] == "mensaje 2"
        assert p2.receive_json()["message"] == "mensaje 2"  # la otra sigue viva
