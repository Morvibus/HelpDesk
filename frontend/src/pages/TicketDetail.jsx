import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, wsUrl } from '../api'
import Layout from '../components/Layout'
import { useAuthStore } from '../store/authStore'
import { ArrowLeft, MessageSquare, Clock, AlertCircle, Send, RefreshCw, CheckCircle2, Lock, UserPlus } from 'lucide-react'
import { useUIStore } from '../store/uiStore'

export default function TicketDetail() {
    const { id } = useParams()
    const navigate = useNavigate()

    // Extraemos el token y también el ROL del usuario
    const token = useAuthStore(state => state.token)
    const role = useAuthStore(state => state.role)
    const removeUnreadTicket = useUIStore(state => state.removeUnreadTicket)
    const refreshTrigger = useUIStore(state => state.refreshTrigger)
    const isTech = role !== 'employee'

    const payload = JSON.parse(atob(token.split('.')[1]))
    const myUserId = parseInt(payload.sub)

    const [ticket, setTicket] = useState(null)
    const [messages, setMessages] = useState([])
    const [messagesTotal, setMessagesTotal] = useState(0)
    const [loadingOlder, setLoadingOlder] = useState(false)
    const [newMessage, setNewMessage] = useState('')
    const [isPrivateNote, setIsPrivateNote] = useState(false) // Nuevo estado para notas privadas
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState(false)
    const [actionError, setActionError] = useState('')

    const ws = useRef(null)
    const messagesEndRef = useRef(null)
    const chatContainerRef = useRef(null)
    const mantenerScrollRef = useRef(false)
    const alturaAntesRef = useRef(0)

    useEffect(() => {
        removeUnreadTicket(Number(id))
    }, [id, removeUnreadTicket])

    // 1. Cargar Datos
    const fetchTicketData = async () => {
        try {
            const [ticketRes, messagesRes] = await Promise.all([
                api.get(`/tickets/${id}`),
                api.get(`/tickets/${id}/messages?limit=200`)
            ])
            setTicket(ticketRes.data)
            // El backend pagina y devuelve los más recientes primero:
            // los invertimos para mostrar el chat en orden cronológico
            setMessages(messagesRes.data.items.slice().reverse())
            setMessagesTotal(messagesRes.data.total)
        } catch (error) {
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

    useEffect(() => {
        fetchTicketData()
    }, [id, token, refreshTrigger])

    // 2. Conectar WebSocket
    useEffect(() => {
        let isMounted = true

        // Retrasamos la conexión medio segundo para evitar el doble render de React
        const timeoutId = setTimeout(() => {
            if (!isMounted) return

            ws.current = new WebSocket(wsUrl(`/ws/tickets/${id}/chat`), ['auth', token])

            ws.current.onmessage = (event) => {
                const data = JSON.parse(event.data)
                setMessages((prev) => [...prev, data])
            }

            ws.current.onerror = () => {
                console.debug("Desconexión menor del WebSocket de chat.")
            }
        }, 500)

        return () => {
            isMounted = false
            clearTimeout(timeoutId)
            if (ws.current && (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING)) {
                ws.current.close()
            }
        }
    }, [id, token])

    // 3. Scroll automático (y mantener la posición al precargar el historial)
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

    // 4. Enviar Mensaje (ahora con soporte para nota privada)
    const handleSendMessage = (e) => {
        e.preventDefault()
        if (!newMessage.trim() || !ws.current) return

        ws.current.send(JSON.stringify({
            content: newMessage,
            is_private_note: isPrivateNote 
        }))
        setNewMessage('')
        setIsPrivateNote(false)
    }

    // 5. ACCIONES DEL TÉCNICO: Cambiar estado del ticket
    const handleStatusChange = async (newStatus) => {
        setActionLoading(true)
        setActionError('')
        try {
            const update = { status: newStatus }
            if (newStatus === 'in_process' && ticket.assigned_to == null) {
                update.assigned_to = myUserId
            }

            await api.patch(`/tickets/${id}`, update)
            await fetchTicketData() // Recargamos para ver los cambios
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
            await api.post(`/tickets/${id}/reopen`, {})
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

    // Etiquetas de estado traducidas
    const statusLabels = {
        created: 'Nuevo', assigned: 'Asignado', in_process: 'En Proceso', solved: 'Solucionado', closed: 'Cerrado'
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
                                <AlertCircle className="w-4 h-4 mr-2" /> <span className="font-medium mr-1">Prioridad:</span> {ticket.priority}
                            </div>
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

                                    {(ticket.status === 'created' || (ticket.status === 'in_process' && ticket.assigned_to == null)) && (
                                        <button onClick={() => handleStatusChange('in_process')} disabled={actionLoading} className="w-full flex justify-center items-center px-4 py-2 bg-brand-primary text-white hover:bg-brand-dark rounded-lg transition-colors text-sm font-medium">
                                            <UserPlus className="w-4 h-4 mr-2" /> {ticket.status === 'created' ? 'Tomar y Atender Ticket' : 'Reclamar asignación'}
                                        </button>
                                    )}

                                    {(['assigned', 'in_process'].includes(ticket.status) && !(ticket.status === 'in_process' && ticket.assigned_to == null)) && (
                                        <button onClick={() => handleStatusChange('solved')} disabled={actionLoading} className="w-full flex justify-center items-center px-4 py-2 bg-brand-light text-white hover:bg-green-600 rounded-lg transition-colors text-sm font-medium">
                                            <CheckCircle2 className="w-4 h-4 mr-2" /> Marcar como Solucionado
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Acción para el Empleado */}
                            {!isTech && isTicketClosed && (
                                <div>
                                    <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">¿El problema persiste?</h4>
                                    <button onClick={handleReopenTicket} disabled={actionLoading} className="w-full flex justify-center items-center px-4 py-2 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border border-yellow-200 rounded-lg transition-colors text-sm font-medium">
                                        <RefreshCw className={`w-4 h-4 mr-2 ${actionLoading ? 'animate-spin' : ''}`} /> Reabrir Ticket
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* COLUMNA DERECHA: Chat */}
                <div className="w-full lg:w-2/3 flex flex-col bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden h-[600px]">

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
                                            {msg.content}
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
                            <div className="flex space-x-2">
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    disabled={isTicketClosed}
                                    className="flex-1 px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary dark:text-white transition-colors disabled:opacity-50"
                                    placeholder={isTicketClosed ? 'Ticket cerrado.' : 'Escribe un mensaje...'}
                                />
                                <button type="submit" disabled={!newMessage.trim() || isTicketClosed} className="px-4 py-2 bg-brand-primary text-white rounded-lg disabled:opacity-50 hover:bg-brand-dark transition-colors">
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
                                        className="w-4 h-4 text-brand-primary border-gray-300 rounded focus:ring-brand-primary"
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
        </Layout>
    )
}