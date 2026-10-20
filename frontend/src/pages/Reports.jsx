import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import Layout from '../components/Layout'
import { toast } from 'react-hot-toast'
import { BarChart3, Download, AlertTriangle, Inbox, PauseCircle, Wrench, CalendarClock, PlusCircle, CheckCircle2 } from 'lucide-react'

// Reportes e indicadores de I&T (RF-11/12, CA-06). Una sola petición: GET /reports/summary.

const STATUS_LABELS = { created: 'Nuevo', assigned: 'Asignado', in_process: 'En Proceso', pending: 'Pendiente', solved: 'Solucionado', closed: 'Cerrado' }
const TYPE_LABELS = { incident: 'Incidente', service_request: 'Solicitud de servicio', maintenance: 'Mantenimiento', inquiry: 'Consulta' }

// Fechas locales "YYYY-MM-DD" (en-CA da ese formato)
const iso = (d) => d.toLocaleDateString('en-CA')
const PERIODOS = {
    mes: { label: 'Este mes', rango: () => { const h = new Date(); return [iso(new Date(h.getFullYear(), h.getMonth(), 1)), iso(h)] } },
    dias30: { label: 'Últimos 30 días', rango: () => [iso(new Date(Date.now() - 29 * 86400000)), iso(new Date())] },
    anio: { label: 'Este año', rango: () => { const h = new Date(); return [iso(new Date(h.getFullYear(), 0, 1)), iso(h)] } },
    todo: { label: 'Todo', rango: () => ['', ''] },
}

// CSV para Excel en español: separador ";" y BOM UTF-8 (si no, los acentos salen rotos)
export const descargarCsv = (nombre, columnas, filas) => {
    const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [columnas, ...filas].map(f => f.map(celda).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `${nombre}.csv` })
    a.click()
    URL.revokeObjectURL(url)
}

const Kpi = ({ icon: Icon, label, value, tone = 'text-brand-primary dark:text-brand-light', to }) => {
    const contenido = (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 flex items-center gap-3 h-full">
            <Icon className={`w-7 h-7 shrink-0 ${tone}`} />
            <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
            </div>
        </div>
    )
    return to ? <Link to={to} className="block hover:opacity-90">{contenido}</Link> : contenido
}

