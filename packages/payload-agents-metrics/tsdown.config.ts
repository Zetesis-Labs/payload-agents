import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/client.ts'],
  format: ['esm'],
  dts: {
    resolve: true
  },
  sourcemap: true,
  clean: true,
  treeshake: true,
  outDir: 'dist',
  tsconfig: './tsconfig.json',
  external: [
    'payload',
    '@payloadcms/db-postgres',
    '@zetesis/agent-ui',
    'drizzle-orm',
    '@toon-format/toon',
    'clsx',
    'tailwind-merge',
    'react',
    'react/jsx-runtime',
    'recharts',
    'framer-motion',
    'zod'
  ]
})
