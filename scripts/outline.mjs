/**
 * Rung 9: long-form from facts. Compile a spike ledger entry into a post outline.
 *
 * The ledger is already structured prose written by the loop: a rung, a measured
 * pass rate, a commit, the gate numbers, the ceiling inputs that broke the run,
 * and a note saying what changed and what it cost. A post has the same skeleton
 * (claim, evidence, open question), so the outline does not need a model. It
 * needs a parser that knows which sentences carry numbers, which lines are
 * provenance, and which sentence names the boundary.
 *
 * What this deliberately does not do: write connective prose. Every sentence in
 * the outline is verbatim ledger text, and the open question is a reframing of a
 * ceiling sentence. Selection and ordering are the deterministic part; the
 * argument between the claims is still the writer's job.
 *
 * Usage:
 *   node scripts/outline.mjs --rung 8 [--ledger <path>] [--json]
 *   import { compileOutline, parseLedger, renderOutline } from './outline.mjs'
 */
import { readFile } from 'node:fs/promises';

const FIELDS = new Set(['outcome', 'pass rate', 'commit', 'gates', 'post', 'ceiling', 'note']);
const FIELD = /^([a-z][a-z ]*):\s*(.*)$/;
const NUMBER = /\d+(?:[.,]\d+)?%?/g;

/** Split a field's raw lines into prose and `- ` bullets, keeping order. */
function blocks(raw) {
  const bullets = [];
  const prose = [];
  let open = -1;
  for (const line0 of String(raw).split('\n')) {
    const line = line0.trim();
    if (!line) continue;
    if (/^-\s+/.test(line)) {
      bullets.push(line.replace(/^-\s+/, ''));
      open = bullets.length - 1;
    } else if (open >= 0) {
      bullets[open] += ` ${line}`;
    } else {
      prose.push(line);
    }
  }
  return { prose: prose.join(' ').replace(/\s+/g, ' ').trim(), bullets };
}

const sentences = (text) =>
  String(text)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Every entry in a ledger, newest first as written. */
