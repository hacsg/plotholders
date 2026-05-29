import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Vite config for Shopify Admin embedded UI
export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, 'src/admin'),
  base: '/admin/',
  build: {
    outDir: path.resolve(__dirname, 'dist/admin'),
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/admin'),
    },
  },
});
