# app/whatsapp.py
from fastapi import APIRouter, Request, HTTPException
import os

router = APIRouter(prefix="/whatsapp", tags=["WhatsApp"])

VERIFY_TOKEN = "mi_token_secreto_de_verificacion" # Puedes inventar una frase clave aquí
WHATSAPP_TOKEN = "EAAkx3ZCOcXt8BSM9uXF1yPWfwRMK19p9zYKPsTqaJjH3cn4ZAEJ6SJ7iWxSspAwoRjmsV4VITAK5dV82ZBCJuFPiBXEiERT938ZCMK7BK3DdflX2ZA2ZA0INH6UBn2tT8cvOnCao5GAiSvohZBL3TplZBij34JGCHsCzhPaa8J180rNg35sJUXFwwV2ZCX3mBuAOwAsRFTZARQfy7CIa98KMWO2u02KrIZAsZCq8VZAZBbZBzN2XLu0vJWGteoXZBpvGOqnMfbjj7B8tbkUJTZAZBwm5R1jlDUStZBk"
PHONE_NUMBER_ID = "1249089601620492"

@router.get("/webhook")
def verificar_webhook(request: Request):
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    if mode and token:
        if mode == "subscribe" and token == VERIFY_TOKEN:
            return int(challenge)
        raise HTTPException(status_code=403, detail="Fallo de verificación")
    raise HTTPException(status_code=400, detail="Parámetros inválidos")

@router.post("/webhook")
async def recibir_mensaje(request: Request):
    body = await request.json()
    try:
        entry = body.get("entry", [])[0]
        changes = entry.get("changes", [])[0]
        value = changes.get("value", {})
        messages = value.get("messages")

        if messages:
            msg = messages[0]
            remitente = msg.get("from")
            texto = msg.get("text", {}).get("body")
            print(f"Mensaje de WhatsApp de {remitente}: {texto}")

        return {"status": "success"}
    except Exception as e:
        print(f"Error: {e}")
        return {"status": "error"}