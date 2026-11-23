import { defineConfig } from 'vite';
import { resolve } from 'path';
import { clientAgent } from 'client-agent/vite';

export default defineConfig({
  base: '/',
  server: { watch: { usePolling: true, interval: 300 } },
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
        // The client-agent page runs the engine live, so it is a Vite entry
        // rather than a static file in public/.
        clientAgent: resolve(__dirname, 'client-agent/index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
