import { defineConfig } from 'vitest/config';

// Pure-logic tests only (no DOM): routing, ratings, geometry, DMX, migration, exporters.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
