import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Static hosts that only look up docs/index.html miss the extensionless /docs URL
// and can fall through to the homepage. Emit docs.html and rewrite dev/preview.
function docsRoute() {
  const rewrite = (req, _res, next) => {
    const path = req.url?.split('?')[0]
    if (path === '/docs') req.url = '/docs/'
    next()
  }
  return {
    name: 'docs-route',
    configureServer(server) { server.middlewares.use(rewrite) },
    configurePreviewServer(server) { server.middlewares.use(rewrite) },
    closeBundle() {
      const dir = resolve(import.meta.dirname, 'dist')
      copyFileSync(resolve(dir, 'docs/index.html'), resolve(dir, 'docs.html'))
    },
  }
}

export default defineConfig({
  plugins: [react(), docsRoute()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        docs: resolve(import.meta.dirname, 'docs/index.html'),
      },
    },
  },
})
