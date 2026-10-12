import { useEffect, useState } from 'react'
import { api } from '../api'
import Layout from '../components/Layout'
import { useAuthStore } from '../store/authStore'
import { toast } from 'react-hot-toast'
import { Users, UserPlus, Loader2, KeyRound, X, ShieldCheck } from 'lucide-react'

const LIMIT = 50

const ROLE_LABELS = { employee: 'Empleado', technician: 'Técnico', admin: 'Admin' }

// --- Modales como componentes de módulo (no se redefinen por render) ---

// Modal "Nuevo usuario"
const CreateUserModal = ({ open, onClose, onCreated }) => {
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [role, setRole] = useState('employee')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    if (!open) return null

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')
        try {
            await api.post('/users/', { name, email, password, role })
            setName('')
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
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-primary dark:bg-gray-800 dark:text-white outline-none transition-shadow"
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
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-primary dark:bg-gray-800 dark:text-white outline-none transition-shadow"
                            placeholder="usuario@helpdesk-mock.com"
                        />
                    </div>

                    <div>
                        <label htmlFor="user-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contraseña</label>
                        <input
                            id="user-password"
                            type="password"
                            required
                            minLength={6}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-primary dark:bg-gray-800 dark:text-white outline-none transition-shadow"
                            placeholder="Mínimo 6 caracteres"
                        />
                    </div>

                    <div>
                        <label htmlFor="user-role" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rol</label>
                        <select
                            id="user-role"
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-primary dark:bg-gray-800 dark:text-white outline-none transition-shadow"
                        >
                            <option value="employee">Empleado</option>
                            <option value="technician">Técnico</option>
                            <option value="admin">Administrador</option>
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
                            <input
                                id="reset-old-password"
                                type="password"
                                required
                                value={oldPassword}
                                onChange={(e) => setOldPassword(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-primary dark:bg-gray-800 dark:text-white outline-none transition-shadow"
                            />
                        </div>
                    )}

                    <div>
                        <label htmlFor="reset-new-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nueva contraseña</label>
                        <input
                            id="reset-new-password"
                            type="password"
                            required
                            minLength={6}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-primary dark:bg-gray-800 dark:text-white outline-none transition-shadow"
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

export default function AdminPanel() {
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
            setOffset(prev => prev + LIMIT)
        } catch {
            toast.error('No se pudieron cargar más usuarios.')
        } finally {
            setLoadingMore(false)
        }
    }

    // Refresca la lista tras una mutación conservando lo visto (extra: +1 para un alta nueva)
    const reload = async (extra = 1) => {
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

    const handleRoleChange = async (user, newRole) => {
        setLoadingUserId(user.id)
        try {
            await api.patch(`/users/${user.id}`, { role: newRole })
            toast.success(`Rol de ${user.name} actualizado a ${ROLE_LABELS[newRole]}`)
            await reload()
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Error al cambiar el rol')
        } finally {
            setLoadingUserId(null)
        }
    }

    const handleToggleActive = async (user) => {
        setLoadingUserId(user.id)
        try {
            await api.patch(`/users/${user.id}`, { is_active: !user.is_active })
            toast.success(user.is_active ? `${user.name} fue desactivado` : `${user.name} fue activado`)
            await reload()
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Error al cambiar el estado')
        } finally {
            setLoadingUserId(null)
        }
    }

    const esPropio = (user) => user.email === email

    return (
        <Layout>
            <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => reload(1)} />
            <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} onUpdated={() => reload(0)} />

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div className="flex items-center">
                    <div className="p-3 rounded-lg bg-brand-primary/10 dark:bg-brand-primary/20 mr-4">
                        <Users className="h-8 w-8 text-brand-primary dark:text-brand-light" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Administración</h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Gestión de usuarios del sistema</p>
                    </div>
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
                        <div className="w-8 h-8 border-4 border-brand-primary/30 border-t-brand-primary rounded-full animate-spin mb-4"></div>
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
                                                        className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <option value="employee">Empleado</option>
                                                        <option value="technician">Técnico</option>
                                                        <option value="admin">Administrador</option>
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
                                                    <div className="flex justify-end">
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
        </Layout>
    )
}