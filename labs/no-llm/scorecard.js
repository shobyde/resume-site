/**
 * /labs/no-llm/ scorecard: one row per task class, its pass rate, and the input
 * that broke it.
 *
 * Two sources, both measured:
 *   - the five slot-filling suites are graded HERE, on load, by
 *     bench/no-llm/grade.mjs, which is the module `npm run bench:no-llm` imports.
 *     Same suite, same grader, so the numbers cannot drift.
 *   - every other class needs a page tree, a browser or a fake transport, so the
 *     page shows the transcript its own harness printed, captured by
 *     scripts/gen-scorecard.mjs. The row says which of the two it is.
 *
 * Nothing on this page contacts a model or the network after load.
 */
import doc from './scorecard.json';
import { analyzeQuestion } from 'boaz';
import { baselineAnalysis, scoreTask } from '../../bench/no-llm/grade.mjs';
import taxonomy from '../../bench/no-llm/tasks.json';
import negation from '../../bench/no-llm/negation.json';
import reference from '../../bench/no-llm/reference.json';
import compound from '../../bench/no-llm/compound.json';
import synonyms from '../../bench/no-llm/synonyms.json';

const SUITES = { taxonomy, negation, reference, compound, synonyms };

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** Grade one suite the way run.mjs does, with the same baseline and the same scorer. */
function gradeSuite(suite) {
  const subjects = suite.subjects ?? [];
  const rows = suite.tasks.map((task) => {
    const context = { ...(task.context ?? {}), ...(suite.baseline === 'naive' ? { naive: true } : {}) };
    const before = baselineAnalysis(task.q, subjects, context);
    const after = analyzeQuestion(task.q, { subjects, context: task.context ?? {} });
    return { q: task.q, want: task.expect, before, after, b: scoreTask(task, before), a: scoreTask(task, after) };
  });
  const passed = rows.filter((row) => row.a.ok).length;
  const beforePassed = rows.filter((row) => row.b.ok).length;
  return {
    rows,
    after: { passed, total: rows.length },
    before: { passed: beforePassed, total: rows.length },
  };
}

const live = new Map();
for (const [id, suite] of Object.entries(SUITES)) live.set(id, gradeSuite(suite));

const pct = (pair) => (pair && pair.total ? Math.round((pair.passed / pair.total) * 1000) / 10 : null);
const frac = (pair) => (pair ? `${pair.passed}/${pair.total}` : 'not printed');

function stats() {
  const liveTasks = [...live.values()].reduce((sum, suite) => sum + suite.rows.length, 0);
  const box = $('stats');
  for (const [value, label] of [
    [String(doc.classes.length), 'task classes'],
    [String(liveTasks), 'graded live in this tab'],
    ['0', 'model calls'],
  ]) {
    const item = el('div');
    item.append(el('b', null, value), el('span', null, label));
    box.append(item);
  }
}

let selected = null;

function renderRows() {
  const body = $('rows');
  body.textContent = '';
  for (const entry of doc.classes) {
    const isLive = live.has(entry.id);
    const after = isLive ? live.get(entry.id).after : entry.after;
    const before = isLive ? live.get(entry.id).before : entry.before;
    const pctAfter = isLive ? pct(after) : entry.afterPct ?? pct(entry.after);
    const pctBefore = isLive ? pct(before) : entry.beforePct ?? pct(entry.before);

    const tr = el('tr');
    if (selected === entry.id) tr.className = 'on';
    tr.tabIndex = 0;
    tr.append(
      el('td', 'num', String(entry.rung)),
      el('td', 'cls', entry.name),
      el('td', 'num', entry.tasks ? String(entry.tasks) : '—'),
      el('td', 'num', pctBefore === null ? '—' : `${pctBefore}%`),
    );
    const afterCell = el('td', `rate ${pctAfter === null ? '' : pctAfter >= 90 ? 'good' : pctAfter < 70 ? 'bad' : ''}`, pctAfter === null ? 'see report' : `${pctAfter}%`);
    tr.append(afterCell, el('td', null, ''));
    const tag = el('span', `tag ${isLive ? 'live' : ''}`, isLive ? 'live here' : 'harness');
    tr.lastElementChild.append(tag);
    tr.addEventListener('click', () => select(entry.id));
    tr.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') select(entry.id);
    });
    body.append(tr);
  }
}

function slotRows(analysis) {
  const slots = analysis.slots ?? {};
  const rows = [
    ['type', analysis.type],
    ['entities', slots.entities ?? []],
    ['attribute', slots.attribute ?? null],
    ['exclude', slots.exclude ?? []],
    ['combine', slots.combine?.op ?? null],
    ['reference', slots.reference?.value ?? null],
  ];
  const dl = el('dl');
  for (const [key, value] of rows) {
    const shown = Array.isArray(value)
      ? value.length
        ? value.join(', ')
        : '(none)'
      : value === null || value === undefined
        ? '(none)'
        : String(value);
    dl.append(el('dt', null, key), el('dd', null, shown));
  }
  return dl;
}

