import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const isCep = mode === 'cep'

  return {
    plugins: [react()],
    // CEP loads from file:// — relative asset paths required
    base: isCep ? './' : '/',
    build: {
      outDir: isCep ? 'ae-panel/www' : 'dist',
      emptyOutDir: true,
      // CEP Chromium is older; avoid bleeding-edge syntax where possible
      target: isCep ? 'chrome88' : undefined,
      // Stable names — CEP often caches index.html; hashed bundles 404 after rebuild
      rollupOptions: isCep
        ? {
            output: {
              entryFileNames: 'assets/index.js',
              chunkFileNames: 'assets/[name].js',
              assetFileNames: 'assets/[name][extname]',
            },
          }
        : undefined,
    },
    server: {
      host: true,
      port: 5173,
    },
  }
})
