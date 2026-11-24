#!/usr/bin/env node
/**
 * Accessibility-tree actions (rung 16): click/fill/scroll by role and accessible
 * name, with no model in the loop.
 *
 * The fixture is the site's own tree, captured from Chromium with the assistant
 * panel open (`site-tree.json`), so every task is a real control of this page,
 * including the six buttons that share one name.
 *
 * `--before` scores the alternative a host writes in ten minutes: strip the verb,
 * find the first element whose text contains the target words, click it. It never
 * refuses, never reads a role, never counts an ordinal and never scopes a search to
 * a panel. Both sides read the same tree, so the delta is the resolver, not a
 * different input.
 *
 * Usage: node bench/no-llm/actions.mjs [--json] [--before]
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describeResolution, parseAction, resolveAction } from 'boaz';

const here = path.dirname(fileURLToPath(import.meta.url));
const suite = JSON.parse(await readFile(path.join(here, 'actions.json'), 'utf8'));
const tree = JSON.parse(await readFile(path.join(here, suite.tree), 'utf8'));

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Index of the nth node (1-based, document order) matching role + name, or -1. */
function indexOfNth(role, name, nth) {
  const hits = tree
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => node.role === role && norm(node.name) === norm(name));
  return hits[nth - 1]?.index ?? -1;
}

/** The ten-minute version: first element whose text contains the target words. */
function naive(say) {
  const verb = /^(?:please\s+)?(click|press|tap|fill|type|enter|scroll|go|open)\b\s*/i.exec(say);
  if (!verb) return { ok: false, reason: 'no-verb' };
  let rest = say.slice(verb[0].length);
  let text;
  const withHit = /\bwith\b/i.exec(rest);
  const intoHit = /\b(?:into|in|to)\b/i.exec(rest);
  if (withHit) {
    text = rest.slice(withHit.index + withHit[0].length).trim();
    rest = rest.slice(0, withHit.index);
  } else if (intoHit && /^(fill|type|enter)$/i.test(verb[1])) {
    text = rest.slice(0, intoHit.index).trim();
    rest = rest.slice(intoHit.index + intoHit[0].length);
  }
  const target = norm(
    rest
      .replace(/\b(button|btn|link|field|input|box|checkbox|tab|heading|text)\b/gi, ' ')
      .replace(/^(?:the|a|an)\s+/i, ''),
  );
  if (!target) return { ok: false, reason: 'no-target' };
  const found = tree.findIndex((node) => norm(node.name).includes(target));
  if (found < 0) return { ok: false, reason: 'not-found' };
  return { ok: true, node: tree[found], index: found, text };
}

const before = process.argv.includes('--before');
const rows = [];

for (const task of suite.tasks) {
  const expect = task.expect;
  const actual = before
    ? naive(task.say)
    : (() => {
        const resolution = resolveAction(task.say, tree);
        return {
          ok: resolution.ok,
          reason: resolution.reason,
          node: resolution.node,
          index: resolution.index,
          text: resolution.request?.text,
          said: describeResolution(resolution),
        };
      })();

  let pass = actual.ok === expect.ok;
  const notes = [];
  if (pass && expect.ok) {
    if (norm(actual.node?.role) !== norm(expect.role)) { pass = false; notes.push(`role ${actual.node?.role}`); }
    if (norm(actual.node?.name) !== norm(expect.name)) { pass = false; notes.push(`name ${actual.node?.name}`); }
    if (expect.nth && actual.index !== indexOfNth(expect.role, expect.name, expect.nth)) {
      pass = false;
      notes.push(`index ${actual.index}, wanted the ${expect.nth}`);
    }
    if (expect.text && norm(actual.text) !== norm(expect.text)) { pass = false; notes.push(`text ${actual.text ?? 'none'}`); }
  } else if (pass) {
    if (actual.reason !== expect.reason) { pass = false; notes.push(`reason ${actual.reason}`); }
  } else {
    notes.push(actual.reason ?? actual.node?.name ?? 'no target');
  }
  rows.push({ id: task.id, say: task.say, pass, expect, actual, notes });
}

const passed = rows.filter((r) => r.pass).length;
const pct = Math.round((passed / rows.length) * 1000) / 10;

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ suite: before ? 'before' : 'after', passed, total: rows.length, pct, rows }, null, 2));
} else {
  for (const row of rows) {
    console.log(`${row.pass ? 'PASS' : 'FAIL'} ${row.id} ${row.say}${row.notes.length ? `  (${row.notes.join('; ')})` : ''}`);
  }
  console.log(`\n${before ? 'before' : 'after'}: ${passed}/${rows.length} (${pct}%)`);
}
process.exitCode = before ? 0 : passed === rows.length ? 0 : 1;
