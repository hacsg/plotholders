import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Customer-facing Portal (standalone)
export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, 'src/portal'),
  base: '/',
  build: {
    outDir: path.resolve(__dirname, 'dist/portal'),
    emptyOutDir: true,
  },
  server: {
    port: 5176,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/portal'),
    },
  },
});