export function parseLedger(markdown) {
  return markdown
    .split(/^## /m)
    .slice(1)
    .map((chunk) => {
      const lines = chunk.split('\n');
      const heading = lines.shift().trim();
      const split = heading.match(/^(\S+)\s+[-–]\s+(.*)$/);
      const timestamp = split ? split[1] : '';
      const rest = split ? split[2] : heading;
      const rungMatch = /(?:rung|spike)\s+(\d+)/i.exec(rest);
      const name = rest.includes(':') ? rest.slice(rest.indexOf(':') + 1).trim() : rest.trim();
      const fields = {};
      let key = null;
      for (const line of lines) {
        const match = FIELD.exec(line);
        // A wrapped line can look like a field ("number that moved is precision: ..."),
        // so only the ledger's own keys start a field, and only once.
        const key_ = match && FIELDS.has(match[1].trim()) && !(match[1].trim() in fields) ? match[1].trim() : null;
        if (key_) {
          key = key_;
          fields[key] = match[2];
          continue;
        }
        if (key) fields[key] += `\n${line}`;
      }
      const raw = [heading, ...Object.values(fields)].join('\n');
      return {
        timestamp,
        rung: rungMatch ? Number(rungMatch[1]) : null,
        name,
        raw,
        fields,
        outcome: (fields.outcome ?? '').trim(),
        passRate: blocks(fields['pass rate'] ?? '').prose,
        commit: blocks(fields.commit ?? '').prose,
        gates: blocks(fields.gates ?? '').prose,
        post: blocks(fields.post ?? '').prose,
        ceiling: blocks(fields.ceiling ?? ''),
        note: blocks(fields.note ?? '').prose,
      };
    });
}

const numberCount = (text) => (String(text).match(NUMBER) ?? []).length;

/**
 * Claims, in the order a post would make them: the measurement, then what
 * changed, then the boundary. Ranked by how much measured content a sentence
 * carries, because a note's first sentence is often context rather than result.
 */
function pickClaims(entry, limit = 3) {
  const claims = [];
  const push = (text, source) => {
    const clean = text.trim();
    if (clean && !claims.some((c) => c.text === clean)) claims.push({ text: clean, source });
  };
  const rate = sentences(entry.passRate);
  if (rate[0]) push(rate[0], 'pass rate');
  const measured = sentences(entry.note)
    .filter((s) => /%|\btasks?\b|\d/.test(s) && s.length > 40)
    .sort((a, b) => numberCount(b) - numberCount(a));
  for (const sentence of measured.slice(0, 2)) push(sentence, 'note');
  if (claims.length < 2) {
    const cost = sentences(entry.note).find((s) => /cost:/i.test(s));
    if (cost) push(cost, 'note');
  }
  return claims.slice(0, limit);
}

const QUESTION_VERBS = /\b(?:is|are|was|were|has|have|does|do|can|cannot|misses?|fails?|breaks?|stops?)\b/i;

/** A clause that names the thing the run ran into, not the sentence around it. */
function subjectOf(sentence) {
  const cut = sentence.split(/[,;:]|\s+(?:is|are|was|were|and|but|so)\s+/i)[0].trim();
  const head = cut.split(/\s+\(/)[0].trim();
  let words = head.split(/\s+/).filter(Boolean);
  if (words.length > 8) words = cut.split(/\s+/).filter(Boolean).slice(0, 4);
  return words.length >= 2 ? words.join(' ') : '';
}

/**
 * The open question is the ceiling reframed. Three shapes, chosen by the shape
 * of the first boundary sentence, never by what would read best:
 *
 *   A  the bullet opens with a quoted input  -> what should the system answer for it
 *   B  a component, plus a quoted input that fails -> what would it take for the component to handle it
 *   C  a component with no input  -> where does the component stop
 *
 * B prefers a quoted input from a sentence that reports a failure, because the
 * first quote in a boundary often names the phrasing that already works.
 */
function quotedMiss(ceiling) {
  const text = `${ceiling.prose} ${ceiling.bullets.join(' ')}`.replace(/\s+/g, ' ');
  const spans = [...text.matchAll(/"([^"]{3,60})"/g)];
  if (!spans.length) return '';
  const FAIL = /\b(?:miss|misses|fails?|no |never|not |wrong|unreachable|breaks?|stops?|invisible)\b/gi;
  // The first quote in a boundary often names the phrasing that already works,
  // so take the quote nearest to a failure word instead of the first one.
  const failures = [...text.matchAll(FAIL)].map((m) => m.index ?? 0);
  if (!failures.length) return '';
  let best = null;
  for (const span of spans) {
    const at = span.index ?? 0;
    const distance = Math.min(...failures.map((f) => Math.abs(f - at)));
    if (!best || distance < best.distance) best = { quote: span[1], distance };
  }
  return best ? best.quote : '';
}

const FIRST_QUOTE_LEAD = 12;

/** Does the boundary lead with a quoted input rather than a named component? */
function leadsWithInput(ceiling) {
  const text = `${ceiling.prose} ${ceiling.bullets.join(' ')}`.replace(/\s+/g, ' ').trim();
  const lead = /^[^"]*/.exec(text)?.[0] ?? '';
  const before = lead.split(/\s+/).filter(Boolean).length;
  return /"/.test(text) && before <= FIRST_QUOTE_LEAD;
}

export function openQuestionFor(entry) {
  const firstQuote = /"([^"]{3,60})"/.exec(`${entry.ceiling.prose} ${entry.ceiling.bullets.join(' ')}`);
  if (!entry.ceiling.bullets.length && !entry.ceiling.prose) return 'What did this run leave unmeasured?';
  if (firstQuote && leadsWithInput(entry.ceiling)) {
    return `What should the system answer when a visitor asks "${firstQuote[1]}"?`;
  }
  const first = entry.ceiling.bullets[0] ?? entry.ceiling.prose;
  const subject = subjectOf(sentences(first)[0] ?? first);
  if (!subject) return 'What did this run leave unmeasured?';
  const miss = quotedMiss(entry.ceiling);
  if (miss) return `What would it take for ${subject} to handle "${miss}"?`;
  return `Where does ${subject} stop?`;
}

export function compileOutline(entry, options = {}) {
  const claims = pickClaims(entry, options.claims ?? 3);
  const evidence = [];
  if (entry.commit) evidence.push(entry.commit);
  if (entry.gates) evidence.push(entry.gates);
  if (entry.outcome) evidence.push(`outcome: ${entry.outcome}`);
  return {
    rung: entry.rung,
    name: entry.name,
    timestamp: entry.timestamp,
    title: `Rung ${entry.rung}: ${entry.name}`,
    claims,
    evidence,
    openQuestion: openQuestionFor(entry),
    boundary: entry.ceiling.bullets[0] ?? '',
  };
}

/**
 * What a grep gets you: the note's opening sentence, the commit line, and no
 * boundary. This is the baseline the suite measures against, kept here so both
 * sides of the number come from the same parser.
 */
export function naiveOutline(entry) {
  return {
    rung: entry.rung,
    name: entry.name,
    timestamp: entry.timestamp,
    title: `Rung ${entry.rung}: ${entry.name}`,
    claims: [{ text: sentences(entry.note)[0] ?? '', source: 'note' }].filter((c) => c.text),
    evidence: entry.commit ? [entry.commit] : [],
    openQuestion: '',
    boundary: '',
  };
}

export function renderOutline(outline) {
  const lines = [`# ${outline.title}`, ''];
  lines.push('## Claims', '');
  for (const claim of outline.claims) lines.push(`- ${claim.text}`);
  lines.push('', '## Evidence', '');
  for (const item of outline.evidence) lines.push(`- ${item}`);
  lines.push('', '## Open question', '', outline.openQuestion);
  if (outline.boundary) lines.push('', '## Boundary', '', `- ${outline.boundary}`);
  return `${lines.join('\n')}\n`;
}

/** Numeric tokens are the fidelity check: an outline may not carry a new one. */
export function numbersIn(text) {
  return (String(text).match(NUMBER) ?? []).map((n) => n.replace(/[.,]$/, ''));
}

// CLI: print the outline for one rung, so the loop can draft from it.
if (import.meta.url === `file://${process.argv[1]}`) {
  const argValue = (flag) => {
    const at = process.argv.indexOf(flag);
    return at >= 0 ? process.argv[at + 1] : undefined;
  };
  const ledgerPath = argValue('--ledger') ?? `${process.env.HOME}/.hermes/cron/output/client-agent-spikes.log.md`;
  const entries = parseLedger(await readFile(ledgerPath, 'utf8'));
  const want = Number(argValue('--rung'));
  const entry = Number.isFinite(want) ? entries.find((e) => e.rung === want) : entries[0];
  if (!entry) {
    process.stderr.write(`no rung ${want} in ${ledgerPath}\n`);
    process.exitCode = 1;
  } else {
    const outline = compileOutline(entry);
    process.stdout.write(process.argv.includes('--json') ? `${JSON.stringify(outline, null, 2)}\n` : renderOutline(outline));
  }
}
