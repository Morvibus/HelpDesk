import { LogOut, Ticket, PlusCircle, Moon, Sun } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'
import { useNavigate, NavLink } from 'react-router-dom'
import { useUIStore } from '../store/uiStore'
import NewTicketModal from './NewTicketModal'
import Avatar from 'boring-avatars'

export default function Layout({ children }) {
    const logout = useAuthStore(state => state.logout)
    const role = useAuthStore(state => state.role)
    const { isDark, toggleTheme } = useThemeStore()
    const navigate = useNavigate()
    const { openTicketModal } = useUIStore()
    const email = useAuthStore((state) => state.email)
    const unreadCount = useUIStore(state => state.unreadTickets.length)


    const handleLogout = () => {
        logout()
        navigate('/login')
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-brand-black transition-colors duration-200">

            {/* Barra de Navegación */}
            <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16">

                        <div className="flex">
                            <div className="shrink-0 flex items-center">
                                <Ticket className="h-8 w-8 text-brand-primary dark:text-brand-light" />
                                <span className="ml-2 text-xl font-bold text-gray-900 dark:text-white whitespace-nowrap">HelpDesk IT</span>
                            </div>
                            <div className="hidden sm:ml-8 sm:flex sm:space-x-8">
                                <NavLink to="/" end className={({ isActive }) => `${isActive ? 'border-brand-primary dark:border-brand-light text-gray-900 dark:text-white' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'} inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors`}>
                                    Mis Tickets
                                    {unreadCount > 0 && (
                                        <span
                                            aria-label={`${unreadCount} ticket(s) con mensajes sin leer`}
                                            className="ml-2 inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-xs font-bold text-white bg-red-500 rounded-full"
                                        >
                                            {unreadCount}
                                        </span>
                                    )}
                                </NavLink>
                                {role === 'admin' && (
                                    <NavLink to="/admin" className={({ isActive }) => `${isActive ? 'border-brand-primary dark:border-brand-light text-gray-900 dark:text-white' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'} inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors`}>
                                        Admin
                                    </NavLink>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center space-x-1 sm:space-x-4">
                            {/* Botón Nuevo Ticket (icono solo en móvil) */}
                            <button
                                onClick={openTicketModal}
                                aria-label="Nuevo Ticket"
                                title="Nuevo Ticket"
                                className="inline-flex items-center px-2 sm:px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand-primary hover:bg-brand-dark dark:bg-brand-light dark:hover:bg-brand-primary dark:text-gray-900 transition-colors"
                            >
                                <PlusCircle className="mr-0 sm:mr-2 h-4 w-4" />
                                <span className="hidden sm:inline">Nuevo Ticket</span>
                            </button>

                            <div className="flex items-center space-x-1 sm:space-x-2 border-l border-gray-200 dark:border-gray-700 pl-2 sm:pl-4">
                                {/* Botón Modo Oscuro */}
                                <button
                                    onClick={toggleTheme}
                                    aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                                    className="p-2 text-gray-400 hover:text-brand-accent dark:hover:text-brand-light transition-colors"
                                >
                                    {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                                </button>

                                {/* Rol (oculto en móvil para no desbordar el header) */}
                                <div className="hidden sm:flex flex-col text-right ml-2 mr-2">
                                    <span className="text-xs text-brand-primary dark:text-brand-accent font-medium uppercase tracking-wider">{role}</span>
                                </div>

                                {/* Avatar */}
                                <Avatar size={32} name={email || "usuario"} variant="beam" />
                                <span className="hidden md:block max-w-[180px] truncate">{email}</span>

                                {/* Botón Salir */}
                                <button
                                    onClick={handleLogout}
                                    aria-label="Cerrar sesión"
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
        </div>
    )
}