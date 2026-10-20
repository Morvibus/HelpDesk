import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, fetchCatalog } from '../api'
import Layout from '../components/Layout'
import { descargarCsv } from './Reports'
import { toast } from 'react-hot-toast'
import { ArrowLeft, Loader2, Monitor, Plus, Search, X, Pencil, UserCheck, Undo2, MessageSquarePlus, Wrench, Download } from 'lucide-react'

// Activos (RF-06/07/08): listado (/activos) y ficha con historial (/activos/:id). Solo I&T.

const LIMIT = 50

const STATUS_LABELS = { active: 'Operativo', in_repair: 'En reparación', retired: 'De baja' }
const STATUS_STYLES = {
    active: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800/50',
    in_repair: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50',
    retired: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
}
const TICKET_STATUS = { created: 'Nuevo', assigned: 'Asignado', in_process: 'En Proceso', pending: 'Pendiente', solved: 'Solucionado', closed: 'Cerrado' }
// Bitácora: action -> etiqueta (campos editados, estado, observaciones, devoluciones)
const EVENT_LABELS = {
    created: 'Alta', status: 'Estado', tag: 'Código', asset_type: 'Tipo', brand: 'Marca', model: 'Modelo',
    serial: 'Serie', notes: 'Notas', note: 'Observación', returned: 'Devolución',
    maintenances_cancelled: 'Mantenimientos cancelados',
}

const inputClass = "w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-primary dark:focus:ring-brand-light outline-none transition-shadow"
const btnPrimary = "inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-brand-primary hover:bg-brand-dark rounded-lg transition-colors disabled:opacity-50"
const btnSecondary = "inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
// Timestamps naive del backend = UTC
const fecha = (ts) => new Date(`${ts}Z`).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const StatusBadge = ({ status }) => (
    <span className={`inline-flex px-2.5 py-0.5 text-xs font-semibold rounded-full border ${STATUS_STYLES[status] || ''}`}>
        {STATUS_LABELS[status] || status}
    </span>
)

// Catálogos y directorio de personas (nombres en listados e historial)
const useLookups = () => {
    const [lookups, setLookups] = useState({ tipos: [], departamentos: [], personas: [] })
    useEffect(() => {
        Promise.all([fetchCatalog('/asset-types/'), fetchCatalog('/departments/'), fetchCatalog('/users/directory/')])
            .then(([tipos, departamentos, personas]) => setLookups({ tipos, departamentos, personas }))
            .catch(() => toast.error('No se pudieron cargar los catálogos'))
    }, [])
    const nombre = (lista, id, campo = 'id') => lista.find(x => x[campo] === id)?.name
    return {
        ...lookups,
        tipo: (key) => nombre(lookups.tipos, key, 'key') || key,
        persona: (id) => (id == null ? null : nombre(lookups.personas, id) || `#${id}`),
        departamento: (id) => (id == null ? null : nombre(lookups.departamentos, id) || `#${id}`),
    }
}

// "Ana · Ventas · Sala 2" (lo que tenga la asignación)
const destino = (a, lk) => [lk.persona(a.user_id), lk.departamento(a.department_id), a.location].filter(Boolean).join(' · ')

const Modal = ({ title, onClose, children }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-gray-100 dark:border-gray-800">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h2>
                <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5">{children}</div>
        </div>
    </div>
)

const Field = ({ id, label, children }) => (
    <div>
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
        {children}
    </div>
)

