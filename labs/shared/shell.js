/* ============================================================
   Shared chat shell for the playable labs.

   The page is the conversation. Each turn is a real message: a
   plain-English "how" line, the streamed reply, the A2UI surface
   the engine drew for that turn, and the provenance line. Surfaces
   are hosted inside the message they belong to, so the generated
   interface arrives where a screenshot of it would sit.

   A surface created in one turn can still be patched by a later one
   (settling an invoice, finishing a checklist); the shell keeps the
   live host per surface id and marks the earlier message as updated.
   ============================================================ */

import { AgentRuntime, CapabilityRegistry } from '@shobyde/boaz/core';
import { createSurfaceHost } from '/src/agent/a2ui.js';
import { mountStream } from './streams.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** One short line per step; the detail lives in the `title`, so nothing is lost. */
export function describeStep(step) {
  if (!step || typeof step !== 'object') return null;
  switch (step.type) {
    case 'inference':
      return {
        label: 'rule',
        text: `${step.goal} · ${step.solutions.length} solution${step.solutions.length === 1 ? '' : 's'}` +
          (step.terms && step.terms.length ? ` · terms ${step.terms.join(', ')}` : ''),
        detail: step.rule || step.goal,
        meta: step.label || '',
      };
    case 'query':
    case 'action':
      return {
        label: step.type === 'query' ? 'read' : 'wrote',
        text: `${step.capabilityId} ${JSON.stringify(step.args ?? {})}`,
        detail: JSON.stringify(step.result ?? null, null, 2).slice(0, 1200),
      };
    case 'surface':
      return {
        label: 'surface',
        text: `${step.capabilityId} · ${Array.isArray(step.messages) ? step.messages.length : 0} A2UI message(s)`,
        detail: 'An A2UI 1.0 stream, drawn with this page’s own elements inside the reply.',
      };
    case 'confirmation':
      return { label: 'gate', text: `${step.capabilityId} · ${step.approved ? 'approved' : 'declined'}` };
    case 'navigate':
      return { label: 'route', text: `${step.capabilityId} → ${step.route}` };
    case 'validation-error':
      return { label: 'rejected', text: `${step.capabilityId} · ${step.errors.join('; ')}` };
    case 'error':
      return { label: 'error', text: step.message };
    case 'text':
      return null;
    default:
      return { label: step.type, text: JSON.stringify(step).slice(0, 200) };
  }
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

function countComponents(step) {
  let total = 0;
  for (const message of Array.isArray(step.messages) ? step.messages : []) {
    total += message.createSurface?.components?.length ?? message.updateComponents?.components?.length ?? 0;
  }
  return total;
}

/** Steps worth naming in visitor-facing copy. A `text` step is the reply itself. */
const SPEAKABLE = new Set(['inference', 'query', 'action', 'surface', 'confirmation', 'navigate', 'validation-error', 'error']);

/** Rows the surface actually drew, when its data model carries the row set. */
function drawnRows(messages) {
  for (const message of Array.isArray(messages) ? messages : []) {
    const rows = message.createSurface?.dataModel?.rows;
    if (Array.isArray(rows)) return rows.length;
  }
  return null;
}

/** The plain-English line above the answer. No Datalog, no goal text. */
function summarize(step) {
  switch (step.type) {
    case 'inference':
      return `matched ${plural(step.solutions?.length ?? 0, 'row')}`;
    case 'query':
      return `read ${step.capabilityId}`;
    case 'action':
      return `ran ${step.capabilityId}`;
    case 'surface': {
      const components = countComponents(step);
      if (components > 0) return `drew ${plural(components, 'component')}`;
      const paths = (Array.isArray(step.messages) ? step.messages : []).filter((message) => message.updateDataModel || message.updateComponents).length;
      return paths > 0 ? `patched ${plural(paths, 'path')} in place` : 'sent a surface update';
    }
    case 'confirmation':
      return step.approved ? 'you approved it' : 'you declined it';
    case 'navigate':
      return `went to ${step.route}`;
    case 'validation-error':
      return 'the call was rejected';
    case 'error':
      return 'an error was reported';
    default:
      return step.type;
  }
}

export function mountChat(options) {
  const {
    capabilities,
    engine,
    getSnapshot = () => ({ currentRoute: '/', state: {} }),
    dispatch = () => {},
    navigate = () => {},
    chips = [],
    welcome = '',
    initial = null,
    reset = null,
    placeholder = 'Ask a question',
    instructions,
    persona = { name: 'boaz', mark: '◇' },
    stream = 'plain',
    streaming = {},
    pending = 'working',
    surfaceNote = 'generated interface',
    patchReply = 'The surface above carries that change now.',
    renderInference = null,
  } = options;

  const root = document.querySelector('#lab');
  if (!root) throw new Error('the chat shell needs a #lab element');

  const logEl = root.querySelector('#labLog');
  const chipsEl = root.querySelector('#labChips');
  const form = root.querySelector('#labForm');
  const input = root.querySelector('#labAsk');
  const sendBtn = root.querySelector('#labSend');
  const resetBtn = root.querySelector('#labReset');
  const statsEl = root.querySelector('#labStats');

  const dialog = document.querySelector('#labConfirm');
  const dialogTitle = dialog.querySelector('#labConfirmTitle');
  const dialogBody = dialog.querySelector('#labConfirmBody');
  const dialogArgs = dialog.querySelector('#labConfirmArgs');
  const dialogYes = dialog.querySelector('#labConfirmYes');
  const dialogNo = dialog.querySelector('#labConfirmNo');

  const registry = new CapabilityRegistry();
  for (const capability of capabilities) registry.register(capability);
  const byId = new Map(capabilities.map((capability) => [capability.id, capability]));

  /** surfaceId → the message that currently hosts it. */
  const latest = new Map();

  let busy = false;
  let live = null;
  let turns = 0;
  let calls = 0;

  const setBusy = (value) => {
    busy = value;
    input.disabled = value;
    sendBtn.disabled = value || input.value.trim().length === 0;
    sendBtn.classList.toggle('is-busy', value);
    root.classList.toggle('is-busy', value);
    logEl.setAttribute('aria-busy', value ? 'true' : 'false');
    // A surface drawn mid-turn is not clickable until the turn ends; say so
    // instead of swallowing the click.
    for (const button of logEl.querySelectorAll('.a2ui-button')) {
      if (value) button.setAttribute('aria-disabled', 'true');
      else button.removeAttribute('aria-disabled');
    }
  };

  const syncSend = () => {
    sendBtn.disabled = busy || input.value.trim().length === 0;
  };

  const nearBottom = () => {
    const thread = logEl.closest('.thread');
    if (!thread) return true;
    return thread.scrollHeight - thread.scrollTop - thread.clientHeight < 120;
  };

  const scrollToTop = () => {
    const thread = logEl.closest('.thread');
    if (thread) thread.scrollTop = 0;
  };

  const scrollToEnd = (force = false) => {
    const thread = logEl.closest('.thread');
    if (!thread) return;
    if (force || nearBottom()) thread.scrollTop = thread.scrollHeight;
  };

  const setStats = () => {
    if (!statsEl) return;
    statsEl.textContent = turns === 0 ? '' : `${plural(turns, 'turn')} · ${plural(calls, 'call')}`;
  };

  /* ---------- a turn ---------- */

  function newTurn(kind) {
    const article = el('article', `turn turn--${kind}`);
    const head = el('header', 'turn__head');
    const body = el('div', 'turn__body');
    article.append(head, body);
    logEl.append(article);

    if (kind === 'user') {
      head.append(el('span', 'turn__who', 'you'));
      const text = el('p', 'turn__text');
      body.append(text);
      return { article, head, body, textEl: text, kind };
    }

    head.append(el('span', 'turn__mark', persona.mark), el('span', 'turn__who', persona.name));
    const meta = el('span', 'turn__meta');
    head.append(meta);

    const howEl = el('details', 'how');
    howEl.hidden = true;
    const textEl = el('div', 'turn__text');
    const surfaceEl = el('div', 'turn__surface');
    surfaceEl.hidden = true;
    const patchEl = el('div', 'turn__patch');
    patchEl.hidden = true;
    const footEl = el('div', 'turn__foot');
    body.append(howEl, textEl, surfaceEl, patchEl, footEl);

    const rec = {
      article, head, body, meta, howEl, textEl, surfaceEl, patchEl, footEl,
      kind,
      steps: [],
      rawText: '',
      firstDeltaAt: 0,
      writer: null,
      pendingEl: null,
      frame: null,
      host: null,
      hostEl: null,
    };

    if (pending) {
      rec.pendingEl = el('p', 'turn__pending');
      rec.pendingEl.append(el('span', 'turn__pending-text', pending), el('span', 'turn__dots'));
      textEl.append(rec.pendingEl);
    }

    return rec;
  }

  function clearPending(rec) {
    if (!rec.pendingEl) return;
    rec.pendingEl.remove();
    rec.pendingEl = null;
  }

  function writer(rec) {
    if (!rec.writer) rec.writer = mountStream(stream, rec.textEl);
    return rec.writer;
  }

  function setStatic(rec, text) {
    clearPending(rec);
    const line = el('p', 'stream stream--static', text);
    rec.textEl.append(line);
    rec.rawText = text;
  }

  function writeDelta(rec, text) {
    clearPending(rec);
    rec.rawText += text;
    writer(rec).write(text);
  }

  /* ---------- A2UI surfaces, inside the message ---------- */

  function ensureSurface(rec) {
    if (rec.frame) return rec;
    const frame = el('div', 'surface');
    const bar = el('div', 'surface__bar');
    const id = el('span', 'surface__bar-id', surfaceNote);
    const tag = el('span', 'surface__bar-tag', 'A2UI 1.0');
    bar.append(id, tag);
    const hostEl = el('div', 'surface__host');
    frame.append(bar, hostEl);
    rec.surfaceEl.append(frame);
    rec.surfaceEl.hidden = false;
    rec.frame = frame;
    rec.hostEl = hostEl;
    rec.host = createSurfaceHost(hostEl, { onAction: (name, context) => runFromSurface(name, context) });
    return rec;
  }

  function patchNote(rec, owner) {
    if (rec.patchEl.dataset.done === '1') return;
    rec.patchEl.dataset.done = '1';
    rec.patchEl.hidden = false;
    const button = el('button', 'turn__patch-link', '↑ an earlier reply was updated in place');
    button.type = 'button';
    button.addEventListener('click', () => {
      owner.article.scrollIntoView({ behavior: 'smooth', block: 'center' });
      owner.article.classList.remove('is-flash');
      void owner.article.offsetWidth;
      owner.article.classList.add('is-flash');
    });
    rec.patchEl.append(button);
  }

  function applyMessages(rec, messages) {
    if (!Array.isArray(messages) || messages.length === 0) return;
    for (const message of messages) {
      if (!message || typeof message !== 'object') continue;
      const { createSurface, updateComponents, updateDataModel } = message;
      const id = createSurface?.surfaceId || updateComponents?.surfaceId || updateDataModel?.surfaceId;
      if (!id) continue;

      if (createSurface) {
        ensureSurface(rec);
        rec.host.apply([message]);
        rec.frame.querySelector('.surface__bar-id').textContent = `${id}`;
        latest.set(id, rec);
      } else {
        const owner = latest.get(id);
        if (owner) {
          owner.host.apply([message]);
          if (owner !== rec) patchNote(rec, owner);
        } else {
          ensureSurface(rec);
          rec.host.apply([message]);
          latest.set(id, rec);
        }
      }
    }
    scrollToEnd();
  }

  /* ---------- the how line, the provenance line ---------- */

  /** Consecutive surface steps are one act, not five lines. */
  function phraseSteps(steps) {
    const tokens = [];
    for (const step of steps) {
      if (step.type === 'surface') {
        const messages = Array.isArray(step.messages) ? step.messages : [];
        const create = messages.reduce((sum, message) => sum + (message.createSurface?.components?.length ?? 0), 0);
        const patch = messages.reduce(
          (sum, message) => sum + (message.updateComponents?.components?.length ?? 0) + (message.updateDataModel ? 1 : 0),
          0,
        );
        const last = tokens[tokens.length - 1];
        if (last && last.kind === 'surface') {
          last.create += create;
          last.patch += patch;
          last.updates += 1;
        } else {
          tokens.push({ kind: 'surface', create, patch, updates: 1 });
        }
      } else {
        tokens.push({ kind: 'step', text: summarize(step) });
      }
    }
    return tokens.map((token) => {
      if (token.kind === 'step') return token.text;
      const parts = [];
      if (token.create > 0) parts.push(`drew ${plural(token.create, 'component')}`);
      if (token.patch > 0) parts.push(`patched ${plural(token.patch, 'path')} in place`);
      return parts.join(', ') || 'sent a surface update';
    });
  }

  function renderHow(rec, allSteps) {
    const steps = allSteps.filter((step) => SPEAKABLE.has(step.type));
    const visible = steps.map(describeStep).filter(Boolean);
    if (visible.length === 0) return;

    const summary = el('summary', 'how__summary');
    summary.append(el('span', 'how__kicker', 'how'));
    const line = el('span', 'how__line');
    line.textContent = phraseSteps(steps).join(' → ');
    summary.append(line);
    rec.howEl.append(summary);

    const list = el('ol', 'how__list');
    for (const step of visible) {
      const item = el('li', 'how__item');
      item.append(el('span', `how__label how__label--${step.label}`, step.label));
      item.append(el('span', 'how__text', step.text));
      if (step.detail) item.title = step.detail;
      if (step.meta) item.append(el('span', 'how__meta', step.meta));
      list.append(item);
    }
    rec.howEl.append(list);
    rec.howEl.hidden = false;
  }

  function renderFoot(rec, allSteps) {
    const steps = allSteps.filter((step) => SPEAKABLE.has(step.type));
    const bits = [];
    const surfaces = steps.filter((step) => step.type === 'surface');
    const messages = surfaces.flatMap((step) => (Array.isArray(step.messages) ? step.messages : []));
    const patched = messages.reduce(
      (sum, message) => sum + (message.updateComponents?.components?.length ?? 0) + (message.updateDataModel ? 1 : 0),
      0,
    );

    // The how line already claims the reasoning; this line is evidence only.
    // The how line already names what was drawn; this line adds the row count
    // and any in-place writes, or stays empty.
    if (surfaces.length > 0) {
      const drawn = drawnRows(messages);
      if (drawn !== null) bits.push(`${drawn} drawn`);
      if (patched > 0) bits.push(`${plural(patched, 'path')} patched`);
    }
    rec.footEl.textContent = bits.join(' · ');
  }

  function finishTurn(rec, result, started) {
    const steps = rec.steps.length > 0 ? rec.steps : result?.steps || [];
    const surfaces = steps.filter((step) => step.type === 'surface');
    const drew = surfaces.some((step) => countComponents(step) > 0);
    const patched = surfaces.some((step) => countComponents(step) === 0 && Array.isArray(step.messages) && step.messages.length > 0);
    // A drawn surface carries its own answer (a table, a refusal card, a week).
    // Only say something when the change happened somewhere else.
    const answer = (result?.text && result.text.trim()) || rec.rawText || (drew ? '' : patched ? patchReply : 'Done.');

    if (answer) {
      if (rec.writer) rec.writer.finish(answer);
      else setStatic(rec, answer);
    } else {
      clearPending(rec);
    }

    renderHow(rec, steps);
    renderFoot(rec, steps);
    if (rec.meta) rec.meta.textContent = plural(steps.filter((step) => SPEAKABLE.has(step.type)).length, 'step');
    return steps;
  }

  /* ---------- the runtime ---------- */

  const runtime = new AgentRuntime({
    engine,
    capabilities,
    registry,
    getSnapshot,
    navigate,
    dispatch,
    topK: 10,
    maxToolCalls: 4,
    instructions,
    streaming: { chunkChars: 12, paceMs: 14, leadInMs: 420, ...streaming },
    onEvent: (event) => {
      if (!live) return;
      if (event.type === 'step') {
        const step = event.step;
        live.steps.push(step);
        if (step.type === 'surface') applyMessages(live, step.messages);
        if (step.type === 'query' || step.type === 'action') calls += 1;
        return;
      }
      if (event.type === 'delta') {
        const text = String(event.text ?? '');
        if (!text) return;
        if (!live.firstDeltaAt) live.firstDeltaAt = performance.now();
        writeDelta(live, text);
        scrollToEnd();
      }
    },
    confirm: (request) =>
      new Promise((resolve) => {
        dialogTitle.textContent = request.title;
        dialogBody.textContent = `${request.description} Nothing changes until you approve it.`;
        dialogArgs.textContent = JSON.stringify(request.args ?? {}, null, 2);
        if (live?.pendingEl) {
          const label = live.pendingEl.querySelector('.turn__pending-text');
          if (label) label.textContent = 'waiting for your approval';
        }
        dialog.hidden = false;
        dialogYes.focus();
        const finish = (value) => {
          dialog.hidden = true;
          dialogYes.removeEventListener('click', onYes);
          dialogNo.removeEventListener('click', onNo);
          document.removeEventListener('keydown', onKey, true);
          resolve(value);
        };
        const onYes = () => finish(true);
        const onNo = () => finish(false);
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            finish(false);
          }
        };
        dialogYes.addEventListener('click', onYes);
        dialogNo.addEventListener('click', onNo);
        document.addEventListener('keydown', onKey, true);
      }),
  });

  /* ---------- asking ---------- */

  async function runFromSurface(name, context) {
    if (busy) return;
    const capability = byId.get(name);
    const label = capability ? capability.title : name;
    const asked = newTurn('user');
    asked.textEl.textContent = `↳ ${label}`;

    const rec = newTurn('assistant');
    live = rec;
    setBusy(true);
    const started = performance.now();
    try {
      const result = await runtime.runCapability(name, context ?? {});
      turns += 1;
      const steps = finishTurn(rec, result, started);
      setStats();
      if (steps.some((step) => step.type === 'confirmation')) resetBtn.hidden = false;
    } catch (error) {
      clearPending(rec);
      setStatic(rec, `That did not run: ${error.message}`);
    } finally {
      live = null;
      setBusy(false);
      syncSend();
      scrollToEnd(true);
      resetBtn.hidden = false;
    }
  }

  async function ask(text) {
    const question = String(text || '').trim();
    if (!question || busy) return;
    input.value = '';
    syncSend();

    newTurn('user').textEl.textContent = question;

    const rec = newTurn('assistant');
    live = rec;
    setBusy(true);
    const started = performance.now();
    try {
      const result = await runtime.send(question);
      turns += 1;
      const steps = finishTurn(rec, result, started);

      const inference = steps.find((step) => step.type === 'inference');
      if (inference && typeof renderInference === 'function') {
        const messages = renderInference(inference, question);
        if (messages) {
          applyMessages(rec, messages);
          if (!steps.some((step) => step.type === 'surface')) {
            renderFoot(rec, [...steps, { type: 'surface', messages }]);
          }
        }
      }

      setStats();
    } catch (error) {
      clearPending(rec);
      setStatic(rec, `The engine did not finish: ${error.message}`);
    } finally {
      live = null;
      setBusy(false);
      syncSend();
      scrollToEnd(true);
      resetBtn.hidden = false;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    ask(input.value);
  });
  input.addEventListener('input', syncSend);

  /* ---------- opening state and reset ---------- */

  function opening() {
    const rec = newTurn('assistant');
    if (welcome) setStatic(rec, welcome);
    if (initial) applyMessages(rec, initial());
    return rec;
  }

  resetBtn.addEventListener('click', () => {
    logEl.replaceChildren();
    latest.clear();
    turns = 0;
    calls = 0;
    setStats();
    if (typeof reset === 'function') reset();
    opening();
    resetBtn.hidden = true;
    input.focus();
    scrollToTop();
  });

  if (chips.length > 0) {
    for (const chip of chips) {
      const button = el('button', 'chip', typeof chip === 'string' ? chip : chip.label);
      button.type = 'button';
      button.addEventListener('click', () => ask(typeof chip === 'string' ? chip : chip.ask));
      chipsEl.append(button);
    }
  } else {
    chipsEl.hidden = true;
  }

  if (placeholder) input.placeholder = placeholder;
  opening();
  resetBtn.hidden = true;
  setStats();
  scrollToTop();

  return { runtime, ask, opening, refresh: () => { logEl.replaceChildren(); latest.clear(); opening(); } };
}
