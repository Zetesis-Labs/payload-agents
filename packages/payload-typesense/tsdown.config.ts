import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
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
    '@nexo-labs/payload-indexer',
    'payload',
    '@payloadcms/richtext-lexical',
    'next',
    'react',
    'react-dom',
  ],
})

