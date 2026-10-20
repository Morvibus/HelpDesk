import { useEffect, useState } from 'react'
import { LogOut, Ticket, PlusCircle, Moon, Sun, BookOpen, Monitor, BarChart3, KeyRound, ShieldCheck, Menu, X, LayoutDashboard, Bell, Volume2, VolumeX } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useThemeStore } from '../store/themeStore'
import { useNavigate, NavLink } from 'react-router-dom'
import { useUIStore } from '../store/uiStore'
import NewTicketModal from './NewTicketModal'
import { api } from '../api'
import Avatar from 'boring-avatars'

// Secciones del menú lateral; `roles` limita quién las ve (sin roles = todos)
const SECCIONES = [
    { to: '/', label: 'Mis Tickets', icon: LayoutDashboard, end: true, unread: true },
    { to: '/accesos', label: 'Accesos', icon: KeyRound },
    { to: '/biblioteca', label: 'Biblioteca', icon: BookOpen },
    { to: '/activos', label: 'Activos', icon: Monitor, roles: ['technician', 'admin'] },
    { to: '/reportes', label: 'Reportes', icon: BarChart3, roles: ['technician', 'admin'] },
    { to: '/admin', label: 'Administración', icon: ShieldCheck, roles: ['admin'] },
]
const ROLE_LABELS = { employee: 'Empleado', technician: 'Técnico', admin: 'Administrador' }

