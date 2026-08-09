import { useState, useEffect } from 'react';
import api from '../api/axios';
import { Loader2, AlertCircle, BarChart3, Users, CheckCircle2, Clock, Layers } from 'lucide-react';

export default function VistaDashboardAdmin() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const cargarEstadisticas = async () => {
        try {
            setLoading(true);
            const res = await api.get('/admin/dashboard-stats');
            setStats(res.data);
        } catch (err) {
            console.error('Error al cargar estadísticas:', err);
            setError('No se pudieron cargar las métricas del sistema.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        cargarEstadisticas();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-sky-600" />
                <span className="text-sm font-medium">Cargando métricas del sistema...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-50 text-red-700 text-sm rounded-xl flex items-center gap-2 border border-red-200">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{error}</span>
            </div>
        );
    }

    const { kpis, por_departamento } = stats || {};
    const maxDepto = Math.max(...(por_departamento?.map(d => d.total) || [1]), 1);

    return (
        <div className="p-8 space-y-6 max-w-6xl mx-auto w-full">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                    <BarChart3 className="w-7 h-7 text-sky-600" /> Panel de Métricas y Reportes
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">Resumen general del rendimiento del HelpDesk</p>
            </div>

            {/* Tarjetas KPI Superiores */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
                    <div className="flex items-center justify-between text-slate-500">
                        <span className="text-xs font-semibold uppercase tracking-wider">Total Tickets</span>
                        <Layers className="w-5 h-5 text-sky-600" />
                    </div>
                    <p className="text-3xl font-black text-slate-900">{kpis?.total || 0}</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
                    <div className="flex items-center justify-between text-slate-500">
                        <span className="text-xs font-semibold uppercase tracking-wider">Abiertos (To Do)</span>
                        <Clock className="w-5 h-5 text-amber-500" />
                    </div>
                    <p className="text-3xl font-black text-amber-600">{kpis?.abiertos || 0}</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
                    <div className="flex items-center justify-between text-slate-500">
                        <span className="text-xs font-semibold uppercase tracking-wider">En Progreso</span>
                        <Users className="w-5 h-5 text-sky-500" />
                    </div>
                    <p className="text-3xl font-black text-sky-600">{kpis?.en_progreso || 0}</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
                    <div className="flex items-center justify-between text-slate-500">
                        <span className="text-xs font-semibold uppercase tracking-wider">Resueltos</span>
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    </div>
                    <p className="text-3xl font-black text-emerald-600">{kpis?.resueltos || 0}</p>
                </div>
            </div>

            {/* Sección de Gráfica de Barras por Departamento */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">Carga de Tickets por Departamento</h3>

                <div className="space-y-4 pt-2">
                    {por_departamento && por_departamento.length > 0 ? (
                        por_departamento.map((item, idx) => {
                            const porcentaje = (item.total / maxDepto) * 100;
                            return (
                                <div key={idx} className="space-y-1.5">
                                    <div className="flex justify-between text-xs font-semibold">
                                        <span className="text-slate-700">{item.departamento}</span>
                                        <span className="text-slate-500 font-mono">{item.total} tickets</span>
                                    </div>
                                    <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                                        <div
                                            className="bg-sky-600 h-full rounded-full transition-all duration-500"
                                            style={{ width: `${porcentaje}%` }}
                                        ></div>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <p className="text-xs text-slate-400">No hay datos suficientes de departamentos registrados.</p>
                    )}
                </div>
            </div>
        </div>
    );
}