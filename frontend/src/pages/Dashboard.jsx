import { useEffect, useState } from 'react'
import { api } from '../api'
import Layout from '../components/Layout'
import { useAuthStore } from '../store/authStore'
import { AlertCircle, Clock, CheckCircle2, Inbox, Briefcase, LayoutGrid, Archive, MessageSquare, Coffee, Sparkles, FolderOpen } from 'lucide-react'
import { useUIStore } from '../store/uiStore'
import { useNavigate } from 'react-router-dom'

export default function Dashboard() {
    const [tickets, setTickets] = useState([])
    const [totalTickets, setTotalTickets] = useState(0)
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [activeTab, setActiveTab] = useState('board')

    const token = useAuthStore(state => state.token)
    const role = useAuthStore(state => state.role)
    const { refreshTrigger, unreadTickets } = useUIStore()
    const navigate = useNavigate()

    const isTech = role !== 'employee'

    useEffect(() => {
        const fetchTickets = async () => {
            try {
                const response = await api.get('/tickets/')
                setTickets(response.data.items)
                setTotalTickets(response.data.total)
            } catch (error) {
                console.error("Error al cargar tickets:", error)
            } finally {
                setLoading(false)
            }
        }
        fetchTickets()
    }, [token, refreshTrigger])

    // Carga la siguiente página y la añade a la lista
    const loadMoreTickets = async () => {
        setLoadingMore(true)
        try {
            const response = await api.get(`/tickets/?offset=${tickets.length}`)
            setTickets(prev => [...prev, ...response.data.items])
            setTotalTickets(response.data.total)
        } catch (error) {
            console.error("Error al cargar más tickets:", error)
        } finally {
            setLoadingMore(false)
        }
    }

    const unassignedTickets = tickets.filter(t => t.status === 'created').length
    const activeTickets = tickets.filter(t => ['created', 'assigned', 'in_process'].includes(t.status)).length
    const solvedTickets = tickets.filter(t => ['solved', 'closed'].includes(t.status)).length

    const colCreated = tickets.filter(t => t.status === 'created')
    const colAssigned = tickets.filter(t => t.status === 'assigned')
    const colInProcess = tickets.filter(t => t.status === 'in_process')
    const historyTickets = tickets.filter(t => ['solved', 'closed'].includes(t.status))

    const getPriorityBadge = (priority) => {
        const styles = { low: 'text-gray-500 bg-gray-100 dark:bg-gray-800', medium: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/30', high: 'text-red-600 bg-red-50 dark:bg-red-900/30' }
        const labels = { low: 'Baja', medium: 'Media', high: 'Alta' }
        return <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${styles[priority]}`}>{labels[priority]}</span>
    }

    const getStatusBadge = (status) => {
        const styles = { solved: 'bg-brand-light/10 text-brand-primary dark:bg-brand-light/20 dark:text-brand-light border-brand-light/30', closed: 'bg-brand-dark text-white dark:bg-brand-black dark:border-gray-700' }
        const labels = { solved: 'Solucionado', closed: 'Cerrado' }
        return <span className={`px-2.5 py-1 inline-flex text-xs font-semibold rounded-full border ${styles[status]}`}>{labels[status]}</span>
    }

    // --- COMPONENTES VISUALES ---
    const TicketCard = ({ ticket }) => (
        <div onClick={() => navigate(`/ticket/${ticket.id}`)} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md hover:border-brand-primary dark:hover:border-brand-light transition-all cursor-pointer group relative">
            {unreadTickets.includes(ticket.id) && (
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500 border-2 border-white dark:border-gray-800"></span>
                </span>
            )}
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-mono text-gray-400 dark:text-gray-500">#{ticket.id}</span>
                {getPriorityBadge(ticket.priority)}
            </div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-brand-primary dark:group-hover:text-brand-light transition-colors line-clamp-2">{ticket.title}</h4>
            <div className="mt-3 pt-3 border-t border-gray-50 dark:border-gray-700/50 flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
                <span>{new Date(ticket.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span>
                {unreadTickets.includes(ticket.id) && <MessageSquare className="w-3.5 h-3.5 text-brand-primary animate-pulse" />}
            </div>
        </div>
    )

    const ColumnEmptyState = ({ icon: Icon, title, message }) => (
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center border-2 border-dashed border-gray-200 dark:border-gray-700/60 rounded-xl bg-white/50 dark:bg-gray-800/30">
            <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-full mb-3">
                <Icon className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-50 mx-auto">{message}</p>
        </div>
    )

    return (
        <Layout>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 mb-8">
                <div className="bg-white dark:bg-gray-900 overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1 rounded-xl border border-gray-100 dark:border-gray-800 p-6 flex items-center group">
                    <div className={`p-3 rounded-lg group-hover:scale-110 transition-transform duration-300 ${isTech ? 'bg-red-50 dark:bg-red-900/20' : 'bg-brand-accent/10 dark:bg-brand-accent/20'}`}>
                        {isTech ? <Inbox className="h-8 w-8 text-red-500" /> : <AlertCircle className="h-8 w-8 text-brand-accent" />}
                    </div>
                    <div className="ml-5">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">{isTech ? 'Nuevos (Sin Asignar)' : 'Mis Tickets Activos'}</p>
                        <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">{isTech ? unassignedTickets : activeTickets}</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-900 overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1 rounded-xl border border-gray-100 dark:border-gray-800 p-6 flex items-center group">
                    <div className={`p-3 rounded-lg group-hover:scale-110 transition-transform duration-300 ${isTech ? 'bg-brand-accent/10 dark:bg-brand-accent/20' : 'bg-brand-light/10 dark:bg-brand-light/20'}`}>
                        {isTech ? <Briefcase className="h-8 w-8 text-brand-accent" /> : <CheckCircle2 className="h-8 w-8 text-brand-light" />}
                    </div>
                    <div className="ml-5">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">{isTech ? 'Total en Proceso' : 'Solucionados'}</p>
                        <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">{isTech ? (activeTickets - unassignedTickets) : solvedTickets}</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-900 overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1 rounded-xl border border-gray-100 dark:border-gray-800 p-6 flex items-center group">
                    <div className="p-3 bg-brand-primary/10 dark:bg-brand-primary/20 rounded-lg group-hover:scale-110 transition-transform duration-300">
                        <Clock className="h-8 w-8 text-brand-primary dark:text-brand-light" />
                    </div>
                    <div className="ml-5">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">{isTech ? 'Total Resueltos' : 'Total Histórico'}</p>
                        <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">{isTech ? solvedTickets : totalTickets}</p>
                    </div>
                </div>
            </div>

            <div className="flex border-b border-gray-200 dark:border-gray-800 mb-6 space-x-6">
                <button onClick={() => setActiveTab('board')} className={`pb-3 text-sm font-semibold flex items-center transition-colors relative ${activeTab === 'board' ? 'text-brand-primary dark:text-brand-light' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                    <LayoutGrid className="w-4 h-4 mr-2" /> Tablero Activo
                    {activeTab === 'board' && <span className="absolute bottom-1px left-0 w-full h-0.5 bg-brand-primary dark:bg-brand-light rounded-t-full"></span>}
                </button>
                <button onClick={() => setActiveTab('history')} className={`pb-3 text-sm font-semibold flex items-center transition-colors relative ${activeTab === 'history' ? 'text-brand-primary dark:text-brand-light' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                    <Archive className="w-4 h-4 mr-2" /> Historial de Cerrados
                    {activeTab === 'history' && <span className="absolute bottom-1px left-0 w-full h-0.5 bg-brand-primary dark:bg-brand-light rounded-t-full"></span>}
                </button>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                    <div className="w-8 h-8 border-4 border-brand-primary/30 border-t-brand-primary rounded-full animate-spin mb-4"></div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Cargando tablero...</p>
                </div>
            ) : activeTab === 'board' ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-gray-50/50 dark:bg-gray-900/30 rounded-2xl p-4 border border-dashed border-gray-200 dark:border-gray-800 flex flex-col h-full">
                        <div className="flex justify-between items-center mb-4 px-1">
                            <h3 className="font-semibold text-gray-700 dark:text-gray-300 flex items-center"><span className="w-2 h-2 rounded-full bg-blue-400 mr-2"></span> Nuevos</h3>
                            <span className="bg-gray-200 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400 text-xs font-bold px-2 py-0.5 rounded-full">{colCreated.length}</span>
                        </div>
                        <div className="space-y-3 flex-1">
                            {colCreated.length === 0 ? <ColumnEmptyState icon={Inbox} title="Bandeja limpia" message="No hay tickets nuevos esperando asignación." /> : colCreated.map(t => <TicketCard key={t.id} ticket={t} />)}
                        </div>
                    </div>

                    <div className="bg-gray-50/50 dark:bg-gray-900/30 rounded-2xl p-4 border border-dashed border-gray-200 dark:border-gray-800 flex flex-col h-full">
                        <div className="flex justify-between items-center mb-4 px-1">
                            <h3 className="font-semibold text-gray-700 dark:text-gray-300 flex items-center"><span className="w-2 h-2 rounded-full bg-yellow-400 mr-2"></span> Asignados</h3>
                            <span className="bg-gray-200 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400 text-xs font-bold px-2 py-0.5 rounded-full">{colAssigned.length}</span>
                        </div>
                        <div className="space-y-3 flex-1">
                            {colAssigned.length === 0 ? <ColumnEmptyState icon={Coffee} title="Tiempo de descanso" message="No tienes tickets en cola por revisar." /> : colAssigned.map(t => <TicketCard key={t.id} ticket={t} />)}
                        </div>
                    </div>

                    <div className="bg-gray-50/50 dark:bg-gray-900/30 rounded-2xl p-4 border border-dashed border-gray-200 dark:border-gray-800 flex flex-col h-full">
                        <div className="flex justify-between items-center mb-4 px-1">
                            <h3 className="font-semibold text-gray-700 dark:text-gray-300 flex items-center"><span className="w-2 h-2 rounded-full bg-brand-primary mr-2"></span> En Proceso</h3>
                            <span className="bg-gray-200 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400 text-xs font-bold px-2 py-0.5 rounded-full">{colInProcess.length}</span>
                        </div>
                        <div className="space-y-3 flex-1">
                            {colInProcess.length === 0 ? <ColumnEmptyState icon={Sparkles} title="Todo bajo control" message="No hay tickets activos en proceso actualmente." /> : colInProcess.map(t => <TicketCard key={t.id} ticket={t} />)}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-white dark:bg-gray-900 shadow-sm rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden min-h-100 flex flex-col">
                    {historyTickets.length === 0 ? (
                        <div className="flex flex-col items-center justify-center flex-1 py-16 px-4 text-center">
                            <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-full mb-4">
                                <FolderOpen className="w-10 h-10 text-gray-400 dark:text-gray-500" />
                            </div>
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">Historial impecable</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
                                Aún no hay tickets cerrados. Cuando un ticket se resuelva, se archivará automáticamente aquí.
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                                <thead className="bg-gray-50/50 dark:bg-gray-800/50">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ticket</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Resolución</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {historyTickets.map((ticket) => (
                                        <tr key={ticket.id} onClick={() => navigate(`/ticket/${ticket.id}`)} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer group">
                                            <td className="px-6 py-4">
                                                <div className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-brand-primary transition-colors">{ticket.title}</div>
                                                <div className="text-xs text-gray-400 mt-0.5">#{ticket.id}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(ticket.status)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {ticket.closed_at ? new Date(ticket.closed_at).toLocaleDateString('es-ES') : 'Sin fecha'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {!loading && tickets.length < totalTickets && (
                <div className="flex justify-center mt-6">
                    <button
                        onClick={loadMoreTickets}
                        disabled={loadingMore}
                        className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                    >
                        {loadingMore ? 'Cargando...' : `Cargar más (${tickets.length} de ${totalTickets})`}
                    </button>
                </div>
            )}
        </Layout>
    )
}