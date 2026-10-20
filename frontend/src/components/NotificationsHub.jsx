import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Toaster, toast } from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'
import { useUIStore } from '../store/uiStore'
import { api, wsUrl } from '../api'

// Dos sonidos (decisión del usuario): "work" = trabajo nuevo (dos tonos ascendentes, llamativo),
// "message" = mensaje/novedad (un tono corto). Sin `sound` en el aviso = silencio.
// Generados con Web Audio: sin archivos ni dependencias. El navegador solo deja sonar tras
// una interacción con la página (el clic del login ya cuenta).
const NOTAS = { work: [660, 880], message: [880] }
let audioCtx = null

const tocar = (sound) => {
    const notas = NOTAS[sound]
    if (!notas || useUIStore.getState().muted) return
    try {
        audioCtx ??= new AudioContext()
        audioCtx.resume()
        notas.forEach((frecuencia, i) => {
            const inicio = audioCtx.currentTime + i * 0.16
            const osc = audioCtx.createOscillator()
            const vol = audioCtx.createGain()
            osc.frequency.value = frecuencia
            vol.gain.setValueAtTime(0.0001, inicio)
            vol.gain.exponentialRampToValueAtTime(0.2, inicio + 0.02)  // ataque suave, sin "clic"
            vol.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.25)
            osc.connect(vol).connect(audioCtx.destination)
            osc.start(inicio)
            osc.stop(inicio + 0.26)
        })
    } catch { /* sin audio disponible: quedan el toast y la notificación del sistema */ }
}

// Contador en el título mientras la pestaña está en segundo plano: "(3) HelpDesk IT"
const TITULO = document.title
let pendientes = 0
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        pendientes = 0
        document.title = TITULO
    }
})

/**
 * Conexión única de notificaciones + contenedor de toasts.
 *
 * Vive montado una sola vez en App (no por página), así el WebSocket no se
 * reconecta al navegar entre secciones y no se pierde ningún aviso.
 */
export default function NotificationsHub() {
    const token = useAuthStore(state => state.token)
    const navigate = useNavigate()

    useEffect(() => {
        if (!token) return

        let ws = null // Es una variable normal, no usamos .current aquí
        let isMounted = true
        let reintentos = 0
        let timerId = null

        const conectar = () => {
            if (!isMounted) return

            ws = new WebSocket(wsUrl('/ws/notifications'), ['auth', token])

            ws.onopen = () => { reintentos = 0 }

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data)

                // 1. Leemos la URL actual
                const currentPath = window.location.pathname
                const isViewingCurrentTicket = currentPath === `/ticket/${data.ticket_id}` || (Boolean(data.link) && currentPath === data.link)

                // 2. Refrescamos datos en segundo plano si es necesario
                if (data.type === 'refresh') {
                    useUIStore.getState().triggerRefresh()
                }

                // 3. Notificación visual (Punto rojo)
                if (data.type === 'new_message' && data.ticket_id) {
                    if (!isViewingCurrentTicket) {
                        useUIStore.getState().addUnreadTicket(data.ticket_id)
                    }
                }

                // 3b. Centro de notificaciones: los avisos con sonido quedaron guardados en el backend.
                //     Si ya está viendo ese ticket, se marca leído en el acto; si no, la campana recarga.
                if (data.sound) {
                    const marcar = isViewingCurrentTicket && data.link
                        ? api.post('/notifications/read-all', null, { params: { link: data.link } }).catch(() => {})
                        : Promise.resolve()
                    marcar.then(() => useUIStore.getState().bumpNotifications())
                }

                // 4. Notificación flotante (Toast) + sonido; nada si ya está viendo ese ticket
                if (!isViewingCurrentTicket) {
                    toast(
                        <div className="flex flex-col">
                            <span className="font-bold text-sm text-gray-900 dark:text-white">{data.title}</span>
                            <span className="text-sm text-gray-600 dark:text-gray-300">{data.message}</span>
                        </div>,
                        { icon: data.icon, duration: data.sound === 'work' ? 8000 : 5000 }
                    )
                    tocar(data.sound)
                }

                // 5. Pestaña en segundo plano: contador en el título + notificación del sistema
                //    (solo avisos con sonido: los de fondo no interrumpen)
                if (data.sound && document.hidden) {
                    pendientes += 1
                    document.title = `(${pendientes}) ${TITULO}`
                    if ('Notification' in window && Notification.permission === 'granted') {
                        const aviso = new Notification(data.title, { body: data.message, tag: data.ticket_id ? `ticket-${data.ticket_id}` : undefined })
                        aviso.onclick = () => {
                            window.focus()
                            if (data.link) navigate(data.link)
                            aviso.close()
                        }
                    }
                }
            }

            ws.onerror = () => {
                console.debug("Desconexión menor del WebSocket de notificaciones.")
            }

            // Si el socket se cae (reinicio del backend, red...), reconectamos con backoff
            ws.onclose = () => {
                if (!isMounted) return
                reintentos += 1
                const delay = Math.min(1000 * 2 ** reintentos, 15000)
                timerId = setTimeout(conectar, delay)
            }
        }

        // Margen inicial: StrictMode monta el efecto dos veces en dev y así no abrimos dos sockets
        timerId = setTimeout(conectar, 500)

        // Función de limpieza
        return () => {
            isMounted = false
            clearTimeout(timerId)
            if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
                ws.close()
            }
        }
    }, [token, navigate])

    return (
        <Toaster
            position="top-right"
            toastOptions={{
                // Con `!` porque la librería fija fondo/color con estilo inline
                className: '!bg-white dark:!bg-gray-900 !text-gray-900 dark:!text-gray-50 !border !border-gray-200 dark:!border-gray-700 !shadow-lg'
            }}
        />
    )
}
