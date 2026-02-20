import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy /api requests to the Vercel dev server (vercel dev runs on :3000).
    // Run `vercel dev` instead of `npm run dev` to use the serverless functions
    // locally, or the proxy below forwards to wherever vercel dev is listening.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})

