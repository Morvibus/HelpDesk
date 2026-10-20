import axios from 'axios'
import { useAuthStore } from './store/authStore'

// URL base del API: por defecto '/api', que el proxy de Vite reenvía al backend (mismo origen:
// funciona igual desde otro dispositivo o un túnel). VITE_API_URL solo para apuntar a otro servidor.
export const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '')

// Cliente axios con la base ya configurada y el token JWT adjuntado automáticamente.
export const api = axios.create({ baseURL: API_URL })

api.interceptors.request.use((config) => {
    const token = useAuthStore.getState().token
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
})

// 401 = token vencido/inválido: cerrar sesión y volver al login.
// Se excluye /login para no pisar el error de credenciales que maneja la página.
api.interceptors.response.use(
    (response) => response,
    (error) => {
        const enLogin = error.config?.url?.includes('/login')
        if (error.response?.status === 401 && !enLogin && window.location.pathname !== '/login') {
            useAuthStore.getState().logout()
            window.location.replace('/login')
        }
        // 422 de validación: detail llega como lista de objetos y React no puede pintarla; se pasa a texto.
        const data = error.response?.data
        if (Array.isArray(data?.detail)) {
            data.detail = data.detail.map(e => e.loc?.includes('email')
                ? 'Correo no válido (dominios como .local o .test no se aceptan)'
                : `${e.loc?.at(-1) ?? 'dato'}: ${e.msg}`).join('. ')
        }
        return Promise.reject(error)
    }
)

// Catálogos (/categories/, /departments/): cambian poco, se piden una vez por sesión de página.
// El panel admin llama a invalidateCatalog tras editarlos.
const catalogCache = {}
export const fetchCatalog = (path) => {
    catalogCache[path] ??= api.get(path).then(r => r.data).catch((err) => {
        delete catalogCache[path]  // un fallo no queda cacheado
        throw err
    })
    return catalogCache[path]
}
export const invalidateCatalog = (path) => { delete catalogCache[path] }

// URL para WebSockets: http(s):// -> ws(s)://; con base relativa se usa el host de la página
// (wss si la página es https, como en un túnel)
export const wsUrl = (path) => API_URL.startsWith('http')
    ? `${API_URL.replace(/^http/, 'ws')}${path}`
    : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}${API_URL}${path}`
