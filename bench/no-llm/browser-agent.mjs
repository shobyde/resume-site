#!/usr/bin/env node
/**
 * Scripted browser agent (rung 18): one sentence in, one observed effect out.
 *
 * The agent reads the page's accessibility tree, decides which capability the
 * sentence names (`routeRequest`), then acts: a `fill` sentence is resolved and
 * performed on the page (and refused when there is no such control), everything
 * else is asked in the panel by resolving the textbox, SEND and the route
 * confirmation by role and accessible name. Success is the EFFECT on the page
 * (path, hash, clipboard, print, surface, answer text), not the absence of an
 * exception.
 *
 * `--before` scores the ten-minute host script: a keyword table that assigns
 * location.href, hardcodes the email, calls print, and types anything else into
 * the panel without waiting for the route confirmation or reading the answer.
 *
 * Usage: node bench/no-llm/browser-agent.mjs [--before] [--json]
 */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseAction, resolveAction, describeResolution, routeRequest } from '@shobyde/boaz';

const here = path.dirname(fileURLToPath(import.meta.url));
const suite = JSON.parse(await readFile(path.join(here, 'browser.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(here, '../../dist/agent-manifest.json'), 'utf8'));
const before = process.argv.includes('--before');
const asJson = process.argv.includes('--json');
// `--base` lets the same suite score the deployed site: npm run smoke:prod.
const baseFlag = process.argv.indexOf('--base');
const BASE = baseFlag > -1 ? process.argv[baseFlag + 1] : process.argv.find((a) => a.startsWith('--base='))?.slice(7) ?? suite.base;

/* ---------- the dist directory, served if nothing else is ---------- */
const DIST = path.join(here, '../../dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
let server = null;
async function ensureServed() {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(800) });
    if (res.ok) return;
  } catch {}
  const { createServer } = await import('node:http');
  const { stat, readFile: rf } = await import('node:fs/promises');
  const port = Number(new URL(BASE).port || 80);
  server = createServer(async (req, res) => {
    const url = new URL(req.url, BASE);
    let file = path.join(DIST, decodeURIComponent(url.pathname));
    try {
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
      const body = await rf(file);
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      // SPA fallback: an unknown path is the single-page document.
      try {
        const body = await rf(path.join(DIST, 'index.html'));
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(body);
      } catch { res.writeHead(404); res.end('not found'); }
    }
  });
  await new Promise((res) => server.listen(port, '127.0.0.1', res));
}
await ensureServed();

/* ---------- CDP ---------- */
const PORT = before ? 9341 : 9342;
const chrome = spawn('/usr/sbin/chromium', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  '--no-default-browser-check', '--disable-gpu', `--user-data-dir=/tmp/boaz-agent-${PORT}`, 'about:blank',
], { stdio: 'ignore' });

async function endpoint() {
  for (let i = 0; i < 150; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return (await res.json()).webSocketDebuggerUrl;
    } catch {}
    await sleep(100);
  }
  throw new Error('chromium did not open a devtools endpoint');
}

