import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react()
  ],
  server: {
    host: true,
    port: 5173,
    // Túneles de VS Code (Ports → Forward). Las IPs de la red local ya se aceptan por defecto.
    allowedHosts: ['.devtunnels.ms'],
    // El navegador solo habla con este servidor: /api se reenvía al backend (REST, /static y
    // WebSockets). Mismo origen => sin CORS y basta exponer el puerto 5173 a otros dispositivos.
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
    watch: {
      usePolling: true,  // bind mounts de Windows no emiten eventos de cambio
      interval: 1000
    }
  }
})
