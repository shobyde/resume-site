/* Writes every A2UI surface the assistant can emit to surfaces/*.jsonl.
   The output is committed and checked by groundglass in CI, so the surfaces
   this site can render are conformance checked rather than assumed. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SURFACE_CASES } from '../src/agent/surfaces.js';
import { LAB_SURFACE_CASES } from '../labs/surfaces.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', 'surfaces');
fs.mkdirSync(outDir, { recursive: true });

let total = 0;
for (const entry of [...SURFACE_CASES, ...LAB_SURFACE_CASES]) {
  const messages = entry.build();
  if (!messages || messages.length === 0) {
    console.error(`surface "${entry.name}" produced nothing`);
    process.exitCode = 1;
    continue;
  }
  const jsonl = `${messages.map((message) => JSON.stringify(message)).join('\n')}\n`;
  fs.writeFileSync(path.join(outDir, `${entry.name}.jsonl`), jsonl);
  total += 1;
  console.log(`${entry.name}: ${messages.length} message(s), ${jsonl.length} bytes`);
}
console.log(`wrote ${total} surface stream(s) to surfaces/`);
