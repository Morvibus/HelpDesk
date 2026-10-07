import { useState } from 'react'
import { api } from '../api'
import { X, Loader2 } from 'lucide-react'
import { useUIStore } from '../store/uiStore'

export default function NewTicketModal() {
    const { isTicketModalOpen, closeTicketModal, triggerRefresh } = useUIStore()

    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [priority, setPriority] = useState('low')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    // Si el modal está cerrado, no renderizamos nada
    if (!isTicketModalOpen) return null

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        try {
            await api.post('/tickets/', { title, description, priority })

            // Si tiene éxito: limpiamos el formulario, cerramos el modal y recargamos la tabla
            setTitle('')
            setDescription('')
            setPriority('low')
            triggerRefresh()
            closeTicketModal()

        } catch {
            setError('Hubo un error al crear el ticket. Intenta de nuevo.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm transition-opacity">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-gray-100 dark:border-gray-800 animate-in fade-in zoom-in-95 duration-200">

                {/* Cabecera del Modal */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Crear Nuevo Ticket</h2>
                    <button
                        onClick={closeTicketModal}
                        className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Cuerpo del Formulario */}
                <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    <div>
                        <label htmlFor="ticket-title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Asunto del problema</label>
                        <input
                            id="ticket-title"
                            type="text"
                            required
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-primary dark:bg-gray-800 dark:text-white outline-none transition-shadow"
                            placeholder="Ej. La impresora de recepción no funciona"
                        />
                    </div>

                    <div>
                        <label htmlFor="ticket-priority" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nivel de Prioridad</label>
                        <select
                            id="ticket-priority"
                            value={priority}
                            onChange={(e) => setPriority(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-primary dark:bg-gray-800 dark:text-white outline-none transition-shadow"
                        >
                            <option value="low">Baja - No afecta mi trabajo principal</option>
                            <option value="medium">Media - Afecta parcialmente mi trabajo</option>
                            <option value="high">Alta - No puedo continuar trabajando</option>
                        </select>
                    </div>

                    <div>
                        <label htmlFor="ticket-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción detallada</label>
                        <textarea
                            id="ticket-description"
                            required
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows="4"
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-primary dark:bg-gray-800 dark:text-white outline-none transition-shadow resize-none"
                            placeholder="Describe qué estabas haciendo y qué error apareció..."
                        ></textarea>
                    </div>

                    {/* Botones de acción */}
                    <div className="flex justify-end space-x-3 pt-2">
                        <button
                            type="button"
                            onClick={closeTicketModal}
                            className="px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-5 py-2.5 text-sm font-medium text-white bg-brand-primary hover:bg-brand-dark rounded-lg flex items-center justify-center min-w-[120px] transition-colors disabled:opacity-70"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Crear Ticket'}
                        </button>
                    </div>
                </form>

            </div>
        </div>
    )
}