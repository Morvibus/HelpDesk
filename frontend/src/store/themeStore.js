// frontend/src/store/themeStore.js
import { create } from "zustand";

// Preferencia del SO; se usa solo cuando el usuario no eligió nada todavía
const prefiereOscuro = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

const temaInicial = () => {
    const guardado = localStorage.getItem("theme");
    return guardado ? guardado === "dark" : prefiereOscuro();
};

const aplicar = (isDark) => {
    document.documentElement.classList.toggle("dark", isDark);
};

export const useThemeStore = create((set) => ({
    isDark: temaInicial(),

    toggleTheme: () =>
        set((state) => {
            const newTheme = !state.isDark;
            localStorage.setItem("theme", newTheme ? "dark" : "light");
            aplicar(newTheme);
            return { isDark: newTheme };
        }),

    // Sincroniza el <html> con la preferencia guardada (o la del SO) al cargar
    initTheme: () => {
        const isDark = temaInicial();
        aplicar(isDark);
        set({ isDark });
    },
}));
