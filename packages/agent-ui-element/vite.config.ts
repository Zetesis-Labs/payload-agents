import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss()],
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env': '{}',
    'process.platform': '"browser"',
    'process.browser': 'true',
    process: '{"env":{"NODE_ENV":"production"},"platform":"browser","browser":true}'
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/element.tsx'),
      name: 'ZetesisAgentChat',
      formats: ['iife', 'es'],
      fileName: format =>
        format === 'iife' ? 'zetesis-agent-chat.iife.js' : 'zetesis-agent-chat.es.js'
    },
    sourcemap: true,
    cssCodeSplit: false,
    rollupOptions: { external: [] }
  },
  server: { host: true, port: 5174, strictPort: true }
})
