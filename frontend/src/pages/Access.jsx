import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, fetchCatalog } from '../api'
import Layout from '../components/Layout'
import { useAuthStore, decodeToken } from '../store/authStore'
import { useUIStore } from '../store/uiStore'
import { toast } from 'react-hot-toast'
import { ArrowLeft, KeyRound, Loader2, Plus, Send, X } from 'lucide-react'

// Solicitudes de acceso (RF-05, CA-04), separadas de los tickets: /accesos y /accesos/:id.
// El empleado ve y crea las suyas; I&T ve todas y registra decisión, habilitación y revocación.

const STATES = { pending: 'Pendiente de aprobación', approved: 'Aprobada', enabled: 'Habilitada', rejected: 'Rechazada', revoked: 'Revocada' }
const STATE_STYLES = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50',
    rejected: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/50',
    approved: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50',
    enabled: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800/50',
    revoked: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
}
const EVENT_TEXT = { created: 'Creó la solicitud', decision: 'Registró la decisión', enabled: 'Habilitó el acceso', revoked: 'Revocó el acceso' }

const inputClass = "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-light outline-none"
const btnPrimary = "inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-brand-primary hover:bg-brand-dark rounded-lg transition-colors disabled:opacity-50"
// Timestamps naive del backend = UTC
const fecha = (ts) => new Date(`${ts}Z`).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const StateBadge = ({ state }) => (
    <span className={`inline-flex px-2.5 py-0.5 text-xs font-semibold rounded-full border ${STATE_STYLES[state]}`}>{STATES[state] || state}</span>
)

// Nombres: I&T usa el directorio; el empleado solo ve sus solicitudes, así que el resto es "I&T"
const useLookups = () => {
    const role = useAuthStore(state => state.role)
    const myId = Number(decodeToken(useAuthStore(state => state.token))?.sub)
    const isTech = role !== 'employee'
    const [lk, setLk] = useState({ sistemas: [], personas: [] })
    useEffect(() => {
        Promise.all([fetchCatalog('/access-systems/'), isTech ? fetchCatalog('/users/directory/') : []])
            .then(([sistemas, personas]) => setLk({ sistemas, personas }))
            .catch(() => {})
    }, [isTech])
    return {
        ...lk, isTech, myId,
        sistema: (key) => lk.sistemas.find(s => s.key === key)?.name || key,
        persona: (id) => (id === myId ? 'Tú' : isTech ? lk.personas.find(p => p.id === id)?.name || `#${id}` : 'I&T'),
    }
}

