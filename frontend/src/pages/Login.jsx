import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { api } from '../api'
import { useAuthStore, decodeToken, isTokenExpired } from '../store/authStore'
import { KeyRound, Mail } from 'lucide-react'

export default function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const login = useAuthStore(state => state.login)
    const token = useAuthStore(state => state.token)
    const navigate = useNavigate()

    // Si ya hay una sesión válida, directo al panel
    if (token && !isTokenExpired(token)) return <Navigate to="/" replace />

    const handleLogin = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            const formData = new URLSearchParams()
            formData.append('username', email)
            formData.append('password', password)

            const response = await api.post('/login', formData, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            })

            const tokenRecibido = response.data.access_token
            const payload = decodeToken(tokenRecibido)

            if (!payload?.role) {
                setError('Respuesta inválida del servidor. Intenta de nuevo.')
                return
            }

            // Guardamos token, rol y el correo que el usuario escribió en el input
            login(tokenRecibido, payload.role, email)
            navigate('/')

        } catch (err) {
            console.error("Detalle del error de login:", err.response?.data || err.message)
            // Distinguir credenciales inválidas de problemas de red/servidor
            if (!err.response) {
                setError('No se pudo conectar con el servidor. Revisa tu conexión.')
            } else if (err.response.status === 401 || err.response.status === 400) {
                setError('Correo o contraseña incorrectos')
            } else {
                setError('Error del servidor. Intenta de nuevo en unos segundos.')
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                    HelpDesk IT
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600">
                    Inicia sesión para gestionar tus tickets
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-200">
                    <form className="space-y-6" onSubmit={handleLogin}>

                        {error && (
                            <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
                                <p className="text-sm text-red-700">{error}</p>
                            </div>
                        )}

                        <div>
                            <label htmlFor="login-email" className="block text-sm font-medium text-gray-700">Correo Electrónico</label>
                            <div className="mt-1 relative rounded-md shadow-sm">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Mail className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    id="login-email"
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2 border"
                                    placeholder="usuario@empresa.com"
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="login-password" className="block text-sm font-medium text-gray-700">Contraseña</label>
                            <div className="mt-1 relative rounded-md shadow-sm">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <KeyRound className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    id="login-password"
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2 border"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                            >
                                {loading ? 'Ingresando...' : 'Iniciar Sesión'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}