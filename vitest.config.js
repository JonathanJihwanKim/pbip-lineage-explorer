import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@pbip-lineage/core': path.resolve(__dirname, 'packages/core/src'),
      '@pbip-lineage/core/': path.resolve(__dirname, 'packages/core/src/'),
    }
  },
  test: {
    include: ['packages/core/tests/**/*.test.js'],
  },
});
