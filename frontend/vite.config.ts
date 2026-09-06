import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
const serverTarget = process.env.SERVER_HTTPS || process.env.SERVER_HTTP || 'http://localhost:5582';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy API calls to the Lumière server
      '/api': {
        target: serverTarget,
        changeOrigin: true
      },
      // Proxy uploaded / seed GLB models to the server's wwwroot
      '/models': {
        target: serverTarget,
        changeOrigin: true
      },
      // Proxy uploaded product photos to the server's wwwroot
      '/images': {
        target: serverTarget,
        changeOrigin: true
      }
    }
  }
});