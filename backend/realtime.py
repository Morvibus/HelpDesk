"""Tiempo real: chat por ticket y notificaciones globales (WebSockets + gestores de conexiones)."""
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from database import SessionLocal
from deps import _user_from_token, _can_see_ticket, _valid_attachment
import models

router = APIRouter()


# WebSocket

# Conexiones

class ConnectionManager:
    def __init__(self):
        # Guardaremos diccionarios: {"ws": websocket, "role": role}
        self.active_connections: dict[int, list[dict]] = {}

    async def connect(self, websocket: WebSocket, ticket_id: int, role: str, subprotocol: str = None):
        await websocket.accept(subprotocol=subprotocol)
        if ticket_id not in self.active_connections:
            self.active_connections[ticket_id] = []
        self.active_connections[ticket_id].append({"ws": websocket, "role": role})

    def disconnect(self, websocket: WebSocket, ticket_id: int):
        if ticket_id in self.active_connections:
            self.active_connections[ticket_id] = [
                c for c in self.active_connections[ticket_id] if c["ws"] != websocket
            ]

    async def broadcast(self, message: dict, ticket_id: int):
        for connection in list(self.active_connections.get(ticket_id, [])):
            # REGLA DE SEGURIDAD: Si es nota privada, omitimos a los empleados
            if message.get("is_private_note") and connection["role"] == "employee":
                continue
            try:
                await connection["ws"].send_json(message)
            except Exception:
                # Socket muerto: lo retiramos sin abortar el envío al resto
                self.disconnect(connection["ws"], ticket_id)

manager = ConnectionManager()

# --- MENSAJERÍA: CANAL DE CHAT EN VIVO (WebSocket) ---

def _ws_subprotocol_token(websocket: WebSocket) -> tuple[str, str]:
    """Lee Sec-WebSocket-Protocol esperando 'auth, <jwt>'.

    El token viaja como subprotocolo (no en la query string) para que no quede
    registrado en logs de proxies o servidores. Devuelve (subprotocolo, token).
    """
    header = websocket.headers.get("sec-websocket-protocol", "")
    parts = [p.strip() for p in header.split(",") if p.strip()]
    if len(parts) == 2 and parts[0] == "auth":
        return parts[0], parts[1]
    return None, None


# Los WebSockets viven mucho: cada acceso a la DB abre una sesión corta (síncrona, vía
# asyncio.to_thread) en vez de retener una conexión del pool mientras la pestaña siga abierta.

def _ws_user(token):
    """(id, rol) del usuario activo dueño del token, o None."""
    with SessionLocal() as db:
        user = _user_from_token(token, db)
        if user is None or user.is_active is False:
            return None
        return user.id, user.role.value


def _ws_chat_access(token, ticket_id: int):
    """(id, rol) si el usuario activo puede ver el ticket, o None."""
    with SessionLocal() as db:
        user = _user_from_token(token, db)
        if user is None or user.is_active is False:
            return None
        ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
        if ticket is None or not _can_see_ticket(user, ticket):
            return None
        return user.id, user.role.value


def _save_chat_message(ticket_id: int, user_id: int, content: str, is_private: bool, image_url: str = None):
    """Guarda un mensaje y devuelve (mensaje para difundir, creador, asignado) del ticket,
    o None si el ticket está cerrado (solo se reactiva con /reopen)."""
    with SessionLocal() as db:
        ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
        if ticket.status in (models.StatusEnum.solved, models.StatusEnum.closed):
            return None
        new_message = models.Message(
            ticket_id=ticket_id,
            sender_id=user_id,
            content=content,
            image_url=image_url,
            is_private_note=is_private
        )
        db.add(new_message)
        db.commit()
        db.refresh(new_message)
        mensaje = {
            "id": new_message.id,
            "sender_id": new_message.sender_id,
            "content": new_message.content,
            "image_url": new_message.image_url,
            "is_private_note": new_message.is_private_note,
            "created_at": new_message.created_at.isoformat()
        }
        return mensaje, ticket.created_by, ticket.assigned_to


@router.websocket("/ws/tickets/{ticket_id}/chat")
async def chat_websocket(websocket: WebSocket, ticket_id: int):
    subprotocol, token = _ws_subprotocol_token(websocket)

    # REGLA DE SEGURIDAD: usuario activo y ticket visible para su rol (rol leído de la DB)
    acceso = await asyncio.to_thread(_ws_chat_access, token, ticket_id)
    if acceso is None:
        print(f" [Chat] Acceso denegado al ticket #{ticket_id}")
        await websocket.close(code=1008)
        return
    user_id, user_role = acceso

    await manager.connect(websocket, ticket_id, user_role, subprotocol)
    print(f" [Chat] Usuario {user_id} ({user_role}) conectado al ticket #{ticket_id}")

    try:
        while True:
            data = await websocket.receive_json()
            # Payload mal formado o vacío: se ignora sin tirar el socket
            content = data.get("content") if isinstance(data, dict) else None
            if not isinstance(content, str) or not content.strip():
                continue
            # Adjunto (RF-02): solo rutas de archivos subidos por /upload-image/; si no, se ignora el mensaje
            image_url = data.get("image_url")
            if image_url is not None and not _valid_attachment(image_url):
                continue

            # 1. Guardamos en base de datos (síncrono → fuera del event loop).
            # REGLA DE SEGURIDAD: un empleado nunca crea notas privadas, diga lo que diga el cliente
            is_private = bool(data.get("is_private_note")) and user_role != "employee"
            guardado = await asyncio.to_thread(
                _save_chat_message, ticket_id, user_id, content, is_private, image_url
            )
            if guardado is None:  # ticket cerrado: se ignora (el frontend ya bloquea el input)
                continue
            mensaje, created_by, assigned_to = guardado

            # 2. El broadcast para los que están viendo el chat
            await manager.broadcast(mensaje, ticket_id)

            # 3. ALERTA GLOBAL PARA LOS QUE ESTÁN EN EL DASHBOARD
            contenido = mensaje["content"]
            msg_resumen = contenido[:30] + "..." if len(contenido) > 30 else contenido

            if is_private:
                titulo, icono = f"Nota Interna (Ticket #{ticket_id})", "🔒"
            elif user_role == "employee":
                titulo, icono = f"Nuevo mensaje (Ticket #{ticket_id})", "💬"
            else:
                titulo, icono = f"Soporte IT (Ticket #{ticket_id})", "💬"

            await notifier.notify_ticket_message(
                created_by,
                assigned_to,
                titulo,
                msg_resumen,
                icono,
                "new_message",
                ticket_id,
                exclude_user_id=user_id,
                is_private=is_private,
            )
            
    except WebSocketDisconnect:
        # El cliente cerró la pestaña
        pass
    finally:
        # Siempre damos de baja la conexión, aunque salga por un error distinto
        manager.disconnect(websocket, ticket_id)

