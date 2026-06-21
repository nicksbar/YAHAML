import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const rawApiUrl = process.env.VITE_API_URL
const isUiDevServer = typeof rawApiUrl === 'string' && /localhost:5173|127\.0\.0\.1:5173/.test(rawApiUrl)
const apiTarget = !rawApiUrl || isUiDevServer ? 'http://localhost:3000' : rawApiUrl
const wsTarget = apiTarget.startsWith('ws') ? apiTarget : apiTarget.replace(/^http/, 'ws')
console.log('[vite-proxy] VITE_API_URL=', rawApiUrl || '(unset)')
console.log('[vite-proxy] apiTarget=', apiTarget)
console.log('[vite-proxy] wsTarget=', wsTarget)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: process.env.VITE_HOST || '0.0.0.0',
    port: Number(process.env.VITE_PORT || 5173),
    strictPort: true,
    proxy: {
      // Proxy API calls to backend in development
      // In production, set VITE_API_URL environment variable
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/ws': {
        target: wsTarget || apiTarget,
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
