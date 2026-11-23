import { readFileSync, writeFileSync } from 'node:fs';
const path = 'node_modules/client-agent/dist/webllm/index.js';
let s;
try { s = readFileSync(path, 'utf8'); } catch { console.log('patch: library not installed, skipping'); process.exit(0); }
const old = `    const ensureWorker = () => {
        if (worker)
            return worker;
        const url = options.workerUrl ?? new URL('./worker.js', import.meta.url);
        worker = new Worker(url, { type: 'module' });
        ownsWorker = true;
        worker.onmessage = (event) => {`;
const neu = `    const ensureWorker = () => {
        if (!worker) {
            const url = options.workerUrl ?? new URL('./worker.js', import.meta.url);
            worker = new Worker(url, { type: 'module' });
            ownsWorker = true;
        }
        if (!worker.__ca_patched) {
        worker.__ca_patched = true;
        worker.onmessage = (event) => {`;
if (!s.includes(old)) {
  // already patched or different version
  if (s.includes('worker.__ca_patched')) { console.log('patch: already applied'); process.exit(0); }
  console.log('patch: pattern not found, skipping'); process.exit(0);
}
s = s.replace(old, neu);
// close the if block before `return worker;`
s = s.replace('            pending = new Map();\n        };\n        return worker;\n    };',
              '            pending = new Map();\n        };\n        }\n        return worker;\n    };');
writeFileSync(path, s);
console.log('patch: applied');