// --- Centro de notificaciones: campana con contador + panel lateral derecho ---
// Timestamps naive del backend = UTC
const hace = (ts) => {
    const min = Math.round((Date.now() - new Date(`${ts}Z`).getTime()) / 60000)
    if (min < 1) return 'ahora'
    if (min < 60) return `hace ${min} min`
    if (min < 60 * 24) return `hace ${Math.round(min / 60)} h`
    return new Date(`${ts}Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

const Campana = ({ unread, onClick, className = '' }) => (
    <button onClick={onClick} aria-label={unread ? `Notificaciones: ${unread} sin leer` : 'Notificaciones'} className={`relative p-2 text-gray-500 hover:text-brand-primary dark:hover:text-brand-light ${className}`}>
        <Bell className="h-6 w-6" />
        {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-5 h-5 px-1 text-[11px] font-bold text-white bg-red-500 rounded-full" aria-hidden="true">
                {unread > 99 ? '99+' : unread}
            </span>
        )}
    </button>
)

const PanelAvisos = ({ avisos, onClose, onOpen, onReadAll }) => (
    <>
        <div onClick={onClose} className="fixed inset-0 z-[60] bg-gray-900/40" aria-hidden="true" />
        <section role="dialog" aria-label="Notificaciones" className="fixed inset-y-0 right-0 z-[70] w-full max-w-sm flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-xl">
            <div className="flex items-center justify-between h-16 px-5 border-b border-gray-200 dark:border-gray-800 shrink-0">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Notificaciones</h2>
                <div className="flex items-center gap-2">
                    {avisos.unread > 0 && (
                        <button onClick={onReadAll} className="text-xs font-medium text-brand-primary dark:text-brand-light hover:underline">Marcar todas como leídas</button>
                    )}
                    <button onClick={onClose} aria-label="Cerrar notificaciones" className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X className="h-5 w-5" /></button>
                </div>
            </div>
            {avisos.items.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center px-6 text-center text-gray-500 dark:text-gray-400">
                    <Bell className="h-10 w-10 mb-3 text-gray-300 dark:text-gray-600" />
                    <p className="text-sm">No tienes avisos de los últimos 30 días.</p>
                </div>
            ) : (
                <ul className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
                    {avisos.items.map(a => (
                        <li key={a.id}>
                            <button
                                onClick={() => onOpen(a)}
                                className={`w-full text-left flex gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors ${a.read_at ? '' : 'bg-brand-primary/5 dark:bg-brand-light/5'}`}
                            >
                                <span className="text-lg leading-6 shrink-0" aria-hidden="true">{a.icon || '🔔'}</span>
                                <span className="min-w-0 flex-1">
                                    <span className={`block text-sm truncate ${a.read_at ? 'text-gray-700 dark:text-gray-300' : 'font-semibold text-gray-900 dark:text-white'}`}>{a.title}</span>
                                    {a.message && <span className="block text-sm text-gray-500 dark:text-gray-400 line-clamp-2">{a.message}</span>}
                                    <span className="block text-xs text-gray-400 mt-0.5">{hace(a.created_at)}</span>
                                </span>
                                {!a.read_at && <span className="mt-2 w-2 h-2 rounded-full bg-brand-primary dark:bg-brand-light shrink-0" aria-label="Sin leer" />}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    </>
)

export default function Layout({ children }) {
    const logout = useAuthStore(state => state.logout)
    const role = useAuthStore(state => state.role)
    const email = useAuthStore((state) => state.email)
    const { isDark, toggleTheme } = useThemeStore()
    const navigate = useNavigate()
    const { openTicketModal } = useUIStore()
    const unreadCount = useUIStore(state => state.unreadTickets.length)
    const [abierto, setAbierto] = useState(false) // panel lateral en pantallas pequeñas
    const muted = useUIStore(state => state.muted)
    const toggleMuted = useUIStore(state => state.toggleMuted)
    const [permisoAvisos, setPermisoAvisos] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'))

    const notifTick = useUIStore(state => state.notifTick)
    const bumpNotifications = useUIStore(state => state.bumpNotifications)
    const [avisos, setAvisos] = useState({ items: [], unread: 0 })
    const [verAvisos, setVerAvisos] = useState(false)

    // Avisos guardados: al entrar se ve lo que pasó mientras no estaba; recarga con cada aviso nuevo
    // oxlint-disable react/exhaustive-effect-dependencies -- notifTick es el disparador de la recarga
    useEffect(() => {
        api.get('/notifications/', { params: { limit: 30 } }).then(res => setAvisos(res.data)).catch(() => {})
    }, [notifTick])
    // oxlint-enable react/exhaustive-effect-dependencies

    // Esc cierra el menú en móvil y el panel de avisos
    useEffect(() => {
        if (!abierto && !verAvisos) return
        const onKey = (e) => { if (e.key === 'Escape') { setAbierto(false); setVerAvisos(false) } }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [abierto, verAvisos])

    const abrirAviso = async (aviso) => {
        setVerAvisos(false)
        setAbierto(false)
        if (!aviso.read_at) await api.post(`/notifications/${aviso.id}/read`).catch(() => {})
        bumpNotifications()
        if (aviso.link) navigate(aviso.link)
    }

    const leerTodas = async () => {
        await api.post('/notifications/read-all').catch(() => {})
        bumpNotifications()
    }

    const handleLogout = () => {
        logout()
        navigate('/login')
    }

    const nuevoTicket = () => { setAbierto(false); openTicketModal() }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-200">

            {/* Franja superior solo en pantallas pequeñas: abre el menú lateral */}
            <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between h-14 px-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
                <button onClick={() => setAbierto(true)} aria-label="Abrir menú" aria-expanded={abierto} aria-controls="menu-lateral" className="relative p-2 -ml-2 text-gray-500 hover:text-brand-primary dark:hover:text-brand-light">
                    <Menu className="h-6 w-6" />
                    {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500" aria-hidden="true" />}
                </button>
                <div className="flex items-center">
                    <Ticket className="h-6 w-6 text-brand-primary dark:text-brand-light" />
                    <span className="ml-2 text-lg font-bold text-gray-900 dark:text-white">HelpDesk IT</span>
                </div>
                <div className="flex items-center -mr-2">
                    <Campana unread={avisos.unread} onClick={() => setVerAvisos(true)} />
                    {role === 'employee' && (
                        <button onClick={nuevoTicket} aria-label="Nuevo Ticket" className="p-2 text-brand-primary dark:text-brand-light">
                            <PlusCircle className="h-6 w-6" />
                        </button>
                    )}
                </div>
            </header>

            {verAvisos && <PanelAvisos avisos={avisos} onClose={() => setVerAvisos(false)} onOpen={abrirAviso} onReadAll={leerTodas} />}

            {/* Fondo oscuro del panel en móvil */}
            {abierto && <div onClick={() => setAbierto(false)} className="lg:hidden fixed inset-0 z-40 bg-gray-900/50 backdrop-blur-sm" aria-hidden="true" />}

            {/* Menú lateral: fijo en escritorio, deslizable en pantallas pequeñas */}
            <aside
                id="menu-lateral"
                className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-transform duration-200 lg:translate-x-0 ${abierto ? 'translate-x-0' : '-translate-x-full'}`}
            >
                <div className="flex items-center justify-between h-16 px-5 shrink-0">
                    <div className="flex items-center">
                        <Ticket className="h-8 w-8 text-brand-primary dark:text-brand-light" />
                        <span className="ml-2 text-xl font-bold text-gray-900 dark:text-white whitespace-nowrap">HelpDesk IT</span>
                    </div>
                    {/* En escritorio la campana vive aquí; en móvil está en la franja superior */}
                    <Campana unread={avisos.unread} onClick={() => setVerAvisos(true)} className="hidden lg:block -mr-2" />
                    <button onClick={() => setAbierto(false)} aria-label="Cerrar menú" className="lg:hidden p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Botón Nuevo Ticket: solo empleados (el backend no deja a técnicos/admins) */}
                {role === 'employee' && (
                    <div className="px-4 pb-2">
                        <button
                            onClick={nuevoTicket}
                            className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg shadow-sm text-white bg-brand-primary hover:bg-brand-dark dark:bg-brand-light dark:hover:bg-brand-light-hover dark:text-gray-900 transition-colors"
                        >
                            <PlusCircle className="mr-2 h-4 w-4" /> Nuevo Ticket
                        </button>
                    </div>
                )}

                <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1" aria-label="Secciones">
                    {SECCIONES.filter(s => !s.roles || s.roles.includes(role)).map(({ to, label, icon: Icon, end, unread }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={end}
                            onClick={() => setAbierto(false)}
                            className={({ isActive }) => `flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive
                                ? 'bg-brand-primary/10 text-brand-primary dark:bg-brand-light/10 dark:text-brand-light'
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'}`}
                        >
                            <Icon className="w-5 h-5 mr-3 shrink-0" />
                            <span className="flex-1">{label}</span>
                            {unread && unreadCount > 0 && (
                                <span
                                    aria-label={`${unreadCount} ticket(s) con mensajes sin leer`}
                                    className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-xs font-bold text-white bg-red-500 rounded-full"
                                >
                                    {unreadCount}
                                </span>
                            )}
                        </NavLink>
                    ))}
                </nav>

                {/* Usuario, tema y salida */}
                <div className="shrink-0 border-t border-gray-200 dark:border-gray-800 p-4">
                    <div className="flex items-center gap-3 mb-3 min-w-0">
                        <Avatar size={36} name={email || "usuario"} variant="beam" colors={['#0d7c73', '#2dd4bf', '#d97706', '#4a5b62', '#151c22']} />
                        <div className="min-w-0">
                            <p className="text-sm text-gray-900 dark:text-white truncate" title={email}>{email}</p>
                            <p className="text-xs font-medium uppercase tracking-wider text-brand-primary dark:text-brand-accent">{ROLE_LABELS[role] || role}</p>
                        </div>
                    </div>
                    {/* Avisos: sonido on/off y permiso para las notificaciones del sistema (pestaña en segundo plano).
                        Solo se pide el permiso si el navegador aún no lo decidió (y exige https o localhost). */}
                    {permisoAvisos === 'default' && (
                        <button
                            onClick={() => Notification.requestPermission().then(setPermisoAvisos)}
                            className="w-full mb-2 inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-brand-primary dark:text-brand-light rounded-lg border border-brand-primary/30 dark:border-brand-light/30 hover:bg-brand-primary/5 dark:hover:bg-brand-light/10 transition-colors"
                        >
                            <Bell className="h-4 w-4" /> Activar avisos del sistema
                        </button>
                    )}
                    <button
                        onClick={toggleMuted}
                        aria-pressed={!muted}
                        aria-label={muted ? 'Activar sonido de avisos' : 'Silenciar avisos'}
                        className="w-full mb-2 inline-flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />} {muted ? 'Avisos en silencio' : 'Sonido de avisos activo'}
                    </button>
                    <div className="flex gap-2">
                        <button
                            onClick={toggleTheme}
                            aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} {isDark ? 'Claro' : 'Oscuro'}
                        </button>
                        <button
                            onClick={handleLogout}
                            aria-label="Cerrar sesión"
                            title="Cerrar Sesión"
                            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-700 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-800/50 transition-colors"
                        >
                            <LogOut className="h-4 w-4" /> Salir
                        </button>
                    </div>
                </div>
            </aside>

            {/* Contenedor dinámico donde se cargan las pantallas (deja libre el ancho del menú en escritorio) */}
            <main className="lg:pl-64">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
                    {children}
                </div>
            </main>
            <NewTicketModal />
        </div>
    )
}
