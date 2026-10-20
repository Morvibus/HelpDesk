import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, fetchCatalog, invalidateCatalog } from '../api'
import Layout from '../components/Layout'
import { useAuthStore } from '../store/authStore'
import { useUIStore } from '../store/uiStore'
import { toast } from 'react-hot-toast'
import { Users, UserPlus, Loader2, KeyRound, X, ShieldCheck, Pencil, LayoutGrid, TrendingUp, Clock, Inbox, Hourglass, History, Tags, CheckCircle2, Eye, EyeOff } from 'lucide-react'

const LIMIT = 50

const ROLE_LABELS = { employee: 'Empleado', technician: 'Técnico', admin: 'Admin' }
const STATUS_LABELS = { created: 'Nuevo', assigned: 'Asignado', in_process: 'En Proceso', pending: 'Pendiente', solved: 'Solucionado', closed: 'Cerrado' }
const PRIORITY_LABELS = { low: 'Baja', medium: 'Media', high: 'Alta' }

const STATUS_STYLES = {
    created: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50',
    assigned: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800/50',
    in_process: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50',
    pending: 'bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600',
    solved: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800/50',
    closed: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
}
const PRIORITY_STYLES = {
    low: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
    medium: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800/50',
    high: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800/50',
}

// Semáforo de antigüedad: umbrales en HORAS HÁBILES por prioridad (jornada lun-vie
// 07:30-17:00, sáb 07:30-12:00). Aprox. 2 / 3 / 5 días hábiles. Debe coincidir con SLA_HOURS
// de backend/business_hours.py ("vencido" en búsqueda y reportes).
const AGE_THRESHOLDS = { high: 20, medium: 30, low: 48 }

