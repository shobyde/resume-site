// Renders the benchmark page from data.json. No chart library: the shapes are
// simple enough that SVG here is smaller than a dependency, and every number
// printed is one the compile step read from a run file.
import data from './data.json';

const COLORS = {
  knowledge: 'var(--knowledge)',
  language: 'var(--language)',
  context: 'var(--context)',
  planning: 'var(--planning)',
  tools: 'var(--tools)',
};
const NAMES = {
  knowledge: 'Knowledge',
  language: 'Readability',
  context: 'Context',
  planning: 'Planning',
  tools: 'Tool use',
};
const SVG = 'http://www.w3.org/2000/svg';
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

function text(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function label(node, x, y, content, attrs = {}) {
  const t = svg('text', { x, y, 'font-family': 'var(--mono)', 'font-size': 10, fill: 'var(--mute)', ...attrs });
  t.textContent = content;
  node.appendChild(t);
  return t;
}

const when = new Date(data.generated);
document.querySelector('#hero-threaded').textContent =
  `${data.threads.memory.passed} of ${data.threads.memory.total}`;
document.querySelector('#hero-stateless').textContent =
  `${data.threads.stateless.passed} of ${data.threads.stateless.total}`;

const meta = document.querySelector('#meta');
meta.textContent =
  `boaz ${data.library} · ${data.threads.memory.total} turns over ${data.threads.threads.length} threads` +
  (data.judge ? ` · judged by ${data.judge.model}` : ' · judge pending') +
  ` · ${when.toISOString().slice(0, 10)}`;

/* ---------------------------------------------------------------- scores */
const scores = document.querySelector('#scores');
const tiles = [
  {
    label: 'Threaded turns',
    value: `${data.threads.memory.passed}<small>/${data.threads.memory.total}</small>`,
    note: `<b>${data.threads.stateless.passed}/${data.threads.stateless.total}</b> with a fresh engine per turn`,
  },
  {
    label: 'Context turns',
    value: `${data.threads.memory.kinds.context.passed}<small>/${data.threads.memory.kinds.context.total}</small>`,
    note: `<b>${data.threads.stateless.kinds.context.passed}/${data.threads.stateless.kinds.context.total}</b> stateless`,
  },
  {
    label: 'Tools matched',
    value: data.judge
      ? `${data.judge.tools.ok}<small>/${data.judge.tools.total}</small>`
      : `${data.threads.memory.kinds.tool.passed}<small>/${data.threads.memory.kinds.tool.total}</small>`,
    note: data.judge ? 'judged against the tool the turn needed' : 'deterministic tool check',
  },
  {
    label: 'Readability',
    value: data.judge ? `${data.judge.readability}<small>/5</small>` : 'pending',
    note: data.judge ? `judge mean over ${data.judge.turns} turns` : 'the judge has not run yet',
  },
];
for (const tile of tiles) {
  const box = text('div', 'score');
  box.appendChild(text('p', 'label', tile.label));
  const value = text('p', 'value');
  value.innerHTML = tile.value;
  box.appendChild(value);
  const note = text('p', 'note');
  note.innerHTML = tile.note;
  box.appendChild(note);
  scores.appendChild(box);
}

/* ---------------------------------------------------------------- matrix */
const matrix = document.querySelector('#matrix');
const grid = text('div', 'matrix');
for (const [name, count] of [
  ['Thread', 'turns'],
  ['boaz', ''],
  ['stateless', ''],
]) {
  const head = text('div', 'row head');
  head.appendChild(text('span', '', name));
  head.appendChild(text('span', '', count));
  head.appendChild(text('span', '', ''));
  grid.appendChild(head);
}
for (const thread of data.threads.threads) {
  const row = text('div', 'row');
  const name = text('div', 'name');
  name.appendChild(text('b', '', thread.title));
  name.appendChild(text('span', '', thread.id));
  row.appendChild(name);
  for (const key of ['pass', 'baseline']) {
    const dots = text('div', 'dots');
    for (const turn of thread.turns) {
      const dot = text('span', `dot ${turn[key] ? 'on' : 'off'}`);
      dot.title = `${turn.ask}${turn[key] ? '' : ' (missed)'}`;
      dots.appendChild(dot);
    }
    row.appendChild(dots);
  }
  grid.appendChild(row);
}
matrix.appendChild(grid);
const legend = text('div', 'legend');
legend.innerHTML =
  '<span><i style="background:var(--accent2)"></i>answered</span>' +
  '<span><i style="background:rgba(255,122,138,0.45)"></i>missed or refused</span>' +
  '<span>one box per turn, in order</span>';
matrix.appendChild(legend);

/* --------------------------------------------------------------- carried */
const carried = document.querySelector('#carried-list');
for (const example of data.threads.carried) {
  const card = text('article', 'carry');
  card.appendChild(text('p', 'thread', example.thread));
  card.appendChild(text('p', 'ask', `“${example.ask}”`));
  if (example.routed && example.routed !== example.ask) card.appendChild(text('p', 'routed', `routed as: ${example.routed}`));
  const pair = text('div', 'pair');
  const before = text('div', 'before');
  before.innerHTML = `<span class="tag">without the thread</span>${escapeHtml(clip(example.before))}`;
  const after = text('div', 'after');
  after.innerHTML = `<span class="tag">with it</span>${escapeHtml(clip(example.after, 190))}`;
  pair.append(before, after);
  card.appendChild(pair);
  carried.appendChild(card);
}
if (!data.threads.carried.length) carried.textContent = 'No context turn passed yet: the thread earns nothing over a fresh engine.';

function clip(value, max = 150) {
  const clean = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return '(no answer)';
  // A bare tool call is the stateless case at its worst: the engine acted and
  // never said anything, which is worth showing as exactly that.
  if (clean.startsWith('```json')) return '(a tool call, and no sentence after it)';
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);
}

