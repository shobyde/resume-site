import { defineConfig } from 'vite';
import { resolve } from 'path';
import { clientAgent } from 'client-agent/vite';

export default defineConfig({
  base: '/',
  server: { watch: { usePolling: true, interval: 300 } },
  // WebLLM splits its own chunks, so the worker has to be an ES module.
  worker: { format: 'es' },
  plugins: [
    // Reads defineCapability() declarations with the TypeScript AST and emits
    // agent-manifest.json, served here as the client-agent:manifest module.
    clientAgent({ include: ['src/**/*.js'], fileName: 'agent-manifest.json' }),
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
