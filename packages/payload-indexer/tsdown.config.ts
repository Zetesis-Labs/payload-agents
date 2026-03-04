import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/client/index.ts'],
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
    'payload',
    '@payloadcms/richtext-lexical',
    '@payloadcms/ui',
    'next',
    'react',
    'react-dom',
  ],
})
