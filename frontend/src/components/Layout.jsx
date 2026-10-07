import { LogOut, Ticket, PlusCircle, Moon, Sun } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'
import { useNavigate } from 'react-router-dom'
import { useUIStore } from '../store/uiStore'
import NewTicketModal from './NewTicketModal'
import { useEffect } from 'react'
import { Toaster, toast } from 'react-hot-toast'
import Avatar from 'boring-avatars'
import { wsUrl } from '../api'

export default function Layout({ children }) {
    const logout = useAuthStore(state => state.logout)
    const role = useAuthStore(state => state.role)
    const { isDark, toggleTheme } = useThemeStore()
    const navigate = useNavigate()
    const { openTicketModal } = useUIStore()
    const token = useAuthStore(state => state.token)
    const email = useAuthStore((state) => state.email)


    const handleLogout = () => {
        logout()
        navigate('/login')
    }

    useEffect(() => {
        if (!token) return

        let ws = null // Es una variable normal, no usamos .current aquí
        let isMounted = true

        const timeoutId = setTimeout(() => {
            if (!isMounted) return

            ws = new WebSocket(wsUrl('/ws/notifications'), ['auth', token])

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
        }, 500)

        // Función de limpieza
        return () => {
            isMounted = false
            clearTimeout(timeoutId)
            if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
                ws.close()
            }
        }
    }, [token])

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-brand-black transition-colors duration-200">

            {/* Barra de Navegación */}
            <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16">

                        <div className="flex">
                            <div className="shrink-0 flex items-center">
                                <Ticket className="h-8 w-8 text-brand-primary dark:text-brand-light" />
                                <span className="ml-2 text-xl font-bold text-gray-900 dark:text-white">HelpDesk IT</span>
                            </div>
                            <div className="hidden sm:ml-8 sm:flex sm:space-x-8">
                                <span className="border-brand-primary dark:border-brand-light text-gray-900 dark:text-white inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                                    Mis Tickets
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center space-x-4">
                            {/* Botón Nuevo Ticket */}

                            <button onClick={openTicketModal} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand-primary hover:bg-brand-dark dark:bg-brand-light dark:hover:bg-brand-primary dark:text-gray-900 transition-colors">
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Nuevo Ticket
                            </button>

                            <div className="flex items-center space-x-2 border-l pl-4 border-gray-200 dark:border-gray-700">
                                {/* Botón Modo Oscuro */}
                                <button
                                    onClick={toggleTheme}
                                    className="p-2 text-gray-400 hover:text-brand-accent dark:hover:text-brand-light transition-colors"
                                >
                                    {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                                </button>

                                <div className="flex flex-col text-right ml-2 mr-2">
                                    <span className="text-xs text-brand-primary dark:text-brand-accent font-medium uppercase tracking-wider">{role}</span>
                                </div>

                                {/* Avatar */}

                                <Avatar size={32} name={email || "usuario"} variant="beam" />
                                <span>{email}</span>

                                {/* Botón Salir */}
                                <button
                                    onClick={handleLogout}
                                    className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                    title="Cerrar Sesión"
                                >
                                    <LogOut className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                    </div>
                </div>
            </nav>

            {/* Contenedor dinámico donde se cargan las pantallas */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {children}
            </main>
            <NewTicketModal />

            <Toaster
                position="top-right"
                toastOptions={{
                    className: 'dark:bg-gray-800 dark:text-white border border-gray-200 dark:border-gray-700 shadow-lg'
                }}
            />
        </div>
    )
}