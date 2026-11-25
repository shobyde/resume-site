/* ============================================================
   Shared shell for the playable labs.

   One transcript, one canvas. The runtime streams typed steps; a
   `surface` step is applied to the canvas host instead of being
   printed as prose, which is the whole point of the exhibit.
   ============================================================ */

import { AgentRuntime, CapabilityRegistry } from '@shobyde/boaz/core';
import { createSurfaceHost } from '/src/agent/a2ui.js';

const STEP_LABELS = {
  inference: 'inference',
  query: 'query',
  action: 'action',
  surface: 'surface',
  confirmation: 'confirm',
  navigate: 'navigate',
  'validation-error': 'rejected',
  error: 'error',
  text: 'reply',
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** One short line per step. Detail lives in the `title`, so nothing is lost. */
export function describeStep(step) {
  if (!step || typeof step !== 'object') return null;
  switch (step.type) {
    case 'inference':
      return {
        label: 'inference',
        text: `${step.goal} · ${step.solutions.length} solution${step.solutions.length === 1 ? '' : 's'}` +
          (step.terms && step.terms.length ? ` · terms ${step.terms.join(', ')}` : ''),
        detail: step.rule || step.goal,
        meta: step.label || '',
      };
    case 'query':
      return {
        label: 'query',
        text: `${step.capabilityId} ${JSON.stringify(step.args ?? {})}`,
        detail: JSON.stringify(step.result ?? null, null, 2).slice(0, 1200),
      };
    case 'action':
      return {
        label: 'action',
        text: `${step.capabilityId} ${JSON.stringify(step.args ?? {})}`,
        detail: JSON.stringify(step.result ?? null, null, 2).slice(0, 1200),
      };
    case 'surface':
      return {
        label: 'surface',
        text: `${step.capabilityId} · ${Array.isArray(step.messages) ? step.messages.length : 0} message(s)`,
        detail: 'A2UI 1.0 stream applied to the canvas; the host renders it with its own elements.',
      };
    case 'confirmation':
      return {
        label: 'confirm',
        text: `${step.capabilityId} · ${step.approved ? 'approved' : 'declined'}`,
      };
    case 'navigate':
      return { label: 'navigate', text: `${step.capabilityId} → ${step.route}` };
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

export function mountLab(options) {
  const {
    capabilities,
    engine,
    getSnapshot = () => ({ currentRoute: '/', state: {} }),
    dispatch = () => {},
    navigate = () => {},
    chips = [],
    initial = null,
    placeholder = 'Ask the book a question',
    reset = null,
    instructions,
  } = options;

  const root = document.querySelector('#lab');
  if (!root) throw new Error('the lab shell needs a #lab element');

  const logEl = root.querySelector('#labLog');
  const chipsEl = root.querySelector('#labChips');
  const form = root.querySelector('#labForm');
  const input = root.querySelector('#labAsk');
  const sendBtn = root.querySelector('#labSend');
  const canvasEl = root.querySelector('#labSurface');
  const canvasMeta = root.querySelector('#labCanvasMeta');
  const proofEl = root.querySelector('#labProof');
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

  const host = createSurfaceHost(canvasEl, {
    onAction: (name, context) => {
      runFromSurface(name, context);
    },
  });

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
  };

  const syncSend = () => {
    sendBtn.disabled = busy || input.value.trim().length === 0;
  };

  const scrollLog = () => {
    logEl.scrollTop = logEl.scrollHeight;
  };

  const setStats = (ms) => {
    if (!statsEl) return;
    const parts = [`${turns} turn${turns === 1 ? '' : 's'}`, `${calls} call${calls === 1 ? '' : 's'}`];
    if (ms !== null && ms !== undefined) parts.push(`${ms} ms`);
    statsEl.textContent = parts.join(' · ');
  };

  function bubble(kind, text) {
    const wrap = el('div', `msg msg--${kind}`);
    const who = el('span', 'msg__who', kind === 'user' ? 'you' : kind === 'system' ? 'system' : 'boaz');
    const body = el('p', 'msg__text');
    body.textContent = text;
    wrap.append(who, body);
    logEl.appendChild(wrap);
    scrollLog();
    return body;
  }

  function traceFor(steps) {
    const visible = steps.map(describeStep).filter(Boolean);
    if (visible.length === 0) return null;
    const details = el('details', 'trace');
    const summary = el('summary', 'trace__summary');
    summary.append(
      el('span', 'trace__kicker', 'reasoning'),
      el('span', 'trace__count', `${visible.length} step${visible.length === 1 ? '' : 's'}`),
    );
    details.appendChild(summary);
    const list = el('ol', 'trace__list');
    for (const step of visible) {
      const item = el('li', 'trace__item');
      item.append(el('span', `trace__label trace__label--${step.label}`, step.label));
      const body = el('span', 'trace__text', step.text);
      if (step.detail) item.title = step.detail;
      item.appendChild(body);
      if (step.meta) item.appendChild(el('span', 'trace__meta', step.meta));
      list.appendChild(item);
    }
    details.appendChild(list);
    return details;
  }

  function proofFor(steps, ms) {
    if (!proofEl) return;
    const inference = steps.find((step) => step.type === 'inference');
    const call = steps.find((step) => step.type === 'query' || step.type === 'action');
    const surface = steps.find((step) => step.type === 'surface');
    proofEl.replaceChildren();
    if (!inference && !call && !surface) {
      proofEl.hidden = true;
      return;
    }
    proofEl.hidden = false;
    const head = el('div', 'proof__head');
    head.append(el('span', 'proof__kicker', 'provenance'));
    if (ms !== null) head.append(el('span', 'proof__time', `${ms} ms`));
    proofEl.appendChild(head);

    if (inference) {
      const row = el('p', 'proof__row');
      row.append(el('span', 'proof__key', 'rule'));
      row.append(el('code', 'proof__val', inference.rule || inference.goal));
      proofEl.appendChild(row);
      const count = el('p', 'proof__row');
      count.append(el('span', 'proof__key', 'bound'));
      count.append(el('code', 'proof__val', `${inference.solutions.length} row${inference.solutions.length === 1 ? '' : 's'}`));
      proofEl.appendChild(count);
      if (inference.solutions.length > 0) {
        const details = el('details', 'proof__more');
        details.appendChild(el('summary', '', 'Show the rows it bound'));
        const table = el('div', 'proof__rows');
        for (const solution of inference.solutions.slice(0, 8)) {
          table.appendChild(el('code', 'proof__rowline', Object.values(solution).join(' · ')));
        }
        if (inference.solutions.length > 8) {
          table.appendChild(el('code', 'proof__rowline', `+ ${inference.solutions.length - 8} more`));
        }
        details.appendChild(table);
        proofEl.appendChild(details);
      }
    } else if (call) {
      const row = el('p', 'proof__row');
      row.append(el('span', 'proof__key', 'call'));
      row.append(el('code', 'proof__val', `${call.capabilityId}(${JSON.stringify(call.args ?? {})})`));
      proofEl.appendChild(row);
    }
    if (surface) {
      const row = el('p', 'proof__row');
      row.append(el('span', 'proof__key', 'canvas'));
      let components = 0;
      let paths = 0;
      for (const message of Array.isArray(surface.messages) ? surface.messages : []) {
        components += message.createSurface?.components?.length ?? message.updateComponents?.components?.length ?? 0;
        if (message.updateDataModel) paths += 1;
      }
      row.append(
        el(
          'code',
          'proof__val',
          components > 0
            ? `${components} component${components === 1 ? '' : 's'} · A2UI 1.0`
            : `${paths} data path${paths === 1 ? '' : 's'} updated in place · A2UI 1.0`,
        ),
      );
      proofEl.appendChild(row);
    }
  }

  function setCanvasMeta(text) {
    if (canvasMeta) canvasMeta.textContent = text;
  }

  function applyMessages(messages) {
    if (!messages || messages.length === 0) return;
    host.apply(messages);
    setCanvasMeta('A2UI 1.0 · rendered with the page’s own elements');
  }

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
    streaming: { chunkChars: 12, paceMs: 14, leadInMs: 420 },
    onEvent: (event) => {
      if (event.type === 'step') {
        const step = event.step;
        if (step.type === 'surface') {
          applyMessages(step.messages);
        }
        if (step.type === 'query' || step.type === 'action') calls += 1;
        if (live) live.steps.push(step);
      }
      if (event.type === 'delta' && live) {
        live.body.textContent += String(event.text ?? '');
        scrollLog();
      }
    },
    confirm: (request) =>
      new Promise((resolve) => {
        dialogTitle.textContent = request.title;
        dialogBody.textContent = `${request.description} Nothing changes until you approve it.`;
        dialogArgs.textContent = JSON.stringify(request.args ?? {}, null, 2);
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

  async function runFromSurface(name, context) {
    if (busy) return;
    setBusy(true);
    const capability = byId.get(name);
    const label = capability ? capability.title : name;
    bubble('user', `↳ ${label}`);
    live = { body: bubble('assistant', ''), steps: [] };
    const started = performance.now();
    try {
      const result = await runtime.runCapability(name, context ?? {});
      const ms = Math.round(performance.now() - started);
      turns += 1;
      const steps = live.steps.length > 0 ? live.steps : result.steps || [];
      const hasSurface = steps.some((step) => step.type === 'surface');
      const isQuery = (capability?.kind ?? 'action') === 'query';
      live.body.textContent = result.ok
        ? result.text ||
          (hasSurface
            ? isQuery
              ? 'Rendered in the canvas.'
              : 'Done — the canvas shows what changed.'
            : 'Done.')
        : result.text || 'That did not run.';
      const trace = traceFor(steps);
      if (trace) logEl.appendChild(trace);
      proofFor(steps, ms);
      setStats(ms);
    } catch (error) {
      live.body.textContent = `That did not run: ${error.message}`;
    } finally {
      live = null;
      setBusy(false);
      syncSend();
      scrollLog();
    }
  }

  async function ask(text) {
    const question = String(text || '').trim();
    if (!question || busy) return;
    input.value = '';
    syncSend();
    bubble('user', question);
    live = { body: bubble('assistant', ''), steps: [] };
    const started = performance.now();
    setBusy(true);
    try {
      const result = await runtime.send(question);
      const ms = Math.round(performance.now() - started);
      turns += 1;
      const steps = live.steps.length > 0 ? live.steps : result.steps || [];
      const hasSurface = steps.some((step) => step.type === 'surface');
      if (!live.body.textContent) {
        live.body.textContent = result.text || (hasSurface ? 'Rendered in the canvas.' : '');
      }
      const trace = traceFor(steps);
      if (trace) logEl.appendChild(trace);
      proofFor(steps, ms);
      setStats(ms);
      const inference = steps.find((step) => step.type === 'inference');
      if (inference && typeof options.renderInference === 'function') {
        const messages = options.renderInference(inference, question);
        if (messages) applyMessages(messages);
      }
    } catch (error) {
      live.body.textContent = `The engine did not finish: ${error.message}`;
    } finally {
      live = null;
      setBusy(false);
      syncSend();
      scrollLog();
      if (reset) resetBtn.hidden = false;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    ask(input.value);
  });
  input.addEventListener('input', syncSend);
  resetBtn.addEventListener('click', () => {
    host.clear();
    logEl.replaceChildren();
    if (options.welcome) {
      const welcome = el('div', 'msg msg--system');
      welcome.append(el('span', 'msg__who', 'boaz'), el('p', 'msg__text', options.welcome));
      logEl.appendChild(welcome);
    }
    proofEl.hidden = true;
    turns = 0;
    calls = 0;
    setStats(null);
    setCanvasMeta('the default view');
    if (typeof options.reset === 'function') {
      options.reset();
    } else if (initial) {
      applyMessages(initial());
    }
    resetBtn.hidden = true;
    input.focus();
  });

  if (options.welcome) {
    const welcome = el('div', 'msg msg--system');
    welcome.append(el('span', 'msg__who', 'boaz'), el('p', 'msg__text', options.welcome));
    logEl.appendChild(welcome);
  }

  if (chips.length > 0) {
    for (const chip of chips) {
      const button = el('button', 'chip', typeof chip === 'string' ? chip : chip.label);
      button.type = 'button';
      button.addEventListener('click', () => ask(typeof chip === 'string' ? chip : chip.ask));
      chipsEl.appendChild(button);
    }
  } else {
    chipsEl.hidden = true;
  }

  if (initial) {
    applyMessages(initial());
    setCanvasMeta('the default view');
    resetBtn.hidden = true;
  }
  setStats(null);

  return { runtime, host, ask, refresh: () => applyMessages(initial ? initial() : []) };
}
