import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'node:url'

const configDirectory = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest.setup.ts',
    testTimeout: 30000,
    maxWorkers: 4,
    exclude: ['node_modules/**', 'node_modules.install-partial/**', 'dist/**', 'scratch/**', '.worktrees/**', '.deploy-worktree/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(configDirectory, './'),
    },
  },
})
