import { useState, useEffect } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import ModalCrearTicket from '../components/ModalNuevoTicket';
import ModalDetalleTicket from '../components/ModalDetalleTicket';
import VistaCatalogos from '../components/VistaCatalogos';
import VistaDashboardAdmin from '../components/VistaDashboardAdmin';
import { BarChart3 } from 'lucide-react';
import {
  Plus, Ticket as TicketIcon, LogOut, Loader2, AlertCircle,
  LayoutDashboard, FolderCog, Search, Clock, ShieldCheck, CheckCircle
} from 'lucide-react';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notificacion, setNotificacion] = useState(null);

  const [vistaActiva, setVistaActiva] = useState('tickets');
  const [isModalCrearOpen, setIsModalCrearOpen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState(null);

  const mostrarAlerta = (mensaje, tipo = 'exito') => {
    setNotificacion({ mensaje, tipo });
    setTimeout(() => {
      setNotificacion(null);
    }, 4000);
  };

  const cargarTickets = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError('');
      let url = '/tickets/';

      if (user?.rol === 'tecnico' && user?.departamento_id) {
        url = `/tickets/departamento/${user.departamento_id}`;
      } else if (user?.rol === 'cliente') {
        url = `/tickets/usuario/${user.id}`;
      }

      const res = await api.get(url);
      setTickets(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error al cargar tickets:', err);
      setError('No se pudieron cargar los tickets del sistema.');
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      cargarTickets();
    }
  }, [user]);

  const handleTomarTicket = async (ticketId, e) => {
    e.stopPropagation();
    try {
      await api.post(`/tickets/${ticketId}/tomar/`);
      mostrarAlerta('¡Ticket tomado exitosamente!');
      cargarTickets();
    } catch (err) {
      console.error('Error al tomar el ticket:', err);
      mostrarAlerta(err.response?.data?.detail || 'No se pudo tomar el ticket.', 'error');
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
      </div>
    );
  }

  const ticketsAbiertos = tickets.filter(t => t.estado_id === 1);
  const ticketsEnProgreso = tickets.filter(t => t.estado_id === 2);
  const ticketsResueltos = tickets.filter(t => t.estado_id === 3);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex">

      {/* 1. SIDEBAR IZQUIERDO LIMPIO */}
      <aside className="w-64 bg-[#1e293b] text-slate-300 flex flex-col justify-between hidden md:flex select-none">
        <div>
          {/* Header Sidebar */}
          <div className="p-6 flex items-center gap-3 border-b border-slate-700/60">
            <div className="bg-sky-600 text-white p-2 rounded-xl shadow-md">
              <TicketIcon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-white font-bold text-base tracking-wide">HelpDesk</h1>
              <p className="text-[11px] text-slate-400 font-medium">System Administration</p>
            </div>
          </div>

          {/* Menú de navegación */}
          <nav className="p-4 space-y-1.5 text-sm font-medium">
            <button
              onClick={() => setVistaActiva('tickets')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition ${vistaActiva === 'tickets'
                  ? 'bg-sky-600 text-white shadow-sm font-semibold'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-white'
                }`}
            >
              <LayoutDashboard className="w-4 h-4" /> Tickets / Board
            </button>

            {user?.rol === 'admin' && (
              <>
                <button
                  onClick={() => setVistaActiva('catalogos')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition ${vistaActiva === 'catalogos'
                      ? 'bg-sky-600 text-white shadow-sm font-semibold'
                      : 'hover:bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                >
                  <FolderCog className="w-4 h-4" /> Catálogos (Admin)
                </button>

                <button
                  onClick={() => setVistaActiva('dashboard_admin')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition ${vistaActiva === 'dashboard_admin'
                      ? 'bg-sky-600 text-white shadow-sm font-semibold'
                      : 'hover:bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                >
                  <BarChart3 className="w-4 h-4" /> Reportes & Métricas
                </button>
              </>
            )}
          </nav>
        </div>

        {/* Footer Sidebar */}
        <div className="p-4 border-t border-slate-700/60 space-y-3">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-red-500/10 text-red-400 hover:text-red-300 text-sm transition text-left"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>

          <div className="flex items-center gap-3 pt-2">
            <div className="w-9 h-9 rounded-full bg-sky-600 text-white flex items-center justify-center font-bold text-sm shadow-inner">
              {user?.correo?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-white truncate">{user?.correo}</p>
              <p className="text-[10px] text-sky-400 uppercase font-medium flex items-center gap-1">
                {user?.rol === 'admin' && <ShieldCheck className="w-3 h-3" />}
                {user?.rol}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* 2. CONTENIDO PRINCIPAL */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="bg-white border-b border-slate-200 px-8 py-3.5 flex items-center justify-between shadow-xs">
          <div className="relative w-96">
            <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar en el sistema..."
              className="w-full bg-slate-100 text-sm rounded-xl pl-10 pr-12 py-2 border border-transparent focus:border-sky-500 focus:bg-white focus:outline-none transition"
            />
            <span className="absolute right-3 top-2.5 text-[10px] bg-slate-200 text-slate-500 font-mono px-1.5 py-0.5 rounded border border-slate-300">⌘K</span>
          </div>
        </header>

        {vistaActiva === 'tickets' ? (
          <div className="p-8 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Ticket Board</h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">{tickets.length} total tickets en el sistema</p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsModalCrearOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-xl shadow-sm transition"
                >
                  <Plus className="w-4 h-4" />
                  New Ticket
                </button>
              </div>
            </div>

            {/* Tarjetas Resumen */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Open</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{ticketsAbiertos.length}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <p className="text-xs font-semibold text-sky-600 uppercase tracking-wider">In Progress</p>
                <p className="text-2xl font-bold text-sky-600 mt-1">{ticketsEnProgreso.length}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Resolved</p>
                <p className="text-2xl font-bold text-emerald-600 mt-1">{ticketsResueltos.length}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Rol Actual</p>
                <p className="text-xs font-bold text-sky-700 mt-2 uppercase">{user?.rol}</p>
              </div>
            </div>

            {/* KANBAN */}
            {loading ? (
              <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-sky-600" />
                <span className="text-sm font-medium">Cargando tablero...</span>
              </div>
            ) : error ? (
              <div className="p-4 bg-red-50 text-red-700 text-sm rounded-xl flex items-center gap-2 border border-red-200">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{error}</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">

                {/* Columna To Do */}
                <div className="bg-slate-200/60 rounded-2xl p-4 space-y-4 border border-slate-300/60">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">To Do ({ticketsAbiertos.length})</h3>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {ticketsAbiertos.map(t => (
                      <div
                        key={t.id}
                        onClick={() => setSelectedTicketId(t.id)}
                        className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-md cursor-pointer transition space-y-3"
                      >
                        <div className="flex justify-between items-start">
                          <span className="text-[11px] font-mono font-bold text-slate-400">{t.codigo || `#${t.id}`}</span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-800 leading-snug">{t.titulo}</h4>
                        <p className="text-xs text-slate-500 line-clamp-2">{t.descripcion_inicial}</p>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-400">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Pendiente</span>
                          {(user?.rol === 'tecnico' || user?.rol === 'admin') && !t.tecnico_asignado_id && (
                            <button
                              onClick={(e) => handleTomarTicket(t.id, e)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-md font-semibold text-[10px]"
                            >
                              Tomar Ticket
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Columna In Progress */}
                <div className="bg-slate-200/60 rounded-2xl p-4 space-y-4 border border-slate-300/60">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">In Progress ({ticketsEnProgreso.length})</h3>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {ticketsEnProgreso.map(t => (
                      <div
                        key={t.id}
                        onClick={() => setSelectedTicketId(t.id)}
                        className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-md cursor-pointer transition space-y-3"
                      >
                        <div className="flex justify-between items-start">
                          <span className="text-[11px] font-mono font-bold text-sky-600">{t.codigo || `#${t.id}`}</span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-800 leading-snug">{t.titulo}</h4>
                        <p className="text-xs text-slate-500 line-clamp-2">{t.descripcion_inicial}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Columna Resolved */}
                <div className="bg-slate-200/60 rounded-2xl p-4 space-y-4 border border-slate-300/60">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Resolved ({ticketsResueltos.length})</h3>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {ticketsResueltos.map(t => (
                      <div
                        key={t.id}
                        onClick={() => setSelectedTicketId(t.id)}
                        className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:shadow-md cursor-pointer transition space-y-3 opacity-80"
                      >
                        <div className="flex justify-between items-start">
                          <span className="text-[11px] font-mono font-bold text-emerald-600">{t.codigo || `#${t.id}`}</span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-800 leading-snug line-through">{t.titulo}</h4>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}
          </div>
        ) : vistaActiva === 'catalogos' ? (
          <VistaCatalogos />
        ) : (
          <VistaDashboardAdmin />
        )}
      </main>

      <ModalCrearTicket
        isOpen={isModalCrearOpen}
        onClose={() => setIsModalCrearOpen(false)}
        onTicketCreado={cargarTickets}
      />

      <ModalDetalleTicket
        ticketId={selectedTicketId}
        isOpen={Boolean(selectedTicketId)}
        onClose={() => setSelectedTicketId(null)}
        onTicketActualizado={cargarTickets}
      />

      {/* Alerta Flotante de Notificación */}
      {notificacion && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg border text-sm font-semibold flex items-center gap-2 transition-all ${notificacion.tipo === 'error'
            ? 'bg-red-600 text-white border-red-700'
            : 'bg-slate-900 text-white border-slate-700'
          }`}>
          <span>{notificacion.mensaje}</span>
        </div>
      )}

    </div>
  );
}