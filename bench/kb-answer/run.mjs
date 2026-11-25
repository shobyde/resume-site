// Before and after on the 520-fact handbook: what a strict lookup does with the
// words a person actually types, and what the matcher does with them.
//
//   node bench/kb-answer/run.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aliasMap,
  createEntityResolver,
  createEvidenceIndex,
  deriveAliases,
  mechanicalAliases,
} from '@shobyde/boaz/match';

const here = path.dirname(fileURLToPath(import.meta.url));
const kb = JSON.parse(fs.readFileSync(path.join(here, '..', 'kb', 'kb.json'), 'utf8'));
const facts = kb.facts.map(([kind, subject, attribute, value], index) => ({ id: index, kind, subject, attribute, value: String(value) }));

const subjects = [...new Set(facts.map((fact) => fact.subject))];
const bySubject = new Map();
for (const fact of facts) {
  if (!bySubject.has(fact.subject)) bySubject.set(fact.subject, []);
  bySubject.get(fact.subject).push(fact);
}

/* The app's own vocabulary: the words a visitor uses for each attribute. This is
   domain knowledge, so it belongs to the app, not the library. */
const ATTRIBUTES = {
  sla: ['sla', 'uptime'],
  database: ['database', 'store', 'db'],
  language: ['language', 'written in', 'written'],
  runtime: ['runtime', 'runs on', 'built with'],
  replicas: ['replicas', 'instances'],
  region: ['region', 'hosted'],
  owner: ['owns', 'own', 'owner', 'responsible'],
  tier: ['tier', 'plan level'],
  lead: ['leads', 'lead', 'manager'],
  headcount: ['headcount', 'how many people', 'how many engineers', 'size of', 'how big'],
  channel: ['channel', 'slack'],
  oncall: ['on-call', 'on call', 'oncall', 'paged'],
  person: ['who is on call', 'on call'],
  team: ['team'],
  role: ['role', 'title'],
  timezone: ['timezone', 'time zone', 'hours'],
  service: ['service', 'which service'],
  severity: ['severity', 'sev'],
  status: ['status', 'state'],
  steps: ['steps', 'runbook', 'how do i fix', 'remediate'],
  plan: ['plan'],
  seats: ['seats', 'users'],
  since: ['since', 'customer since', 'when did they sign', 'sign', 'signed'],
  direction: ['direction', 'inbound', 'outbound'],
  text: ['policy', 'rule', 'say', 'says', 'what does'],
  product: ['product'],
  title: ['title', 'what happened'],
};

function attributeFor(question) {
  const q = question.toLowerCase();
  let best = null;
  for (const [attribute, phrases] of Object.entries(ATTRIBUTES)) {
    for (const phrase of phrases) {
      if (!q.includes(phrase)) continue;
      if (!best || phrase.length > best.length) best = { attribute, length: phrase.length };
    }
  }
  return best?.attribute ?? null;
}

/* ------------------------------------------------------- before: strict lookup */

function exactSubject(question) {
  const q = question.toLowerCase();
  return subjects
    .filter((subject) => q.includes(subject.toLowerCase()))
    .sort((a, b) => b.length - a.length)[0] ?? null;
}

function compose(fact) {
  const { subject, attribute, value } = fact;
  switch (attribute) {
    case 'owner': return `${subject} is owned by ${value}.`;
    case 'lead': return `${value} leads ${subject}.`;
    case 'headcount': return `${subject} has ${value} people on it.`;
    case 'sla': return `${subject} carries a ${value} SLA.`;
    case 'database': return `${subject} runs on ${value}.`;
    case 'language': return `${subject} is written in ${value}.`;
    case 'runtime': return `${subject} runs on ${value}.`;
    case 'replicas': return `${subject} runs ${value} replicas.`;
    case 'region': return `${subject} is hosted in ${value}.`;
    case 'person': return `${value} is on call for ${subject}.`;
    case 'timezone': return `${value} is the timezone for ${subject}.`;
    case 'role': return `${subject} is a ${value}.`;
    case 'title': return `${subject}: ${value}.`;
    case 'severity': return `${subject} is ${value}.`;
    case 'status': return `${subject} is ${value}.`;
    case 'steps': return `For ${subject}: ${value}.`;
    case 'text': return `${subject}: ${value}`;
    case 'plan': return `${subject} is on the ${value} plan.`;
    case 'seats': return `${subject} has ${value} seats.`;
    case 'since': return `${subject} has been a customer since ${value}.`;
    case 'direction': return `${subject} is ${value}.`;
    case 'tier': return `${subject} is ${value}.`;
    case 'channel': return `${subject} meets in ${value}.`;
    case 'campus': return `${subject} is at ${value}.`;
    default: return `${subject}: ${attribute} is ${value}.`;
  }
}

