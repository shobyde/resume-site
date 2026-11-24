#!/usr/bin/env node
// Measures how much code each project carries, so the panel can answer "which
// one is bigger" with a number instead of a guess. The assistant's rule reads
// the frozen values in src/agent/projectSize.js; this script is what produces
// them, and it is committed so anyone can re-run it and compare.
//
// Metric: non-blank lines in application source files (.ts .tsx .js .jsx .mjs
// .cjs .py .rs .go .c .cc .cpp .h .hpp). Excluded: stylesheets, markup, JSON,
// config, lockfiles, build output (dist/build), vendored dependencies,
// node_modules, and the site's generated public/ tree. Tests are counted,
// because they ship in the same repository and are part of the codebase.
//
// Usage: node scripts/measure-size.mjs [name=path ...]
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const DEFAULT_REPOS = [
  ['Hobnob', '~/projects/hobnob'],
  ['Readback', '~/projects/readback'],
  ['Groundglass', '~/projects/groundglass'],
  ['Boaz', '~/projects/client-agent'],
  ['shobyde.com', '~/projects/resume-site'],
];

const CODE = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rs', '.go', '.c', '.cc', '.cpp', '.h', '.hpp']);
const SKIP_DIR = new Set([
  'node_modules', 'dist', 'build', '.git', 'vendor', 'venv', '.venv', '__pycache__',
  'coverage', '.worktrees', 'public', 'fixtures', '.next', 'out', 'target',
]);

const home = process.env.HOME ?? '';
const resolved = (path) => path.replace(/^~/, home);

function measure(name, dir) {
  const root = resolved(dir);
  const files = execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const commit = execFileSync('git', ['-C', root, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  const remote = execFileSync('git', ['-C', root, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
  let lines = 0;
  let counted = 0;
  for (const file of files) {
    const parts = file.split('/');
    if (parts.slice(0, -1).some((part) => SKIP_DIR.has(part))) continue;
    if (!CODE.has(extname(file).toLowerCase())) continue;
    const absolute = join(root, file);
    try {
      if (!statSync(absolute).isFile()) continue;
      const text = readFileSync(absolute, 'utf8');
      lines += text.split('\n').filter((line) => line.trim()).length;
      counted += 1;
    } catch {
      // A file git tracks but the checkout lacks is not part of the measure.
    }
  }
  return { name, repo: remote.replace(/^.*github\.com[:/]/, '').replace(/\.git$/, ''), commit, files: counted, lines };
}

const repos = process.argv.slice(2).length
  ? process.argv.slice(2).map((arg) => arg.split('='))
  : DEFAULT_REPOS;
const result = repos.map(([name, dir]) => measure(name, dir));
console.log(JSON.stringify(result, null, 2));
