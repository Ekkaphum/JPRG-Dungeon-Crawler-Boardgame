import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@engine': path.resolve(__dirname, 'src/engine'),
      '@bots': path.resolve(__dirname, 'src/bots'),
      '@content': path.resolve(__dirname, 'src/content'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@session': path.resolve(__dirname, 'src/session'),
    },
  },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: { target: 'es2020', sourcemap: false },
});
