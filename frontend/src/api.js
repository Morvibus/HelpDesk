import axios from 'axios'
import { useAuthStore } from './store/authStore'

// URL base del API: VITE_API_URL (docker-compose / .env) o fallback local.
export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '')

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
        return Promise.reject(error)
    }
)

// URL para WebSockets: convierte http(s):// en ws(s)://
export const wsUrl = (path) => `${API_URL.replace(/^http/, 'ws')}${path}`
