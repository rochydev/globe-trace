import { defineConfig } from 'vite';

export default defineConfig({
  // Rutas relativas para que el build funcione también en GitHub Pages (subcarpeta)
  base: './',
  server: {
    port: 5195,
    strictPort: true,
    // En desarrollo, /api va al backend: mismo origen, sin necesidad de CORS
    proxy: { '/api': 'http://127.0.0.1:8790' },
  },
  build: {
    // globe.gl + three pesan; separarlos permite cachearlos aparte del código propio
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('node_modules') ? 'vendor' : undefined),
      },
    },
    chunkSizeWarningLimit: 1500,
  },
});
