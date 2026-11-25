import { defineConfig } from 'vite';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { boaz } from '@shobyde/boaz/vite';

// The archive and post pages are generated as directory indexes, which
// Cloudflare Pages serves for a clean URL. Vite's SPA fallback would otherwise
// hand /archive/ the homepage in development, so resolve those two shapes here.
function generatedIndexes() {
  return {
    name: 'generated-indexes',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const path = (req.url || '').split('?')[0];
        if (!path.endsWith('/')) return next();
        const candidate = resolve(__dirname, 'public', `.${path}index.html`);
        if (existsSync(candidate)) req.url = `${path}index.html`;
        next();
      });
    },
  };
}

export default defineConfig({
  base: '/',
  server: { watch: { usePolling: true, interval: 300 } },
  plugins: [
    generatedIndexes(),
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
        // The conversation page. The landing record opens it with ?q=...
        thread: resolve(__dirname, 'thread/index.html'),
        // The boaz page runs the engine live, so it is a Vite entry
        // rather than a static file in public/.
        boaz: resolve(__dirname, 'boaz/index.html'),
        // Labs: the probe generator runs the pure generator from the published
        // package in the browser, so it needs the same treatment.
        'probe-gen': resolve(__dirname, 'labs/probe-gen/index.html'),
        // The scorecard grades the five slot suites live, with the same grader
        // the Node harness imports (bench/no-llm/grade.mjs).
        'no-llm': resolve(__dirname, 'labs/no-llm/index.html'),
        // The playable labs: each runs the published package in the tab, so
        // these are Vite entries rather than static pages.
        ledger: resolve(__dirname, 'labs/ledger/index.html'),
        rota: resolve(__dirname, 'labs/rota/index.html'),
        runbook: resolve(__dirname, 'labs/runbook/index.html'),
        // The index of the exhibits. A Vite entry, not public/: public/ is
        // generated, so anything hand-written there never reaches the build.
        labs: resolve(__dirname, 'labs/index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