function trace(row, kind) {
  const ok = kind === 'pass';
  const box = el('div', `trace ${ok ? 'pass' : 'fail'}`);
  box.append(el('div', 'q', `"${row.q}"`));
  const dl = el('dl');
  dl.append(
    el('dt', null, 'wanted'),
    el('dd', null, JSON.stringify(row.want)),
  );
  box.append(dl, slotRows(row.after));
  box.append(
    el('div', 'why', ok ? 'passes: every asserted slot matches' : `fails: ${row.a.problems.join('; ')}`),
  );
  const naive = el('div', 'why');
  naive.style.color = 'var(--mute)';
  naive.textContent = row.b.ok
    ? 'The naive handler gets this one too.'
    : `The naive handler reads it as type ${row.before.type}, entities [${
        (row.before.slots.entities ?? []).join(', ') || 'none'
      }], exclude [${(row.before.slots.exclude ?? []).join(', ') || 'none'}].`;
  box.append(naive);
  return box;
}

function renderLive(entry, panel) {
  const suite = live.get(entry.id);
  const meta = el(
    'div',
    'meta',
    `graded in this tab: ${frac(suite.after)} = ${pct(suite.after)}%  ·  naive ${frac(suite.before)} = ${pct(suite.before)}%` +
      `  ·  harness printed: ${entry.headline[0] ?? 'n/a'}`,
  );
  panel.append(meta);

  const fail = suite.rows.find((row) => !row.a.ok);
  const pass = suite.rows.find((row) => row.a.ok);
  const pair = el('div', 'pair');
  if (fail) pair.append(trace(fail, 'fail'));
  if (pass) pair.append(trace(pass, 'pass'));
  if (!fail) {
    const note = el('div', 'trace pass');
    note.append(
      el('div', 'q', 'no failing input in this suite'),
      el('div', 'why', `Every one of the ${suite.rows.length} utterances passes. The ceiling is recorded in the ledger instead.`),
    );
    pair.prepend(note);
  }
  panel.append(pair);

  const list = el('div', 'tasks');
  for (const row of suite.rows) {
    const item = el('div', 'task');
    item.append(el('span', `st ${row.a.ok ? 'pass' : 'fail'}`, row.a.ok ? 'PASS' : 'FAIL'), el('span', null, row.q));
    item.addEventListener('click', () => {
      for (const other of list.children) other.classList.remove('sel');
      item.classList.add('sel');
      const box = $('taskDetail');
      box.textContent = '';
      box.append(trace(row, row.a.ok ? 'pass' : 'fail'));
    });
    list.append(item);
  }
  panel.append(list);
  const detail = el('div');
  detail.id = 'taskDetail';
  panel.append(detail);
}

function renderHarness(entry, panel) {
  panel.append(
    el(
      'div',
      'meta',
      `${frac(entry.before)} naive → ${frac(entry.after)} with the machinery` +
        `${entry.afterPct !== null && entry.afterPct !== undefined ? ` (${entry.afterPct}%)` : ''}` +
        `  ·  scored by its own harness, which needs ${entry.id === 'browser' ? 'a real Chromium session' : entry.id === 'actions' ? 'a captured page tree' : 'the site build'}`,
    ),
  );
  const lines = entry.report.split('\n');
  const shown = lines.length > 70 ? [...lines.slice(0, 66), `... ${lines.length - 66} more lines`] : lines;
  const pre = el('pre');
  pre.textContent = shown.join('\n');
  panel.append(pre);
}

function select(id) {
  selected = id;
  renderRows();
  const entry = doc.classes.find((item) => item.id === id);
  const panel = $('panel');
  panel.textContent = '';
  panel.hidden = false;

  const head = el('div');
  head.append(
    el('h2', null, entry.name),
    el('p', 'sub', `Rung ${entry.rung} of the no-model programme. ${entry.suite ? `Suite bench/no-llm/${entry.suite}.` : ''}`),
  );
  panel.append(head);

  if (live.has(id)) renderLive(entry, panel);
  else renderHarness(entry, panel);

  if (entry.ceiling) {
    const box = el('div', 'ceiling');
    box.append(el('b', null, 'Ceiling: '), document.createTextNode(entry.ceiling));
    panel.append(box);
  }

  const chips = el('div', 'chips');
  const rerun = el('button', null, 'Grade every live suite again');
  rerun.addEventListener('click', () => {
    for (const [key, suite] of Object.entries(SUITES)) live.set(key, gradeSuite(suite));
    renderRows();
    select(selected ?? id);
  });
  chips.append(rerun);
  panel.append(chips);
  panel.scrollIntoView({ block: 'nearest' });
}

stats();
renderRows();
select('negation');
