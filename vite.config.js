import { defineConfig } from 'vite';
import { resolve } from 'path';
import { clientAgent } from 'client-agent/vite';

/**
 * Edge gates the Prompt API behind an origin trial, and Chrome may do the same
 * for a new capability. Injecting the token at build time is the documented
 * way to enable it per origin; without a token nothing is emitted.
 */
function originTrial() {
  return {
    name: 'origin-trial-meta',
    transformIndexHtml(html) {
      const token = process.env.VITE_ORIGIN_TRIAL;
      if (!token) return html;
      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'origin-trial', content: token },
            injectTo: 'head-prepend',
          },
        ],
      };
    },
  };
}

export default defineConfig({
  base: '/',
  server: { watch: { usePolling: true, interval: 300 } },
  // WebLLM splits its own chunks, so the worker has to be an ES module.
  worker: { format: 'es' },
  plugins: [
    // Reads defineCapability() declarations with the TypeScript AST and emits
    // agent-manifest.json, served here as the client-agent:manifest module.
    clientAgent({ include: ['src/**/*.js'], fileName: 'agent-manifest.json' }),
    originTrial(),
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