// Tabla de buckets con exportación; `etiqueta` traduce claves (estados, tipos) cuando hace falta
const ReportTable = ({ title, rows, archivo, etiqueta = (r) => r.label, conPromedio = false, vacio = 'Sin datos en el período.' }) => {
    const columnas = conPromedio ? [title, 'Cantidad', 'Promedio (h hábiles)'] : [title, 'Cantidad']
    const filas = rows.map(r => (conPromedio ? [etiqueta(r), r.count, r.avg_business_hours] : [etiqueta(r), r.count]))
    const max = Math.max(1, ...rows.map(r => r.count))
    return (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-5">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
                <button
                    onClick={() => descargarCsv(archivo, columnas, filas)}
                    disabled={rows.length === 0}
                    aria-label={`Descargar CSV de ${title}`}
                    className="inline-flex items-center text-xs font-medium text-brand-primary dark:text-brand-light hover:underline disabled:opacity-40 disabled:no-underline"
                >
                    <Download className="w-3.5 h-3.5 mr-1" /> CSV
                </button>
            </div>
            {rows.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">{vacio}</p>
            ) : (
                <ul className="space-y-2">
                    {rows.map(r => (
                        <li key={r.key ?? '∅'} className="text-sm">
                            <div className="flex justify-between gap-3">
                                <span className="text-gray-700 dark:text-gray-300 truncate">{etiqueta(r)}</span>
                                <span className="font-semibold text-gray-900 dark:text-white shrink-0">
                                    {r.count}{conPromedio && <span className="ml-2 text-xs font-normal text-gray-500">{r.avg_business_hours} h</span>}
                                </span>
                            </div>
                            {/* Barra proporcional: la lectura rápida; el número exacto va al lado */}
                            <div className="mt-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800">
                                <div className="h-1.5 rounded-full bg-brand-primary/70 dark:bg-brand-light/70" style={{ width: `${(r.count / max) * 100}%` }} />
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

export default function Reports() {
    const [periodo, setPeriodo] = useState('mes')
    const [rango, setRango] = useState(PERIODOS.mes.rango)
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)

    const elegir = (clave) => { setPeriodo(clave); setRango(PERIODOS[clave].rango()) }

    useEffect(() => {
        const controller = new AbortController()
        const params = {}
        if (rango[0]) params.from = rango[0]
        if (rango[1]) params.to = rango[1]
        setLoading(true)
        api.get('/reports/summary', { params, signal: controller.signal })
            .then(res => setData(res.data))
            .catch(err => { if (err.code !== 'ERR_CANCELED') toast.error(err.response?.data?.detail || 'No se pudieron cargar los reportes') })
            .finally(() => setLoading(false))
        return () => controller.abort()
    }, [rango])

    const sufijo = rango[0] || rango[1] ? `_${rango[0] || 'inicio'}_${rango[1] || 'hoy'}` : '_todo'
    const inputClass = "px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-light outline-none"

    return (
        <Layout>
            <div className="flex items-center mb-6">
                <div className="p-3 rounded-lg bg-brand-primary/10 dark:bg-brand-primary/20 mr-4">
                    <BarChart3 className="h-8 w-8 text-brand-primary dark:text-brand-light" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reportes</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Indicadores de I&T por período, exportables a CSV</p>
                </div>
            </div>

            {/* Foto actual: no depende del período */}
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Ahora mismo</h2>
            {data && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
                    <Kpi icon={Inbox} label="Tickets abiertos" value={data.open_now} />
                    <Kpi icon={AlertTriangle} label="Vencidos (fuera de SLA)" value={data.overdue_now} tone="text-red-500" />
                    <Kpi icon={PauseCircle} label="Pendientes" value={data.pending_now} tone="text-amber-500" />
                    <Kpi icon={Wrench} label="Mantenimientos vencidos" value={data.maintenances_overdue} tone="text-red-500" to="/activos" />
                    <Kpi icon={CalendarClock} label="Mantenimientos (30 días)" value={data.maintenances_upcoming} to="/activos" />
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2 mb-4">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mr-2">Período</h2>
                {Object.entries(PERIODOS).map(([k, v]) => (
                    <button
                        key={k}
                        onClick={() => elegir(k)}
                        aria-pressed={periodo === k}
                        className={`px-3 py-1.5 text-sm font-medium rounded-full border transition-colors ${periodo === k ? 'border-brand-primary bg-brand-primary/10 text-brand-primary dark:border-brand-light dark:text-brand-light' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                    >
                        {v.label}
                    </button>
                ))}
                <input type="date" aria-label="Desde" value={rango[0]} onChange={(e) => { setPeriodo(''); setRango([e.target.value, rango[1]]) }} className={inputClass} />
                <span className="text-gray-400">→</span>
                <input type="date" aria-label="Hasta" value={rango[1]} onChange={(e) => { setPeriodo(''); setRango([rango[0], e.target.value]) }} className={inputClass} />
            </div>

            {loading && !data ? (
                <p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">Cargando reportes...</p>
            ) : data && (
                <div className={loading ? 'opacity-60 transition-opacity' : ''}>
                    <div className="grid grid-cols-2 gap-3 mb-6 max-w-md">
                        <Kpi icon={PlusCircle} label="Creados en el período" value={data.created} />
                        <Kpi icon={CheckCircle2} label="Resueltos en el período" value={data.resolved} tone="text-green-500" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        <ReportTable title="Por estado" rows={data.by_status} archivo={`tickets_por_estado${sufijo}`} etiqueta={(r) => STATUS_LABELS[r.key] || r.key} />
                        <ReportTable title="Por tipo" rows={data.by_type} archivo={`tickets_por_tipo${sufijo}`} etiqueta={(r) => TYPE_LABELS[r.key] || r.key} />
                        <ReportTable title="Por categoría" rows={data.by_category} archivo={`tickets_por_categoria${sufijo}`} />
                        <ReportTable title="Por departamento" rows={data.by_department} archivo={`tickets_por_departamento${sufijo}`} />
                        <ReportTable title="Resueltos por técnico" rows={data.by_technician} archivo={`resueltos_por_tecnico${sufijo}`} conPromedio />
                        <ReportTable title="Activos con más incidencias" rows={data.top_assets} archivo={`activos_con_mas_incidencias${sufijo}`} vacio="Ningún ticket del período tiene activo vinculado." />
                        <ReportTable title="Accesos vigentes por sistema" rows={data.access_enabled_by_system} archivo="accesos_vigentes_por_sistema" vacio="No hay accesos habilitados." />
                    </div>
                    <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                        "Creados" y las tablas por estado/tipo/categoría/departamento/activo cuentan tickets <em>creados</em> en el período;
                        "Resueltos" y "por técnico", los <em>cerrados</em> en el período. Accesos vigentes y los indicadores de arriba son del momento actual.
                        El historial completo de un activo está en su ficha (Activos).
                    </p>
                </div>
            )}
        </Layout>
    )
}
