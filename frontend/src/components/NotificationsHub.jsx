import { useEffect } from 'react'
import { Toaster, toast } from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'
import { useUIStore } from '../store/uiStore'
import { wsUrl } from '../api'

/**
 * Conexión única de notificaciones + contenedor de toasts.
 *
 * Vive montado una sola vez en App (no por página), así el WebSocket no se
 * reconecta al navegar entre secciones y no se pierde ningún aviso.
 */
export default function NotificationsHub() {
    const token = useAuthStore(state => state.token)

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
                const isViewingCurrentTicket = currentPath === `/ticket/${data.ticket_id}`

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

                // 4. Notificación flotante (Toast)
                if (!isViewingCurrentTicket) {
                    toast(
                        <div className="flex flex-col">
                            <span className="font-bold text-sm text-gray-900 dark:text-white">{data.title}</span>
                            <span className="text-sm text-gray-600 dark:text-gray-300">{data.message}</span>
                        </div>,
                        { icon: data.icon, duration: 5000 }
                    )
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
    }, [token])

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
