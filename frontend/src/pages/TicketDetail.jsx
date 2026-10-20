import { useEffect, useState, useRef } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { api, wsUrl, fetchCatalog, API_URL } from '../api'
import { toast } from 'react-hot-toast'
import Layout from '../components/Layout'
import ArticleModal from '../components/ArticleModal'
import { useAuthStore, decodeToken } from '../store/authStore'
import { ArrowLeft, MessageSquare, Clock, AlertCircle, Send, RefreshCw, CheckCircle2, Lock, UserPlus, BookOpen, Pause, Play, Tag, Building2, Paperclip, FileText, X } from 'lucide-react'
import { useUIStore } from '../store/uiStore'

// Adjuntos del chat (RF-02): mismos tipos y límite que valida el backend
const ACCEPT_ADJUNTOS = 'image/jpeg,image/png,image/gif,image/webp,application/pdf'
const MAX_ADJUNTO = 5 * 1024 * 1024

// Etiquetas de estado traducidas
const statusLabels = {
    created: 'Nuevo', assigned: 'Asignado', in_process: 'En Proceso', pending: 'Pendiente', solved: 'Solucionado', closed: 'Cerrado'
}

const typeLabels = {
    incident: 'Incidente', service_request: 'Solicitud de servicio',
    maintenance: 'Mantenimiento', inquiry: 'Consulta'
}

// Historial (solo admin). ticket_history guarda estados en los cambios de estado
// e ids de usuario (o "None") en las asignaciones: así se distinguen.
const describeHistory = (e, userMap) => {
    const persona = (v) => (v === 'None' ? 'Sin asignar' : userMap[v]?.name || `#${v}`)
    const valor = (v) => statusLabels[v] || persona(v)
    if (e.action === 'asset_linked') {
        const activo = (v) => (v === 'None' ? 'sin activo' : `activo #${v}`)
        return `Activo: ${activo(e.old_value)} → ${activo(e.new_value)}`
    }
    const accion = e.action === 'reopened' ? 'Reabierto' : statusLabels[e.new_value] ? 'Estado' : 'Asignación'
    return `${accion}: ${valor(e.old_value)} → ${valor(e.new_value)}`
}

