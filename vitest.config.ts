import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

// Deliberately NOT reusing vite.config.ts: tanstackStart() and nitro() would
// try to boot a server and generate routes during test runs.
export default defineConfig({
  resolve: {
    alias: {
      '#': resolve(import.meta.dirname, 'src'),
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
})
