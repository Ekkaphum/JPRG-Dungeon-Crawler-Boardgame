import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@engine': path.resolve(__dirname, 'src/engine'),
      '@bots': path.resolve(__dirname, 'src/bots'),
      '@content': path.resolve(__dirname, 'src/content'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@session': path.resolve(__dirname, 'src/session'),
    },
  },
  test: { environment: 'node' },
});
