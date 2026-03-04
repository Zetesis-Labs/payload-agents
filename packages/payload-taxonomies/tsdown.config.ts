import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/constants.ts'],
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
    '@payloadcms/ui',
    'react',
    '@types/json-schema'
  ],
})

