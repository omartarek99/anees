import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Not 5173 — that's taken by another local project on this machine; kept off the common
    // default more generally so the two don't collide again next time either.
    port: 5190,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