// Activo involucrado (CA-03): solo I&T lo ve y lo vincula; se busca por código, marca, modelo o serie
const TicketAssetCard = ({ ticket, onChanged }) => {
    const [activo, setActivo] = useState(null)
    const [q, setQ] = useState('')
    const [resultados, setResultados] = useState([])
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        if (ticket.asset_id == null) { setActivo(null); return }
        const controller = new AbortController()
        api.get(`/assets/${ticket.asset_id}`, { signal: controller.signal }).then(r => setActivo(r.data)).catch(() => {})
        return () => controller.abort()
    }, [ticket.asset_id])

    useEffect(() => {
        if (!q.trim()) { setResultados([]); return }
        const controller = new AbortController()
        const timer = setTimeout(() => {
            api.get('/assets/', { params: { q: q.trim(), limit: 5 }, signal: controller.signal })
                .then(r => setResultados(r.data.items)).catch(() => {})
        }, 250)
        return () => { clearTimeout(timer); controller.abort() }
    }, [q])

    const vincular = async (assetId) => {
        setBusy(true)
        try {
            await api.patch(`/tickets/${ticket.id}`, { asset_id: assetId })
            setQ('')
            await onChanged()
        } catch (err) {
            toast.error(err.response?.data?.detail || 'No se pudo actualizar el activo')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Activo involucrado</h3>
            {ticket.asset_id != null ? (
                <div className="flex items-center justify-between gap-2 text-sm">
                    <Link to={`/activos/${ticket.asset_id}`} className="text-brand-primary dark:text-brand-light hover:underline truncate">
                        {activo ? `${activo.tag} · ${[activo.brand, activo.model].filter(Boolean).join(' ')}` : `#${ticket.asset_id}`}
                    </Link>
                    <button onClick={() => vincular(null)} disabled={busy} className="text-xs text-gray-500 hover:text-red-600 dark:hover:text-red-400">Desvincular</button>
                </div>
            ) : (
                <>
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        aria-label="Buscar activo para vincular"
                        placeholder="Buscar por código, marca o serie"
                        className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-light dark:text-white"
                    />
                    {resultados.length > 0 && (
                        <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-800 border border-gray-100 dark:border-gray-800 rounded-lg">
                            {resultados.map(a => (
                                <li key={a.id}>
                                    <button onClick={() => vincular(a.id)} disabled={busy} className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
                                        <span className="font-semibold">{a.tag}</span> {[a.brand, a.model].filter(Boolean).join(' ')}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </>
            )}
        </div>
    )
}

export default function TicketDetail() {
    const { id } = useParams()
    const navigate = useNavigate()

    // Extraemos el token y también el ROL del usuario
    const token = useAuthStore(state => state.token)
    const role = useAuthStore(state => state.role)
    const removeUnreadTicket = useUIStore(state => state.removeUnreadTicket)
    const refreshTrigger = useUIStore(state => state.refreshTrigger)
    const isTech = role !== 'employee'
    const isAdmin = role === 'admin'

    const payload = decodeToken(token) || {}
    const myUserId = parseInt(payload.sub)

    const [ticket, setTicket] = useState(null)
    const [messages, setMessages] = useState([])
    const [messagesTotal, setMessagesTotal] = useState(0)
    const [loadingOlder, setLoadingOlder] = useState(false)
    const [newMessage, setNewMessage] = useState('')
    const [isPrivateNote, setIsPrivateNote] = useState(false) // Nuevo estado para notas privadas
    const [adjunto, setAdjunto] = useState(null) // archivo elegido para el próximo mensaje (RF-02)
    const [subiendo, setSubiendo] = useState(false)
    const adjuntoRef = useRef(null)
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState(false)
    const [actionError, setActionError] = useState('')
    const [observacion, setObservacion] = useState('') // queda en el historial del cambio (RF-04)
    const [wsAbierto, setWsAbierto] = useState(false)
    const [historial, setHistorial] = useState([]) // solo admin
    const [userMap, setUserMap] = useState({})
    const [catalogos, setCatalogos] = useState({ categorias: [], departamentos: [] })

    // Biblioteca: entrada ligada a este ticket (null si no está publicada)
    const [entradaBiblioteca, setEntradaBiblioteca] = useState(null)
    const [mostrarModalArticulo, setMostrarModalArticulo] = useState(false)
    const [recargaBiblioteca, setRecargaBiblioteca] = useState(0)

    const ws = useRef(null)
    const messagesEndRef = useRef(null)
    const chatContainerRef = useRef(null)
    const mantenerScrollRef = useRef(false)
    const alturaAntesRef = useRef(0)

    useEffect(() => {
        removeUnreadTicket(Number(id))
        // Abrir el ticket = sus avisos del centro de notificaciones quedan leídos
        api.post('/notifications/read-all', null, { params: { link: `/ticket/${id}` } })
            .then(() => useUIStore.getState().bumpNotifications())
            .catch(() => {})
    }, [id, removeUnreadTicket])

    // Nombres de categoría y departamento (catálogos cacheados por api.js)
    useEffect(() => {
        Promise.all([fetchCatalog('/categories/'), fetchCatalog('/departments/')])
            .then(([categorias, departamentos]) => setCatalogos({ categorias, departamentos }))
            .catch(() => {})
    }, [])

    // Nombres para el historial (solo admin; sin mapa se muestran ids)
    useEffect(() => {
        if (!isAdmin) return
        const controller = new AbortController()
        api.get('/users/', { params: { limit: 200, offset: 0 }, signal: controller.signal })
            .then(res => setUserMap(Object.fromEntries(res.data.items.map(u => [u.id, u]))))
            .catch(() => {})
        return () => controller.abort()
    }, [isAdmin])

    // 1. Cargar Datos (signal: cancela si cambia el ticket o se desmonta)
    const fetchTicketData = async (signal) => {
        try {
            const opciones = signal ? { signal } : undefined
            const [ticketRes, messagesRes, historialRes] = await Promise.all([
                api.get(`/tickets/${id}`, opciones),
                api.get(`/tickets/${id}/messages?limit=200`, opciones),
                isAdmin ? api.get('/audit/', { params: { kind: 'tickets', ticket_id: id, limit: 200 }, ...opciones }) : null,
            ])
            setTicket(ticketRes.data)
            if (historialRes) setHistorial(historialRes.data.items)
            // El backend pagina y devuelve los más recientes primero:
            // los invertimos para mostrar el chat en orden cronológico
            setMessages(messagesRes.data.items.slice().reverse())
            setMessagesTotal(messagesRes.data.total)
        } catch (error) {
            if (error.code === 'ERR_CANCELED') return
            console.error("Error al cargar datos", error)
        } finally {
            setLoading(false)
        }
    }

    // Carga el bloque anterior de mensajes y lo añade por arriba
    const loadOlderMessages = async () => {
        setLoadingOlder(true)
        try {
            const contenedor = chatContainerRef.current
            alturaAntesRef.current = contenedor ? contenedor.scrollHeight : 0
            mantenerScrollRef.current = true
            const res = await api.get(`/tickets/${id}/messages?limit=200&offset=${messages.length}`)
            const antiguos = res.data.items.slice().reverse()
            setMessages(prev => [...antiguos, ...prev])
            setMessagesTotal(res.data.total)
        } catch (error) {
            mantenerScrollRef.current = false
            console.error("Error al cargar mensajes anteriores", error)
        } finally {
            setLoadingOlder(false)
        }
    }

    // oxlint-disable react/exhaustive-effect-dependencies -- token y refreshTrigger recargan a propósito
    useEffect(() => {
        const controller = new AbortController()
        fetchTicketData(controller.signal)
        return () => controller.abort()
    }, [id, token, refreshTrigger])
    // oxlint-enable react/exhaustive-effect-dependencies

    // ¿Este ticket ya está documentado en la biblioteca? (solo técnicos/admins)
    // oxlint-disable react/exhaustive-effect-dependencies -- token recarga a propósito
    useEffect(() => {
        if (!isTech) return
        const controller = new AbortController()
        api.get('/library/', { params: { ticket_id: id, limit: 1 }, signal: controller.signal })
            .then(res => setEntradaBiblioteca(res.data.items[0] || null))
            .catch(err => {
                if (err.code === 'ERR_CANCELED') return
                console.error('Error al consultar la biblioteca:', err)
            })
        return () => controller.abort()
    }, [id, isTech, token, recargaBiblioteca])
    // oxlint-enable react/exhaustive-effect-dependencies

    // 2. Conectar WebSocket (con reconexión por si el backend se cae)
    useEffect(() => {
        let isMounted = true
        let reintentos = 0
        let timerId = null

        function conectar() {
            if (!isMounted) return

            ws.current = new WebSocket(wsUrl(`/ws/tickets/${id}/chat`), ['auth', token])

            ws.current.onopen = () => {
                reintentos = 0
                setWsAbierto(true)
            }

            ws.current.onmessage = (event) => {
                const data = JSON.parse(event.data)
                setMessages((prev) => [...prev, data])
            }

            ws.current.onerror = () => {
                console.debug("Desconexión menor del WebSocket de chat.")
            }

            // Caída del socket → reconectamos con backoff (máx 15 s)
            ws.current.onclose = () => {
                setWsAbierto(false)
                if (!isMounted) return
                reintentos += 1
                const delay = Math.min(1000 * 2 ** reintentos, 15000)
                timerId = setTimeout(conectar, delay)
            }
        }

        // Margen inicial: StrictMode monta el efecto dos veces en dev y así no abrimos dos sockets
        timerId = setTimeout(conectar, 500)

        return () => {
            isMounted = false
            clearTimeout(timerId)
            setWsAbierto(false)
            if (ws.current && (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING)) {
                ws.current.close()
            }
        }
    }, [id, token])

    // 3. Scroll automático (y mantener la posición al precargar el historial)
    // oxlint-disable react/exhaustive-effect-dependencies -- messages dispara el scroll a propósito
    useEffect(() => {
        if (mantenerScrollRef.current) {
            mantenerScrollRef.current = false
            const contenedor = chatContainerRef.current
            if (contenedor) {
                contenedor.scrollTop += contenedor.scrollHeight - alturaAntesRef.current
            }
            return
        }
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages])
    // oxlint-enable react/exhaustive-effect-dependencies

    // 4. Enviar Mensaje (ahora con soporte para nota privada)
    const handleSendMessage = async (e) => {
        e.preventDefault()
        if (!newMessage.trim() && !adjunto) return

        // Sin socket abierto no enviamos: avisamos en vez de perder el mensaje
        if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
            toast.error('Sin conexión al chat: tu mensaje no se envió. Reintentando…')
            return
        }

        // Adjunto (RF-02): primero se sube; el mensaje lleva la ruta devuelta. Sin texto, el texto es el nombre
        let image_url
        if (adjunto) {
            setSubiendo(true)
            try {
                const form = new FormData()
                form.append('file', adjunto)
                image_url = (await api.post('/upload-image/', form)).data.image_url
            } catch (err) {
                toast.error(err.response?.data?.detail || 'No se pudo subir el archivo')
                return
            } finally {
                setSubiendo(false)
            }
        }

        ws.current.send(JSON.stringify({
            content: newMessage.trim() || adjunto.name,
            is_private_note: isPrivateNote,
            ...(image_url && { image_url }),
        }))
        setNewMessage('')
        setIsPrivateNote(false)
        setAdjunto(null)
    }

    const elegirAdjunto = (e) => {
        const file = e.target.files?.[0]
        e.target.value = ''  // permite volver a elegir el mismo archivo
        if (!file) return
        if (file.size > MAX_ADJUNTO) return toast.error('El archivo supera el límite de 5 MB')
        setAdjunto(file)
    }

    // 5. ACCIONES DEL TÉCNICO: Cambiar estado del ticket
    const handleStatusChange = async (newStatus) => {
        setActionLoading(true)
        setActionError('')
        try {
            const update = { status: newStatus, comment: observacion }
            if (newStatus === 'in_process' && ticket.assigned_to == null) {
                update.assigned_to = myUserId
            }

            await api.patch(`/tickets/${id}`, update)
            setObservacion('')
            await fetchTicketData() // Recargamos para ver los cambios
            // Publicación asistida: al resolver, se ofrece documentar la solución
            if (newStatus === 'solved' && isTech && !entradaBiblioteca) {
                setMostrarModalArticulo(true)
            }
        } catch {
            setActionError('Error al actualizar el estado del ticket')
        } finally {
            setActionLoading(false)
        }
    }

    // 6. ACCIÓN DEL EMPLEADO: Reabrir ticket
    const handleReopenTicket = async () => {
        setActionLoading(true)
        setActionError('')
        try {
            await api.post(`/tickets/${id}/reopen`, { comment: observacion })
            setObservacion('')
            await fetchTicketData()
        } catch (err) {
            setActionError(err.response?.data?.detail || 'Error al reabrir el ticket')
        } finally {
            setActionLoading(false)
        }
    }

    if (loading) return <Layout><div className="text-center py-12 dark:text-white">Cargando detalles...</div></Layout>
    if (!ticket) return <Layout><div className="text-center py-12 text-red-500">Ticket no encontrado</div></Layout>

    const isTicketClosed = ['solved', 'closed'].includes(ticket.status)
    // Iniciado (en proceso o pendiente) pero sin responsable: volvió al pool
    const iniciadoSinAsignar = ['in_process', 'pending'].includes(ticket.status) && ticket.assigned_to == null
    const atendido = ['assigned', 'in_process', 'pending'].includes(ticket.status) && !iniciadoSinAsignar

    const observacionInput = (
        <textarea
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            rows={2}
            aria-label="Observación del cambio"
            placeholder="Observación (opcional): queda en el historial"
            className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-light dark:text-white"
        />
    )
    const priorityLabels = {
        low: 'Baja', medium: 'Media', high: 'Alta'
    }

    return (
        <Layout>
            <button onClick={() => navigate('/')} className="mb-6 flex items-center text-sm font-medium text-gray-500 hover:text-brand-primary dark:text-gray-400 dark:hover:text-brand-light transition-colors">
                <ArrowLeft className="w-4 h-4 mr-1" /> Volver al Panel
            </button>

            <div className="flex flex-col lg:flex-row gap-6">

                {/* COLUMNA IZQUIERDA: Info del Ticket y Controles */}
                <div className="w-full lg:w-1/3 space-y-6">
                    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
                        <div className="flex justify-between items-start mb-4">
                            <h1 className="text-xl font-bold text-gray-900 dark:text-white">#{ticket.id}</h1>
                            <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${isTicketClosed
                                ? 'bg-brand-light/10 text-brand-primary border-brand-light/30 dark:bg-brand-light/20 dark:text-brand-light'
                                : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50'
                                }`}>
                                {statusLabels[ticket.status]}
                            </span>
                        </div>

                        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">{ticket.title}</h2>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">{ticket.description}</p>

                        <div className="space-y-3 text-sm">
                            <div className="flex items-center text-gray-500 dark:text-gray-400">
                                <AlertCircle className="w-4 h-4 mr-2" /> <span className="font-medium mr-1">Prioridad:</span> {priorityLabels[ticket.priority] || ticket.priority}
                            </div>
                            <div className="flex items-center text-gray-500 dark:text-gray-400">
                                <Tag className="w-4 h-4 mr-2" /> <span className="font-medium mr-1">Tipo:</span> {typeLabels[ticket.ticket_type] || ticket.ticket_type}
                                {ticket.category && <> · {catalogos.categorias.find(c => c.key === ticket.category)?.name || ticket.category}</>}
                            </div>
                            {ticket.department_id != null && (
                                <div className="flex items-center text-gray-500 dark:text-gray-400">
                                    <Building2 className="w-4 h-4 mr-2" /> <span className="font-medium mr-1">Departamento:</span>
                                    {catalogos.departamentos.find(d => d.id === ticket.department_id)?.name || `#${ticket.department_id}`}
                                </div>
                            )}
                            <div className="flex items-center text-gray-500 dark:text-gray-400">
                                <Clock className="w-4 h-4 mr-2" /> <span className="font-medium mr-1">Creado:</span>
                                {new Date(ticket.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>

                        {/* CONTROLES DE ACCIÓN (Dinámicos por Rol) */}
                        <div className="mt-6 border-t border-gray-100 dark:border-gray-800 pt-6">
                            {actionError && <p className="text-sm text-red-500 mb-3 bg-red-50 p-2 rounded">{actionError}</p>}

                            {/* Acciones para el Técnico */}
                            {isTech && !isTicketClosed && (
                                <div className="space-y-3">
                                    <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Acciones del Técnico</h4>
                                    {observacionInput}

                                    {(ticket.status === 'created' || iniciadoSinAsignar) && (
                                        <button onClick={() => handleStatusChange('in_process')} disabled={actionLoading} className="w-full flex justify-center items-center px-4 py-2 bg-brand-primary text-white hover:bg-brand-dark rounded-lg transition-colors text-sm font-medium">
                                            <UserPlus className="w-4 h-4 mr-2" /> {ticket.status === 'created' ? 'Tomar y Atender Ticket' : 'Reclamar asignación'}
                                        </button>
                                    )}

                                    {atendido && ticket.status !== 'pending' && (
                                        <button onClick={() => handleStatusChange('pending')} disabled={actionLoading} className="w-full flex justify-center items-center px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                            <Pause className="w-4 h-4 mr-2" /> Marcar como Pendiente
                                        </button>
                                    )}

                                    {atendido && ticket.status === 'pending' && (
                                        <button onClick={() => handleStatusChange('in_process')} disabled={actionLoading} className="w-full flex justify-center items-center px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                            <Play className="w-4 h-4 mr-2" /> Retomar
                                        </button>
                                    )}

                                    {atendido && (
                                        <button onClick={() => handleStatusChange('solved')} disabled={actionLoading} className="w-full flex justify-center items-center px-4 py-2 bg-brand-primary text-white hover:bg-brand-dark rounded-lg transition-colors text-sm font-medium">
                                            <CheckCircle2 className="w-4 h-4 mr-2" /> Marcar como Solucionado
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Biblioteca: documentar la solución de un ticket resuelto/cerrado */}
                            {isTech && isTicketClosed && (
                                <div className="space-y-3">
                                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">Biblioteca de Soluciones</h4>
                                    {entradaBiblioteca ? (
                                        <div className="bg-brand-primary/5 dark:bg-brand-light/10 border border-brand-primary/10 dark:border-brand-light/20 rounded-lg p-3">
                                            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">Esta solución ya está publicada.</p>
                                            <button
                                                onClick={() => navigate('/biblioteca')}
                                                className="w-full flex justify-center items-center px-4 py-2 text-sm font-medium rounded-lg border border-brand-primary/30 dark:border-brand-light/30 text-brand-primary dark:text-brand-light hover:bg-brand-primary/10 dark:hover:bg-brand-light/10 transition-colors"
                                            >
                                                <BookOpen className="w-4 h-4 mr-2" /> Ver en Biblioteca
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => setMostrarModalArticulo(true)}
                                            className="w-full flex justify-center items-center px-4 py-2 bg-brand-primary text-white hover:bg-brand-dark rounded-lg transition-colors text-sm font-medium"
                                        >
                                            <BookOpen className="w-4 h-4 mr-2" /> Publicar en Biblioteca
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Acción para el Empleado */}
                            {!isTech && isTicketClosed && (
                                <div>
                                    <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">¿El problema persiste?</h4>
                                    <div className="mb-3">{observacionInput}</div>
                                    <button onClick={handleReopenTicket} disabled={actionLoading} className="w-full flex justify-center items-center px-4 py-2 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border border-yellow-200 rounded-lg transition-colors text-sm font-medium">
                                        <RefreshCw className={`w-4 h-4 mr-2 ${actionLoading ? 'animate-spin' : ''}`} /> Reabrir Ticket
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {isTech && <TicketAssetCard ticket={ticket} onChanged={fetchTicketData} />}

                    {/* Historial de cambios (auditoría, solo admin) */}
                    {isAdmin && (
                        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Historial</h3>
                            {historial.length === 0 ? (
                                <p className="text-sm text-gray-500 dark:text-gray-400">Sin cambios registrados.</p>
                            ) : (
                                <ol className="space-y-4 border-l-2 border-gray-100 dark:border-gray-800 pl-4">
                                    {historial.map(e => (
                                        <li key={e.id} className="text-sm">
                                            <p className="text-gray-900 dark:text-white">{describeHistory(e, userMap)}</p>
                                            {e.comment && <p className="mt-0.5 text-xs italic text-gray-600 dark:text-gray-400">“{e.comment}”</p>}
                                            {/* Timestamps naive del backend = UTC */}
                                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-500">
                                                {userMap[e.changed_by]?.name || `#${e.changed_by}`} · {new Date(`${e.timestamp}Z`).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </div>
                    )}
                </div>

                {/* COLUMNA DERECHA: Chat */}
                <div className="w-full lg:w-2/3 flex flex-col bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden h-[55vh] min-h-[400px] lg:h-[600px]">

                    <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center bg-gray-50/50 dark:bg-gray-800/50 justify-between">
                        <div className="flex items-center">
                            <MessageSquare className="w-5 h-5 text-brand-primary dark:text-brand-light mr-2" />
                            <h3 className="font-semibold text-gray-900 dark:text-white">Chat de Soporte</h3>
                        </div>
                        {isTicketClosed && <span className="text-xs font-medium text-red-500 bg-red-50 px-2 py-1 rounded">Cerrado</span>}
                    </div>

                    {/* Área de Mensajes */}
                    <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/30 dark:bg-brand-black/30 flex flex-col">
                        {messages.length < messagesTotal && (
                            <button
                                onClick={loadOlderMessages}
                                disabled={loadingOlder}
                                className="self-center px-3 py-1.5 text-xs font-semibold rounded-full border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                            >
                                {loadingOlder ? 'Cargando...' : `Cargar mensajes anteriores (${messages.length} de ${messagesTotal})`}
                            </button>
                        )}
                        {messages.length === 0 ? (

                            /* --- EMPTY STATE DEL CHAT --- */
                            <div className="flex-1 flex flex-col items-center justify-center text-center px-4 animate-in fade-in duration-500">
                                <div className="bg-brand-primary/10 dark:bg-brand-light/10 p-5 rounded-full mb-4 ring-8 ring-brand-primary/5 dark:ring-brand-light/5">
                                    <MessageSquare className="w-10 h-10 text-brand-primary dark:text-brand-light opacity-80" />
                                </div>
                                <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                                    El chat está vacío
                                </h4>
                                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
                                    {isTech
                                        ? 'Inicia la conversación saludando al empleado o deja una nota interna para tu equipo.'
                                        : 'Describe tu problema con más detalle para que el equipo de soporte pueda ayudarte más rápido.'}
                                </p>
                            </div>

                        ) : (
                            messages.map((msg) => {
                                const isMe = msg.sender_id === myUserId
                                const isPrivate = msg.is_private_note

                                return (
                                    <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                        <span className={`text-xs flex items-center text-gray-500 mb-1 ${isMe ? 'mr-1' : 'ml-1'}`}>
                                            {isPrivate && <Lock className="w-3 h-3 mr-1 text-yellow-500" />}
                                            {isMe ? 'Tú' : 'Soporte IT'}
                                            {isPrivate && ' (Nota Interna)'}
                                        </span>
                                        <div className={`px-4 py-2.5 rounded-2xl max-w-[80%] shadow-sm text-sm ${isPrivate
                                                ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-900 dark:text-yellow-200 border border-yellow-200 dark:border-yellow-700/50'
                                                : isMe
                                                    ? 'bg-brand-primary text-white rounded-tr-none'
                                                    : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 rounded-tl-none'
                                            }`}>
                                            {msg.image_url?.endsWith('.pdf') ? (
                                                <a href={`${API_URL}${msg.image_url}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 underline underline-offset-2">
                                                    <FileText className="w-4 h-4 shrink-0" /> {msg.content}
                                                </a>
                                            ) : msg.image_url ? (
                                                <>
                                                    <a href={`${API_URL}${msg.image_url}`} target="_blank" rel="noopener noreferrer" title="Abrir imagen completa">
                                                        <img src={`${API_URL}${msg.image_url}`} alt={msg.content} loading="lazy" className="max-h-56 max-w-full rounded-lg" />
                                                    </a>
                                                    <p className="mt-1">{msg.content}</p>
                                                </>
                                            ) : msg.content}
                                        </div>
                                    </div>
                                )
                            })
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Caja de Entrada de Chat */}
                    <div className="p-4 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
                        <form onSubmit={handleSendMessage} className="flex flex-col space-y-3">
                            {adjunto && (
                                <div className="flex items-center gap-2 self-start max-w-full px-3 py-1.5 text-sm rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                                    <Paperclip className="w-4 h-4 shrink-0" />
                                    <span className="truncate">{adjunto.name}</span>
                                    <button type="button" onClick={() => setAdjunto(null)} aria-label="Quitar adjunto" className="text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                                </div>
                            )}
                            <div className="flex space-x-2">
                                <input ref={adjuntoRef} type="file" accept={ACCEPT_ADJUNTOS} onChange={elegirAdjunto} className="hidden" />
                                <button
                                    type="button"
                                    onClick={() => adjuntoRef.current?.click()}
                                    disabled={isTicketClosed || subiendo}
                                    aria-label="Adjuntar archivo (imagen o PDF, máx. 5 MB)"
                                    title="Adjuntar imagen o PDF (máx. 5 MB)"
                                    className="px-3 py-2 text-gray-500 hover:text-brand-primary dark:hover:text-brand-light border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-50 transition-colors"
                                >
                                    <Paperclip className="w-5 h-5" />
                                </button>
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    disabled={isTicketClosed}
                                    className="flex-1 px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-light dark:text-white transition-colors disabled:opacity-50"
                                    placeholder={isTicketClosed ? 'Ticket cerrado.' : wsAbierto ? 'Escribe un mensaje...' : 'Conectando al chat...'}
                                />
                                <button type="submit" disabled={(!newMessage.trim() && !adjunto) || isTicketClosed || !wsAbierto || subiendo} title={wsAbierto ? "Enviar mensaje" : "Conectando al chat…"} className="px-4 py-2 bg-brand-primary text-white rounded-lg disabled:opacity-50 hover:bg-brand-dark transition-colors">
                                    <Send className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Opciones del Técnico (Nota Privada) */}
                            {isTech && !isTicketClosed && (
                                <div className="flex items-center">
                                    <input
                                        type="checkbox"
                                        id="private_note"
                                        checked={isPrivateNote}
                                        onChange={(e) => setIsPrivateNote(e.target.checked)}
                                        className="w-4 h-4 text-brand-primary border-gray-300 rounded focus:ring-brand-primary dark:focus:ring-brand-light"
                                    />
                                    <label htmlFor="private_note" className="ml-2 flex items-center text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                                        <Lock className="w-3 h-3 mr-1" /> Marcar como Nota Privada (El empleado no la verá)
                                    </label>
                                </div>
                            )}
                        </form>
                    </div>

                </div>
            </div>

            {/* Publicación asistida desde el ticket resuelto */}
            {mostrarModalArticulo && (
                <ArticleModal
                    onClose={() => setMostrarModalArticulo(false)}
                    onSaved={() => {
                        setMostrarModalArticulo(false)
                        setRecargaBiblioteca(n => n + 1)
                        toast.success('Publicado en la biblioteca')
                    }}
                    ticket={{ id: ticket.id, title: ticket.title, description: ticket.description }}
                />
            )}
        </Layout>
    )
}