const ws = new WebSocket(await endpoint());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
  }
};
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p = {}) => send(m, p, sessionId);
await S('Page.enable');
await S('Runtime.enable');
await S('Accessibility.enable');
// Effects that leave no DOM trace: clipboard, print, window.open.
await S('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.__print = 0; window.__clip = null; window.__opened = [];
    window.print = () => { window.__print += 1; };
    const n = navigator.clipboard || {}; n.writeText = (t) => { window.__clip = t; return Promise.resolve(); };
    try { Object.defineProperty(navigator, 'clipboard', { value: n, configurable: true }); } catch {}
    window.open = (u) => { window.__opened.push(u); return null; };`,
});

async function evaluate(expression) {
  const r = await S('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r.result?.value;
}

async function load(url) {
  await S('Page.navigate', { url: `${BASE}?v=${Date.now()}`.replace('/?v', '/?v') });
  await sleep(1600);
}

async function tree() {
  const { nodes } = await S('Accessibility.getFullAXTree');
  return nodes
    .filter((n) => !n.ignored)
    .map((n) => ({ id: n.backendDOMNodeId, role: n.role?.value || '', name: (n.name?.value || '').replace(/\s+/g, ' ').trim() }))
    .filter((n) => n.name || ['textbox', 'searchbox'].includes(n.role));
}

const act = {
  async click(node) {
    const { object } = await S('DOM.resolveNode', { backendNodeId: node.id });
    await S('Runtime.callFunctionOn', {
      objectId: object.objectId,
      functionDeclaration: 'function(){ this.scrollIntoView({block:"center"}); this.click(); }',
    });
    await sleep(600);
  },
  async fill(node, text) {
    const { object } = await S('DOM.resolveNode', { backendNodeId: node.id });
    await S('Runtime.callFunctionOn', {
      objectId: object.objectId,
      arguments: [{ value: text }],
      functionDeclaration: `function(v){ this.focus(); this.value = v;
        this.dispatchEvent(new Event('input', { bubbles: true })); }`,
    });
    await sleep(150);
  },
};

/* ---------- the agent ---------- */
const capabilities = manifest.capabilities;

async function ensurePanel(nodes) {
  const box = nodes.find((n) => ['textbox', 'searchbox'].includes(n.role) && /ask/i.test(n.name));
  if (box) return nodes;
  const open = resolveAction('click the ask about sho button', nodes);
  if (!open.ok) return nodes;
  await act.click(open.node);
  return tree();
}

async function askInPanel(say, nodes) {
  nodes = await ensurePanel(nodes);
  const box = nodes.find((n) => ['textbox', 'searchbox'].includes(n.role) && /ask/i.test(n.name));
  if (!box) return { refused: 'no panel textbox on this page' };
  await act.fill(box, say);
  const fresh = await tree();
  const send = resolveAction('click send', fresh);
  if (!send.ok) return { refused: `send not resolvable: ${send.reason}` };
  await act.click(send.node);
  // A route capability asks first: click the affirmative control.
  for (let i = 0; i < 12; i += 1) {
    await sleep(350);
    const confirm = await evaluate(`(()=>{const b=document.querySelector('.agent__confirm-btns button');return b?b.textContent.trim():null})()`);
    if (confirm) {
      await evaluate(`document.querySelector('.agent__confirm-btns button').click()`);
      break;
    }
    const done = await evaluate(`!!document.querySelector('.agent__bubble--assistant.is-done')`);
    if (done && i > 2) break;
  }
  await sleep(900);
  return { asked: true };
}

async function answerText() {
  return evaluate(`(()=>{const b=[...document.querySelectorAll('.agent__bubble--assistant')].pop();
    return b ? b.textContent.replace(/\\s+/g,' ').trim() : ''})()`);
}

async function runTask(task) {
  await load(BASE);
  let nodes = await tree();
  const decision = routeRequest(task.say, { capabilities });
  const parsed = parseAction(task.say);
  const log = [];

  if (parsed?.verb === 'fill') {
    const res = resolveAction(task.say, nodes);
    log.push(describeResolution(res));
    if (!res.ok) {
      return { ok: task.expect.refuse !== undefined && task.expect.refuse.includes(res.reason || 'refused'),
        observed: `refused: ${res.reason}`, decision: decision.capabilityId ?? decision.declined ?? '(none)', log };
    }
    await act.fill(res.node, res.request?.text ?? '');
  } else {
    const asked = await askInPanel(task.say, nodes);
    log.push(asked.refused ? `panel: ${asked.refused}` : 'filled the panel, pressed SEND, handled any confirmation');
  }

  const state = await evaluate(`({ path: location.pathname, hash: location.hash,
    clip: window.__clip, printed: window.__print,
    card: [...document.querySelectorAll('.a2ui-card')].map(e=>e.textContent.replace(/\\s+/g,' ').trim()).join(' | ') })`);
  const bubble = await answerText();
  const expect = task.expect;
  const observed = { ...state, bubble: bubble.slice(0, 120) };
  let ok = false;
  let why = '';
  if (expect.path) { ok = new RegExp(expect.path).test(state.path); why = `path ${state.path}`; }
  else if (expect.hash) { ok = new RegExp(expect.hash).test(state.hash); why = `hash ${state.hash || '(none)'}`; }
  else if (expect.clipboard) { ok = state.clip === expect.clipboard; why = `clipboard ${state.clip}`; }
  else if (expect.printed) { ok = state.printed > 0; why = `print calls ${state.printed}`; }
  else if (expect.bubble) { ok = new RegExp(expect.bubble, 'i').test(bubble); why = `answer "${bubble.slice(0, 80)}"`; }
  else if (expect.card) { ok = state.card.includes(expect.card); why = `cards "${state.card.slice(0, 60)}"`; }
  else if (expect.refuse) { ok = false; why = `acted instead of refusing (path ${state.path})`; }
  return { ok, observed: why, decision: decision.capabilityId ?? decision.declined ?? '(none)', log };
}

/* ---------- the ten-minute host script ---------- */
async function runNaive(task) {
  await load(BASE);
  const say = task.say.toLowerCase();
  if (/archive/.test(say)) await evaluate(`location.href='/archive/'`);
  else if (/\b(blog|log|writing)\b/.test(say)) await evaluate(`location.hash='#blog'`);
  else if (/boaz/.test(say)) await evaluate(`location.href='/boaz/'`);
  else if (/newest|latest/.test(say)) await evaluate(`location.href='/posts/'`);
  else if (/email/.test(say)) await evaluate(`navigator.clipboard.writeText('shobyde@gmail.com')`);
  else if (/resume|print/.test(say)) await evaluate(`window.print()`);
  else await evaluate(`(()=>{const i=document.querySelector('.agent__input');
    if(!i) return; i.value=${JSON.stringify(task.say)}; i.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('.agent__send')?.click();})()`);
  await sleep(2200);
  const state = await evaluate(`({ path: location.pathname, hash: location.hash, clip: window.__clip,
    printed: window.__print, card: [...document.querySelectorAll('.a2ui-card')].map(e=>e.textContent).join(' | ') })`);
  const bubble = await answerText();
  const e = task.expect;
  let ok = false;
  if (e.path) ok = new RegExp(e.path).test(state.path);
  else if (e.hash) ok = new RegExp(e.hash).test(state.hash);
  else if (e.clipboard) ok = state.clip === e.clipboard;
  else if (e.printed) ok = state.printed > 0;
  else if (e.bubble) ok = new RegExp(e.bubble, 'i').test(bubble);
  else if (e.card) ok = state.card.includes(e.card);
  else if (e.refuse) ok = false;
  return { ok, observed: `path ${state.path}${state.hash}`, decision: '(keyword table)', log: [] };
}

const rows = [];
for (const task of suite.tasks) {
  const result = before ? await runNaive(task) : await runTask(task);
  rows.push({ id: task.id, say: task.say, ...result });
  if (!asJson) {
    console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${task.id.padEnd(4)} ${task.say.padEnd(34)} -> ${result.decision}  [${result.observed}]`);
    for (const line of result.log) console.log(`         ${line}`);
  }
}
const passed = rows.filter((r) => r.ok).length;
if (asJson) console.log(JSON.stringify({ before, passed, total: rows.length, rows }, null, 1));
else console.log(`\n${before ? 'keyword table' : 'agent'}: ${passed}/${rows.length} = ${((passed / rows.length) * 100).toFixed(1)}%`);

ws.close();
chrome.kill('SIGKILL');
server?.close();
process.exit(0);
