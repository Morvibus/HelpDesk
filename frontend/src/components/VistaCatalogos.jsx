import { useState, useEffect } from 'react';
import api from '../api/axios';
import { Users, Building2, Trash2, Plus, AlertCircle, Loader2 } from 'lucide-react';

export default function VistaCatalogos() {
    const [usuarios, setUsuarios] = useState([]);
    const [departamentos, setDepartamentos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [nuevoDeptoNombre, setNuevoDeptoNombre] = useState('');
    const [nuevoUser, setNuevoUser] = useState({
        nombre: '',
        correo: '',
        password: '123456',
        rol: 'tecnico',
        departamento_id: ''
    });

    const cargarDatos = async () => {
        try {
            setLoading(true);
            setError('');
            const [resUsers, resDeptos] = await Promise.all([
                api.get('/usuarios/'),
                api.get('/departamentos/')
            ]);
            setUsuarios(Array.isArray(resUsers.data) ? resUsers.data : []);
            setDepartamentos(Array.isArray(resDeptos.data) ? resDeptos.data : []);
        } catch (err) {
            setError('No se pudieron obtener los registros de usuarios o departamentos.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        cargarDatos();
    }, []);

    const handleCrearDepartamento = async (e) => {
        e.preventDefault();
        if (!nuevoDeptoNombre.trim()) return;
        try {
            await api.post(`/departamentos/?nombre=${encodeURIComponent(nuevoDeptoNombre)}`);
            setNuevoDeptoNombre('');
            cargarDatos();
        } catch (err) {
            alert('Error al crear departamento');
        }
    };

    const handleEliminarDepartamento = async (id) => {
        if (!confirm('¿Estás seguro de eliminar este departamento?')) return;
        try {
            await api.delete(`/departamentos/${id}`);
            cargarDatos();
        } catch (err) {
            alert('No se pudo eliminar el departamento');
        }
    };

    const handleCrearUsuario = async (e) => {
        e.preventDefault();
        try {
            await api.post('/auth/register', {
                ...nuevoUser,
                departamento_id: nuevoUser.departamento_id ? Number(nuevoUser.departamento_id) : null
            });
            setNuevoUser({ nombre: '', correo: '', password: '123456', rol: 'tecnico', departamento_id: '' });
            cargarDatos();
        } catch (err) {
            alert('Error al registrar usuario');
        }
    };

    const handleEliminarUsuario = async (id) => {
        if (!confirm('¿Estás seguro de eliminar este usuario?')) return;
        try {
            await api.delete(`/usuarios/${id}`);
            cargarDatos();
        } catch (err) {
            alert('No se pudo eliminar el usuario');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-sky-600" />
                <span className="text-sm font-medium">Cargando catálogos...</span>
            </div>
        );
    }

    return (
        <div className="p-8 space-y-8 max-w-7xl mx-auto">
            <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Catálogos del Sistema</h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">Control de altas, bajas y configuración estructural</p>
            </div>

            {error && (
                <div className="p-4 bg-red-50 text-red-700 text-sm rounded-xl flex items-center gap-2 border border-red-200">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Departamentos */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                        <div className="p-2.5 bg-sky-50 text-sky-600 rounded-xl">
                            <Building2 className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-800">Departamentos</h3>
                            <p className="text-xs text-slate-400">Áreas operativas</p>
                        </div>
                    </div>

                    <form onSubmit={handleCrearDepartamento} className="flex gap-2">
                        <input
                            type="text"
                            placeholder="Nuevo departamento..."
                            value={nuevoDeptoNombre}
                            onChange={(e) => setNuevoDeptoNombre(e.target.value)}
                            className="flex-1 bg-slate-50 text-sm rounded-xl px-3.5 py-2 border border-slate-200 focus:outline-none focus:border-sky-500"
                            required
                        />
                        <button type="submit" className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1">
                            <Plus className="w-4 h-4" /> Agregar
                        </button>
                    </form>

                    <div className="divide-y divide-slate-100">
                        {departamentos.map(d => (
                            <div key={d.id} className="py-3 flex items-center justify-between text-sm">
                                <span className="font-medium text-slate-700">{d.nombre}</span>
                                <button onClick={() => handleEliminarDepartamento(d.id)} className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Usuarios */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                        <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                            <Users className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-800">Usuarios y Roles</h3>
                            <p className="text-xs text-slate-400">Gestión de personal y accesos</p>
                        </div>
                    </div>

                    <form onSubmit={handleCrearUsuario} className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                            <input
                                type="text"
                                placeholder="Nombre"
                                value={nuevoUser.nombre}
                                onChange={(e) => setNuevoUser({ ...nuevoUser, nombre: e.target.value })}
                                className="bg-slate-50 text-sm rounded-xl px-3 py-2 border border-slate-200 focus:outline-none"
                                required
                            />
                            <input
                                type="email"
                                placeholder="Correo"
                                value={nuevoUser.correo}
                                onChange={(e) => setNuevoUser({ ...nuevoUser, correo: e.target.value })}
                                className="bg-slate-50 text-sm rounded-xl px-3 py-2 border border-slate-200 focus:outline-none"
                                required
                            />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <select
                                value={nuevoUser.rol}
                                onChange={(e) => setNuevoUser({ ...nuevoUser, rol: e.target.value })}
                                className="bg-slate-50 text-sm rounded-xl px-2 py-2 border border-slate-200"
                            >
                                <option value="cliente">Cliente</option>
                                <option value="tecnico">Técnico</option>
                                <option value="admin">Admin</option>
                            </select>

                            <select
                                value={nuevoUser.departamento_id}
                                onChange={(e) => setNuevoUser({ ...nuevoUser, departamento_id: e.target.value })}
                                className="bg-slate-50 text-sm rounded-xl px-2 py-2 border border-slate-200"
                            >
                                <option value="">Sin depto</option>
                                {departamentos.map(d => (
                                    <option key={d.id} value={d.id}>{d.nombre}</option>
                                ))}
                            </select>

                            <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1">
                                <Plus className="w-4 h-4" /> Crear
                            </button>
                        </div>
                    </form>

                    <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                        {usuarios.map(u => (
                            <div key={u.id} className="py-3 flex items-center justify-between text-sm">
                                <div>
                                    <p className="font-semibold text-slate-800">{u.nombre || u.correo}</p>
                                    <p className="text-[11px] text-slate-400">{u.correo} • <span className="uppercase text-sky-600 font-bold">{u.rol}</span></p>
                                </div>
                                <button onClick={() => handleEliminarUsuario(u.id)} className="text-slate-400 hover:text-red-500 p-1.5 rounded-lg">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}