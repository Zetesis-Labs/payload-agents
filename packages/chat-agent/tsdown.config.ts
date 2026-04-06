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
  // Force the automatic JSX runtime regardless of any inherited
  // `"jsx": "preserve"` from a parent tsconfig. Without this, tsdown emits
  // literal JSX into .mjs files, which Next/webpack will not transform when
  // the package is consumed from node_modules.
  inputOptions: {
    transform: {
      jsx: { runtime: 'automatic' },
    },
  },
  external: [
    'react',
    'react-dom',
    'framer-motion',
    'react-markdown',
  ],
})

