// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { build as esbuildBuild } from 'esbuild'

// Vite dev NO transforma CommonJS en archivos fuente .cjs (solo deps de
// node_modules), así que sirve `module.exports` crudo y los named imports
// fallan con "does not provide an export named ...".
// periodontal-stats-core.cjs DEBE seguir siendo .cjs porque el server lo
// require() (Client es type:module → un .js sería ESM y rompería el require).
// Este plugin lo convierte a ESM en dev con esbuild; el build de prod ya lo
// resuelve vía @rollup/plugin-commonjs. El default export = module.exports,
// por lo que los consumidores del cliente hacen default import + destructuring.
function devCjsToEsm() {
  return {
    name: 'dev-cjs-to-esm',
    apply: 'serve',
    enforce: 'pre',
    async load(id) {
      const file = id.split('?')[0]
      if (!file.endsWith('.cjs')) return null
      const { outputFiles } = await esbuildBuild({
        entryPoints: [file],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        write: false,
        logLevel: 'silent',
      })
      return outputFiles[0].text
    },
  }
}

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
  plugins: [devCjsToEsm(), react()],
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
        }
      }
    }
  }
})