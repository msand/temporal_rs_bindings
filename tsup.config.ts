import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['lib/temporal.ts'],
  format: ['esm', 'cjs'],
  outDir: 'lib',
  dts: false,
  clean: false,
  splitting: false,
  sourcemap: true,
  minify: true,
  // Don't bundle dependencies - keep the require('../index.js') external
  external: ['node:module', 'node:child_process', 'node:url', '../index.js', /\.node$/],
  // tsup shims import.meta.url for CJS automatically
  shims: true,
  // Keep original class/function names (esbuild --keep-names)
  // Required for Temporal spec: constructor.name must match the type name
  esbuildOptions(options) {
    options.keepNames = true;
  },
});