function before(question) {
  const subject = exactSubject(question);
  const attribute = attributeFor(question);
  if (!subject) return { text: "I don't have a record for that.", subject: null, fact: null };
  const candidates = bySubject.get(subject) ?? [];
  const fact = attribute ? candidates.find((row) => row.attribute === attribute) : candidates[0];
  if (!fact) return { text: `${subject} has no ${attribute} recorded.`, subject, fact: null };
  return { text: compose(fact), subject, fact };
}

/* -------------------------------------------------------- after: matcher + aliases */

const aliasSources = subjects.map((subject) => ({
  name: subject,
  documents: (bySubject.get(subject) ?? []).map((fact) => `${fact.attribute} is ${fact.value}`),
}));
const derived = deriveAliases(aliasSources, { minEntityShare: 0.34, maxGlobalShare: 0.2, exclude: Object.keys(ATTRIBUTES) });
const learned = aliasMap(derived.filter((alias) => alias.kind === 'learned'));

const resolverNames = [
  ...subjects,
  ...subjects.flatMap((subject) => mechanicalAliases(subject)),
  ...Object.keys(learned).filter((alias) => alias.length >= 5),
];
const resolver = createEntityResolver({ names: resolverNames, maxSpan: 4 });

const evidence = createEvidenceIndex(
  facts.map((fact) => ({
    id: String(fact.id),
    text: `${fact.subject} ${fact.attribute} is ${fact.value}`,
    subject: fact.subject,
  })),
  { minScore: 0.5 },
);

function canonicalSubject(name) {
  const lowered = name.toLowerCase();
  const direct = subjects.find((subject) => subject.toLowerCase() === lowered);
  if (direct) return direct;
  for (const [alias, names] of Object.entries(learned)) {
    if (alias === lowered && names[0]) return names[0];
  }
  const mechanical = subjects.find((subject) => mechanicalAliases(subject).includes(lowered));
  return mechanical ?? null;
}

function after(question) {
  const resolved = resolver.resolve(question);
  let subject = null;
  for (const match of resolved.matches) {
    subject = canonicalSubject(match.to.split(' ').pop() ?? match.to) ?? canonicalSubject(match.to);
    if (subject) break;
  }
  const attribute = attributeFor(question);

  // An on-call record and a team can share a name ("platform"): the question's
  // attribute decides which one is meant.
  if (subject && (attribute === 'oncall' || attribute === 'person')) {
    const oncall = facts.filter((fact) => fact.kind === 'oncall' && fact.subject.toLowerCase() === subject.toLowerCase());
    if (oncall.length) operator: {
      const fact = oncall.find((row) => row.attribute === 'person' || row.attribute === 'oncall') ?? oncall[0];
      return { text: compose(fact), subject: fact.subject, fact, how: 'resolved name (on-call record)' };
    }
  }

  if (subject) {
    const candidates = bySubject.get(subject) ?? [];
    const fact = attribute ? candidates.find((row) => row.attribute === attribute) : candidates[0];
    if (fact) return { text: compose(fact), subject, fact, how: resolved.matches.length ? 'resolved name' : 'exact name' };

    // A service inherits its product's facts: "what database does atlas-worker
    // use" is a question about Atlas, and the hop is visible in the record.
    if (attribute) {
      const productFact = candidates.find((row) => row.attribute === 'product');
      if (productFact) {
        const inherited = (bySubject.get(productFact.value) ?? []).find((row) => row.attribute === attribute);
        if (inherited) {
          return {
            text: compose(inherited),
            subject: inherited.subject,
            fact: inherited,
            how: `inherited from ${productFact.value}`,
          };
        }
      }
      return { text: `${subject} has no ${attribute} recorded.`, subject, fact: null, how: 'declined' };
    }
  }

  // Nothing resolved: fall back to weighted evidence over the facts themselves.
  const hit = evidence.find(question);
  if (hit) {
    const fact = facts[Number(hit.document.id)];
    return { text: compose(fact), subject: fact.subject, fact, how: 'evidence' };
  }
  return { text: "I don't have a record for that.", subject: null, fact: null, how: 'declined' };
}

