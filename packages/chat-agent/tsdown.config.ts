import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/react.ts'],
  format: ['esm'],
  dts: {
    resolve: true,
  },
  sourcemap: true,
  clean: true,
  treeshake: true,
  outDir: 'dist',
  tsconfig: './tsconfig.json',
  external: [
    'react',
    'react-dom',
    'framer-motion',
    'react-markdown',
  ],
})

