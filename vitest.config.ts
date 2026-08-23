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
  test: {
    environment: 'node',
    // The suite spends almost all of its wall time starting workers and re-importing the engine,
    // not running assertions — 330 tests execute in ~1.5s out of a 16s run. A shared thread pool
    // with no per-file isolation cuts that to ~4s because the module graph is parsed once instead
    // of once per file.
    //
    // This is only safe because the engine is pure and every test builds its own GameState via
    // tests/testUtils.ts; nothing reads or writes module-level mutable state. Verified with five
    // consecutive runs including two with --sequence.shuffle, all 330 green.
    //
    // If a test ever starts passing alone but failing in the suite, this is the first thing to
    // suspect: drop `isolate: false` to confirm, then fix the shared state rather than leaving
    // isolation off permanently.
    pool: 'threads',
    isolate: false,
  },
});
