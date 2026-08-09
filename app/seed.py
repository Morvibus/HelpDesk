from app.database import SessionLocal
from app import models
import app.security as security

def ejecutar_seed():
    db = SessionLocal()
    try:
        print("🌱 Iniciando el proceso de seed desde cero...")

        # 1. Limpiar datos existentes en orden correcto
        db.query(models.TicketDetalle).delete()
        db.query(models.Ticket).delete()
        db.query(models.Usuario).delete()
        db.query(models.Departamento).delete()
        db.commit()

        # 2. Crear Departamentos
        depto_sistemas = models.Departamento(nombre="Sistemas y Soporte")
        depto_ventas = models.Departamento(nombre="Ventas y Facturación")
        db.add_all([depto_sistemas, depto_ventas])
        db.commit()
        db.refresh(depto_sistemas)
        db.refresh(depto_ventas)

        # 3. Generar hash de contraseña común ("123456")
        hashed_pw = security.obtener_password_hash("123456")

        # 4. Crear 2 usuarios por cada rol con sus nombres y hashed_password
        usuarios = [
            models.Usuario(nombre="Cliente Uno", correo="cliente1@sis.com", hashed_password=hashed_pw, rol="cliente", departamento_id=None),
            models.Usuario(nombre="Cliente Dos", correo="cliente2@sis.com", hashed_password=hashed_pw, rol="cliente", departamento_id=None),
            models.Usuario(nombre="Técnico Uno", correo="tecnico1@sis.com", hashed_password=hashed_pw, rol="tecnico", departamento_id=depto_sistemas.id),
            models.Usuario(nombre="Técnico Dos", correo="tecnico2@sis.com", hashed_password=hashed_pw, rol="tecnico", departamento_id=depto_ventas.id),
            models.Usuario(nombre="Admin Uno", correo="admin1@sis.com", hashed_password=hashed_pw, rol="admin", departamento_id=depto_sistemas.id),
            models.Usuario(nombre="Admin Dos", correo="admin2@sis.com", hashed_password=hashed_pw, rol="admin", departamento_id=depto_ventas.id),
        ]

        db.add_all(usuarios)
        db.commit()

        # Recuperar usuarios creados para asignarles tickets
        c1 = db.query(models.Usuario).filter_by(correo="cliente1@sis.com").first()
        c2 = db.query(models.Usuario).filter_by(correo="cliente2@sis.com").first()
        t1 = db.query(models.Usuario).filter_by(correo="tecnico1@sis.com").first()

        # 5. Crear Tickets de prueba iniciales
        ticket1 = models.Ticket(
            codigo="TKT-101",
            titulo="Falla en la red Wi-Fi",
            descripcion_inicial="El punto de acceso del segundo piso no da internet.",
            estado_id=1,
            solicitante_id=c1.id,
            departamento_id=depto_sistemas.id
        )

        ticket2 = models.Ticket(
            codigo="TKT-102",
            titulo="Configuración de impresora",
            descripcion_inicial="No logramos conectar la impresora nueva.",
            estado_id=2,
            solicitante_id=c2.id,
            tecnico_asignado_id=t1.id,
            departamento_id=depto_sistemas.id
        )

        db.add_all([ticket1, ticket2])
        db.commit()

        print("¡Base de datos limpia y sembrada con éxito!")

    except Exception as e:
        print(f"Error al ejecutar el seed: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    ejecutar_seed()