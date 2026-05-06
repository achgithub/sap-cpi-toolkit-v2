import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// elkjs/elk.bundled.js contains a conditional Node.js path that imports 'web-worker'.
// Rollup sees the bare import statically and emits a chunk the browser can't resolve.
// This plugin intercepts the specifier and returns the native browser Worker instead.
const webWorkerShim = {
  name: 'web-worker-shim',
  resolveId(id: string) { return id === 'web-worker' ? '\0web-worker-shim' : null },
  load(id: string) { return id === '\0web-worker-shim' ? 'export default Worker' : null },
}

export default defineConfig({
  plugins: [react(), webWorkerShim],
  server: {
    port: 5173,
    proxy: {
      '/api/groovy': {
        target: 'http://localhost:8082',
        rewrite: (path) => path.replace(/^\/api\/groovy/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