/* ---------------------------------------------------------------- ladder */
function renderLadder() {
  const chart = document.querySelector('#ladder-chart');
  const rows = data.ladder;
  const width = 980;
  const rowH = 30;
  const top = 34;
  const left = 232;
  const right = width - 58;
  const height = top + rows.length * rowH + 26;
  chart.setAttribute('viewBox', `0 0 ${width} ${height}`);

  // grid
  for (const tick of [0, 25, 50, 75, 100]) {
    const x = left + ((right - left) * tick) / 100;
    chart.appendChild(svg('line', { x1: x, y1: top - 12, x2: x, y2: height - 22, stroke: 'var(--line)' }));
    label(chart, x, top - 18, `${tick}%`, { 'text-anchor': 'middle', 'font-size': 9 });
  }

  let lastDimension = null;
  rows.forEach((rung, index) => {
    const y = top + index * rowH + 10;
    if (rung.dimension !== lastDimension) {
      const color = COLORS[rung.dimension];
      chart.appendChild(svg('rect', { x: left - 14, y: y - 7, width: 2, height: 14, fill: color, rx: 1 }));
      // A tick marks the group; the names live in the means strip, so they do
      // not collide with the rung labels.
      lastDimension = rung.dimension;
    }
    const nameY = rung.release && index === rows.length - 1 ? y : y;
    chart.appendChild(
      svg('text', { x: left - 30, y: nameY + 3.5, 'text-anchor': 'end', 'font-family': 'var(--sans)', 'font-size': 11.5, fill: 'var(--fg)' }),
    ).textContent = rung.label;
    const x1 = left + ((right - left) * rung.before) / 100;
    const x2 = left + ((right - left) * rung.after) / 100;
    chart.appendChild(svg('line', { x1, y1: y, x2, y2: y, stroke: COLORS[rung.dimension], 'stroke-opacity': 0.35, 'stroke-width': 2 }));
    chart.appendChild(svg('circle', { cx: x1, cy: y, r: 3.4, fill: 'var(--bg)', stroke: 'var(--bad)', 'stroke-width': 1.6 }));
    chart.appendChild(svg('circle', { cx: x2, cy: y, r: 4.6, fill: COLORS[rung.dimension] }));
    label(chart, x2 + 10, y + 3.5, `${rung.after}%`, { fill: 'var(--dim)', 'font-size': 9.5 });
    label(chart, x1 - 8, y + 3.5, `${rung.before}%`, { 'text-anchor': 'end', fill: 'var(--mute)', 'font-size': 9 });
  });
}
renderLadder();

