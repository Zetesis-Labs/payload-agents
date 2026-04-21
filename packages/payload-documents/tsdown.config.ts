import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/client/index.ts'],
  format: ['esm'],
  dts: {
    resolve: true
  },
  sourcemap: true,
  clean: true,
  treeshake: true,
  outDir: 'dist',
  tsconfig: './tsconfig.json',
  inputOptions: {
    transform: {
      jsx: { runtime: 'automatic' }
    }
  },
  external: ['payload', '@payloadcms/ui', 'next', 'react', 'react-dom']
})
