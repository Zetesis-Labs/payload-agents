import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': '"production"'
  },
  build: {
    outDir: 'dist/wc',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/web-component.tsx'),
      name: 'ZetesisChat',
      formats: ['iife'],
      fileName: () => 'chat.js'
    },
    rollupOptions: {
      // We bundle everything, even react, so we do NOT put react in external here.
      // This ensures the host site just imports chat.js and it works standalone.
      external: []
    }
  }
})
