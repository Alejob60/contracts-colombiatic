import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3300,
    proxy: {
      '/api/v1': {
        target: 'http://127.0.0.1:8100',
        changeOrigin: true,
      },
      '/api/auth': {
        target: 'http://127.0.0.1:3007',
        changeOrigin: true,
      },
      '/api/users': {
        target: 'http://127.0.0.1:3007',
        changeOrigin: true,
      },
      '/api/subscriptions': {
        target: 'http://127.0.0.1:3007',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion'],
          icons: ['lucide-react'],
        },
      },
    },
  },
});