const NewAccessModal = ({ sistemas, onClose, onCreated }) => {
    const [system, setSystem] = useState('')
    const [justification, setJustification] = useState('')
    const [saving, setSaving] = useState(false)

    const submit = async (e) => {
        e.preventDefault()
        setSaving(true)
        try {
            const res = await api.post('/access-requests/', { system, justification })
            toast.success('Solicitud enviada')
            onCreated(res.data)
        } catch (err) {
            toast.error(err.response?.data?.detail || 'No se pudo enviar la solicitud')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg border border-gray-100 dark:border-gray-800">
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">Nueva solicitud de acceso</h2>
                    <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"><X className="w-5 h-5" /></button>
                </div>
                <form onSubmit={submit} className="px-6 py-5 space-y-4">
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800/50 rounded-lg p-2.5">
                        Nunca escribas contraseñas en la solicitud ni en los comentarios: I&T te las entregará por un canal seguro.
                    </p>
                    <div>
                        <label htmlFor="acc-system" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sistema</label>
                        <select id="acc-system" required value={system} onChange={(e) => setSystem(e.target.value)} className={inputClass}>
                            <option value="" disabled>Elige el sistema...</option>
                            {sistemas.filter(s => s.is_active).map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="acc-just" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Justificación</label>
                        <textarea id="acc-just" required rows={3} value={justification} onChange={(e) => setJustification(e.target.value)} className={`${inputClass} resize-none`} placeholder="¿Para qué necesitas el acceso?" />
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Cancelar</button>
                        <button type="submit" disabled={saving || !system || !justification.trim()} className={btnPrimary}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar solicitud'}</button>
                    </div>
                </form>
            </div>
        </div>
    )
}

const FILTROS = { '': 'Todas', pending: 'Pendientes', approved: 'Aprobadas', enabled: 'Habilitadas', rejected: 'Rechazadas', revoked: 'Revocadas' }

// --- /accesos ---
export default function Access() {
    const navigate = useNavigate()
    const lk = useLookups()
    const refreshTrigger = useUIStore(state => state.refreshTrigger)
    const [estado, setEstado] = useState('')
    const [sistema, setSistema] = useState('')
    const [items, setItems] = useState([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [creando, setCreando] = useState(false)

    const params = (offset) => ({ ...(estado && { state: estado }), ...(sistema && { system: sistema }), limit: 50, offset })

    // oxlint-disable react/exhaustive-effect-dependencies -- params se arma con estado/sistema
    useEffect(() => {
        const controller = new AbortController()
        api.get('/access-requests/', { params: params(0), signal: controller.signal })
            .then(res => { setItems(res.data.items); setTotal(res.data.total) })
            .catch(err => { if (err.code !== 'ERR_CANCELED') toast.error('No se pudieron cargar las solicitudes') })
            .finally(() => setLoading(false))
        return () => controller.abort()
    }, [estado, sistema, refreshTrigger])
    // oxlint-enable react/exhaustive-effect-dependencies

    const loadMore = async () => {
        const res = await api.get('/access-requests/', { params: params(items.length) })
        setItems(prev => [...prev, ...res.data.items])
        setTotal(res.data.total)
    }

    const th = "px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"

    return (
        <Layout>
            {creando && <NewAccessModal sistemas={lk.sistemas} onClose={() => setCreando(false)} onCreated={(a) => navigate(`/accesos/${a.id}`)} />}

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div className="flex items-center">
                    <div className="p-3 rounded-lg bg-brand-primary/10 dark:bg-brand-primary/20 mr-4">
                        <KeyRound className="h-8 w-8 text-brand-primary dark:text-brand-light" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Accesos</h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{lk.isTech ? 'Solicitudes de acceso a sistemas: aprobación, habilitación y revocación' : 'Pide acceso a un sistema y sigue su estado'}</p>
                    </div>
                </div>
                <button onClick={() => setCreando(true)} className={btnPrimary}><Plus className="w-4 h-4 mr-2" /> Nueva solicitud</button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                <div className="flex flex-wrap gap-2 flex-1" role="group" aria-label="Filtrar por estado">
                    {Object.entries(FILTROS).map(([k, v]) => (
                        <button
                            key={k}
                            onClick={() => setEstado(k)}
                            aria-pressed={estado === k}
                            className={`px-3 py-1.5 text-sm font-medium rounded-full border transition-colors ${estado === k ? 'border-brand-primary bg-brand-primary/10 text-brand-primary dark:border-brand-light dark:text-brand-light' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                        >
                            {v}
                        </button>
                    ))}
                </div>
                <select value={sistema} onChange={(e) => setSistema(e.target.value)} aria-label="Filtrar por sistema" className={`${inputClass} sm:w-52`}>
                    <option value="">Todos los sistemas</option>
                    {lk.sistemas.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
                </select>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                {loading ? (
                    <p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">Cargando solicitudes...</p>
                ) : items.length === 0 ? (
                    <div className="py-16 px-4 text-center">
                        <KeyRound className="w-10 h-10 mx-auto mb-3 text-gray-400 dark:text-gray-500" />
                        <p className="text-sm text-gray-500 dark:text-gray-400">No hay solicitudes en esta vista.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                            <thead className="bg-gray-50 dark:bg-gray-800/50">
                                <tr>
                                    <th scope="col" className={th}>Solicitud</th>
                                    {lk.isTech && <th scope="col" className={th}>Solicitante</th>}
                                    <th scope="col" className={th}>Estado</th>
                                    <th scope="col" className={th}>Fecha</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {items.map(a => (
                                    <tr key={a.id} onClick={() => navigate(`/accesos/${a.id}`)} className="cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                                        <td className="px-6 py-4 text-sm">
                                            {/* Link además del click de fila: accesible con teclado */}
                                            <Link to={`/accesos/${a.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-brand-primary dark:text-brand-light hover:underline">{lk.sistema(a.system)}</Link>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[260px]">#{a.id} · {a.justification}</p>
                                        </td>
                                        {lk.isTech && <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">{lk.persona(a.requested_by)}</td>}
                                        <td className="px-6 py-4"><StateBadge state={a.state} /></td>
                                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{fecha(a.created_at)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {!loading && items.length < total && (
                    <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-center">
                        <button onClick={loadMore} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">Cargar más ({items.length} de {total})</button>
                    </div>
                )}
            </div>
        </Layout>
    )
}

// --- /accesos/:id ---
export function AccessDetail() {
    const { id } = useParams()
    const navigate = useNavigate()
    const lk = useLookups()
    const refreshTrigger = useUIStore(state => state.refreshTrigger)
    const [acceso, setAcceso] = useState(null)
    const [loading, setLoading] = useState(true)
    const [decision, setDecision] = useState('approved')
    const [aprobador, setAprobador] = useState('')
    const [nota, setNota] = useState('')        // comentario de decisión/habilitación/motivo de revocación
    const [comentario, setComentario] = useState('')  // hilo de conversación
    const [busy, setBusy] = useState(false)

    // oxlint-disable react/exhaustive-effect-dependencies -- recarga al cambiar de solicitud o al llegar un aviso
    useEffect(() => {
        const controller = new AbortController()
        api.get(`/access-requests/${id}`, { signal: controller.signal })
            .then(res => setAcceso(res.data))
            .catch(err => { if (err.code !== 'ERR_CANCELED') setAcceso(null) })
            .finally(() => setLoading(false))
        return () => controller.abort()
    }, [id, refreshTrigger])
    // oxlint-enable react/exhaustive-effect-dependencies

    // Cada paso devuelve la solicitud completa (con el hilo): se pinta tal cual
    const paso = async (ruta, body, exito) => {
        setBusy(true)
        try {
            const res = await api.post(`/access-requests/${id}/${ruta}`, body)
            setAcceso(res.data)
            toast.success(exito)
            setNota('')
            setComentario('')
            setAprobador('')
        } catch (err) {
            toast.error(err.response?.data?.detail || 'No se pudo registrar')
        } finally {
            setBusy(false)
        }
    }

    if (loading) return <Layout><p className="text-center py-12 text-gray-500 dark:text-gray-400">Cargando solicitud...</p></Layout>
    if (!acceso) return <Layout><p className="text-center py-12 text-red-500">Solicitud no encontrada</p></Layout>

    const card = "bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-6"
    const linea = (label, valor) => valor && (
        <p className="text-sm text-gray-600 dark:text-gray-400"><span className="font-medium text-gray-700 dark:text-gray-300">{label}:</span> {valor}</p>
    )
    const accionable = lk.isTech && ['pending', 'approved', 'enabled'].includes(acceso.state)

    return (
        <Layout>
            <button onClick={() => navigate('/accesos')} className="mb-6 flex items-center text-sm font-medium text-gray-500 hover:text-brand-primary dark:text-gray-400 dark:hover:text-brand-light transition-colors">
                <ArrowLeft className="w-4 h-4 mr-1" /> Volver a Accesos
            </button>

            <div className="flex flex-col lg:flex-row gap-6">
                <div className="w-full lg:w-1/3 space-y-6">
                    <div className={`${card} space-y-2`}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                                <h1 className="text-xl font-bold text-gray-900 dark:text-white">{lk.sistema(acceso.system)}</h1>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Solicitud #{acceso.id} · {fecha(acceso.created_at)}</p>
                            </div>
                            <StateBadge state={acceso.state} />
                        </div>
                        {linea('Solicitante', lk.persona(acceso.requested_by))}
                        {linea('Justificación', acceso.justification)}
                        {acceso.approval !== 'pending' && linea(
                            acceso.approval === 'rejected' ? 'Rechazó' : 'Aprobación',
                            acceso.approval === 'not_required' ? 'No requiere' : `${acceso.approver_name} · ${fecha(acceso.approval_at)}`,
                        )}
                        {linea('Comentario de aprobación', acceso.approval_comment)}
                        {acceso.enabled_at && linea('Habilitado', fecha(acceso.enabled_at))}
                        {acceso.revoked_at && linea('Revocado', `${fecha(acceso.revoked_at)} · ${acceso.revoke_reason}`)}
                    </div>

                    {accionable && (
                        <div className={`${card} space-y-2`}>
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Acciones de I&T</h3>
                            {acceso.state === 'pending' && (
                                <>
                                    <select value={decision} onChange={(e) => setDecision(e.target.value)} aria-label="Decisión" className={inputClass}>
                                        <option value="approved">Aprobada</option>
                                        <option value="rejected">Rechazada</option>
                                        <option value="not_required">No requiere aprobación</option>
                                    </select>
                                    {decision !== 'not_required' && (
                                        <input value={aprobador} onChange={(e) => setAprobador(e.target.value)} aria-label="Quién decidió" placeholder="¿Quién aprobó o rechazó? (ej. jefa de Ventas)" className={inputClass} />
                                    )}
                                </>
                            )}
                            <textarea
                                value={nota}
                                onChange={(e) => setNota(e.target.value)}
                                rows={2}
                                aria-label="Comentario del paso"
                                placeholder={acceso.state === 'enabled' ? 'Motivo de la revocación (obligatorio)' : 'Comentario (opcional)'}
                                className={`${inputClass} resize-none`}
                            />
                            {acceso.state === 'pending' && (
                                <button onClick={() => paso('decision', { decision, approver_name: aprobador, comment: nota }, 'Decisión registrada')} disabled={busy || (decision !== 'not_required' && !aprobador.trim())} className={`${btnPrimary} w-full`}>
                                    Registrar decisión
                                </button>
                            )}
                            {acceso.state === 'approved' && (
                                <button onClick={() => paso('enable', { comment: nota }, 'Acceso habilitado')} disabled={busy} className={`${btnPrimary} w-full`}>
                                    Marcar como habilitado
                                </button>
                            )}
                            {acceso.state === 'enabled' && (
                                <button onClick={() => paso('revoke', { comment: nota }, 'Acceso revocado')} disabled={busy || !nota.trim()} className="w-full px-4 py-2 text-sm font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800/50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50">
                                    Revocar acceso
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Hilo: pasos del flujo + comentarios, en orden */}
                <div className={`w-full lg:w-2/3 ${card} flex flex-col`}>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Historial y comentarios</h3>
                    <ol className="space-y-3 flex-1">
                        {acceso.events.map(e => e.action === 'comment' ? (
                            <li key={e.id} className={`max-w-[85%] rounded-xl px-4 py-2 text-sm ${e.changed_by === lk.myId ? 'ml-auto bg-brand-primary/10 dark:bg-brand-light/10' : 'bg-gray-50 dark:bg-gray-800'}`}>
                                <p className="text-gray-900 dark:text-white whitespace-pre-line">{e.comment}</p>
                                <p className="mt-1 text-[11px] text-gray-500">{lk.persona(e.changed_by)} · {fecha(e.timestamp)}</p>
                            </li>
                        ) : (
                            <li key={e.id} className="text-center text-xs text-gray-500 dark:text-gray-400">
                                <span className="font-medium">{lk.persona(e.changed_by)}</span> {EVENT_TEXT[e.action]?.toLowerCase() || e.action}
                                {e.new_value && e.action !== 'created' && <> → <StateBadge state={e.new_value} /></>}
                                {e.comment && <span className="block italic">“{e.comment}”</span>}
                                <span className="block">{fecha(e.timestamp)}</span>
                            </li>
                        ))}
                    </ol>
                    <form
                        className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex gap-2"
                        onSubmit={(e) => { e.preventDefault(); paso('comments', { comment: comentario }, 'Comentario enviado') }}
                    >
                        <input value={comentario} onChange={(e) => setComentario(e.target.value)} aria-label="Escribe un comentario" placeholder="Escribe un comentario (nunca contraseñas)" className={`${inputClass} flex-1`} />
                        <button type="submit" disabled={busy || !comentario.trim()} aria-label="Enviar comentario" className={btnPrimary}><Send className="w-4 h-4" /></button>
                    </form>
                </div>
            </div>
        </Layout>
    )
}
