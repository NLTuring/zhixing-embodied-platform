import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, watch: { usePolling: true, interval: 300 } },
  build: { chunkSizeWarningLimit: 1100 },
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/domain.ts', 'src/motion.ts', 'src/robotPose.ts'],
      thresholds: { lines: 80, statements: 80, branches: 80, functions: 80 },
    },
  },
})
