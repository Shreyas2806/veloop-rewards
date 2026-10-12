import dns from 'node:dns'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Prioritize IPv4 resolution to prevent Windows getaddrinfo ENOTFOUND errors
dns.setDefaultResultOrder('ipv4first')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    proxy: {
      // During local dev, proxy /api/* to the deployed Render backend.
      // We rewrite the Origin header so the backend's CORS middleware accepts it.
      '/api': {
        target: 'https://veloop-rewards-qah4.onrender.com',
        changeOrigin: true,
        secure: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            // Replace browser's localhost origin with the Vercel origin
            // so the Render backend's CORS allow-list accepts the request.
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
          });
        },
      },
    },
  },
})
