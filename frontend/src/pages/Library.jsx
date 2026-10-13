import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import Layout from '../components/Layout'
import ArticleModal from '../components/ArticleModal'
import { useAuthStore, decodeToken } from '../store/authStore'
import { toast } from 'react-hot-toast'
import { BookOpen, Plus, Search, Pencil, Trash2, ChevronDown, CheckCircle2 } from 'lucide-react'

// Categorías fijas (deben coincidir con CategoryEnum del backend)
const CATEGORIAS = [
    { value: 'network', label: 'Red' },
    { value: 'hardware', label: 'Hardware' },
    { value: 'software', label: 'Software' },
    { value: 'access', label: 'Accesos' },
    { value: 'email', label: 'Correo' },
    { value: 'other', label: 'Otro' },
]

const CATEGORIA_LABELS = Object.fromEntries(CATEGORIAS.map(c => [c.value, c.label]))

const CATEGORIA_ESTILOS = {
    network: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800/50',
    hardware: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/50',
    software: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800/50',
    access: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800/50',
    email: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800/50',
    other: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
}

export default function Library() {
    const token = useAuthStore(state => state.token)
    const role = useAuthStore(state => state.role)
    const navigate = useNavigate()

    const puedePublicar = role === 'technician' || role === 'admin'
    const payload = decodeToken(token) || {}
    const myUserId = parseInt(payload.sub)

    const [articles, setArticles] = useState([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [q, setQ] = useState('')
    const [category, setCategory] = useState('')
    const [expandedId, setExpandedId] = useState(null)
    const [recarga, setRecarga] = useState(0)
    // null = cerrado; {} = publicar libre; { article } = editar; { ticket } = crear desde ticket
    const [modal, setModal] = useState(null)

    // oxlint-disable react/exhaustive-effect-dependencies -- token y recarga recargan a propósito
    useEffect(() => {
        const controller = new AbortController()
        const timer = setTimeout(async () => {
            try {
                const params = { limit: 50, offset: 0 }
                if (q.trim()) params.q = q.trim()
                if (category) params.category = category
                const res = await api.get('/library/', { params, signal: controller.signal })
                setArticles(res.data.items)
                setTotal(res.data.total)
            } catch (err) {
                if (err.code === 'ERR_CANCELED') return
                console.error('Error al cargar la biblioteca:', err)
            } finally {
                setLoading(false)
            }
        }, 250)
        return () => { clearTimeout(timer); controller.abort() }
    }, [q, category, token, recarga])
    // oxlint-enable react/exhaustive-effect-dependencies

    const loadMore = async () => {
        setLoadingMore(true)
        try {
            const params = { limit: 50, offset: articles.length }
            if (q.trim()) params.q = q.trim()
            if (category) params.category = category
            const res = await api.get('/library/', { params })
            setArticles(prev => [...prev, ...res.data.items])
            setTotal(res.data.total)
        } catch (err) {
            console.error('Error al cargar más entradas:', err)
        } finally {
            setLoadingMore(false)
        }
    }

    const handleDelete = async (article) => {
        if (!window.confirm(`¿Eliminar "${article.title}" de la biblioteca?`)) return
        try {
            await api.delete(`/library/${article.id}`)
            setArticles(prev => prev.filter(a => a.id !== article.id))
            setTotal(t => Math.max(0, t - 1))
            toast.success('Entrada eliminada')
        } catch (err) {
            toast.error(err.response?.data?.detail || 'No se pudo eliminar la entrada')
        }
    }

    const handleSaved = () => {
        setModal(null)
        setRecarga(n => n + 1)
        toast.success('Entrada guardada')
    }

    const puedeGestionar = (article) => role === 'admin' || article.created_by === myUserId

    return (
        <Layout>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                        <BookOpen className="w-6 h-6 mr-2 text-brand-primary dark:text-brand-light" />
                        Biblioteca de Soluciones
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Soluciones documentadas por el equipo de soporte.
                    </p>
                </div>
                {puedePublicar && (
                    <button
                        onClick={() => setModal({})}
                        className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg shadow-sm text-white bg-brand-primary hover:bg-brand-dark transition-colors"
                    >
                        <Plus className="mr-2 h-4 w-4" /> Nueva entrada
                    </button>
                )}
            </div>

            {/* Filtros */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Buscar por problema o solución..."
                        className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-light dark:text-white transition-colors"
                    />
                </div>
                <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-light dark:text-white transition-colors"
                >
                    <option value="">Todas las categorías</option>
                    {CATEGORIAS.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                </select>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                    <div className="w-8 h-8 border-4 border-brand-primary/30 border-t-brand-primary dark:border-brand-light/30 dark:border-t-brand-light rounded-full animate-spin mb-4"></div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Cargando biblioteca...</p>
                </div>
            ) : articles.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-20 px-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
                    <BookOpen className="w-10 h-10 text-gray-400 dark:text-gray-500 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">Sin soluciones todavía</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
                        {q || category
                            ? 'Ninguna entrada coincide con tu búsqueda.'
                            : 'Cuando un ticket se resuelva, su solución puede publicarse acá para consultarla.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {articles.map((a) => {
                        const expandido = expandedId === a.id
                        return (
                            <div key={a.id} className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${CATEGORIA_ESTILOS[a.category] || ''}`}>
                                        {CATEGORIA_LABELS[a.category] || a.category}
                                    </span>
                                    {puedeGestionar(a) && (
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => setModal({ article: a })}
                                                title="Editar"
                                                aria-label="Editar"
                                                className="p-1.5 text-gray-400 hover:text-brand-primary dark:hover:text-brand-light transition-colors"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(a)}
                                                title="Eliminar"
                                                aria-label="Eliminar"
                                                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={() => setExpandedId(expandido ? null : a.id)}
                                    className="mt-3 w-full text-left flex items-start justify-between group"
                                >
                                    <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-brand-primary dark:group-hover:text-brand-light transition-colors">
                                        {a.title}
                                    </h3>
                                    <span className="text-gray-400 mt-1 shrink-0">
                                        <ChevronDown className={`w-4 h-4 transition-transform ${expandido ? 'rotate-180' : ''}`} />
                                    </span>
                                </button>

                                <p className={`mt-2 text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line ${expandido ? '' : 'line-clamp-2'}`}>
                                    {a.problem}
                                </p>

                                {expandido ? (
                                    <div className="mt-4 flex items-start gap-3 bg-brand-primary/5 dark:bg-brand-light/10 border border-brand-primary/10 dark:border-brand-light/20 rounded-lg p-4">
                                        <CheckCircle2 className="w-5 h-5 text-brand-primary dark:text-brand-light shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-xs font-bold uppercase tracking-wider text-brand-primary dark:text-brand-light mb-1">Solución</p>
                                            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{a.solution}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mt-3 flex items-center text-xs text-brand-primary dark:text-brand-light font-medium">
                                        <BookOpen className="w-3.5 h-3.5 mr-1" /> Ver solución
                                    </div>
                                )}

                                <div className="mt-4 pt-3 border-t border-gray-50 dark:border-gray-800/70 flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
                                    <span>{new Date(a.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                    {a.ticket_id && (
                                        <button
                                            onClick={() => navigate(`/ticket/${a.ticket_id}`)}
                                            className="hover:text-brand-primary dark:hover:text-brand-light transition-colors"
                                        >
                                            Ticket #{a.ticket_id}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {!loading && articles.length > 0 && articles.length < total && (
                <div className="flex justify-center mt-6">
                    <button
                        onClick={loadMore}
                        disabled={loadingMore}
                        className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                    >
                        {loadingMore ? 'Cargando...' : `Cargar más (${articles.length} de ${total})`}
                    </button>
                </div>
            )}

            {modal && (
                <ArticleModal
                    onClose={() => setModal(null)}
                    onSaved={handleSaved}
                    article={modal.article || null}
                    ticket={modal.ticket || null}
                />
            )}
        </Layout>
    )
}
