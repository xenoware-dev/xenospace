import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The shared package is consumed as TypeScript source, so the contract is
      // typechecked across the client/server boundary rather than at a build step.
      '@xenospace/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    /*
     * The API is proxied under /api during development so the browser sees one
     * origin. That keeps cookies same-site and means the dev setup exercises
     * the same CSRF path as production rather than a permissive special case.
     */
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/realtime': { target: 'http://localhost:4000', ws: true, changeOrigin: true },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Split the heavy, rarely-changing libraries so an app-code deploy does
        // not invalidate them in the browser cache.
        // Vite 8 (Rolldown) accepts only the function form.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'react';
          if (/[\\/](recharts|d3-[a-z]+|victory-vendor)[\\/]/.test(id)) return 'charts';
          if (id.includes('@dnd-kit')) return 'dnd';
          return undefined;
        },
      },
    },
  },
});
