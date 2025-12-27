// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Puertos permitidos
const ALLOWED_CLIENT_PORTS = new Set([5173, 5174]);
const clientPort = (() => {
  const envPort = Number(process.env.VITE_PORT);
  return ALLOWED_CLIENT_PORTS.has(envPort) ? envPort : 5173;
})();

const ALLOWED_API_PORTS = new Set([5000, 5002]);
const apiPort = (() => {
  const envPort = Number(process.env.VITE_API_PORT);
  return ALLOWED_API_PORTS.has(envPort) ? envPort : 5002;
})();

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: clientPort,
    host: true,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        }
      },
      '/uploads': {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.error('Error en proxy de uploads:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('📤 Enviando archivo estático:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('📥 Respuesta de archivo estático:', proxyRes.statusCode, req.url);
          });
        },
        // Configuración específica para archivos estáticos
        headers: {
          'Cache-Control': 'public, max-age=31536000', // Cache por 1 año
          'Accept-Ranges': 'bytes'
        }
      }
    }
  }
})