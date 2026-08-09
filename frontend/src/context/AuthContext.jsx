import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // Controla el estado de carga inicial

  useEffect(() => {
    // Al recargar la página, recuperamos el usuario guardado y el token
    const storedUser = localStorage.getItem('usuario');
    const token = localStorage.getItem('token');

    if (storedUser && token) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error('Error al parsear el usuario almacenado', e);
        localStorage.removeItem('usuario');
        localStorage.removeItem('token');
      }
    }
    setLoading(false);
  }, []);

  const login = async (correo, password) => {
    const formData = new URLSearchParams();
    formData.append('username', correo);
    formData.append('password', password);

    const response = await api.post('/auth/login', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const { access_token, id, correo: userCorreo, rol, departamento_id } = response.data;

    const userData = {
      id: id,
      correo: userCorreo,
      nombre: userCorreo.split('@')[0],
      rol: rol,
      departamento_id: departamento_id,
    };

    localStorage.setItem('token', access_token);
    localStorage.setItem('usuario', JSON.stringify(userData));
    setUser(userData);

    return response.data;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    setUser(null);
  };

  // Evita parpadeos o redirecciones prematuras mientras verifica la sesión guardada
  if (loading) {
    return null;
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);