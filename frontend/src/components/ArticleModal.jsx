import { useState } from 'react'
import { api } from '../api'
import { X, Loader2, BookOpen } from 'lucide-react'

// Categorías fijas de la biblioteca (deben coincidir con CategoryEnum del backend)
const CATEGORIAS = [
    { value: 'network', label: 'Red' },
    { value: 'hardware', label: 'Hardware' },
    { value: 'software', label: 'Software' },
    { value: 'access', label: 'Accesos' },
    { value: 'email', label: 'Correo' },
    { value: 'other', label: 'Otro' },
]

/**
 * Modal para crear o editar una entrada de la biblioteca.
 * - `article`: si viene, es edición (PATCH).
 * - `ticket`: si viene (y no `article`), la entrada nace de ese ticket resuelto
 *   y se prefiltran título y problema.
 */
export default function ArticleModal({ onClose, onSaved, article = null, ticket = null }) {
    const editando = Boolean(article)

    const [title, setTitle] = useState(article?.title || ticket?.title || '')
    const [problem, setProblem] = useState(article?.problem || ticket?.description || '')
    const [solution, setSolution] = useState(article?.solution || '')
    const [category, setCategory] = useState(article?.category || 'other')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        try {
            const body = { title, problem, solution, category }
            if (editando) {
                await api.patch(`/library/${article.id}`, body)
            } else {
                if (ticket) body.ticket_id = ticket.id
                await api.post('/library/', body)
            }
            onSaved()
        } catch (err) {
            setError(err.response?.data?.detail || 'Hubo un error al guardar la entrada. Intenta de nuevo.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm transition-opacity">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden border border-gray-100 dark:border-gray-800">

                {/* Cabecera */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center">
                        <BookOpen className="w-5 h-5 text-brand-primary dark:text-brand-light mr-2" />
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                            {editando ? 'Editar entrada' : 'Publicar en la Biblioteca'}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Cerrar"
                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 overflow-y-auto">
                    {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/30 p-2 rounded">{error}</p>}
                    {ticket && !editando && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 rounded-lg">
                            Se publicará a partir del ticket <span className="font-semibold">#{ticket.id}</span>
                        </p>
                    )}

                    <div>
                        <label htmlFor="article-title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Título</label>
                        <input
                            id="article-title"
                            type="text"
                            required
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-primary dark:bg-gray-800 dark:text-white outline-none transition-shadow"
                            placeholder="Ej: La impresora no responde"
                        />
                    </div>

                    <div>
                        <label htmlFor="article-category" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Categoría</label>
                        <select
                            id="article-category"
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-primary dark:bg-gray-800 dark:text-white outline-none transition-shadow"
                        >
                            {CATEGORIAS.map((c) => (
                                <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label htmlFor="article-problem" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Problema</label>
                        <textarea
                            id="article-problem"
                            required
                            rows="3"
                            value={problem}
                            onChange={(e) => setProblem(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-primary dark:bg-gray-800 dark:text-white outline-none transition-shadow resize-none"
                            placeholder="Qué le pasaba al usuario..."
                        ></textarea>
                    </div>

                    <div>
                        <label htmlFor="article-solution" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Solución</label>
                        <textarea
                            id="article-solution"
                            required
                            rows="4"
                            value={solution}
                            onChange={(e) => setSolution(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-primary dark:bg-gray-800 dark:text-white outline-none transition-shadow resize-none"
                            placeholder="Pasos que resolvieron el problema..."
                        ></textarea>
                    </div>

                    {/* Botones de acción */}
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
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (editando ? 'Guardar cambios' : 'Publicar')}
                        </button>
                    </div>
                </form>

            </div>
        </div>
    )
}
