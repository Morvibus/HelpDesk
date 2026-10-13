import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { toast } from 'react-hot-toast'
import { X, Loader2, ArrowRight, ArrowLeft, BookOpen, ChevronDown, CheckCircle2, Wifi, Monitor, AppWindow, KeyRound, Mail, HelpCircle } from 'lucide-react'
import { useUIStore } from '../store/uiStore'

// Categorías fijas (deben coincidir con CategoryEnum del backend)
const CATEGORIAS = [
    { value: 'network', label: 'Red', icon: Wifi },
    { value: 'hardware', label: 'Hardware', icon: Monitor },
    { value: 'software', label: 'Software', icon: AppWindow },
    { value: 'access', label: 'Accesos', icon: KeyRound },
    { value: 'email', label: 'Correo', icon: Mail },
    { value: 'other', label: 'Otro', icon: HelpCircle },
]

// Prioridades (ya no existe 'urgent')
const PRIORIDADES = [
    { value: 'low', label: 'Baja', desc: 'Puedo seguir trabajando' },
    { value: 'medium', label: 'Media', desc: 'Me complica, pero trabajo' },
    { value: 'high', label: 'Alta', desc: 'No puedo trabajar' },
]

export default function NewTicketModal() {
    const { isTicketModalOpen, closeTicketModal, triggerRefresh } = useUIStore()
    const navigate = useNavigate()

    const [step, setStep] = useState(1)
    const [title, setTitle] = useState('')
    const [category, setCategory] = useState('')
    const [description, setDescription] = useState('')
    const [priority, setPriority] = useState('low')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    // Sugerencias de la biblioteca para evitar tickets repetidos
    const [sugerencias, setSugerencias] = useState([])
    const [cargandoSugerencias, setCargandoSugerencias] = useState(false)
    const [sugerenciaAbierta, setSugerenciaAbierta] = useState(null)

    if (!isTicketModalOpen) return null

    const resetear = () => {
        setStep(1)
        setTitle('')
        setCategory('')
        setDescription('')
        setPriority('low')
        setError('')
        setSugerencias([])
        setSugerenciaAbierta(null)
    }

    const cerrar = () => {
        closeTicketModal()
        resetear()
    }

    const cargarSugerencias = async () => {
        setCargandoSugerencias(true)
        setSugerencias([])
        try {
            let items = (await api.get('/library/', {
                params: { limit: 3, q: title.trim(), category },
            })).data.items
            // Si el texto no coincide con nada, mostramos lo mejor de la categoría
            if (items.length === 0) {
                items = (await api.get('/library/', { params: { limit: 3, category } })).data.items
            }
            setSugerencias(items)
        } catch (err) {
            console.error('Error al buscar sugerencias:', err)
        } finally {
            setCargandoSugerencias(false)
        }
    }

    const irAPaso2 = (e) => {
        e.preventDefault()
        if (!title.trim() || !category) return
        setError('')
        setStep(2)
        cargarSugerencias()
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')
        try {
            const { data } = await api.post('/tickets/', {
                title, description, priority, category,
            })
            triggerRefresh()
            cerrar()
            toast.success(
                (t) => (
                    <span className="flex items-center gap-3 text-sm">
                        Ticket #{data.id} creado
                        <button
                            onClick={() => { toast.dismiss(t.id); navigate(`/ticket/${data.id}`) }}
                            className="font-semibold text-brand-primary dark:text-brand-light hover:underline"
                        >
                            Ver
                        </button>
                    </span>
                ),
                { duration: 6000 }
            )
        } catch {
            setError('Hubo un error al crear el ticket. Intenta de nuevo.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm transition-opacity">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden border border-gray-100 dark:border-gray-800">

                {/* Cabecera del Modal */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Crear Nuevo Ticket</h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Paso {step} de 2</p>
                    </div>
                    <button onClick={cerrar} aria-label="Cerrar" className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Barra de progreso */}
                <div className="h-1 bg-gray-100 dark:bg-gray-800">
                    <div className={`h-full bg-brand-primary transition-all duration-300 ${step === 1 ? 'w-1/2' : 'w-full'}`}></div>
                </div>

                {step === 1 ? (
                    <form onSubmit={irAPaso2} className="p-6 space-y-5 overflow-y-auto">
                        <div>
                            <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">¿Qué tipo de problema es?</label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {CATEGORIAS.map((c) => {
                                    const Icon = c.icon
                                    const activo = category === c.value
                                    return (
                                        <button
                                            key={c.value}
                                            type="button"
                                            onClick={() => setCategory(c.value)}
                                            className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-sm font-medium transition-colors ${activo ? 'border-brand-primary bg-brand-primary/10 text-brand-primary dark:border-brand-light dark:text-brand-light' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                                        >
                                            <Icon className="w-5 h-5" />
                                            {c.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        <div>
                            <label htmlFor="ticket-title" className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">Resumen corto</label>
                            <input
                                id="ticket-title"
                                type="text"
                                autoFocus
                                required
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-light dark:bg-gray-800 dark:text-white outline-none transition-shadow"
                                placeholder="Ej: No puedo imprimir"
                            />
                        </div>

                        <div className="flex justify-end space-x-3 pt-1">
                            <button type="button" onClick={cerrar} className="px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={!title.trim() || !category}
                                className="inline-flex items-center px-5 py-2.5 text-sm font-medium text-white bg-brand-primary hover:bg-brand-dark rounded-lg transition-colors disabled:opacity-50"
                            >
                                Continuar <ArrowRight className="w-4 h-4 ml-2" />
                            </button>
                        </div>
                    </form>
                ) : (
                    <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
                        {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 p-2 rounded">{error}</p>}

                        <div>
                            <label htmlFor="ticket-description" className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">Descripción detallada</label>
                            <textarea
                                id="ticket-description"
                                autoFocus
                                required
                                rows="4"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-light dark:bg-gray-800 dark:text-white outline-none transition-shadow resize-none"
                                placeholder="¿Qué estabas haciendo y qué apareció?"
                            ></textarea>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">Prioridad</label>
                            <div className="grid grid-cols-3 gap-2">
                                {PRIORIDADES.map((p) => (
                                    <button
                                        key={p.value}
                                        type="button"
                                        onClick={() => setPriority(p.value)}
                                        className={`px-3 py-2.5 rounded-xl border text-left transition-colors ${priority === p.value ? 'border-brand-primary bg-brand-primary/10 dark:border-brand-light' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                                    >
                                        <span className="block text-sm font-semibold text-gray-900 dark:text-white">{p.label}</span>
                                        <span className="block text-[11px] text-gray-500 dark:text-gray-400 leading-tight mt-0.5">{p.desc}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Sugerencias de la biblioteca */}
                        {(cargandoSugerencias || sugerencias.length > 0) && (
                            <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-gray-50/50 dark:bg-gray-800/30">
                                <p className="flex items-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                                    <BookOpen className="w-3.5 h-3.5 mr-1.5" /> Quizá ya está resuelto
                                </p>
                                {cargandoSugerencias ? (
                                    <p className="text-sm text-gray-400 flex items-center"><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Buscando...</p>
                                ) : (
                                    <ul className="space-y-1">
                                        {sugerencias.map((s) => {
                                            const abierta = sugerenciaAbierta === s.id
                                            return (
                                                <li key={s.id}>
                                                    <button type="button" onClick={() => setSugerenciaAbierta(abierta ? null : s.id)} className="w-full flex items-center justify-between text-left text-sm text-gray-700 dark:text-gray-200 hover:text-brand-primary dark:hover:text-brand-light transition-colors">
                                                        <span className="line-clamp-1">{s.title}</span>
                                                        <ChevronDown className={`w-3.5 h-3.5 shrink-0 ml-2 transition-transform ${abierta ? 'rotate-180' : ''}`} />
                                                    </button>
                                                    {abierta && (
                                                        <div className="mt-1.5 flex items-start gap-2 text-xs text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-2.5">
                                                            <CheckCircle2 className="w-4 h-4 text-brand-primary dark:text-brand-light shrink-0 mt-0.5" />
                                                            <span className="whitespace-pre-line">{s.solution}</span>
                                                        </div>
                                                    )}
                                                </li>
                                            )
                                        })}
                                    </ul>
                                )}
                            </div>
                        )}

                        <div className="flex justify-between pt-1">
                            <button type="button" onClick={() => setStep(1)} className="inline-flex items-center px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                <ArrowLeft className="w-4 h-4 mr-2" /> Atrás
                            </button>
                            <button
                                type="submit"
                                disabled={loading || !description.trim()}
                                className="px-5 py-2.5 text-sm font-medium text-white bg-brand-primary hover:bg-brand-dark rounded-lg flex items-center justify-center min-w-[120px] transition-colors disabled:opacity-70"
                            >
                                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Crear Ticket'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    )
}
