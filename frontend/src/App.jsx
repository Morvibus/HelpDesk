import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import TicketDetail from './pages/TicketDetail'

const ProtectedRoute = ({ children }) => {
  const token = useAuthStore(state => state.token)
  if (!token) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        { }
        <Route path="/ticket/:id" element={
          <ProtectedRoute>
            <TicketDetail />
          </ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  )
}