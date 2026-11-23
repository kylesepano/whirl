import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.{mjs,tsx,ts}'],
    testTimeout: 45_000,
    hookTimeout: 20_000,
  },
})
