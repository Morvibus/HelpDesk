import { create } from "zustand";

// Decodifica el payload del JWT (base64url) SIN validar la firma:
// solo para leer claims de UI (rol, exp). Token ilegible → null.
export const decodeToken = (token) => {
    if (!token) return null;
    try {
        const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        return JSON.parse(atob(base64));
    } catch {
        return null;
    }
};

// Sesión vencida o token ilegible → la tratamos como expirada.
export const isTokenExpired = (token) => {
    const payload = decodeToken(token);
    if (!payload) return true;
    if (!payload.exp) return false; // sin exp declarado: lo decide el servidor
    return payload.exp * 1000 < Date.now();
};

export const useAuthStore = create((set) => ({
    token: localStorage.getItem("token") || null,
    role: localStorage.getItem("role") || null,
    email: localStorage.getItem("email") || null,

    login: (token, role, email) => {
        localStorage.setItem("token", token);
        localStorage.setItem("role", role);
        localStorage.setItem("email", email);
        set({ token, role, email });
    },

    logout: () => {
        localStorage.removeItem("token");
        localStorage.removeItem("role");
        localStorage.removeItem("email");
        set({ token: null, role: null, email: null });
    },
}));