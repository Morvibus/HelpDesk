// frontend/src/store/themeStore.js
import { create } from "zustand";

export const useThemeStore = create((set) => ({
    isDark: localStorage.getItem("theme") === "dark",

    toggleTheme: () =>
        set((state) => {
            const newTheme = !state.isDark;
            localStorage.setItem("theme", newTheme ? "dark" : "light");

            // Aplicamos o quitamos la clase 'dark' al HTML principal
            if (newTheme) {
                document.documentElement.classList.add("dark");
            } else {
                document.documentElement.classList.remove("dark");
            }

            return { isDark: newTheme };
        }),

    // Función para inicializar el tema al cargar la app
    initTheme: () => {
        const isDark = localStorage.getItem("theme") === "dark";
        if (isDark) document.documentElement.classList.add("dark");
    },
}));
