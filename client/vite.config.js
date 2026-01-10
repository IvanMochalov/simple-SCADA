import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {WS_BASE, BASE} from "./src/services/api.js";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: BASE,
        changeOrigin: true
      },
      '/ws': {
        target: WS_BASE,
        ws: true
      }
    }
  }
})
