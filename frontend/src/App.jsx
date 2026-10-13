import { Component, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore, isTokenExpired } from './store/authStore'
import NotificationsHub from './components/NotificationsHub'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import TicketDetail from './pages/TicketDetail'
import AdminPanel from './pages/AdminPanel'

const ProtectedRoute = ({ children }) => {
  const token = useAuthStore(state => state.token)
  const logout = useAuthStore(state => state.logout)

  // Token vencido → limpiar la sesión (el interceptor 401 cubre las llamadas)
  useEffect(() => {
    if (token && isTokenExpired(token)) logout()
  }, [token, logout])

  if (!token || isTokenExpired(token)) return <Navigate to="/login" replace />
  return children
}

// Solo administradores: los demás roles vuelven al panel
const AdminRoute = ({ children }) => {
  const token = useAuthStore(state => state.token)
  const role = useAuthStore(state => state.role)
  const logout = useAuthStore(state => state.logout)

  useEffect(() => {
    if (token && isTokenExpired(token)) logout()
  }, [token, logout])

  if (!token || isTokenExpired(token)) return <Navigate to="/login" replace />
  if (role !== 'admin') return <Navigate to="/" replace />
  return children
}

// Emergencia: cualquier error de render muestra esta pantalla en vez de quedar en blanco
class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Algo salió mal</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">La página encontró un error inesperado.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-brand-primary text-white hover:bg-brand-dark transition-colors"
          >
            Recargar aplicación
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        {/* Hub persistente: el WebSocket de notificaciones vive acá, fuera de las
            páginas, para no reconectarse (ni perder avisos) al navegar. */}
        <NotificationsHub />
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />
          <Route path="/ticket/:id" element={
            <ProtectedRoute>
              <TicketDetail />
            </ProtectedRoute>
          } />
          <Route path="/admin" element={
            <AdminRoute>
              <AdminPanel />
            </AdminRoute>
          } />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
