import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The source code is not shipped with the site: no source maps, and no comments left in the built files.
  esbuild: { legalComments: 'none' },
  build: {
    sourcemap: false,
    rollupOptions: {
      // Libraries change far less often than app code: separate chunks stay cached across deploys.
      // 10-character hashes (the default is 8): every built file gets a new address, so a browser that cached a "not found" for an old address during a
      // deploy (the files are cached for a year) never asks for it again.
      output: { entryFileNames: 'assets/[name]-[hash:10].js', chunkFileNames: 'assets/[name]-[hash:10].js', assetFileNames: 'assets/[name]-[hash:10][extname]', manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], motion: ['framer-motion'] } },
    },
  },
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