# --- GESTOR DE NOTIFICACIONES GLOBALES ---
class NotificationManager:
    def __init__(self):
        # Un usuario puede tener varias pestañas abiertas: lista de conexiones por usuario
        self.active_connections: dict[int, list[dict]] = {}

    async def connect(self, websocket: WebSocket, user_id: int, role: str, subprotocol: str = None):
        await websocket.accept(subprotocol=subprotocol)
        self.active_connections.setdefault(user_id, []).append({"ws": websocket, "role": role})

    def disconnect(self, websocket: WebSocket, user_id: int):
        # Solo se retira LA pestaña que se desconecta; las demás siguen vivas
        conns = self.active_connections.get(user_id, [])
        conns[:] = [c for c in conns if c["ws"] is not websocket]
        if not conns:
            self.active_connections.pop(user_id, None)

    async def _send_safe(self, user_id: int, conn: dict, payload: dict):
        try:
            await conn["ws"].send_json(payload)
        except Exception:
            # Socket muerto: se da de baja sin romper el resto de envíos
            self.disconnect(conn["ws"], user_id)

    async def notify_user(self, user_id: int, title: str, message: str, icon: str = "🔔", msg_type: str = "toast", ticket_id: int = None, exclude_user_id: int = None):
        # Verificamos que el destinatario no sea la misma persona que originó el mensaje
        if user_id == exclude_user_id:
            return
        payload = {"type": msg_type, "title": title, "message": message, "icon": icon, "ticket_id": ticket_id}
        for conn in list(self.active_connections.get(user_id, [])):
            await self._send_safe(user_id, conn, payload)

    async def notify_techs(self, title: str, message: str, icon: str = "🔔", msg_type: str = "toast", ticket_id: int = None, exclude_user_id: int = None):
        payload = {"type": msg_type, "title": title, "message": message, "icon": icon, "ticket_id": ticket_id}
        for uid, conns in list(self.active_connections.items()):
            # Filtramos para que no le llegue a los empleados NI al usuario que originó el mensaje
            if uid == exclude_user_id:
                continue
            for conn in list(conns):
                if conn["role"] != "employee":
                    await self._send_safe(uid, conn, payload)

    async def notify_ticket_message(
        self,
        created_by: int,
        assigned_to: int = None,
        title: str = "",
        message: str = "",
        icon: str = "💬",
        msg_type: str = "new_message",
        ticket_id: int = None,
        exclude_user_id: int = None,
        is_private: bool = False,
    ):
        """Reparte el aviso de un mensaje de chat según su visibilidad.

        Se recorre cada conexión una sola vez: así nadie recibe el aviso duplicado
        aunque cumpla varios criterios (asignado que además es admin). Reglas:
        - Nota privada: solo staff (técnicos y admins); JAMÁS un empleado.
        - Mensaje público: creador + asignado + (técnicos si no hay asignado) + admins.
        El emisor nunca se auto-notifica.
        """
        payload = {"type": msg_type, "title": title, "message": message, "icon": icon, "ticket_id": ticket_id}
        for uid, conns in list(self.active_connections.items()):
            if uid == exclude_user_id:
                continue
            for conn in list(conns):
                role = conn["role"]
                if is_private:
                    # La nota privada nunca debe llegar a un empleado
                    if role in ("technician", "admin"):
                        await self._send_safe(uid, conn, payload)
                    continue
                if uid == created_by:
                    await self._send_safe(uid, conn, payload)
                elif assigned_to is not None and uid == assigned_to:
                    await self._send_safe(uid, conn, payload)
                elif assigned_to is None and role in ("technician", "admin"):
                    await self._send_safe(uid, conn, payload)
                elif role == "admin":
                    await self._send_safe(uid, conn, payload)


notifier = NotificationManager()

# --- ENDPOINT WEBSOCKET DE ALERTAS ---
@router.websocket("/ws/notifications")
async def global_notifications(websocket: WebSocket):
    subprotocol, token = _ws_subprotocol_token(websocket)
    # Usuario activo y rol leídos de la DB (no del token)
    usuario = await asyncio.to_thread(_ws_user, token)
    if usuario is None:
        print("🚨 [Notificaciones] Token inválido o usuario desactivado")
        await websocket.close(code=1008)
        return
    user_id, user_role = usuario

    # Pasamos el rol y el subprotocolo acordado al aceptar la conexión
    await notifier.connect(websocket, user_id, user_role, subprotocol)
    print(f"✅ [Notificaciones] Usuario {user_id} ({user_role}) conectado.")

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        notifier.disconnect(websocket, user_id)