// La antigüedad en horas hábiles la calcula el backend (campo business_age_hours).
const businessAgeHours = (ticket) => ticket.business_age_hours ?? 0
const formatAge = (hours) => {
    if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`
    if (hours < 24) return `${Math.round(hours)} h`
    if (hours < 24 * 30) return `${(hours / 24).toFixed(1)} días`
    return `${(hours / 24 / 30).toFixed(1)} meses`
}
const ageTone = (priority, hours) => {
    const threshold = AGE_THRESHOLDS[priority] || 48
    if (hours > threshold) return 'text-red-600 dark:text-red-400 font-semibold'
    if (hours > threshold / 2) return 'text-amber-600 dark:text-amber-400 font-semibold'
    return 'text-gray-500 dark:text-gray-400'
}

// --- Badges de módulo ---

const StatusBadge = ({ status }) => (
    <span className={`inline-flex px-2.5 py-0.5 text-xs font-semibold rounded-full border ${STATUS_STYLES[status] || STATUS_STYLES.created}`}>
        {STATUS_LABELS[status] || status}
    </span>
)

const PriorityBadge = ({ priority }) => (
    <span className={`inline-flex px-2.5 py-0.5 text-xs font-semibold rounded-full border ${PRIORITY_STYLES[priority] || PRIORITY_STYLES.medium}`}>
        {PRIORITY_LABELS[priority] || priority}
    </span>
)

// Campo de contraseña con botón para mostrarla (mismo patrón que el login)
const PasswordInput = ({ className, ...props }) => {
    const [ver, setVer] = useState(false)
    return (
        <div className="relative">
            <input {...props} type={ver ? 'text' : 'password'} className={`${className} pr-10`} />
            <button
                type="button"
                onClick={() => setVer(v => !v)}
                aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={ver}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-brand-primary dark:hover:text-brand-light transition-colors"
            >
                {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
        </div>
    )
}

// --- Modales como componentes de módulo (no se redefinen por render) ---

// Modal "Nuevo usuario"
const CreateUserModal = ({ open, onClose, onCreated, departamentos }) => {
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [role, setRole] = useState('employee')
    const [departmentId, setDepartmentId] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    if (!open) return null

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')
        try {
            await api.post('/users/', { name, email, password, role, department_id: departmentId === '' ? null : Number(departmentId) })
            setName('')
            setDepartmentId('')
            setEmail('')
            setPassword('')
            setRole('employee')
            toast.success('Usuario creado correctamente')
            onCreated()
            onClose()
        } catch (err) {
            setError(err.response?.data?.detail || 'Hubo un error al crear el usuario')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm transition-opacity">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-gray-100 dark:border-gray-800 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Nuevo Usuario</h2>
                    <button onClick={onClose} aria-label="Cerrar modal" className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">{error}</div>
                    )}

                    <div>
                        <label htmlFor="user-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre</label>
                        <input
                            id="user-name"
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-light dark:bg-gray-800 dark:text-white outline-none transition-shadow"
                            placeholder="Nombre y apellido"
                        />
                    </div>

                    <div>
                        <label htmlFor="user-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Correo</label>
                        <input
                            id="user-email"
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-light dark:bg-gray-800 dark:text-white outline-none transition-shadow"
                            placeholder="usuario@helpdesk-mock.com"
                        />
                    </div>

                    <div>
                        <label htmlFor="user-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contraseña</label>
                        <PasswordInput
                            id="user-password"
                            required
                            minLength={6}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-light dark:bg-gray-800 dark:text-white outline-none transition-shadow"
                            placeholder="Mínimo 6 caracteres"
                        />
                    </div>

                    <div>
                        <label htmlFor="user-role" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rol</label>
                        <select
                            id="user-role"
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-light dark:bg-gray-800 dark:text-white outline-none transition-shadow"
                        >
                            <option value="employee">Empleado</option>
                            <option value="technician">Técnico</option>
                            <option value="admin">Administrador</option>
                        </select>
                    </div>

                    <div>
                        <label htmlFor="user-department" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Departamento</label>
                        <select
                            id="user-department"
                            value={departmentId}
                            onChange={(e) => setDepartmentId(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-light dark:bg-gray-800 dark:text-white outline-none transition-shadow"
                        >
                            <option value="">Sin departamento</option>
                            {departamentos.filter(d => d.is_active).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>

                    <div className="flex justify-end space-x-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-5 py-2.5 text-sm font-medium text-white bg-brand-primary hover:bg-brand-dark rounded-lg flex items-center justify-center min-w-[120px] transition-colors disabled:opacity-70"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Crear Usuario'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// Modal "Resetear contraseña" (a uno mismo le pide la contraseña actual)
const ResetPasswordModal = ({ user, onClose, onUpdated }) => {
    const email = useAuthStore(state => state.email)
    const esPropio = user && user.email === email
    const [newPassword, setNewPassword] = useState('')
    const [oldPassword, setOldPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    if (!user) return null

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')
        try {
            const payload = esPropio
                ? { old_password: oldPassword, new_password: newPassword }
                : { new_password: newPassword }
            await api.patch(`/users/${user.id}/password`, payload)
            toast.success('Contraseña actualizada')
            onUpdated()
            onClose()
        } catch (err) {
            setError(err.response?.data?.detail || 'Error al cambiar la contraseña')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm transition-opacity">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-gray-100 dark:border-gray-800 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Resetear Contraseña</h2>
                    <button onClick={onClose} aria-label="Cerrar modal" className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">{error}</div>
                    )}

                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Nueva contraseña para <span className="font-medium text-gray-700 dark:text-gray-300">{user.name}</span> ({user.email})
                    </p>

                    {esPropio && (
                        <div>
                            <label htmlFor="reset-old-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contraseña actual</label>
                            <PasswordInput
                                id="reset-old-password"
                                required
                                value={oldPassword}
                                onChange={(e) => setOldPassword(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-light dark:bg-gray-800 dark:text-white outline-none transition-shadow"
                            />
                        </div>
                    )}

                    <div>
                        <label htmlFor="reset-new-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nueva contraseña</label>
                        <PasswordInput
                            id="reset-new-password"
                            required
                            minLength={6}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-light dark:bg-gray-800 dark:text-white outline-none transition-shadow"
                            placeholder="Mínimo 6 caracteres"
                        />
                    </div>

                    <div className="flex justify-end space-x-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-5 py-2.5 text-sm font-medium text-white bg-brand-primary hover:bg-brand-dark rounded-lg flex items-center justify-center min-w-[120px] transition-colors disabled:opacity-70"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Guardar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// Modal "Editar nombre y correo"
const EditUserModal = ({ user, onClose, onUpdated }) => {
    const [name, setName] = useState(user?.name || '')
    const [userEmail, setUserEmail] = useState(user?.email || '')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    if (!user) return null

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')
        try {
            await api.patch(`/users/${user.id}`, { name, email: userEmail })
            toast.success('Usuario actualizado')
            onUpdated()
            onClose()
        } catch (err) {
            setError(err.response?.data?.detail || 'Error al actualizar el usuario')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm transition-opacity">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-gray-100 dark:border-gray-800 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Editar Usuario</h2>
                    <button onClick={onClose} aria-label="Cerrar modal" className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">{error}</div>
                    )}

                    <div>
                        <label htmlFor="edit-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre</label>
                        <input
                            id="edit-name"
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-light dark:bg-gray-800 dark:text-white outline-none transition-shadow"
                        />
                    </div>

                    <div>
                        <label htmlFor="edit-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Correo</label>
                        <input
                            id="edit-email"
                            type="email"
                            required
                            value={userEmail}
                            onChange={(e) => setUserEmail(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-light dark:bg-gray-800 dark:text-white outline-none transition-shadow"
                        />
                    </div>

                    <div className="flex justify-end space-x-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-5 py-2.5 text-sm font-medium text-white bg-brand-primary hover:bg-brand-dark rounded-lg flex items-center justify-center min-w-[120px] transition-colors disabled:opacity-70"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Guardar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// Modal "Tickets abiertos": al desactivar o degradar a un técnico sus tickets abiertos
// quedarían sin atender. Permite reasignarlos a otro técnico o devolverlos al pool.
const OrphanTicketsModal = ({ user, descripcion, abiertos, loading, onClose, onConfirm }) => {
    const [techs, setTechs] = useState([])
    const [destino, setDestino] = useState('')  // '' => volver al pool (sin asignar)
    const [cargandoTechs, setCargandoTechs] = useState(true)

    useEffect(() => {
        const controller = new AbortController()
        ;(async () => {
            try {
                const res = await api.get('/users/', { params: { limit: 200, offset: 0 }, signal: controller.signal })
                setTechs(res.data.items.filter(u => u.is_active && u.id !== user.id && (u.role === 'technician' || u.role === 'admin')))
            } catch (err) {
                if (err.code !== 'ERR_CANCELED') toast.error('No se pudo cargar la lista de técnicos.')
            } finally {
                setCargandoTechs(false)
            }
        })()
        return () => controller.abort()
    }, [user.id])

    const iniciados = abiertos.filter(t => ['in_process', 'pending'].includes(t.status)).length

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm transition-opacity">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-gray-100 dark:border-gray-800 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">Tickets abiertos de {user.name}</h2>
                    <button onClick={onClose} aria-label="Cerrar modal" className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="px-6 py-5 space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Al {descripcion}, <strong className="text-gray-900 dark:text-white">{abiertos.length} ticket(s) abierto(s)</strong> quedarían sin atender.{' '}
                        {iniciados > 0 && (
                            <span className="text-amber-600 dark:text-amber-400 font-semibold">
                                {iniciados} ya iniciado(s) se marcarán como tal y conviene priorizarlos.
                            </span>
                        )}
                    </p>

                    <ul className="max-h-44 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800 border border-gray-100 dark:border-gray-800 rounded-lg">
                        {abiertos.map(t => (
                            <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                <span className="text-gray-900 dark:text-white truncate">#{t.id} {t.title}</span>
                                <span className="flex items-center gap-1.5 shrink-0">
                                    {['in_process', 'pending'].includes(t.status) && (
                                        <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">Ya iniciado</span>
                                    )}
                                    <StatusBadge status={t.status} />
                                </span>
                            </li>
                        ))}
                    </ul>

                    <div>
                        <label htmlFor="orphan-destino" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Destino de esos tickets</label>
                        <select
                            id="orphan-destino"
                            value={destino}
                            onChange={(e) => setDestino(e.target.value)}
                            disabled={cargandoTechs}
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-light outline-none transition-shadow disabled:opacity-50"
                        >
                            <option value="">Devolver al pool (sin asignar)</option>
                            {techs.map(u => (
                                <option key={u.id} value={u.id}>Reasignar a {u.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex justify-end space-x-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={() => onConfirm(destino === '' ? null : Number(destino))}
                            disabled={loading}
                            className="px-5 py-2.5 text-sm font-medium text-white bg-brand-primary hover:bg-brand-dark rounded-lg flex items-center justify-center min-w-[120px] transition-colors disabled:opacity-70"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirmar'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// --- Pestañas ---

// Pestaña 1: gestión de usuarios
const UsersTab = () => {
    const email = useAuthStore(state => state.email)
    const [users, setUsers] = useState([])
    const [total, setTotal] = useState(0)
    const [offset, setOffset] = useState(0)
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState('')
    const [loadingUserId, setLoadingUserId] = useState(null)
    const [createOpen, setCreateOpen] = useState(false)
    const [resetUser, setResetUser] = useState(null)
    const [editUser, setEditUser] = useState(null)
    // { user, body, exito, descripcion, abiertos }: operación pendiente de decidir el destino de los tickets
    const [orphan, setOrphan] = useState(null)
    const [departamentos, setDepartamentos] = useState([])

    useEffect(() => {
        fetchCatalog('/departments/').then(setDepartamentos).catch(() => {})
    }, [])

    // Carga inicial (una sola vez al montar)
    // oxlint-disable react/exhaustive-effect-dependencies -- la carga inicial es intencional
    useEffect(() => {
        const controller = new AbortController()

        const cargar = async () => {
            try {
                const res = await api.get('/users/', {
                    params: { limit: LIMIT, offset: 0 },
                    signal: controller.signal,
                })
                setUsers(res.data.items)
                setTotal(res.data.total)
                setOffset(LIMIT)
            } catch (err) {
                if (err.code === 'ERR_CANCELED') return
                console.error('Error al cargar usuarios:', err)
                setError('No se pudieron cargar los usuarios.')
            } finally {
                setLoading(false)
            }
        }

        cargar()
        return () => controller.abort()
    }, [])
    // oxlint-enable react/exhaustive-effect-dependencies

    const loadMore = async () => {
        if (loadingMore) return
        setLoadingMore(true)
        try {
            const res = await api.get('/users/', { params: { limit: LIMIT, offset } })
            setUsers(prev => [...prev, ...res.data.items])
            setTotal(res.data.total)
            setOffset(prev => prev + res.data.items.length)
        } catch {
            toast.error('No se pudieron cargar más usuarios.')
        } finally {
            setLoadingMore(false)
        }
    }

    // Refresca la lista tras una mutación conservando lo visto (extra: +1 para un alta nueva)
    const reload = async (extra = 1) => {
        invalidateCatalog('/users/directory/')  // Activos usa el directorio de personas
        try {
            const limite = Math.min(users.length + extra, 200)
            const res = await api.get('/users/', { params: { limit: limite, offset: 0 } })
            setUsers(res.data.items)
            setTotal(res.data.total)
            setOffset(res.data.items.length)
        } catch {
            toast.error('Error al refrescar la lista de usuarios.')
        }
    }

    // Aplica un cambio de usuario (rol/estado) y refresca la lista
    const aplicarCambio = async (user, body, exito) => {
        setLoadingUserId(user.id)
        try {
            await api.patch(`/users/${user.id}`, body)
            toast.success(exito)
            setOrphan(null)
            await reload()
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Error al actualizar al usuario')
        } finally {
            setLoadingUserId(null)
        }
    }

    // Antes de desactivar o degradar a empleado, revisa si el usuario tiene tickets abiertos:
    // si los tiene, pide decidir el destino (reasignar o devolver al pool) antes de aplicar.
    const solicitarCambio = async (user, body, exito, descripcion) => {
        setLoadingUserId(user.id)
        try {
            const res = await api.get('/tickets/', { params: { assigned_to: user.id, limit: 200, offset: 0 } })
            const abiertos = res.data.items.filter(t => ['created', 'assigned', 'in_process', 'pending'].includes(t.status))
            setLoadingUserId(null)
            if (abiertos.length === 0) {
                await aplicarCambio(user, body, exito)
            } else {
                setOrphan({ user, body, exito, descripcion, abiertos })
            }
        } catch {
            setLoadingUserId(null)
            toast.error('No se pudieron revisar los tickets del usuario.')
        }
    }

    const handleRoleChange = (user, newRole) => {
        const exito = `Rol de ${user.name} actualizado a ${ROLE_LABELS[newRole]}`
        if (newRole === 'employee') {
            // Degradar a empleado deja sus tickets asignados sin responsable
            solicitarCambio(user, { role: newRole }, exito, 'cambiar el rol a Empleado')
        } else {
            aplicarCambio(user, { role: newRole }, exito)
        }
    }

    const handleToggleActive = (user) => {
        if (user.is_active) {
            // Desactivar deja sus tickets abiertos sin responsable
            solicitarCambio(user, { is_active: false }, `${user.name} fue desactivado`, 'desactivar la cuenta')
        } else {
            aplicarCambio(user, { is_active: true }, `${user.name} fue activado`)
        }
    }

    const esPropio = (user) => user.email === email

    return (
        <>
            <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => reload(1)} departamentos={departamentos} />
            <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} onUpdated={() => reload(0)} />
            {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} onUpdated={() => reload(0)} />}
            {orphan && (
                <OrphanTicketsModal
                    user={orphan.user}
                    descripcion={orphan.descripcion}
                    abiertos={orphan.abiertos}
                    loading={loadingUserId === orphan.user.id}
                    onClose={() => setOrphan(null)}
                    onConfirm={(reassignTo) => aplicarCambio(
                        orphan.user,
                        reassignTo != null ? { ...orphan.body, reassign_to: reassignTo } : orphan.body,
                        orphan.exito,
                    )}
                />
            )}

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">Usuarios del sistema</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Crea, edita, cambia roles y resetea contraseñas</p>
                </div>
                <button
                    onClick={() => setCreateOpen(true)}
                    className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-medium text-white bg-brand-primary hover:bg-brand-dark rounded-lg transition-colors"
                >
                    <UserPlus className="w-4 h-4 mr-2" /> Nuevo Usuario
                </button>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-800 text-sm">{error}</div>
            )}

            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="w-8 h-8 border-4 border-brand-primary/30 border-t-brand-primary dark:border-brand-light/30 dark:border-t-brand-light rounded-full animate-spin mb-4"></div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Cargando usuarios...</p>
                    </div>
                ) : users.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-full mb-4">
                            <Users className="w-10 h-10 text-gray-400 dark:text-gray-500" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">Sin usuarios</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">No hay usuarios para mostrar. Crea el primero con "Nuevo Usuario".</p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                                <thead className="bg-gray-50 dark:bg-gray-800/50">
                                    <tr>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Usuario</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rol</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Departamento</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
                                        <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {users.map(user => {
                                        const propio = esPropio(user)
                                        const busy = loadingUserId === user.id
                                        return (
                                            <tr key={user.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center">
                                                        <div className="flex items-center justify-center w-9 h-9 rounded-full bg-brand-accent/10 dark:bg-brand-accent/20 text-brand-primary dark:text-brand-light font-bold text-sm mr-3 shrink-0">
                                                            {user.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-medium text-gray-900 dark:text-white flex items-center">
                                                                {user.name}
                                                                {user.role === 'admin' && <ShieldCheck className="w-4 h-4 ml-1.5 text-brand-primary dark:text-brand-light" aria-label="Administrador" />}
                                                            </p>
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <select
                                                        value={user.role}
                                                        disabled={busy || propio}
                                                        onChange={(e) => handleRoleChange(user, e.target.value)}
                                                        title={propio ? 'No puedes modificar tu propio rol' : undefined}
                                                        aria-label={`Cambiar rol de ${user.name}`}
                                                        className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-light outline-none transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <option value="employee">Empleado</option>
                                                        <option value="technician">Técnico</option>
                                                        <option value="admin">Administrador</option>
                                                    </select>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <select
                                                        value={user.department_id ?? ''}
                                                        disabled={busy}
                                                        onChange={(e) => aplicarCambio(
                                                            user,
                                                            { department_id: e.target.value === '' ? null : Number(e.target.value) },
                                                            `Departamento de ${user.name} actualizado`,
                                                        )}
                                                        aria-label={`Cambiar departamento de ${user.name}`}
                                                        className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-light outline-none transition-shadow disabled:opacity-50"
                                                    >
                                                        <option value="">Sin departamento</option>
                                                        {/* activos + el actual aunque esté dado de baja */}
                                                        {departamentos.filter(d => d.is_active || d.id === user.department_id).map(d => (
                                                            <option key={d.id} value={d.id}>{d.name}{d.is_active ? '' : ' (inactivo)'}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <button
                                                        onClick={() => handleToggleActive(user)}
                                                        disabled={busy || propio}
                                                        title={propio ? 'No puedes desactivar tu propia cuenta' : user.is_active ? 'Desactivar cuenta' : 'Activar cuenta'}
                                                        aria-label={`${user.is_active ? 'Desactivar' : 'Activar'} a ${user.name}`}
                                                        className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed "
                                                    >
                                                        <span className={`w-2 h-2 rounded-full mr-2 ${user.is_active ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                                        {user.is_active ? 'Activo' : 'Inactivo'}
                                                    </button>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex justify-end space-x-1">
                                                        <button
                                                            onClick={() => setEditUser(user)}
                                                            disabled={busy}
                                                            aria-label={`Editar a ${user.name}`}
                                                            title="Editar nombre y correo"
                                                            className="p-2 text-gray-400 hover:text-brand-primary dark:hover:text-brand-light transition-colors disabled:opacity-50"
                                                        >
                                                            <Pencil className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => setResetUser(user)}
                                                            disabled={busy}
                                                            aria-label={`Resetear contraseña de ${user.name}`}
                                                            title="Resetear contraseña"
                                                            className="p-2 text-gray-400 hover:text-brand-primary dark:hover:text-brand-light transition-colors disabled:opacity-50"
                                                        >
                                                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {users.length < total && (
                            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-center">
                                <button
                                    onClick={loadMore}
                                    disabled={loadingMore}
                                    className="px-5 py-2 text-sm font-medium text-brand-primary dark:text-brand-light border border-brand-primary/30 dark:border-brand-light/30 rounded-lg hover:bg-brand-primary/5 dark:hover:bg-brand-light/10 transition-colors disabled:opacity-50"
                                >
                                    {loadingMore ? <Loader2 className="w-4 h-4 animate-spin inline" /> : `Cargar más (${users.length} de ${total})`}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </>
    )
}

// Pestaña 2: todos los tickets (filtros + reasignación)
const TicketsTab = () => {
    const [tickets, setTickets] = useState([])
    const [total, setTotal] = useState(0)
    const [offset, setOffset] = useState(0)
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [priorityFilter, setPriorityFilter] = useState('')
    const [userMap, setUserMap] = useState({})
    const [candidateTechs, setCandidateTechs] = useState([])
    const [reassigningId, setReassigningId] = useState(null)
    // El hub de notificaciones incrementa refreshTrigger ante eventos del backend;
    // lo usamos para recargar la lista en vivo (como hace el Dashboard).
    const refreshTrigger = useUIStore(state => state.refreshTrigger)

    const buildParams = (limit, off) => {
        const params = { limit, offset: off }
        if (statusFilter) params.status = statusFilter
        if (priorityFilter) params.priority = priorityFilter
        return params
    }

    // Carga de usuarios (mapa de nombres + técnicos candidatos) y de tickets
    // oxlint-disable react/exhaustive-effect-dependencies -- cargas iniciales y refresco por filtro intencionales
    useEffect(() => {
        ;(async () => {
            try {
                const res = await api.get('/users/', { params: { limit: 200, offset: 0 } })
                const map = {}
                res.data.items.forEach(u => { map[u.id] = u })
                setUserMap(map)
                setCandidateTechs(res.data.items.filter(u => u.is_active && (u.role === 'technician' || u.role === 'admin')))
            } catch {
                // El mapa de nombres es opcional; no bloquea la lista de tickets
            }
        })()
    }, [])

    useEffect(() => {
        const controller = new AbortController()

        const cargar = async () => {
            setLoading(true)
            setError('')
            try {
                const res = await api.get('/tickets/', { params: buildParams(LIMIT, 0), signal: controller.signal })
                setTickets(res.data.items)
                setTotal(res.data.total)
                setOffset(res.data.items.length)
            } catch (err) {
                if (err.code === 'ERR_CANCELED') return
                setError('No se pudieron cargar los tickets.')
            } finally {
                setLoading(false)
            }
        }

        cargar()
        return () => controller.abort()
    }, [statusFilter, priorityFilter, refreshTrigger])
    // oxlint-enable react/exhaustive-effect-dependencies

    const loadMore = async () => {
        if (loadingMore) return
        setLoadingMore(true)
        try {
            const res = await api.get('/tickets/', { params: buildParams(LIMIT, offset) })
            setTickets(prev => [...prev, ...res.data.items])
            setTotal(res.data.total)
            setOffset(prev => prev + res.data.items.length)
        } catch {
            toast.error('No se pudieron cargar más tickets.')
        } finally {
            setLoadingMore(false)
        }
    }

    // Refresca la ventana actual tras una mutación (conserva lo visto)
    const refetchCurrent = async () => {
        const current = tickets.length
        if (current === 0) return
        try {
            const res = await api.get('/tickets/', { params: buildParams(current, 0) })
            setTickets(res.data.items)
            setTotal(res.data.total)
            setOffset(res.data.items.length)
        } catch {
            toast.error('Error al refrescar los tickets.')
        }
    }

    const handleReassign = async (ticketId, techId) => {
        setReassigningId(ticketId)
        try {
            await api.patch(`/tickets/${ticketId}`, { assigned_to: Number(techId) })
            toast.success('Ticket reasignado')
            await refetchCurrent()
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Error al reasignar el ticket')
        } finally {
            setReassigningId(null)
        }
    }

    const filterSelectClass = "px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-light outline-none transition-shadow"

    return (
        <>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">Todos los tickets</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Filtra por estado o prioridad y reasigna tickets</p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        aria-label="Filtrar por estado"
                        className={filterSelectClass}
                    >
                        <option value="">Todos los estados</option>
                        <option value="created">Nuevo</option>
                        <option value="assigned">Asignado</option>
                        <option value="in_process">En Proceso</option>
                        <option value="pending">Pendiente</option>
                        <option value="solved">Solucionado</option>
                        <option value="closed">Cerrado</option>
                    </select>
                    <select
                        value={priorityFilter}
                        onChange={(e) => setPriorityFilter(e.target.value)}
                        aria-label="Filtrar por prioridad"
                        className={filterSelectClass}
                    >
                        <option value="">Todas las prioridades</option>
                        <option value="low">Baja</option>
                        <option value="medium">Media</option>
                        <option value="high">Alta</option>
                    </select>
                </div>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-800 text-sm">{error}</div>
            )}

            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="w-8 h-8 border-4 border-brand-primary/30 border-t-brand-primary dark:border-brand-light/30 dark:border-t-brand-light rounded-full animate-spin mb-4"></div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Cargando tickets...</p>
                    </div>
                ) : tickets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-full mb-4">
                            <LayoutGrid className="w-10 h-10 text-gray-400 dark:text-gray-500" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">Sin tickets</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">No hay tickets que coincidan con los filtros seleccionados.</p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                                <thead className="bg-gray-50 dark:bg-gray-800/50">
                                    <tr>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ticket</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Prioridad</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Creador</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Asignado</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Antigüedad (hábil)</th>
                                        <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Asignar a</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {tickets.map(t => {
                                        const cerrado = ['solved', 'closed'].includes(t.status)
                                        return (
                                            <tr key={t.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                                                <td className="px-6 py-4 min-w-0">
                                                    <Link to={`/ticket/${t.id}`} className="text-sm font-semibold text-brand-primary dark:text-brand-light hover:underline">
                                                        #{t.id}
                                                    </Link>
                                                    <p className="text-sm text-gray-900 dark:text-white truncate max-w-[220px]">{t.title}</p>
                                                    {['in_process', 'pending'].includes(t.status) && t.assigned_to == null && (
                                                        <span className="inline-flex items-center mt-1 px-2 py-0.5 text-[10px] font-bold uppercase rounded border border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50">
                                                            Ya iniciado · sin asignar
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4"><PriorityBadge priority={t.priority} /></td>
                                                <td className="px-6 py-4"><StatusBadge status={t.status} /></td>
                                                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{userMap[t.created_by]?.name || `#${t.created_by}`}</td>
                                                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{userMap[t.assigned_to]?.name || '—'}</td>
                                                <td className="px-6 py-4 text-sm"><span className={ageTone(t.priority, businessAgeHours(t))}>{formatAge(businessAgeHours(t))}</span></td>
                                                <td className="px-6 py-4">
                                                    <div className="flex justify-end">
                                                        <select
                                                            value={t.assigned_to ?? ''}
                                                            disabled={reassigningId === t.id || cerrado}
                                                            onChange={(e) => handleReassign(t.id, e.target.value)}
                                                            title={cerrado ? 'No se puede reasignar un ticket cerrado' : `Reasignar ticket #${t.id}`}
                                                            aria-label={`Reasignar ticket #${t.id}`}
                                                            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-light outline-none transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            <option value="" disabled>Sin asignar</option>
                                                            {candidateTechs.map(u => (
                                                                <option key={u.id} value={u.id}>{u.name}</option>
                                                            ))}
                                                            {t.assigned_to && userMap[t.assigned_to] && candidateTechs.every(u => u.id !== t.assigned_to) && (
                                                                <option value={t.assigned_to}>{userMap[t.assigned_to].name} (inactivo)</option>
                                                            )}
                                                        </select>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {tickets.length < total && (
                            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-center">
                                <button
                                    onClick={loadMore}
                                    disabled={loadingMore}
                                    className="px-5 py-2 text-sm font-medium text-brand-primary dark:text-brand-light border border-brand-primary/30 dark:border-brand-light/30 rounded-lg hover:bg-brand-primary/5 dark:hover:bg-brand-light/10 transition-colors disabled:opacity-50"
                                >
                                    {loadingMore ? <Loader2 className="w-4 h-4 animate-spin inline" /> : `Cargar más (${tickets.length} de ${total})`}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </>
    )
}

// Pestaña 3: rendimiento y tiempo de vida de los tickets
const PerformanceTab = () => {
    const [metrics, setMetrics] = useState(null)
    const [tickets, setTickets] = useState([])
    const [userMap, setUserMap] = useState({})
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    // Carga inicial (una sola vez al montar)
    // oxlint-disable react/exhaustive-effect-dependencies -- la carga inicial es intencional
    useEffect(() => {
        const controller = new AbortController()

        const cargar = async () => {
            try {
                const [metricsRes, ticketsRes, usersRes] = await Promise.all([
                    api.get('/metrics/', { signal: controller.signal }),
                    api.get('/tickets/', { params: { limit: 200, offset: 0 }, signal: controller.signal }),
                    api.get('/users/', { params: { limit: 200, offset: 0 }, signal: controller.signal }),
                ])
                setMetrics(metricsRes.data)
                setTickets(ticketsRes.data.items)
                const map = {}
                usersRes.data.items.forEach(u => { map[u.id] = u })
                setUserMap(map)
            } catch (err) {
                if (err.code === 'ERR_CANCELED') return
                console.error('Error al cargar métricas:', err)
                setError('No se pudieron cargar las métricas.')
            } finally {
                setLoading(false)
            }
        }

        cargar()
        return () => controller.abort()
    }, [])
    // oxlint-enable react/exhaustive-effect-dependencies

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <div className="w-8 h-8 border-4 border-brand-primary/30 border-t-brand-primary dark:border-brand-light/30 dark:border-t-brand-light rounded-full animate-spin mb-4"></div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Cargando rendimiento...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="p-4 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-800 text-sm">{error}</div>
        )
    }

    const activeStatuses = ['created', 'assigned', 'in_process', 'pending']
    const openTickets = tickets
        .filter(t => activeStatuses.includes(t.status))
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    const maxAge = openTickets.length ? Math.max(...openTickets.map(t => businessAgeHours(t))) : 0

    const ticketsByStatus = metrics?.tickets_by_status || {}
    const activeCount = (ticketsByStatus.created || 0) + (ticketsByStatus.assigned || 0) + (ticketsByStatus.in_process || 0) + (ticketsByStatus.pending || 0)

    const resolvedByTech = metrics?.resolved_by_technician || {}
    const avgByTech = metrics?.avg_resolution_by_technician || {}
    const avgByTechBusiness = metrics?.avg_resolution_by_technician_business || {}
    const techNames = new Set([...Object.keys(resolvedByTech), ...Object.keys(avgByTech), ...Object.keys(avgByTechBusiness)])
    const techRows = [...techNames]
        .map(name => ({
            name,
            resolved: resolvedByTech[name] || 0,
            avgHours: avgByTechBusiness[name] !== undefined
                ? avgByTechBusiness[name]
                : (avgByTech[name] !== undefined ? avgByTech[name] : null),
            calendarHours: avgByTech[name] !== undefined ? avgByTech[name] : null,
        }))
        .sort((a, b) => (b.avgHours ?? 0) - (a.avgHours ?? 0))

    const avgResolutionBusiness = metrics?.average_resolution_business_hours
    const avgResolutionCalendar = metrics?.average_resolution_time_hours

    return (
        <>
            <div className="mb-6">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Rendimiento y tiempo de vida</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Mide la eficiencia: antigüedad de tickets activos y tiempos de resolución</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-5">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Prom. resolución (hábil)</p>
                        <Clock className="w-5 h-5 text-brand-primary dark:text-brand-light" />
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{avgResolutionBusiness != null ? `${avgResolutionBusiness} h` : '—'}</p>
                    {avgResolutionCalendar != null && avgResolutionCalendar !== avgResolutionBusiness && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{avgResolutionCalendar} h calendario</p>
                    )}
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-5">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Tickets activos</p>
                        <Inbox className="w-5 h-5 text-brand-primary dark:text-brand-light" />
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{activeCount}</p>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-5">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Antigüedad máxima (hábil)</p>
                        <Hourglass className="w-5 h-5 text-brand-primary dark:text-brand-light" />
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{openTickets.length ? formatAge(maxAge) : '—'}</p>
                </div>
            </div>

            <div className="mb-6 p-4 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Semáforo de antigüedad (tickets activos) por prioridad:</p>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-gray-600 dark:text-gray-400">
                    <span className="inline-flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-green-500 mr-1.5"></span>OK: dentro del umbral</span>
                    <span className="inline-flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 mr-1.5"></span>Atención: pasó la mitad del umbral</span>
                    <span className="inline-flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-red-500 mr-1.5"></span>Crítico: superó el umbral</span>
                    <span className="inline-flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-gray-300 dark:bg-gray-600 mr-1.5"></span>Umbrales (hábiles): alta 20 h · media 30 h · baja 48 h</span>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden mb-6">
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">Tickets activos por antigüedad</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">De mayor a menor antigüedad: los más viejos primero</p>
                </div>
                {openTickets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-full mb-4">
                            <Hourglass className="w-10 h-10 text-gray-400 dark:text-gray-500" />
                        </div>
                        <h4 className="text-base font-medium text-gray-900 dark:text-white mb-1">Sin tickets activos</h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">No hay tickets abiertos en este momento. ¡Buen trabajo!</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                            <thead className="bg-gray-50 dark:bg-gray-800/50">
                                <tr>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ticket</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Prioridad</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Asignado</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Antigüedad (hábil)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {openTickets.map(t => (
                                    <tr key={t.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                                        <td className="px-6 py-4 min-w-0">
                                            <Link to={`/ticket/${t.id}`} className="text-sm font-semibold text-brand-primary dark:text-brand-light hover:underline">
                                                #{t.id}
                                            </Link>
                                            <p className="text-sm text-gray-900 dark:text-white truncate max-w-[220px]">{t.title}</p>
                                        </td>
                                        <td className="px-6 py-4"><PriorityBadge priority={t.priority} /></td>
                                        <td className="px-6 py-4"><StatusBadge status={t.status} /></td>
                                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{userMap[t.assigned_to]?.name || 'Sin asignar'}</td>
                                        <td className="px-6 py-4 text-sm">
                                            <span className={ageTone(t.priority, businessAgeHours(t))}>{formatAge(businessAgeHours(t))}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">Rendimiento por técnico</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Tickets resueltos y promedio de horas hábiles hasta la resolución</p>
                </div>
                {techRows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-full mb-4">
                            <Users className="w-10 h-10 text-gray-400 dark:text-gray-500" />
                        </div>
                        <h4 className="text-base font-medium text-gray-900 dark:text-white mb-1">Sin datos de resolución</h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">Aún no hay tickets resueltos para calcular el rendimiento.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                            <thead className="bg-gray-50 dark:bg-gray-800/50">
                                <tr>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Técnico</th>
                                    <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Resueltos</th>
                                    <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Prom. hábil</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {techRows.map(tech => (
                                    <tr key={tech.name} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center">
                                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-brand-accent/10 dark:bg-brand-accent/20 text-brand-primary dark:text-brand-light font-bold text-xs mr-3 shrink-0">
                                                    {tech.name.charAt(0).toUpperCase()}
                                                </div>
                                                <span className="text-sm font-medium text-gray-900 dark:text-white">{tech.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right text-sm text-gray-600 dark:text-gray-400">{tech.resolved}</td>
                                        <td className="px-6 py-4 text-right">
                                            <p className="text-sm font-medium text-gray-900 dark:text-white">{tech.avgHours != null ? `${tech.avgHours} h` : '—'}</p>
                                            {tech.calendarHours != null && tech.calendarHours !== tech.avgHours && (
                                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{tech.calendarHours} h calendario</p>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </>
    )
}

// Pestaña 4: auditoría. Tickets = listado que abre el detalle (chat + historial);
// Usuarios = registro de acciones sobre cuentas.
const USER_ACTION_LABELS = { created: 'Alta', role: 'Rol', is_active: 'Estado', name: 'Nombre', email: 'Correo', password: 'Contraseña reseteada' }
const userName = (id, userMap) => (id == null ? '—' : userMap[id]?.name || `#${id}`)
const userAuditValue = (v) => (v == null ? null : ROLE_LABELS[v] || { True: 'Activo', False: 'Inactivo' }[v] || v)

const AuditTab = () => {
    const navigate = useNavigate()
    const [kind, setKind] = useState('tickets')
    const [items, setItems] = useState([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState('')
    const [userMap, setUserMap] = useState({})

    useEffect(() => {
        ;(async () => {
            try {
                const res = await api.get('/users/', { params: { limit: 200, offset: 0 } })
                const map = {}
                res.data.items.forEach(u => { map[u.id] = u })
                setUserMap(map)
            } catch {
                // Sin mapa se muestran los ids; no bloquea la auditoría
            }
        })()
    }, [])

    useEffect(() => {
        const controller = new AbortController()
        ;(async () => {
            setLoading(true)
            setError('')
            try {
                // GET /tickets/ ignora el parámetro kind; /audit/ lo usa
                const res = await api.get(kind === 'tickets' ? '/tickets/' : '/audit/', { params: { kind, limit: LIMIT, offset: 0 }, signal: controller.signal })
                setItems(res.data.items)
                setTotal(res.data.total)
            } catch (err) {
                if (err.code === 'ERR_CANCELED') return
                setError('No se pudo cargar la auditoría.')
            } finally {
                setLoading(false)
            }
        })()
        return () => controller.abort()
    }, [kind])

    const loadMore = async () => {
        if (loadingMore) return
        setLoadingMore(true)
        try {
            const res = await api.get(kind === 'tickets' ? '/tickets/' : '/audit/', { params: { kind, limit: LIMIT, offset: items.length } })
            setItems(prev => [...prev, ...res.data.items])
            setTotal(res.data.total)
        } catch {
            toast.error('No se pudieron cargar más registros.')
        } finally {
            setLoadingMore(false)
        }
    }

    const th = "px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"

    return (
        <>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">Auditoría</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {kind === 'tickets' ? 'Abre un ticket para ver su chat e historial completo' : 'Quién cambió qué y cuándo en las cuentas'}
                    </p>
                </div>
                <select
                    value={kind}
                    onChange={(e) => { setItems([]); setLoading(true); setKind(e.target.value) }}
                    aria-label="Tipo de registro"
                    className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-light outline-none transition-shadow"
                >
                    <option value="tickets">Tickets</option>
                    <option value="users">Usuarios</option>
                </select>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-800 text-sm">{error}</div>
            )}

            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="w-8 h-8 border-4 border-brand-primary/30 border-t-brand-primary dark:border-brand-light/30 dark:border-t-brand-light rounded-full animate-spin mb-4"></div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Cargando auditoría...</p>
                    </div>
                ) : items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-full mb-4">
                            <History className="w-10 h-10 text-gray-400 dark:text-gray-500" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">Sin registros</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">Todavía no hay registros de este tipo.</p>
                    </div>
                ) : kind === 'tickets' ? (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                            <thead className="bg-gray-50 dark:bg-gray-800/50">
                                <tr>
                                    <th scope="col" className={th}>Ticket</th>
                                    <th scope="col" className={th}>Estado</th>
                                    <th scope="col" className={th}>Creador</th>
                                    <th scope="col" className={th}>Asignado</th>
                                    <th scope="col" className={th}>Creado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {items.map(t => (
                                    <tr key={t.id} onClick={() => navigate(`/ticket/${t.id}`)} className="cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                                        <td className="px-6 py-4 min-w-0">
                                            {/* Link además del click de fila: accesible con teclado */}
                                            <Link to={`/ticket/${t.id}`} onClick={(ev) => ev.stopPropagation()} className="text-sm font-semibold text-brand-primary dark:text-brand-light hover:underline">#{t.id}</Link>
                                            <p className="text-sm text-gray-900 dark:text-white truncate max-w-[260px]">{t.title}</p>
                                        </td>
                                        <td className="px-6 py-4"><StatusBadge status={t.status} /></td>
                                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{userName(t.created_by, userMap)}</td>
                                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{userName(t.assigned_to, userMap)}</td>
                                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{new Date(`${t.created_at}Z`).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                                <thead className="bg-gray-50 dark:bg-gray-800/50">
                                    <tr>
                                        <th scope="col" className={th}>Fecha</th>
                                        <th scope="col" className={th}>Hecho por</th>
                                        <th scope="col" className={th}>Usuario</th>
                                        <th scope="col" className={th}>Acción</th>
                                        <th scope="col" className={th}>Cambio</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {items.map(e => {
                                        const antes = userAuditValue(e.old_value)
                                        const despues = userAuditValue(e.new_value)
                                        return (
                                            <tr key={e.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                                                {/* Timestamps naive del backend = UTC */}
                                                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{new Date(`${e.timestamp}Z`).toLocaleString()}</td>
                                                <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{e.changed_by == null ? 'Sistema' : userName(e.changed_by, userMap)}</td>
                                                <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{userName(e.target_id, userMap)}</td>
                                                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{USER_ACTION_LABELS[e.action] || e.action}</td>
                                                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                                                    {antes && despues ? `${antes} → ${despues}` : despues || '—'}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                )}

                {!loading && items.length < total && (
                    <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-center">
                        <button
                            onClick={loadMore}
                            disabled={loadingMore}
                            className="px-5 py-2 text-sm font-medium text-brand-primary dark:text-brand-light border border-brand-primary/30 dark:border-brand-light/30 rounded-lg hover:bg-brand-primary/5 dark:hover:bg-brand-light/10 transition-colors disabled:opacity-50"
                        >
                            {loadingMore ? <Loader2 className="w-4 h-4 animate-spin inline" /> : `Cargar más (${items.length} de ${total})`}
                        </button>
                    </div>
                )}
            </div>
        </>
    )
}

// Pestaña 5: catálogos (departamentos y categorías). No se borran: se desactivan,
// porque tickets y artículos viejos los siguen citando.
const CatalogSection = ({ title, description, path, idOf }) => {
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [nuevo, setNuevo] = useState('')
    const [editando, setEditando] = useState(null) // { id, name }
    const [busy, setBusy] = useState(false)

    const cargar = async () => {
        try {
            const res = await api.get(path)
            setItems(res.data)
        } catch {
            toast.error(`No se pudo cargar: ${title.toLowerCase()}`)
        } finally {
            setLoading(false)
        }
    }

    // oxlint-disable react/exhaustive-effect-dependencies -- carga inicial intencional
    useEffect(() => { cargar() }, [])
    // oxlint-enable react/exhaustive-effect-dependencies

    // Toda mutación: invalida la caché de api.js (alta de tickets, biblioteca...) y recarga
    const mutar = async (peticion, exito) => {
        setBusy(true)
        try {
            await peticion()
            invalidateCatalog(path)
            toast.success(exito)
            setEditando(null)
            await cargar()
            return true
        } catch (err) {
            toast.error(err.response?.data?.detail || 'No se pudo guardar')
            return false
        } finally {
            setBusy(false)
        }
    }

    const crear = async (e) => {
        e.preventDefault()
        if (await mutar(() => api.post(path, { name: nuevo }), 'Agregado')) setNuevo('')
    }

    const inputClass = "px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-light outline-none"

    return (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
            <h3 className="text-base font-bold text-gray-900 dark:text-white">{title}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{description}</p>

            <form onSubmit={crear} className="flex gap-2 mb-4">
                <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} aria-label={`Nuevo en ${title}`} placeholder="Nombre" className={`flex-1 ${inputClass}`} />
                <button type="submit" disabled={busy || !nuevo.trim()} className="px-4 py-1.5 text-sm font-medium text-white bg-brand-primary hover:bg-brand-dark rounded-lg transition-colors disabled:opacity-50">
                    Agregar
                </button>
            </form>

            {loading ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Cargando...</p>
            ) : items.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Sin registros todavía.</p>
            ) : (
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                    {items.map(item => {
                        const id = idOf(item)
                        const enEdicion = editando?.id === id
                        return (
                            <li key={id} className="flex items-center gap-2 py-2">
                                {enEdicion ? (
                                    <form
                                        className="flex flex-1 gap-2"
                                        onSubmit={(e) => { e.preventDefault(); mutar(() => api.patch(`${path}${id}`, { name: editando.name }), 'Renombrado') }}
                                    >
                                        <input autoFocus value={editando.name} onChange={(e) => setEditando({ id, name: e.target.value })} aria-label={`Nuevo nombre de ${item.name}`} className={`flex-1 ${inputClass}`} />
                                        <button type="submit" disabled={busy} className="p-1.5 text-brand-primary dark:text-brand-light" aria-label="Guardar nombre"><CheckCircle2 className="w-4 h-4" /></button>
                                        <button type="button" onClick={() => setEditando(null)} className="p-1.5 text-gray-400" aria-label="Cancelar edición"><X className="w-4 h-4" /></button>
                                    </form>
                                ) : (
                                    <>
                                        <span className={`flex-1 text-sm ${item.is_active ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500 line-through'}`}>{item.name}</span>
                                        <button onClick={() => setEditando({ id, name: item.name })} disabled={busy} aria-label={`Renombrar ${item.name}`} className="p-1.5 text-gray-400 hover:text-brand-primary dark:hover:text-brand-light transition-colors">
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => mutar(() => api.patch(`${path}${id}`, { is_active: !item.is_active }), item.is_active ? 'Desactivado' : 'Activado')}
                                            disabled={busy}
                                            aria-label={`${item.is_active ? 'Desactivar' : 'Activar'} ${item.name}`}
                                            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                                        >
                                            <span className={`w-2 h-2 rounded-full mr-1.5 ${item.is_active ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                            {item.is_active ? 'Activo' : 'Inactivo'}
                                        </button>
                                    </>
                                )}
                            </li>
                        )
                    })}
                </ul>
            )}
        </div>
    )
}

const CatalogsTab = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CatalogSection title="Departamentos" description="Se asignan a los usuarios; el ticket guarda el del solicitante al crearse." path="/departments/" idOf={d => d.id} />
        <CatalogSection title="Categorías" description="Clasifican tickets y artículos de la biblioteca." path="/categories/" idOf={c => c.key} />
        <CatalogSection title="Tipos de activo" description="Clasifican el inventario de la sección Activos." path="/asset-types/" idOf={t => t.key} />
        <CatalogSection title="Sistemas de acceso" description="Sistemas que se pueden pedir en una solicitud de acceso." path="/access-systems/" idOf={s => s.key} />
    </div>
)

// --- Página con pestañas ---

const TABS = [
    { id: 'users', label: 'Usuarios', icon: Users },
    { id: 'tickets', label: 'Tickets', icon: LayoutGrid },
    { id: 'performance', label: 'Rendimiento', icon: TrendingUp },
    { id: 'audit', label: 'Auditoría', icon: History },
    { id: 'catalogs', label: 'Catálogos', icon: Tags },
]

export default function AdminPanel() {
    const [activeTab, setActiveTab] = useState('users')

    return (
        <Layout>
            <div className="flex items-center mb-6">
                <div className="p-3 rounded-lg bg-brand-primary/10 dark:bg-brand-primary/20 mr-4">
                    <ShieldCheck className="h-8 w-8 text-brand-primary dark:text-brand-light" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Administración</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Usuarios, tickets, rendimiento, auditoría y catálogos</p>
                </div>
            </div>

            <div className="flex gap-1 mb-6 border-b border-gray-100 dark:border-gray-800">
                {TABS.map(tab => {
                    const Icon = tab.icon
                    const active = activeTab === tab.id
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            aria-current={active ? 'page' : undefined}
                            className={`inline-flex items-center px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px rounded-t-lg ${active
                                ? 'text-brand-primary dark:text-brand-light border-brand-primary dark:border-brand-light'
                                : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-200 dark:hover:border-gray-700'}`}
                        >
                            <Icon className="w-4 h-4 mr-2" /> {tab.label}
                        </button>
                    )
                })}
            </div>

            {activeTab === 'users' && <UsersTab />}
            {activeTab === 'tickets' && <TicketsTab />}
            {activeTab === 'performance' && <PerformanceTab />}
            {activeTab === 'audit' && <AuditTab />}
            {activeTab === 'catalogs' && <CatalogsTab />}
        </Layout>
    )
}