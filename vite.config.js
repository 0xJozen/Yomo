import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Forward /api requests to vercel dev (port 3000) when running npm run dev.
    // When using `vercel dev` directly this proxy is bypassed — requests go
    // to vercel dev's port and never reach Vite's server directly.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})

