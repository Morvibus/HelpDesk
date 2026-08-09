import { useState, useEffect } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { X, Send, CheckCircle, ArrowRightLeft, ShieldAlert, Loader2, Lock, RotateCcw, Paperclip, FileText } from 'lucide-react';

export default function ModalDetalleTicket({ ticketId, isOpen, onClose, onTicketActualizado }) {
    const { user } = useAuth();
    const [ticket, setTicket] = useState(null);
    const [detalles, setDetalles] = useState([]);
    const [departamentos, setDepartamentos] = useState([]);
    const [nuevoMensaje, setNuevoMensaje] = useState('');
    const [esNotaInterna, setEsNotaInterna] = useState(false);
    const [nuevoDeptoId, setNuevoDeptoId] = useState('');
    const [archivoAdjunto, setArchivoAdjunto] = useState(null); // Estado para el archivo/imagen
    const [loading, setLoading] = useState(false);

    const cargarDatosTicket = async () => {
        if (!ticketId) return;
        try {
            setLoading(true);
            const [resTicket, resDetalles, resDeptos] = await Promise.all([
                api.get(`/tickets/${ticketId}`),
                api.get(`/tickets/${ticketId}/detalles/`),
                api.get('/departamentos/')
            ]);
            setTicket(resTicket.data);
            setDetalles(Array.isArray(resDetalles.data) ? resDetalles.data : []);
            setDepartamentos(Array.isArray(resDeptos.data) ? resDeptos.data : []);
        } catch (err) {
            console.error('Error al cargar detalle del ticket:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen && ticketId) {
            cargarDatosTicket();
        }
    }, [isOpen, ticketId]);

    const handleEnviarMensaje = async (e) => {
        e.preventDefault();
        if (!nuevoMensaje.trim() && !archivoAdjunto) return;

        try {
            // 1. Crear el mensaje de texto primero
            const resDetalle = await api.post(`/tickets/${ticketId}/detalles/`, {
                mensaje: nuevoMensaje.trim() || (archivoAdjunto ? `Archivo adjunto: ${archivoAdjunto.name}` : ''),
                es_nota_interna: user?.rol === 'cliente' ? false : esNotaInterna
            });

            const detalleId = resDetalle.data.id;

            // 2. Si hay un archivo adjunto, subirlo usando el endpoint de adjuntos
            if (archivoAdjunto && detalleId) {
                const formData = new FormData();
                formData.append('archivo', archivoAdjunto);

                await api.post(`/detalles/${detalleId}/adjuntos/`, formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                    },
                });
            }

            // Limpiar formulario y recargar
            setNuevoMensaje('');
            setEsNotaInterna(false);
            setArchivoAdjunto(null);
            cargarDatosTicket();
        } catch (err) {
            console.error('Error al enviar el mensaje o adjunto:', err);
            alert('No se pudo enviar el mensaje o el archivo.');
        }
    };

    const handleResolver = async () => {
        try {
            await api.patch(`/tickets/${ticketId}/resolver`);
            alert('Ticket marcado como resuelto.');
            onClose();
            onTicketActualizado();
        } catch (err) {
            alert('Error al resolver el ticket.');
        }
    };

    const handleEscalar = async () => {
        if (!nuevoDeptoId) {
            alert('Selecciona un departamento destino para escalar.');
            return;
        }
        try {
            await api.patch(`/tickets/${ticketId}/escalar?nuevo_departamento_id=${nuevoDeptoId}`);
            alert('Ticket escalado correctamente.');
            onClose();
            onTicketActualizado();
        } catch (err) {
            alert('Error al escalar el ticket.');
        }
    };

    const handleCerrarCliente = async () => {
        try {
            await api.patch(`/tickets/${ticketId}/cerrar`);
            alert('Ticket cerrado con éxito.');
            onClose();
            onTicketActualizado();
        } catch (err) {
            alert('Error al cerrar el ticket.');
        }
    };

    const handleReabrir = async () => {
        try {
            await api.patch(`/tickets/${ticketId}/reabrir`);
            alert('Ticket reabierto con éxito.');
            onClose();
            onTicketActualizado();
        } catch (err) {
            alert('Error al reabrir el ticket.');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">

                {/* Header Modal */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <div>
                        <span className="text-xs font-mono font-bold text-sky-600">{ticket?.codigo || `#${ticketId}`}</span>
                        <h3 className="text-lg font-black text-slate-800 leading-tight">{ticket?.titulo || 'Cargando...'}</h3>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Cuerpo del Detalle */}
                <div className="p-6 flex-1 overflow-y-auto space-y-6">
                    {loading ? (
                        <div className="flex justify-center py-10">
                            <Loader2 className="w-6 h-6 animate-spin text-sky-600" />
                        </div>
                    ) : (
                        <>
                            {/* Información y Estado */}
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2">
                                <p><span className="font-semibold">Descripción inicial:</span> {ticket?.descripcion_inicial}</p>
                                <div className="flex gap-4 pt-2 border-t border-slate-200">
                                    <span>Estado ID: <strong className="text-sky-600">{ticket?.estado_id}</strong></span>
                                    <span>Departamento ID: <strong>{ticket?.departamento_id}</strong></span>
                                </div>
                            </div>

                            {/* Panel de Acciones */}
                            <div className="bg-sky-50/60 border border-sky-100 p-4 rounded-xl space-y-3">
                                <h4 className="text-xs font-bold uppercase text-sky-900 tracking-wider">Acciones del Ticket</h4>

                                <div className="flex flex-wrap gap-2 items-center">
                                    {(user?.rol === 'tecnico' || user?.rol === 'admin') && ticket?.estado_id !== 3 && (
                                        <>
                                            <button
                                                onClick={handleResolver}
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-lg flex items-center gap-1.5 transition"
                                            >
                                                <CheckCircle className="w-4 h-4" /> Marcar como Resuelto
                                            </button>

                                            <div className="flex items-center gap-2 border-l border-sky-200 pl-3">
                                                <select
                                                    value={nuevoDeptoId}
                                                    onChange={(e) => setNuevoDeptoId(e.target.value)}
                                                    className="bg-white text-xs rounded-lg px-2.5 py-1.5 border border-slate-300 focus:outline-none"
                                                >
                                                    <option value="">Escalar a otro depto...</option>
                                                    {departamentos.map(d => (
                                                        <option key={d.id} value={d.id}>{d.nombre}</option>
                                                    ))}
                                                </select>
                                                <button
                                                    onClick={handleEscalar}
                                                    className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-2 rounded-lg flex items-center gap-1.5 transition"
                                                >
                                                    <ArrowRightLeft className="w-4 h-4" /> Escalar
                                                </button>
                                            </div>
                                        </>
                                    )}

                                    {user?.rol === 'cliente' && ticket?.estado_id !== 3 && (
                                        <button
                                            onClick={handleCerrarCliente}
                                            className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-2 rounded-lg flex items-center gap-1.5 transition"
                                        >
                                            <ShieldAlert className="w-4 h-4" /> Cerrar Ticket (Ya no necesito ayuda)
                                        </button>
                                    )}

                                    {ticket?.estado_id === 3 && (
                                        <div className="flex items-center justify-between w-full bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl">
                                            <span className="text-xs font-bold text-emerald-700">
                                                ✓ Este ticket se encuentra resuelto / cerrado.
                                            </span>
                                            <button
                                                onClick={handleReabrir}
                                                className="bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition shadow-xs"
                                            >
                                                <RotateCcw className="w-3.5 h-3.5" /> Reabrir Ticket
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Historial de Mensajes, Notas Privadas y Adjuntos */}
                            <div className="space-y-3">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Historial y Conversación</h4>
                                {detalles.map(d => {
                                    const esPrivada = d.es_nota_interna;
                                    return (
                                        <div
                                            key={d.id}
                                            className={`p-3 border rounded-xl space-y-2 shadow-xs ${esPrivada
                                                    ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                                                    : 'bg-white border-slate-200 text-slate-700'
                                                }`}
                                        >
                                            <div className="flex justify-between items-center text-[11px] opacity-75">
                                                <span className="flex items-center gap-1 font-semibold">
                                                    {esPrivada && <Lock className="w-3 h-3 text-amber-600" />}
                                                    {esPrivada ? 'Nota Privada / Interna' : `Usuario ID: ${d.usuario_id}`}
                                                </span>
                                                <span>{new Date(d.fecha_creacion).toLocaleString()}</span>
                                            </div>
                                            <p className="text-xs">{d.mensaje}</p>

                                            {/* Renderizar imágenes o archivos adjuntos si existen */}
                                            {d.adjuntos && d.adjuntos.length > 0 && (
                                                <div className="pt-2 flex flex-wrap gap-2 border-t border-slate-100">
                                                    {d.adjuntos.map(adj => {
                                                        const esImagen = adj.tipo_mime?.startsWith('image/');
                                                        return (
                                                            <div key={adj.id} className="mt-1">
                                                                {esImagen ? (
                                                                    <a href={adj.ruta_archivo} target="_blank" rel="noopener noreferrer">
                                                                        <img
                                                                            src={`http://192.168.123.2:8000${adj.ruta_archivo}`}
                                                                            alt={adj.nombre_archivo}
                                                                            className="max-h-36 rounded-lg border border-slate-200 object-cover hover:opacity-90 transition"
                                                                        />
                                                                    </a>
                                                                ) : (
                                                                    <a
                                                                        href={adj.ruta_archivo}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-medium text-slate-700 transition"
                                                                    >
                                                                        <FileText className="w-4 h-4 text-sky-600" />
                                                                        <span>{adj.nombre_archivo}</span>
                                                                    </a>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>

                {/* Input para Enviar Mensaje, Nota Privada y Archivo Adjunto */}
                <form onSubmit={handleEnviarMensaje} className="p-4 border-t border-slate-100 bg-slate-50 space-y-2">
                    {(user?.rol === 'tecnico' || user?.rol === 'admin') && (
                        <label className="flex items-center gap-2 text-xs font-medium text-amber-800 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={esNotaInterna}
                                onChange={(e) => setEsNotaInterna(e.target.checked)}
                                className="rounded border-amber-300 text-amber-600 focus:ring-amber-500 w-4 h-4"
                            />
                            <span className="flex items-center gap-1">
                                <Lock className="w-3 h-3" /> Guardar como nota privada interna (oculta para el cliente)
                            </span>
                        </label>
                    )}

                    {/* Mostrar miniatura o nombre del archivo seleccionado */}
                    {archivoAdjunto && (
                        <div className="flex items-center justify-between bg-sky-50 border border-sky-200 px-3 py-1.5 rounded-lg text-xs text-sky-800">
                            <span className="truncate flex items-center gap-1.5 font-medium">
                                <Paperclip className="w-3.5 h-3.5" /> {archivoAdjunto.name}
                            </span>
                            <button
                                type="button"
                                onClick={() => setArchivoAdjunto(null)}
                                className="text-sky-600 hover:text-red-600 font-bold ml-2"
                            >
                                ×
                            </button>
                        </div>
                    )}

                    <div className="flex gap-2 items-center">
                        {/* Input de archivo oculto con botón de clip */}
                        <label className="cursor-pointer bg-white border border-slate-300 hover:bg-slate-100 text-slate-600 p-2.5 rounded-xl transition flex items-center justify-center">
                            <Paperclip className="w-4 h-4" />
                            <input
                                type="file"
                                className="hidden"
                                onChange={(e) => setArchivoAdjunto(e.target.files[0])}
                            />
                        </label>

                        <input
                            type="text"
                            placeholder={esNotaInterna ? "Escribe una nota interna..." : "Escribe una respuesta o adjunta una imagen..."}
                            value={nuevoMensaje}
                            onChange={(e) => setNuevoMensaje(e.target.value)}
                            className={`flex-1 text-xs rounded-xl px-3.5 py-2.5 border focus:outline-none transition ${esNotaInterna
                                    ? 'bg-amber-50/50 border-amber-300 focus:border-amber-500'
                                    : 'bg-white border-slate-300 focus:border-sky-500'
                                }`}
                        />
                        <button
                            type="submit"
                            className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1 shadow-sm transition text-white ${esNotaInterna ? 'bg-amber-600 hover:bg-amber-700' : 'bg-sky-600 hover:bg-sky-700'
                                }`}
                        >
                            <Send className="w-4 h-4" /> Enviar
                        </button>
                    </div>
                </form>

            </div>
        </div>
    );
}