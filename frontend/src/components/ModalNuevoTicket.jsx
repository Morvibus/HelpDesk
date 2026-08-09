import { useState, useEffect } from 'react';
import api from '../api/axios';

export default function ModalCrearTicket({ isOpen, onClose, onTicketCreado }) {
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [departamentoId, setDepartamentoId] = useState('');
  const [departamentos, setDepartamentos] = useState([]);
  const [prioridadId, setPrioridadId] = useState(2); // Normal por defecto
  const [loading, setLoading] = useState(false);

  // Cargar los departamentos al abrir el modal para llenar el ListBox
  useEffect(() => {
    if (isOpen) {
      api.get('/departamentos/')
        .then(res => setDepartamentos(res.data))
        .catch(err => console.error('Error al cargar departamentos:', err));
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      await api.post('/tickets/', {
        titulo,
        descripcion_inicial: descripcion,
        departamento_id: Number(departamentoId),
        prioridad_id: Number(prioridadId),
        solicitante_id: 1 // O usa el ID del usuario logueado desde tu AuthContext
      });
      onTicketCreado();
      onClose();
    } catch (err) {
      console.error('Error al crear ticket:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Crear Nuevo Requerimiento</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Título del Requerimiento</label>
            <input
              type="text"
              required
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="Ej. Fallo en conexión de red"
            />
          </div>

          {/* LIST BOX DE DEPARTAMENTOS (Reemplaza el input numérico) */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Departamento Destino</label>
            <select
              required
              value={departamentoId}
              onChange={e => setDepartamentoId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-sky-500 bg-white"
            >
              <option value="">Seleccione un departamento...</option>
              {departamentos.map(dep => (
                <option key={dep.id} value={dep.id}>
                  {dep.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Descripción Inicial</label>
            <textarea
              rows={3}
              required
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-sky-500 resize-none"
              placeholder="Detalle el inconveniente..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm bg-sky-600 text-white rounded-lg hover:bg-sky-700 font-medium"
            >
              {loading ? 'Guardando...' : 'Crear Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}