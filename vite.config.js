import { defineConfig } from 'vite';
import { resolve } from 'path';
import { boaz } from '@shobyde/boaz/vite';

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
        // The scorecard grades the five slot suites live, with the same grader
        // the Node harness imports (bench/no-llm/grade.mjs).
        'no-llm': resolve(__dirname, 'labs/no-llm/index.html'),
        // The benchmark page renders a compiled data file: threads, the judge's
        // scores and the recorded suite ladder. No engine runs on it.
        benchmarks: resolve(__dirname, 'labs/benchmarks/index.html'),
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
