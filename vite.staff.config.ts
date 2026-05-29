import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Mobile-first Staff UI (barista interface)
export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, 'src/staff'),
  base: '/staff/',
  build: {
    outDir: path.resolve(__dirname, 'dist/staff'),
    emptyOutDir: true,
  },
  server: {
    port: 5175,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/staff'),
    },
  },
});
