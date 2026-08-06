import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const targetUrl = env.VITE_BACKEND_URL || 'https://crm-be-three.vercel.app';

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/api': {
          target: targetUrl,
          changeOrigin: true,
          secure: false,
        },
        '/uploads': {
          target: targetUrl,
          changeOrigin: true,
          secure: false,
        },
        '/socket.io': {
          target: targetUrl,
          ws: true,
          changeOrigin: true,
          secure: false,
        }
      }
    }
  };
})