const means = document.querySelector('#means');
for (const dimension of data.dimension) {
  const cell = text('div');
  const key = text('p', 'k', NAMES[dimension.id]);
  key.style.color = COLORS[dimension.id];
  cell.appendChild(key);
  const value = text('p', 'v');
  value.innerHTML = `${dimension.before} → ${dimension.after}<span> ${dimension.suites} suites</span>`;
  cell.appendChild(value);
  means.appendChild(cell);
}

/* --------------------------------------------------------------- releases */
function renderReleases() {
  const chart = document.querySelector('#release-chart');
  const width = 980;
  const height = 300;
  const left = 46;
  const right = width - 24;
  const top = 34;
  const bottom = height - 52;
  chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const points = data.releases;
  const max = Math.max(...points.map((point) => point.suites_at_90), 1);
  const x = (index) => left + ((right - left) * index) / Math.max(1, points.length - 1);
  const y = (value) => bottom - ((bottom - top) * value) / max;

  for (const tick of [0, Math.round(max / 2), max]) {
    chart.appendChild(svg('line', { x1: left, y1: y(tick), x2: right, y2: y(tick), stroke: 'var(--line)' }));
    label(chart, left - 10, y(tick) + 3, String(tick), { 'text-anchor': 'end', 'font-size': 9 });
  }
  label(chart, left - 10, top - 14, 'suites at 90%+', { 'text-anchor': 'start', 'font-size': 9 });

  let path = '';
  points.forEach((point, index) => {
    const px = x(index);
    const py = y(point.suites_at_90);
    path += index === 0 ? `M ${px} ${py}` : ` H ${px} V ${py}`;
    chart.appendChild(svg('circle', { cx: px, cy: py, r: 4.5, fill: 'var(--accent2)' }));
    label(chart, px, py - 12, String(point.suites_at_90), { 'text-anchor': 'middle', fill: 'var(--fg)', 'font-size': 10 });
    label(chart, px, bottom + 20, `v${point.version}`, { 'text-anchor': 'middle', fill: 'var(--dim)', 'font-size': 9.5 });
    if (point.note) label(chart, px, bottom + 34, point.note, { 'text-anchor': 'middle', 'font-size': 8.5 });
  });
  const line = svg('path', { d: path, fill: 'none', stroke: 'var(--accent2)', 'stroke-width': 2, 'stroke-opacity': 0.8 });
  chart.insertBefore(line, chart.firstChild);
}
renderReleases();

/* ------------------------------------------------------------------ judge */
const judge = document.querySelector('#judge-body');
if (!data.judge) {
  judge.innerHTML = '<p class="sub">The judge has not run yet. Run <code>python3 bench/threads/judge.py</code> and recompile.</p>';
} else {
  const bars = text('div', 'bars');
  const rows = [
    ['Answered', data.judge.answered, data.judge.turns],
    ['Tool called correctly', data.judge.tools.ok, data.judge.tools.total],
    ['Grounded claims', data.judge.grounded, 100],
    ['Readability', data.judge.readability, 5],
  ];
  for (const [label, value, total] of rows) {
    const bar = text('div', 'bar');
    const top = text('div', 'top');
    top.innerHTML = `<span>${label}</span><b>${value}${total === 100 ? '%' : `/${total}`}</b>`;
    bar.appendChild(top);
    const track = text('div', 'track');
    const fill = text('div', 'fill');
    fill.style.width = `${Math.min(100, (value / total) * 100)}%`;
    track.appendChild(fill);
    bar.appendChild(track);
    bars.appendChild(bar);
  }
  const verdicts = text('div', 'verdicts');
  for (const example of data.judge.examples) {
    const card = text('div', 'verdict');
    card.innerHTML = `<p class="q">“${escapeHtml(example.ask)}”</p><p class="w">${example.answered ? 'answered' : 'not answered'} · readability ${example.readability}/5 · ${escapeHtml(example.why)}</p>`;
    verdicts.appendChild(card);
  }
  if (data.judge.stateless) {
    const line = text(
      'p',
      'sub',
      `Fresh engine per turn: ${data.judge.stateless.answered}/${data.judge.stateless.turns} answered, ` +
        `${data.judge.stateless.readability}/5 readable. The judge saw the same rubric and no expected facts.`,
    );
    line.style.marginTop = '0.9rem';
    bars.appendChild(line);
  }
  judge.append(bars, verdicts);
}
