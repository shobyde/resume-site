import { defineConfig } from 'vite';
import { resolve } from 'path';
import { boaz } from 'boaz/vite';

export default defineConfig({
  base: '/',
  server: { watch: { usePolling: true, interval: 300 } },
  plugins: [
    // Reads defineCapability() declarations with the TypeScript AST and emits
    // agent-manifest.json, served here as the boaz:manifest module.
    boaz({ include: ['src/**/*.js'], fileName: 'agent-manifest.json' }),
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        // The boaz page runs the engine live, so it is a Vite entry
        // rather than a static file in public/.
        boaz: resolve(__dirname, 'boaz/index.html'),
        // Labs: the probe generator runs the pure generator from the published
        // package in the browser, so it needs the same treatment.
        'probe-gen': resolve(__dirname, 'labs/probe-gen/index.html'),
        // The tools lab runs the JSON-RPC server and the accessibility resolver
        // from the published package against this page's own controls.
        'tools-lab': resolve(__dirname, 'labs/tools/index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