/* ---------------------------------------------------------------------- cases */

const CASES = [
  { ask: 'what is the sla for becon?', want: ['Beacon', 'sla'] },
  { ask: 'how many people are on the platfrom team?', want: ['Platform', 'headcount'] },
  { ask: 'what database does atlas worker use?', want: ['Atlas', 'database'] },
  { ask: 'what happened in INC 4101?', want: ['INC-4101', 'title'] },
  { ask: 'who is on call for the platform team?', want: ['platform', 'person'] },
  { ask: 'what does the deploy freeze say?', want: ['Deploy freeze', 'text'] },
  { ask: 'which team owns northwind?', want: ['Northwind', 'owner'] },
  { ask: 'what are the steps for the ledger reconciliation runbook?', want: ['Ledger reconciliation', 'steps'] },
  { ask: 'when did contoso sign?', want: ['Contoso', 'since'] },
  { ask: 'what is the timezone for maya chen?', want: ['Maya Chen', 'timezone'] },
  { ask: 'how big is the growth team?', want: ['Growth', 'headcount'] },
  { ask: 'what language is cinder written in?', want: ['Cinder', 'language'] },
  { ask: 'what tier is the atlas api?', want: ['Atlas', 'tier'] },
  { ask: 'which product does stripe integrate with?', want: ['Stripe', 'product'] },
  { ask: 'what is the sla for northwind?', want: [null, 'sla'] },
  { ask: 'what database does the growth team use?', want: [null, 'database'] },
  { ask: 'what severity was INC 4102?', want: ['INC-4102', 'severity'] },
  { ask: 'who leads payments?', want: ['Payments', 'lead'] },
];

const rows = [];
for (const item of CASES) {
  const b = before(item.ask);
  const a = after(item.ask);
  // A null subject means the honest outcome is a decline: the record has no such
  // attribute, and inventing one is worse than saying so.
  const ok = (result) =>
    item.want[0] === null
      ? !result.fact
      : Boolean(result.fact) && result.fact.subject === item.want[0] && result.fact.attribute === item.want[1];
  rows.push({ ask: item.ask, want: item.want, before: b, after: a, beforeOk: ok(b), afterOk: ok(a) });
}

const score = {
  before: rows.filter((row) => row.beforeOk).length,
  after: rows.filter((row) => row.afterOk).length,
  total: rows.length,
  repaired: rows.filter((row) => !row.beforeOk && row.afterOk).length,
  broken: rows.filter((row) => row.beforeOk && !row.afterOk).length,
};

console.log(`cases ${score.total}: before ${score.before} after ${score.after} (repaired ${score.repaired}, broken ${score.broken})`);
for (const row of rows) {
  console.log(`\n${row.beforeOk ? '  ' : '->'} ${row.ask}`);
  console.log(`   before: ${row.before.text}`);
  console.log(`   after : ${row.after.text}   [${row.after.how}]`);
}

fs.mkdirSync(path.join(here, 'results'), { recursive: true });
fs.writeFileSync(
  path.join(here, 'results', 'kb-answer.json'),
  JSON.stringify({ score, rows: rows.map(({ before: b, after: a, ...rest }) => ({ ...rest, before: b.text, after: a.text, how: a.how })) }, null, 2),
);