// Alta y edición comparten formulario; en edición solo se envía lo que cambió
const AssetFormModal = ({ asset, tipos, onClose, onSaved }) => {
    const [form, setForm] = useState({
        tag: asset?.tag || '', asset_type: asset?.asset_type || '', brand: asset?.brand || '',
        model: asset?.model || '', serial: asset?.serial || '', notes: asset?.notes || '',
    })
    const [saving, setSaving] = useState(false)
    const set = (campo) => (e) => setForm({ ...form, [campo]: e.target.value })

    const submit = async (e) => {
        e.preventDefault()
        setSaving(true)
        try {
            const res = asset
                ? await api.patch(`/assets/${asset.id}`, Object.fromEntries(Object.entries(form).filter(([k, v]) => v !== (asset[k] || ''))))
                : await api.post('/assets/', form)
            toast.success(asset ? 'Activo actualizado' : 'Activo registrado')
            onSaved(res.data)
        } catch (err) {
            toast.error(err.response?.data?.detail || 'No se pudo guardar')
        } finally {
            setSaving(false)
        }
    }

    // Tipos activos, más el actual aunque esté dado de baja
    const opciones = tipos.filter(t => t.is_active || t.key === asset?.asset_type)

    return (
        <Modal title={asset ? `Editar ${asset.tag}` : 'Nuevo activo'} onClose={onClose}>
            <form onSubmit={submit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <Field id="asset-tag" label="Código de inventario">
                        <input id="asset-tag" required value={form.tag} onChange={set('tag')} className={inputClass} placeholder="PC-001" />
                    </Field>
                    <Field id="asset-type" label="Tipo">
                        <select id="asset-type" required value={form.asset_type} onChange={set('asset_type')} className={inputClass}>
                            <option value="" disabled>Elegir...</option>
                            {opciones.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
                        </select>
                    </Field>
                    <Field id="asset-brand" label="Marca"><input id="asset-brand" value={form.brand} onChange={set('brand')} className={inputClass} /></Field>
                    <Field id="asset-model" label="Modelo"><input id="asset-model" value={form.model} onChange={set('model')} className={inputClass} /></Field>
                </div>
                <Field id="asset-serial" label="Número de serie"><input id="asset-serial" value={form.serial} onChange={set('serial')} className={inputClass} /></Field>
                <Field id="asset-notes" label="Notas"><textarea id="asset-notes" rows={2} value={form.notes} onChange={set('notes')} className={`${inputClass} resize-none`} /></Field>
                <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={onClose} className={btnSecondary}>Cancelar</button>
                    <button type="submit" disabled={saving} className={btnPrimary}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}</button>
                </div>
            </form>
        </Modal>
    )
}

const AssignModal = ({ asset, lk, onClose, onSaved }) => {
    const [form, setForm] = useState({ user_id: '', department_id: '', location: '', notes: '' })
    const [saving, setSaving] = useState(false)
    const set = (campo) => (e) => setForm({ ...form, [campo]: e.target.value })

    const submit = async (e) => {
        e.preventDefault()
        setSaving(true)
        try {
            const res = await api.post(`/assets/${asset.id}/assign`, {
                user_id: form.user_id === '' ? null : Number(form.user_id),
                department_id: form.department_id === '' ? null : Number(form.department_id),
                location: form.location, notes: form.notes,
            })
            toast.success('Asignación registrada')
            onSaved(res.data)
        } catch (err) {
            toast.error(err.response?.data?.detail || 'No se pudo asignar')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal title={`${asset.current_assignment ? 'Mover' : 'Asignar'} ${asset.tag}`} onClose={onClose}>
            <form onSubmit={submit} className="space-y-4">
                {asset.current_assignment && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">La asignación actual ({destino(asset.current_assignment, lk)}) se cerrará al guardar.</p>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400">Indica al menos uno: persona, departamento o ubicación.</p>
                <Field id="assign-user" label="Persona">
                    <select id="assign-user" value={form.user_id} onChange={(e) => {
                        // Al elegir persona se sugiere su departamento
                        const persona = lk.personas.find(p => p.id === Number(e.target.value))
                        setForm({ ...form, user_id: e.target.value, department_id: persona?.department_id ? String(persona.department_id) : form.department_id })
                    }} className={inputClass}>
                        <option value="">—</option>
                        {lk.personas.filter(p => p.is_active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </Field>
                <Field id="assign-dep" label="Departamento">
                    <select id="assign-dep" value={form.department_id} onChange={set('department_id')} className={inputClass}>
                        <option value="">—</option>
                        {lk.departamentos.filter(d => d.is_active).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                </Field>
                <Field id="assign-loc" label="Ubicación"><input id="assign-loc" value={form.location} onChange={set('location')} className={inputClass} placeholder="Ej: Sala de juntas" /></Field>
                <Field id="assign-notes" label="Observaciones de la entrega"><input id="assign-notes" value={form.notes} onChange={set('notes')} className={inputClass} placeholder="Ej: con cargador y mochila" /></Field>
                <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={onClose} className={btnSecondary}>Cancelar</button>
                    <button type="submit" disabled={saving || (!form.user_id && !form.department_id && !form.location.trim())} className={btnPrimary}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Registrar entrega'}
                    </button>
                </div>
            </form>
        </Modal>
    )
}

// --- Pestaña Inventario ---
const InventoryTab = ({ lk }) => {
    const navigate = useNavigate()
    const [items, setItems] = useState([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [q, setQ] = useState('')
    const [tipo, setTipo] = useState('')
    const [estado, setEstado] = useState('')
    const [creando, setCreando] = useState(false)

    const params = (offset) => {
        const p = { limit: LIMIT, offset }
        if (q.trim()) p.q = q.trim()
        if (tipo) p.asset_type = tipo
        if (estado) p.status = estado
        return p
    }

    // oxlint-disable react/exhaustive-effect-dependencies -- params se arma con q/tipo/estado
    useEffect(() => {
        const controller = new AbortController()
        const timer = setTimeout(async () => {  // debounce de la búsqueda
            try {
                const res = await api.get('/assets/', { params: params(0), signal: controller.signal })
                setItems(res.data.items)
                setTotal(res.data.total)
            } catch (err) {
                if (err.code !== 'ERR_CANCELED') toast.error('No se pudieron cargar los activos')
            } finally {
                setLoading(false)
            }
        }, 250)
        return () => { clearTimeout(timer); controller.abort() }
    }, [q, tipo, estado])
    // oxlint-enable react/exhaustive-effect-dependencies

    const loadMore = async () => {
        setLoadingMore(true)
        try {
            const res = await api.get('/assets/', { params: params(items.length) })
            setItems(prev => [...prev, ...res.data.items])
            setTotal(res.data.total)
        } catch {
            toast.error('No se pudieron cargar más activos')
        } finally {
            setLoadingMore(false)
        }
    }

    const th = "px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"

    return (
        <>
            {creando && (
                <AssetFormModal tipos={lk.tipos} onClose={() => setCreando(false)} onSaved={(a) => navigate(`/activos/${a.id}`)} />
            )}

            <div className="flex justify-end mb-4">
                <button onClick={() => setCreando(true)} className={btnPrimary}><Plus className="w-4 h-4 mr-2" /> Nuevo activo</button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar activos" placeholder="Código, marca, modelo o serie" className={`${inputClass} pl-9`} />
                </div>
                <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Filtrar por tipo" className={`${inputClass} sm:w-48`}>
                    <option value="">Todos los tipos</option>
                    {lk.tipos.map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
                </select>
                <select value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Filtrar por estado" className={`${inputClass} sm:w-44`}>
                    <option value="">Todos los estados</option>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                {loading ? (
                    <p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">Cargando activos...</p>
                ) : items.length === 0 ? (
                    <div className="py-16 px-4 text-center">
                        <Monitor className="w-10 h-10 mx-auto mb-3 text-gray-400 dark:text-gray-500" />
                        <p className="text-sm text-gray-500 dark:text-gray-400">{q || tipo || estado ? 'Ningún activo coincide con los filtros.' : 'Todavía no hay activos registrados.'}</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                            <thead className="bg-gray-50 dark:bg-gray-800/50">
                                <tr>
                                    <th scope="col" className={th}>Código</th>
                                    <th scope="col" className={th}>Tipo</th>
                                    <th scope="col" className={th}>Marca / modelo</th>
                                    <th scope="col" className={th}>Estado</th>
                                    <th scope="col" className={th}>Asignado a</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {items.map(a => (
                                    <tr key={a.id} onClick={() => navigate(`/activos/${a.id}`)} className="cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                                        <td className="px-6 py-4 text-sm">
                                            {/* Link además del click de fila: accesible con teclado */}
                                            <Link to={`/activos/${a.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-brand-primary dark:text-brand-light hover:underline">{a.tag}</Link>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{lk.tipo(a.asset_type)}</td>
                                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{[a.brand, a.model].filter(Boolean).join(' ') || '—'}</td>
                                        <td className="px-6 py-4"><StatusBadge status={a.status} /></td>
                                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                                            {a.current_assignment ? destino(a.current_assignment, lk) : <span className="italic">Disponible</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {!loading && items.length < total && (
                    <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-center">
                        <button onClick={loadMore} disabled={loadingMore} className={btnSecondary}>
                            {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : `Cargar más (${items.length} de ${total})`}
                        </button>
                    </div>
                )}
            </div>
        </>
    )
}

// --- Mantenimientos (RF-09, CA-05) ---

const KIND_LABELS = { preventive: 'Preventivo', corrective: 'Correctivo' }
const M_STATUS_LABELS = { scheduled: 'Programado', done: 'Realizado', cancelled: 'Cancelado' }
const M_STATUS_STYLES = {
    scheduled: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50',
    done: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800/50',
    cancelled: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
}
// Fechas "YYYY-MM-DD" en la zona del navegador (en-CA da ese formato); las de solo fecha no llevan hora
const hoy = () => new Date().toLocaleDateString('en-CA')
const ayer = () => new Date(Date.now() - 86400000).toLocaleDateString('en-CA')
const fechaCorta = (d) => (d ? new Date(`${d}T00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const vencido = (m) => m.status === 'scheduled' && m.scheduled_for < hoy()

const MaintenanceBadge = ({ m }) => (
    <span className={`inline-flex px-2.5 py-0.5 text-xs font-semibold rounded-full border ${vencido(m) ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/50' : M_STATUS_STYLES[m.status]}`}>
        {vencido(m) ? 'Vencido' : M_STATUS_LABELS[m.status]}
    </span>
)

// Programar (nuevo) o reprogramar (edición de uno programado)
const MaintenanceModal = ({ assetId, maint, lk, onClose, onSaved }) => {
    const [form, setForm] = useState({
        kind: maint?.kind || 'preventive', scheduled_for: maint?.scheduled_for || hoy(),
        responsible_id: maint?.responsible_id ?? '', ticket_id: maint?.ticket_id ?? '',
    })
    const [saving, setSaving] = useState(false)
    const set = (campo) => (e) => setForm({ ...form, [campo]: e.target.value })

    const submit = async (e) => {
        e.preventDefault()
        setSaving(true)
        const body = {
            ...form,
            responsible_id: form.responsible_id === '' ? null : Number(form.responsible_id),
            ticket_id: form.ticket_id === '' ? null : Number(form.ticket_id),
        }
        try {
            if (maint) await api.patch(`/maintenances/${maint.id}`, body)
            else await api.post(`/assets/${assetId}/maintenances`, body)
            toast.success(maint ? 'Mantenimiento reprogramado' : 'Mantenimiento programado')
            onSaved()
        } catch (err) {
            toast.error(err.response?.data?.detail || 'No se pudo guardar')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal title={maint ? 'Reprogramar mantenimiento' : 'Programar mantenimiento'} onClose={onClose}>
            <form onSubmit={submit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <Field id="m-kind" label="Tipo">
                        <select id="m-kind" value={form.kind} onChange={set('kind')} className={inputClass}>
                            {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                    </Field>
                    <Field id="m-date" label="Fecha"><input id="m-date" type="date" required value={form.scheduled_for} onChange={set('scheduled_for')} className={inputClass} /></Field>
                </div>
                <Field id="m-resp" label="Responsable">
                    <select id="m-resp" value={form.responsible_id} onChange={set('responsible_id')} className={inputClass}>
                        <option value="">Sin asignar</option>
                        {lk.personas.filter(p => p.is_active && p.is_staff).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </Field>
                <Field id="m-ticket" label="Ticket de origen (opcional, # del ticket)">
                    <input id="m-ticket" type="number" min="1" value={form.ticket_id} onChange={set('ticket_id')} className={inputClass} placeholder="Ej: 42" />
                </Field>
                <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={onClose} className={btnSecondary}>Cancelar</button>
                    <button type="submit" disabled={saving} className={btnPrimary}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}</button>
                </div>
            </form>
        </Modal>
    )
}

// Documentar el mantenimiento realizado: hallazgos, acciones (obligatorias) y próxima fecha sugerida
const CompleteModal = ({ maint, onClose, onSaved }) => {
    const [form, setForm] = useState({ findings: '', actions: '', next_date: '' })
    const [saving, setSaving] = useState(false)
    const set = (campo) => (e) => setForm({ ...form, [campo]: e.target.value })

    const submit = async (e) => {
        e.preventDefault()
        setSaving(true)
        try {
            await api.patch(`/maintenances/${maint.id}`, { status: 'done', ...form, next_date: form.next_date || null })
            toast.success('Mantenimiento registrado')
            onSaved()
        } catch (err) {
            toast.error(err.response?.data?.detail || 'No se pudo registrar')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal title={`Registrar mantenimiento ${KIND_LABELS[maint.kind].toLowerCase()}`} onClose={onClose}>
            <form onSubmit={submit} className="space-y-4">
                <Field id="c-findings" label="Hallazgos"><textarea id="c-findings" rows={2} value={form.findings} onChange={set('findings')} className={`${inputClass} resize-none`} placeholder="Qué se encontró" /></Field>
                <Field id="c-actions" label="Acciones realizadas"><textarea id="c-actions" rows={3} required value={form.actions} onChange={set('actions')} className={`${inputClass} resize-none`} placeholder="Qué se hizo" /></Field>
                <Field id="c-next" label="Próxima fecha sugerida (opcional; queda anotada, no se programa sola)">
                    <input id="c-next" type="date" value={form.next_date} onChange={set('next_date')} className={inputClass} />
                </Field>
                <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={onClose} className={btnSecondary}>Cancelar</button>
                    <button type="submit" disabled={saving || !form.actions.trim()} className={btnPrimary}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Registrar'}</button>
                </div>
            </form>
        </Modal>
    )
}

// Línea de un mantenimiento (ficha del activo y consulta general comparten formato)
const MaintenanceRow = ({ m, lk, showAsset, onAction }) => (
    <li className="py-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
            <MaintenanceBadge m={m} />
            <span className="font-medium text-gray-900 dark:text-white">{KIND_LABELS[m.kind]} · {fechaCorta(m.scheduled_for)}</span>
            {showAsset && <Link to={`/activos/${m.asset_id}`} className="text-brand-primary dark:text-brand-light hover:underline">{m.asset_tag}</Link>}
            {m.ticket_id && <Link to={`/ticket/${m.ticket_id}`} className="text-xs text-brand-primary dark:text-brand-light hover:underline">ticket #{m.ticket_id}</Link>}
            <span className="text-gray-500 dark:text-gray-400">· {lk.persona(m.responsible_id) || 'sin responsable'}</span>
        </div>
        {m.findings && <p className="mt-1 text-gray-600 dark:text-gray-400"><span className="font-medium">Hallazgos:</span> {m.findings}</p>}
        {m.actions && <p className="mt-0.5 text-gray-600 dark:text-gray-400"><span className="font-medium">Acciones:</span> {m.actions}</p>}
        {(m.completed_at || m.next_date) && (
            <p className="mt-0.5 text-xs text-gray-500">
                {m.completed_at && `Realizado ${fecha(m.completed_at)}`}{m.completed_at && m.next_date && ' · '}{m.next_date && `próximo sugerido: ${fechaCorta(m.next_date)}`}
            </p>
        )}
        {m.status === 'scheduled' && onAction && (
            <div className="mt-2 flex gap-2">
                <button onClick={() => onAction('complete', m)} className="text-xs font-medium text-brand-primary dark:text-brand-light hover:underline">Registrar realizado</button>
                <button onClick={() => onAction('edit', m)} className="text-xs font-medium text-gray-600 dark:text-gray-300 hover:underline">Reprogramar</button>
                <button onClick={() => onAction('cancel', m)} className="text-xs font-medium text-gray-500 hover:text-red-600 dark:hover:text-red-400">Cancelar</button>
            </div>
        )}
    </li>
)

// Acciones sobre un mantenimiento programado: abre el modal que toque o cancela directo
const useMaintenanceActions = (onDone) => {
    const [modal, setModal] = useState(null) // { tipo: 'complete'|'edit', m }
    const onAction = async (tipo, m) => {
        if (tipo !== 'cancel') return setModal({ tipo, m })
        try {
            await api.patch(`/maintenances/${m.id}`, { status: 'cancelled' })
            toast.success('Mantenimiento cancelado')
            onDone()
        } catch (err) {
            toast.error(err.response?.data?.detail || 'No se pudo cancelar')
        }
    }
    return { modal, setModal, onAction }
}

// Filtros rápidos de la consulta (CA-05): fechas calculadas en el momento del clic
const VISTAS = {
    vencidos: { label: 'Vencidos', params: () => ({ status: 'scheduled', to: ayer() }) },
    proximos: { label: 'Próximos', params: () => ({ status: 'scheduled', from: hoy() }) },
    realizados: { label: 'Realizados', params: () => ({ status: 'done' }) },
    cancelados: { label: 'Cancelados', params: () => ({ status: 'cancelled' }) },
    todos: { label: 'Todos', params: () => ({}) },
}

// --- Pestaña Mantenimientos ---
const MaintenancesTab = ({ lk }) => {
    const [vista, setVista] = useState('proximos')
    const [kind, setKind] = useState('')
    const [items, setItems] = useState([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [recarga, setRecarga] = useState(0)
    const acciones = useMaintenanceActions(() => setRecarga(r => r + 1))

    const params = (offset) => ({ ...VISTAS[vista].params(), ...(kind && { kind }), limit: LIMIT, offset })

    // oxlint-disable react/exhaustive-effect-dependencies -- params se arma con vista/kind
    useEffect(() => {
        const controller = new AbortController()
        setLoading(true)
        api.get('/maintenances/', { params: params(0), signal: controller.signal })
            .then(res => { setItems(res.data.items); setTotal(res.data.total) })
            .catch(err => { if (err.code !== 'ERR_CANCELED') toast.error('No se pudieron cargar los mantenimientos') })
            .finally(() => setLoading(false))
        return () => controller.abort()
    }, [vista, kind, recarga])
    // oxlint-enable react/exhaustive-effect-dependencies

    const loadMore = async () => {
        try {
            const res = await api.get('/maintenances/', { params: params(items.length) })
            setItems(prev => [...prev, ...res.data.items])
            setTotal(res.data.total)
        } catch {
            toast.error('No se pudieron cargar más mantenimientos')
        }
    }

    const recargar = () => { acciones.setModal(null); setRecarga(r => r + 1) }

    return (
        <>
            {acciones.modal?.tipo === 'complete' && <CompleteModal maint={acciones.modal.m} onClose={() => acciones.setModal(null)} onSaved={recargar} />}
            {acciones.modal?.tipo === 'edit' && <MaintenanceModal maint={acciones.modal.m} lk={lk} onClose={() => acciones.setModal(null)} onSaved={recargar} />}

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                <div className="flex flex-wrap gap-2 flex-1" role="group" aria-label="Vista de mantenimientos">
                    {Object.entries(VISTAS).map(([k, v]) => (
                        <button
                            key={k}
                            onClick={() => setVista(k)}
                            aria-pressed={vista === k}
                            className={`px-3 py-1.5 text-sm font-medium rounded-full border transition-colors ${vista === k ? 'border-brand-primary bg-brand-primary/10 text-brand-primary dark:border-brand-light dark:text-brand-light' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                        >
                            {v.label}
                        </button>
                    ))}
                </div>
                <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Filtrar por tipo de mantenimiento" className={`${inputClass} sm:w-44`}>
                    <option value="">Preventivos y correctivos</option>
                    {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Se programan desde la ficha de cada activo.</p>

            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 px-6">
                {loading ? (
                    <p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">Cargando mantenimientos...</p>
                ) : items.length === 0 ? (
                    <p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">No hay mantenimientos en esta vista.</p>
                ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                        {items.map(m => <MaintenanceRow key={m.id} m={m} lk={lk} showAsset onAction={acciones.onAction} />)}
                    </ul>
                )}
                {!loading && items.length < total && (
                    <div className="py-4 border-t border-gray-100 dark:border-gray-800 flex justify-center">
                        <button onClick={loadMore} className={btnSecondary}>Cargar más ({items.length} de {total})</button>
                    </div>
                )}
            </div>
        </>
    )
}

// --- /activos ---
const TABS = [
    { id: 'inventario', label: 'Inventario', icon: Monitor },
    { id: 'mantenimientos', label: 'Mantenimientos', icon: Wrench },
]

export default function Assets() {
    const lk = useLookups()
    const [tab, setTab] = useState('inventario')

    return (
        <Layout>
            <div className="flex items-center mb-6">
                <div className="p-3 rounded-lg bg-brand-primary/10 dark:bg-brand-primary/20 mr-4">
                    <Monitor className="h-8 w-8 text-brand-primary dark:text-brand-light" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Activos</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Inventario de I&T, asignaciones, mantenimientos e historial</p>
                </div>
            </div>

            <div className="flex gap-1 mb-6 border-b border-gray-100 dark:border-gray-800">
                {TABS.map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        onClick={() => setTab(id)}
                        aria-current={tab === id ? 'page' : undefined}
                        className={`inline-flex items-center px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === id
                            ? 'text-brand-primary dark:text-brand-light border-brand-primary dark:border-brand-light'
                            : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-700 dark:hover:text-gray-200'}`}
                    >
                        <Icon className="w-4 h-4 mr-2" /> {label}
                    </button>
                ))}
            </div>

            {tab === 'inventario' ? <InventoryTab lk={lk} /> : <MaintenancesTab lk={lk} />}
        </Layout>
    )
}

// --- /activos/:id ---
export function AssetDetail() {
    const { id } = useParams()
    const navigate = useNavigate()
    const lk = useLookups()
    const [asset, setAsset] = useState(null)
    const [loading, setLoading] = useState(true)
    const [modal, setModal] = useState(null) // 'edit' | 'assign' | 'maintenance'
    const [comentario, setComentario] = useState('') // observación para cambio de estado o devolución
    const [nota, setNota] = useState('') // observación libre de la bitácora
    const [busy, setBusy] = useState(false)

    const cargar = async (signal) => {
        try {
            const res = await api.get(`/assets/${id}`, signal ? { signal } : undefined)
            setAsset(res.data)
        } catch (err) {
            if (err.code !== 'ERR_CANCELED') setAsset(null)
        } finally {
            setLoading(false)
        }
    }

    const mantenimientos = useMaintenanceActions(() => cargar())

    // oxlint-disable react/exhaustive-effect-dependencies -- recarga al cambiar de activo
    useEffect(() => {
        const controller = new AbortController()
        cargar(controller.signal)
        return () => controller.abort()
    }, [id])
    // oxlint-enable react/exhaustive-effect-dependencies

    // Acción con observación opcional: tras guardar se recarga la ficha completa (historial incluido)
    const accion = async (peticion, exito) => {
        setBusy(true)
        try {
            await peticion()
            toast.success(exito)
            setComentario('')
            setNota('')
            await cargar()
        } catch (err) {
            toast.error(err.response?.data?.detail || 'No se pudo guardar')
        } finally {
            setBusy(false)
        }
    }

    if (loading) return <Layout><p className="text-center py-12 text-gray-500 dark:text-gray-400">Cargando activo...</p></Layout>
    if (!asset) return <Layout><p className="text-center py-12 text-red-500">Activo no encontrado</p></Layout>

    const card = "bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-6"
    const vigente = asset.current_assignment

    // Historial del activo (RF-12): asignaciones, bitácora, tickets y mantenimientos en una sola tabla,
    // del más reciente al más antiguo (los timestamps ISO del backend se ordenan como texto)
    const exportarHistorial = () => {
        const filas = [
            ...asset.assignments.map(a => [a.assigned_at, 'Asignación', `${destino(a, lk)}${a.returned_at ? ` (devuelto ${fecha(a.returned_at)})` : ' (vigente)'}`, lk.persona(a.assigned_by), a.notes]),
            ...asset.events.map(e => [e.timestamp, EVENT_LABELS[e.action] || e.action, e.old_value || e.new_value ? `${e.old_value ?? ''} → ${e.new_value ?? ''}` : '', lk.persona(e.changed_by), e.comment]),
            ...asset.tickets.map(t => [t.created_at, 'Ticket', `#${t.id} ${t.title} (${TICKET_STATUS[t.status] || t.status})`, '', '']),
            ...asset.maintenances.map(m => [m.created_at, `Mantenimiento ${KIND_LABELS[m.kind].toLowerCase()}`, `${M_STATUS_LABELS[m.status]} · programado ${fechaCorta(m.scheduled_for)}`, lk.persona(m.responsible_id) || '', [m.findings, m.actions].filter(Boolean).join(' / ')]),
        ].sort((x, y) => (x[0] < y[0] ? 1 : -1)).map(([ts, ...resto]) => [fecha(ts), ...resto])
        descargarCsv(`historial_${asset.tag}`, ['Fecha', 'Tipo', 'Detalle', 'Quién', 'Observaciones'], filas)
    }

    return (
        <Layout>
            {modal === 'edit' && <AssetFormModal asset={asset} tipos={lk.tipos} onClose={() => setModal(null)} onSaved={() => { setModal(null); cargar() }} />}
            {modal === 'assign' && <AssignModal asset={asset} lk={lk} onClose={() => setModal(null)} onSaved={() => { setModal(null); cargar() }} />}
            {modal === 'maintenance' && <MaintenanceModal assetId={asset.id} lk={lk} onClose={() => setModal(null)} onSaved={() => { setModal(null); cargar() }} />}
            {mantenimientos.modal?.tipo === 'complete' && <CompleteModal maint={mantenimientos.modal.m} onClose={() => mantenimientos.setModal(null)} onSaved={() => { mantenimientos.setModal(null); cargar() }} />}
            {mantenimientos.modal?.tipo === 'edit' && <MaintenanceModal maint={mantenimientos.modal.m} lk={lk} onClose={() => mantenimientos.setModal(null)} onSaved={() => { mantenimientos.setModal(null); cargar() }} />}

            <button onClick={() => navigate('/activos')} className="mb-6 flex items-center text-sm font-medium text-gray-500 hover:text-brand-primary dark:text-gray-400 dark:hover:text-brand-light transition-colors">
                <ArrowLeft className="w-4 h-4 mr-1" /> Volver a Activos
            </button>

            <div className="flex flex-col lg:flex-row gap-6">
                {/* Ficha, estado y asignación */}
                <div className="w-full lg:w-1/3 space-y-6">
                    <div className={card}>
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h1 className="text-xl font-bold text-gray-900 dark:text-white">{asset.tag}</h1>
                                <p className="text-sm text-gray-500 dark:text-gray-400">{lk.tipo(asset.asset_type)}</p>
                            </div>
                            <StatusBadge status={asset.status} />
                        </div>
                        <dl className="space-y-2 text-sm">
                            {[['Marca', asset.brand], ['Modelo', asset.model], ['Serie', asset.serial], ['Notas', asset.notes]].map(([k, v]) => (
                                <div key={k} className="flex gap-2"><dt className="font-medium text-gray-500 dark:text-gray-400 w-16 shrink-0">{k}</dt><dd className="text-gray-900 dark:text-white whitespace-pre-line">{v || '—'}</dd></div>
                            ))}
                        </dl>
                        <button onClick={() => setModal('edit')} className={`${btnSecondary} w-full mt-4`}><Pencil className="w-4 h-4 mr-2" /> Editar datos</button>
                        <button onClick={exportarHistorial} className={`${btnSecondary} w-full mt-2`}><Download className="w-4 h-4 mr-2" /> Historial completo (CSV)</button>
                    </div>

                    <div className={card}>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Asignación actual</h3>
                        {vigente ? (
                            <div className="text-sm mb-4">
                                <p className="text-gray-900 dark:text-white font-medium">{destino(vigente, lk)}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Desde {fecha(vigente.assigned_at)}</p>
                            </div>
                        ) : (
                            <p className="text-sm italic text-gray-500 dark:text-gray-400 mb-4">Disponible</p>
                        )}
                        <textarea
                            value={comentario}
                            onChange={(e) => setComentario(e.target.value)}
                            rows={2}
                            aria-label="Observación"
                            placeholder="Observación (opcional): se guarda con el cambio de estado o la devolución"
                            className={`${inputClass} resize-none mb-3`}
                        />
                        <div className="space-y-2">
                            {asset.status !== 'retired' && (
                                <button onClick={() => setModal('assign')} disabled={busy} className={`${btnPrimary} w-full`}>
                                    <UserCheck className="w-4 h-4 mr-2" /> {vigente ? 'Mover / reasignar' : 'Asignar'}
                                </button>
                            )}
                            {vigente && (
                                <button onClick={() => accion(() => api.post(`/assets/${id}/return`, { comment: comentario }), 'Devolución registrada')} disabled={busy} className={`${btnSecondary} w-full`}>
                                    <Undo2 className="w-4 h-4 mr-2" /> Registrar devolución
                                </button>
                            )}
                            <select
                                value={asset.status}
                                disabled={busy}
                                onChange={(e) => accion(() => api.patch(`/assets/${id}`, { status: e.target.value, comment: comentario }), 'Estado actualizado')}
                                aria-label="Cambiar estado del activo"
                                className={inputClass}
                            >
                                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Historial (RF-07) */}
                <div className="w-full lg:w-2/3 space-y-6">
                    <div className={card}>
                        <div className="flex items-center justify-between mb-1">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Mantenimientos</h3>
                            {asset.status !== 'retired' && (
                                <button onClick={() => setModal('maintenance')} className="inline-flex items-center text-sm font-medium text-brand-primary dark:text-brand-light hover:underline">
                                    <Wrench className="w-4 h-4 mr-1" /> Programar
                                </button>
                            )}
                        </div>
                        {asset.maintenances.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400 py-2">Sin mantenimientos registrados.</p>
                        ) : (
                            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                                {asset.maintenances.map(m => <MaintenanceRow key={m.id} m={m} lk={lk} onAction={mantenimientos.onAction} />)}
                            </ul>
                        )}
                    </div>

                    <div className={card}>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Tickets vinculados</h3>
                        {asset.tickets.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">Ningún ticket vinculado. Se vinculan desde el detalle del ticket.</p>
                        ) : (
                            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                                {asset.tickets.map(t => (
                                    <li key={t.id} className="py-2 flex justify-between gap-3 text-sm">
                                        <Link to={`/ticket/${t.id}`} className="text-brand-primary dark:text-brand-light hover:underline truncate">#{t.id} {t.title}</Link>
                                        <span className="text-gray-500 dark:text-gray-400 shrink-0">{TICKET_STATUS[t.status] || t.status} · {fecha(t.created_at)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className={card}>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Historial de asignaciones</h3>
                        {asset.assignments.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">Nunca se ha asignado.</p>
                        ) : (
                            <ol className="space-y-3 border-l-2 border-gray-100 dark:border-gray-800 pl-4">
                                {asset.assignments.map(a => (
                                    <li key={a.id} className="text-sm">
                                        <p className="text-gray-900 dark:text-white">{destino(a, lk)}{!a.returned_at && <span className="ml-2 text-xs font-semibold text-green-600 dark:text-green-400">vigente</span>}</p>
                                        {a.notes && <p className="text-xs italic text-gray-600 dark:text-gray-400">“{a.notes}”</p>}
                                        <p className="text-xs text-gray-500">
                                            {fecha(a.assigned_at)} → {a.returned_at ? fecha(a.returned_at) : 'hoy'} · entregó {lk.persona(a.assigned_by)}
                                        </p>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>

                    <div className={card}>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Bitácora</h3>
                        <form
                            className="flex gap-2 mb-4"
                            onSubmit={(e) => { e.preventDefault(); accion(() => api.post(`/assets/${id}/notes`, { comment: nota }), 'Observación agregada') }}
                        >
                            <input value={nota} onChange={(e) => setNota(e.target.value)} aria-label="Nueva observación" placeholder="Ej: se cambió la fuente de poder" className={`${inputClass} flex-1`} />
                            <button type="submit" disabled={busy || !nota.trim()} className={btnSecondary}><MessageSquarePlus className="w-4 h-4 mr-2" /> Agregar</button>
                        </form>
                        <ol className="space-y-3 border-l-2 border-gray-100 dark:border-gray-800 pl-4">
                            {asset.events.map(e => {
                                const valor = (v) => (e.action === 'status' ? STATUS_LABELS[v] : e.action === 'asset_type' ? lk.tipo(v) : v) ?? '—'
                                return (
                                    <li key={e.id} className="text-sm">
                                        <p className="text-gray-900 dark:text-white">
                                            {EVENT_LABELS[e.action] || e.action}
                                            {e.action === 'maintenances_cancelled'
                                                ? `: ${e.new_value}`
                                                : !['note', 'returned', 'created'].includes(e.action) && `: ${valor(e.old_value)} → ${valor(e.new_value)}`}
                                        </p>
                                        {e.comment && <p className="text-xs italic text-gray-600 dark:text-gray-400">“{e.comment}”</p>}
                                        <p className="text-xs text-gray-500">{lk.persona(e.changed_by)} · {fecha(e.timestamp)}</p>
                                    </li>
                                )
                            })}
                        </ol>
                    </div>
                </div>
            </div>
        </Layout>
    )
}
