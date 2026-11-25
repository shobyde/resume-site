/* ============================================================
   Streaming entry methods.

   The runtime emits `delta` events, and the labs do not print those
   deltas the same way. Each exhibit has its own writer that decides
   the DOM the text lands in and how it arrives:

     ledger   a ruled line, words settling as if posted in ink,
              amounts re-set in tabular figures when the turn ends
     rota     word-level segments that rise into the line, one shift
              at a time, with a soft caret
     runbook  a log tail: one line, a real elapsed-time gutter, a
              block cursor, fast and flat

   A writer is `{ write(chunk), finish(text) }` and is mounted on the
   turn's text host. Nothing here touches the runtime or the engine.
   ============================================================ */

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const CARET = (className = 'stream__caret') => el('span', className, '▏');

/** Money, counts, durations: the tokens an exhibit wants to set in figures. */
const FIGURE = /(\$[\d,]+(?:\.\d+)?|\b\d+(?:[.,]\d+)?(?:%|h|d|ms|kB|kB\/s)?\b)/g;

function setFigures(text) {
  const parts = String(text).split(FIGURE);
  return parts.map((part, index) => {
    if (!part) return null;
    if (index % 2 === 1) return el('b', 'stream__figure', part);
    return document.createTextNode(part);
  }).filter(Boolean);
}

function ledgerWriter(host) {
  const line = el('p', 'stream stream--ledger');
  const body = el('span', 'stream__body');
  const caret = CARET();
  line.append(body, caret);
  host.append(line);

  let raw = '';
  return {
    write(chunk) {
      raw += chunk;
      body.append(el('span', 'stream__seg', chunk));
    },
    finish(text) {
      const final = typeof text === 'string' && text.length >= raw.length ? text : raw;
      line.replaceChildren(...setFigures(final));
      line.classList.add('is-settled');
    },
  };
}

function rotaWriter(host) {
  const line = el('p', 'stream stream--rota');
  const body = el('span', 'stream__body');
  const caret = CARET('stream__caret stream__caret--soft');
  line.append(body, caret);
  host.append(line);

  let raw = '';
  let partial = '';

  const emit = (text) => {
    body.append(el('span', 'stream__seg', text));
  };

  return {
    write(chunk) {
      raw += chunk;
      partial += chunk;
      // A delta can land mid-word; hold the tail so words rise whole.
      const cut = partial.search(/\s\S*$/);
      if (cut === -1) return;
      const ready = partial.slice(0, cut + 1);
      partial = partial.slice(cut + 1);
      for (const token of ready.split(/(\s+)/)) if (token) emit(token);
    },
    finish(text) {
      const final = typeof text === 'string' && text.length >= raw.length ? text : raw;
      if (partial) emit(partial);
      partial = '';
      if (final && !raw) {
        raw = final;
        for (const token of final.split(/(\s+)/)) if (token) emit(token);
      }
      caret.remove();
      line.classList.add('is-settled');
    },
  };
}

function runbookWriter(host) {
  const box = el('div', 'stream stream--runbook');
  const line = el('div', 'logline');
  const gutter = el('span', 'logline__gutter', '+0.0s');
  const body = el('span', 'logline__body');
  const caret = CARET('stream__caret stream__caret--block');
  body.append(caret);
  line.append(gutter, body);
  box.append(line);
  host.append(box);

  const started = performance.now();
  const elapsed = () => ((performance.now() - started) / 1000).toFixed(1);
  let raw = '';

  return {
    write(chunk) {
      raw += chunk;
      body.insertBefore(document.createTextNode(chunk), caret);
      gutter.textContent = `+${elapsed()}s`;
    },
    finish(text) {
      const final = typeof text === 'string' && text.length >= raw.length ? text : raw;
      if (!raw && final) body.insertBefore(document.createTextNode(final), caret);
      caret.remove();
      gutter.textContent = `+${elapsed()}s`;
      box.classList.add('is-settled');
    },
  };
}

function plainWriter(host) {
  const line = el('p', 'stream stream--plain');
  const body = el('span', 'stream__body');
  line.append(body);
  host.append(line);
  let raw = '';
  return {
    write(chunk) {
      raw += chunk;
      body.textContent = raw;
    },
    finish(text) {
      const final = typeof text === 'string' && text.length >= raw.length ? text : raw;
      body.textContent = final;
    },
  };
}

const WRITERS = {
  ledger: ledgerWriter,
  rota: rotaWriter,
  runbook: runbookWriter,
  plain: plainWriter,
};

export function mountStream(name, host) {
  const make = WRITERS[name] || plainWriter;
  return make(host);
}
