import { useEffect, useState } from 'react'
import { api, fetchCatalog } from '../api'
import Layout from '../components/Layout'
import { useAuthStore } from '../store/authStore'
import { AlertCircle, Clock, CheckCircle2, Inbox, Briefcase, LayoutGrid, Search, MessageSquare, Sparkles, FolderOpen } from 'lucide-react'
import { useUIStore } from '../store/uiStore'
import { useNavigate } from 'react-router-dom'

// --- Componentes de tablero a nivel de módulo (no se redefinen por render) ---

const getPriorityBadge = (priority) => {
    const styles = { low: 'text-gray-500 bg-gray-100 dark:bg-gray-800 dark:text-gray-400', medium: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/30 dark:text-yellow-400', high: 'text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400' }
    const labels = { low: 'Baja', medium: 'Media', high: 'Alta' }
    return <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${styles[priority] || ''}`}>{labels[priority] || priority}</span>
}

const TicketCard = ({ ticket }) => {
    const navigate = useNavigate()
    const unreadTickets = useUIStore(state => state.unreadTickets)
    // Ticket ya iniciado que volvió al pool (sin responsable): se resalta y se prioriza
    const retomar = ['in_process', 'pending'].includes(ticket.status) && ticket.assigned_to == null
    return (
        <div onClick={() => navigate(`/ticket/${ticket.id}`)} className={`bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border hover:shadow-md hover:border-brand-primary dark:hover:border-brand-light transition-all cursor-pointer group relative ${retomar ? 'border-amber-300 dark:border-amber-700/60 ring-2 ring-amber-400/70 dark:ring-amber-500/40' : 'border-gray-100 dark:border-gray-700'}`}>
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
            {ticket.status === 'pending' && (
                <span className="mt-2 mr-1 inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase rounded border border-gray-200 bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600">
                    Pendiente
                </span>
            )}
            {retomar && (
                <span className="mt-2 inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase rounded border border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50">
                    Ya iniciado · sin asignar
                </span>
            )}
            <div className="mt-3 pt-3 border-t border-gray-50 dark:border-gray-700/50 flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
                <span>{new Date(ticket.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span>
                {unreadTickets.includes(ticket.id) && <MessageSquare className="w-3.5 h-3.5 text-brand-primary dark:text-brand-light animate-pulse" />}
            </div>
        </div>
    )
}

const ColumnEmptyState = ({ icon: Icon, title, message }) => (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center border-2 border-dashed border-gray-200 dark:border-gray-700/60 rounded-xl bg-white/50 dark:bg-gray-800/30">
        <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-full mb-3">
            <Icon className="w-5 h-5 text-gray-400 dark:text-gray-500" />
        </div>
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-50 mx-auto">{message}</p>
    </div>
)

// --- Pestaña Buscar (RF-10): filtros en el servidor; cada rol solo ve lo suyo, como el tablero ---
const STATUS_LABELS = { created: 'Nuevo', assigned: 'Asignado', in_process: 'En Proceso', pending: 'Pendiente', solved: 'Solucionado', closed: 'Cerrado' }
const TYPE_LABELS = { incident: 'Incidente', service_request: 'Solicitud', maintenance: 'Mantenimiento', inquiry: 'Consulta' }
const FILTROS_VACIOS = { q: '', status: '', ticket_type: '', category: '', department_id: '', created_by: '', date_from: '', date_to: '' }
const selectClass = "px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-light outline-none"
// Timestamps naive del backend = UTC
const fechaCorta = (ts) => (ts ? new Date(`${ts}Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

const SearchTab = ({ isTech }) => {
    const navigate = useNavigate()
    const [filtros, setFiltros] = useState(FILTROS_VACIOS)
    const [items, setItems] = useState([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [catalogos, setCatalogos] = useState({ categorias: [], departamentos: [], personas: [] })
    const set = (campo) => (e) => setFiltros({ ...filtros, [campo]: e.target.value })
    // Solo los filtros con valor viajan al API
    const params = (offset) => ({ ...Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== '')), limit: 50, offset })

    useEffect(() => {
        const pedidos = [fetchCatalog('/categories/'), isTech ? fetchCatalog('/departments/') : [], isTech ? fetchCatalog('/users/directory/') : []]
        Promise.all(pedidos).then(([categorias, departamentos, personas]) => setCatalogos({ categorias, departamentos, personas })).catch(() => {})
    }, [isTech])

    // oxlint-disable react/exhaustive-effect-dependencies -- params se arma con filtros
    useEffect(() => {
        const controller = new AbortController()
        const timer = setTimeout(() => {  // debounce del texto
            api.get('/tickets/', { params: params(0), signal: controller.signal })
                .then(res => { setItems(res.data.items); setTotal(res.data.total) })
                .catch(err => { if (err.code !== 'ERR_CANCELED') console.error('Error al buscar tickets:', err) })
                .finally(() => setLoading(false))
        }, 300)
        return () => { clearTimeout(timer); controller.abort() }
    }, [filtros])
    // oxlint-enable react/exhaustive-effect-dependencies

    const loadMore = async () => {
        const res = await api.get('/tickets/', { params: params(items.length) })
        setItems(prev => [...prev, ...res.data.items])
        setTotal(res.data.total)
    }

    const th = "px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-48">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={filtros.q} onChange={set('q')} aria-label="Buscar tickets" placeholder="Número o texto" className={`${selectClass} w-full pl-9`} />
                </div>
                <select value={filtros.status} onChange={set('status')} aria-label="Estado" className={selectClass}>
                    <option value="">Todos los estados</option>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select value={filtros.ticket_type} onChange={set('ticket_type')} aria-label="Tipo" className={selectClass}>
                    <option value="">Todos los tipos</option>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select value={filtros.category} onChange={set('category')} aria-label="Categoría" className={selectClass}>
                    <option value="">Todas las categorías</option>
                    {catalogos.categorias.map(c => <option key={c.key} value={c.key}>{c.name}</option>)}
                </select>
                {isTech && (
                    <>
                        <select value={filtros.department_id} onChange={set('department_id')} aria-label="Departamento" className={selectClass}>
                            <option value="">Todos los departamentos</option>
                            {catalogos.departamentos.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                        <select value={filtros.created_by} onChange={set('created_by')} aria-label="Solicitante" className={selectClass}>
                            <option value="">Todos los solicitantes</option>
                            {catalogos.personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </>
                )}
                <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">Desde
                    <input type="date" value={filtros.date_from} onChange={set('date_from')} className={selectClass} />
                </label>
                <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">Hasta
                    <input type="date" value={filtros.date_to} onChange={set('date_to')} className={selectClass} />
                </label>
                {filtros !== FILTROS_VACIOS && (
                    <button onClick={() => setFiltros(FILTROS_VACIOS)} className="px-3 py-2 text-sm text-gray-500 hover:text-brand-primary dark:hover:text-brand-light">Limpiar</button>
                )}
            </div>

            <div className="bg-white dark:bg-gray-900 shadow-sm rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                {loading ? (
                    <p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">Buscando...</p>
                ) : items.length === 0 ? (
                    <div className="flex flex-col items-center py-16 px-4 text-center">
                        <FolderOpen className="w-10 h-10 mb-3 text-gray-400 dark:text-gray-500" />
                        <p className="text-sm text-gray-500 dark:text-gray-400">Ningún ticket coincide con la búsqueda.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                            <thead className="bg-gray-50/50 dark:bg-gray-800/50">
                                <tr>
                                    <th className={th}>Ticket</th>
                                    <th className={th}>Estado</th>
                                    <th className={th}>Tipo</th>
                                    <th className={th}>Creado</th>
                                    <th className={th}>Cerrado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {items.map(t => (
                                    <tr key={t.id} onClick={() => navigate(`/ticket/${t.id}`)} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer group">
                                        <td className="px-6 py-4">
                                            <div className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-brand-primary dark:group-hover:text-brand-light transition-colors">{t.title}</div>
                                            <div className="text-xs text-gray-400 mt-0.5">
                                                #{t.id}{t.overdue && <span className="ml-2 font-semibold text-red-600 dark:text-red-400">Vencido</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{STATUS_LABELS[t.status] || t.status}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{TYPE_LABELS[t.ticket_type] || t.ticket_type}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{fechaCorta(t.created_at)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{fechaCorta(t.closed_at)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            {!loading && items.length < total && (
                <div className="flex justify-center">
                    <button onClick={loadMore} className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        Cargar más ({items.length} de {total})
                    </button>
                </div>
            )}
        </div>
    )
}

export default function Dashboard() {
    const [tickets, setTickets] = useState([])
    const [totalTickets, setTotalTickets] = useState(0)
    const [metrics, setMetrics] = useState(null)
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [activeTab, setActiveTab] = useState('board')

    const token = useAuthStore(state => state.token)
    const role = useAuthStore(state => state.role)
    const refreshTrigger = useUIStore(state => state.refreshTrigger)

    const isTech = role !== 'employee'

    // oxlint-disable react/exhaustive-effect-dependencies -- token y refreshTrigger recargan a propósito
    useEffect(() => {
        // Cancela la carga si cambia el refresh o el componente se desmonta:
        // evita que una respuesta tardía pise datos más recientes.
        const controller = new AbortController()

        const fetchDashboardData = async () => {
            try {
                const [ticketsRes, metricsRes] = await Promise.all([
                    api.get('/tickets/', { signal: controller.signal }),
                    api.get('/metrics/', { signal: controller.signal })
                ])
                setTickets(ticketsRes.data.items)
                setTotalTickets(ticketsRes.data.total)
                setMetrics(metricsRes.data)
            } catch (error) {
                if (error.code === 'ERR_CANCELED') return
                console.error("Error al cargar tickets:", error)
            } finally {
                setLoading(false)
            }
        }
        fetchDashboardData()
        return () => controller.abort()
    }, [token, refreshTrigger])
    // oxlint-enable react/exhaustive-effect-dependencies

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

    // KPIs reales del servidor (GET /metrics/): el empleado cuenta solo sus tickets
    const tbs = metrics?.tickets_by_status || {}
    const creados = tbs.created || 0
    const asignados = tbs.assigned || 0
    const enProceso = (tbs.in_process || 0) + (tbs.pending || 0)
    const resueltos = (tbs.solved || 0) + (tbs.closed || 0)
    const activos = creados + asignados + enProceso
    const totalMetricas = metrics?.total_tickets ?? totalTickets

    const colCreated = tickets.filter(t => t.status === 'created')
    // Los tickets viejos en 'assigned' (datos de sesiones anteriores) se muestran
    // dentro de En Proceso: al tomar, un ticket nuevo ya va directo a in_process.
    // Los 'pending' (en espera) también viven aquí con su etiqueta.
    // Los iniciados sin asignar (volvieron al pool) se fijan arriba.
    const iniciadoSinAsignar = (t) => ['in_process', 'pending'].includes(t.status) && t.assigned_to == null
    const colInProcess = tickets
        .filter(t => ['in_process', 'assigned', 'pending'].includes(t.status))
        .sort((a, b) => {
            const aRetomar = iniciadoSinAsignar(a)
            const bRetomar = iniciadoSinAsignar(b)
            return (bRetomar ? 1 : 0) - (aRetomar ? 1 : 0)
        })

    return (
        <Layout>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 mb-8">
                <div className="bg-white dark:bg-gray-900 overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1 rounded-xl border border-gray-100 dark:border-gray-800 p-6 flex items-center group">
                    <div className={`p-3 rounded-lg group-hover:scale-110 transition-transform duration-300 ${isTech ? 'bg-red-50 dark:bg-red-900/20' : 'bg-brand-accent/10 dark:bg-brand-accent/20'}`}>
                        {isTech ? <Inbox className="h-8 w-8 text-red-500" /> : <AlertCircle className="h-8 w-8 text-brand-accent" />}
                    </div>
                    <div className="ml-5">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">{isTech ? 'Nuevos (Sin Asignar)' : 'Mis Tickets Activos'}</p>
                        <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">{isTech ? creados : activos}</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-900 overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1 rounded-xl border border-gray-100 dark:border-gray-800 p-6 flex items-center group">
                    <div className={`p-3 rounded-lg group-hover:scale-110 transition-transform duration-300 ${isTech ? 'bg-brand-accent/10 dark:bg-brand-accent/20' : 'bg-brand-light/10 dark:bg-brand-light/20'}`}>
                        {isTech ? <Briefcase className="h-8 w-8 text-brand-accent" /> : <CheckCircle2 className="h-8 w-8 text-brand-light" />}
                    </div>
                    <div className="ml-5">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">{isTech ? 'Total en Proceso' : 'Solucionados'}</p>
                        <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">{isTech ? (asignados + enProceso) : resueltos}</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-900 overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1 rounded-xl border border-gray-100 dark:border-gray-800 p-6 flex items-center group">
                    <div className="p-3 bg-brand-primary/10 dark:bg-brand-primary/20 rounded-lg group-hover:scale-110 transition-transform duration-300">
                        <Clock className="h-8 w-8 text-brand-primary dark:text-brand-light" />
                    </div>
                    <div className="ml-5">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">{isTech ? 'Total Resueltos' : 'Total Histórico'}</p>
                        <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">{isTech ? resueltos : totalMetricas}</p>
                    </div>
                </div>
            </div>

            <div className="flex border-b border-gray-200 dark:border-gray-800 mb-6 space-x-6">
                <button onClick={() => setActiveTab('board')} className={`pb-3 text-sm font-semibold flex items-center transition-colors relative ${activeTab === 'board' ? 'text-brand-primary dark:text-brand-light' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                    <LayoutGrid className="w-4 h-4 mr-2" /> Tablero Activo
                    {activeTab === 'board' && <span className="absolute bottom-1px left-0 w-full h-0.5 bg-brand-primary dark:bg-brand-light rounded-t-full"></span>}
                </button>
                <button onClick={() => setActiveTab('history')} className={`pb-3 text-sm font-semibold flex items-center transition-colors relative ${activeTab === 'history' ? 'text-brand-primary dark:text-brand-light' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                    <Search className="w-4 h-4 mr-2" /> Buscar
                    {activeTab === 'history' && <span className="absolute bottom-1px left-0 w-full h-0.5 bg-brand-primary dark:bg-brand-light rounded-t-full"></span>}
                </button>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                    <div className="w-8 h-8 border-4 border-brand-primary/30 border-t-brand-primary dark:border-brand-light/30 dark:border-t-brand-light rounded-full animate-spin mb-4"></div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Cargando tablero...</p>
                </div>
            ) : activeTab === 'board' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-gray-50/50 dark:bg-gray-900/30 rounded-2xl p-4 border border-dashed border-gray-200 dark:border-gray-800 flex flex-col h-full">
                        <div className="flex justify-between items-center mb-4 px-1">
                            <h3 className="font-semibold text-gray-700 dark:text-gray-300 flex items-center"><span className="w-2 h-2 rounded-full bg-brand-accent mr-2"></span> Nuevos</h3>
                            <span className="bg-gray-200 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400 text-xs font-bold px-2 py-0.5 rounded-full">{colCreated.length}</span>
                        </div>
                        <div className="space-y-3 flex-1">
                            {colCreated.length === 0 ? <ColumnEmptyState icon={Inbox} title="Bandeja limpia" message="No hay tickets nuevos esperando asignación." /> : colCreated.map(t => <TicketCard key={t.id} ticket={t} />)}
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
                <SearchTab isTech={isTech} />
            )}

            {!loading && activeTab === 'board' && tickets.length < totalTickets && (
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