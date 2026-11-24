// A knowledge base that is not this site: a synthetic operations handbook.
// Deterministic, no randomness: the point is scale and shape (entities, facts,
// tools, policies), not surprises. Every entity and fact is invented.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const products = [
  { id: 'atlas', name: 'Atlas', owner: 'Platform', language: 'Go', sla: '99.95%', database: 'Postgres', region: 'us-east', tier: 1 },
  { id: 'beacon', name: 'Beacon', owner: 'Growth', language: 'TypeScript', sla: '99.9%', database: 'Postgres', region: 'us-east', tier: 2 },
  { id: 'cinder', name: 'Cinder', owner: 'Data', language: 'Python', sla: '99.5%', database: 'ClickHouse', region: 'eu-west', tier: 2 },
  { id: 'delta', name: 'Delta', owner: 'Payments', language: 'Rust', sla: '99.99%', database: 'Postgres', region: 'us-west', tier: 1 },
  { id: 'ember', name: 'Ember', owner: 'Platform', language: 'Go', sla: '99.9%', database: 'Redis', region: 'us-east', tier: 2 },
  { id: 'flint', name: 'Flint', owner: 'Search', language: 'Java', sla: '99.9%', database: 'Elasticsearch', region: 'us-west', tier: 1 },
  { id: 'gauge', name: 'Gauge', owner: 'Data', language: 'Python', sla: '99.0%', database: 'ClickHouse', region: 'eu-west', tier: 3 },
  { id: 'harbor', name: 'Harbor', owner: 'Growth', language: 'TypeScript', sla: '99.5%', database: 'Postgres', region: 'ap-south', tier: 3 },
];

const services = [
  { id: 'ingest-api', product: 'atlas', runtime: 'Go', replicas: 12, oncall: 'Platform' },
  { id: 'ingest-worker', product: 'atlas', runtime: 'Go', replicas: 30, oncall: 'Platform' },
  { id: 'signup-web', product: 'beacon', runtime: 'TypeScript', replicas: 6, oncall: 'Growth' },
  { id: 'experiment-api', product: 'beacon', runtime: 'TypeScript', replicas: 4, oncall: 'Growth' },
  { id: 'pipeline-runner', product: 'cinder', runtime: 'Python', replicas: 8, oncall: 'Data' },
  { id: 'query-cache', product: 'cinder', runtime: 'Go', replicas: 3, oncall: 'Data' },
  { id: 'ledger-api', product: 'delta', runtime: 'Rust', replicas: 10, oncall: 'Payments' },
  { id: 'settlement-worker', product: 'delta', runtime: 'Rust', replicas: 5, oncall: 'Payments' },
  { id: 'notify-fanout', product: 'ember', runtime: 'Go', replicas: 9, oncall: 'Platform' },
  { id: 'search-index', product: 'flint', runtime: 'Java', replicas: 14, oncall: 'Search' },
  { id: 'search-suggest', product: 'flint', runtime: 'Java', replicas: 6, oncall: 'Search' },
  { id: 'metrics-rollup', product: 'gauge', runtime: 'Python', replicas: 4, oncall: 'Data' },
  { id: 'marketing-site', product: 'harbor', runtime: 'TypeScript', replicas: 2, oncall: 'Growth' },
  { id: 'docs-portal', product: 'harbor', runtime: 'TypeScript', replicas: 2, oncall: 'Growth' },
];

const teams = [
  { id: 'platform', name: 'Platform', lead: 'Maya Chen', headcount: 9, channel: '#platform' },
  { id: 'growth', name: 'Growth', lead: 'Ivan Okafor', headcount: 6, channel: '#growth' },
  { id: 'data', name: 'Data', lead: 'Priya Raman', headcount: 7, channel: '#data' },
  { id: 'payments', name: 'Payments', lead: 'Lena Ortiz', headcount: 5, channel: '#payments' },
  { id: 'search', name: 'Search', lead: 'Tom Haddad', headcount: 4, channel: '#search' },
];

const people = [
  { id: 'maya', name: 'Maya Chen', team: 'platform', role: 'Staff engineer', timezone: 'PT' },
  { id: 'ivan', name: 'Ivan Okafor', team: 'growth', role: 'Engineering manager', timezone: 'ET' },
  { id: 'priya', name: 'Priya Raman', team: 'data', role: 'Staff engineer', timezone: 'IST' },
  { id: 'lena', name: 'Lena Ortiz', team: 'payments', role: 'Principal engineer', timezone: 'CET' },
  { id: 'tom', name: 'Tom Haddad', team: 'search', role: 'Senior engineer', timezone: 'ET' },
  { id: 'ada', name: 'Ada Ferreira', team: 'platform', role: 'SRE', timezone: 'PT' },
  { id: 'ben', name: 'Ben Yamada', team: 'growth', role: 'Product engineer', timezone: 'PT' },
  { id: 'cy', name: 'Cy Mensah', team: 'data', role: 'Analytics engineer', timezone: 'ET' },
  { id: 'noa', name: 'Noa Levi', team: 'payments', role: 'SRE', timezone: 'CET' },
  { id: 'ravi', name: 'Ravi Shah', team: 'search', role: 'Search engineer', timezone: 'IST' },
];

const oncall = [
  { team: 'platform', person: 'Ada Ferreira', week: '2026-W48' },
  { team: 'growth', person: 'Ben Yamada', week: '2026-W48' },
  { team: 'data', person: 'Cy Mensah', week: '2026-W48' },
  { team: 'payments', person: 'Noa Levi', week: '2026-W48' },
  { team: 'search', person: 'Ravi Shah', week: '2026-W48' },
];

const policies = [
  { id: 'p1', name: 'Incident severity', text: 'Sev 1 is customer-visible downtime, paged immediately to the owning team. Sev 2 is degraded service, acknowledged within 30 minutes. Sev 3 is cosmetic and handled in business hours.', owner: 'Platform' },
  { id: 'p2', name: 'Deploy freeze', text: 'No production deploys during the last two business days of the quarter, except for Sev 1 fixes approved by the owning team lead.', owner: 'Platform' },
  { id: 'p3', name: 'Data retention', text: 'Application logs are kept 30 days. Audit logs are kept 400 days. Customer records are deleted within 30 days of a verified request.', owner: 'Data' },
  { id: 'p4', name: 'Oncall handoff', text: 'Oncall rotates weekly on Monday at 09:00 in the team\'s lead timezone, with a written handoff in the team channel.', owner: 'Platform' },
  { id: 'p5', name: 'Access review', text: 'Production access is reviewed quarterly. Any access unused for 90 days is revoked automatically.', owner: 'Platform' },
  { id: 'p6', name: 'Cost guardrail', text: 'Any service above 2,000 dollars a month in compute needs a named owner and a monthly review.', owner: 'Data' },
  { id: 'p7', name: 'Search relevance', text: 'Every relevance change ships behind a traffic split of at least 5%, held for 72 hours before full rollout.', owner: 'Search' },
  { id: 'p8', name: 'Payment retries', text: 'Failed charges retry three times over 48 hours with exponential backoff, then settle to manual review.', owner: 'Payments' },
];

// Facts are triples the way a rules engine sees them: subject, attribute, value.
const facts = [];
for (const p of products) {
  facts.push(['product', p.name, 'owner', p.owner]);
  facts.push(['product', p.name, 'language', p.language]);
  facts.push(['product', p.name, 'sla', p.sla]);
  facts.push(['product', p.name, 'database', p.database]);
  facts.push(['product', p.name, 'region', p.region]);
  facts.push(['product', p.name, 'tier', `tier ${p.tier}`]);
}
for (const s of services) {
  facts.push(['service', s.id, 'product', products.find((p) => p.id === s.product).name]);
  facts.push(['service', s.id, 'runtime', s.runtime]);
  facts.push(['service', s.id, 'replicas', String(s.replicas)]);
  facts.push(['service', s.id, 'oncall', teams.find((t) => t.id === String(s.oncall).toLowerCase()).name]);
}
for (const t of teams) {
  facts.push(['team', t.name, 'lead', t.lead]);
  facts.push(['team', t.name, 'headcount', String(t.headcount)]);
  facts.push(['team', t.name, 'channel', t.channel]);
}
for (const person of people) {
  facts.push(['person', person.name, 'team', teams.find((t) => t.id === person.team).name]);
  facts.push(['person', person.name, 'role', person.role]);
  facts.push(['person', person.name, 'timezone', person.timezone]);
}
for (const row of oncall) facts.push(['oncall', row.team, 'person', row.person]);
for (const p of policies) {
  facts.push(['policy', p.name, 'owner', p.owner]);
  facts.push(['policy', p.name, 'text', p.text]);
}

// One sentence per fact, which is what a retrieval system gets to work with.
const docs = facts.map(([kind, subject, attribute, value]) => ({
  id: `${kind}:${subject}:${attribute}`,
  kind,
  subject,
  attribute,
  text: `${subject}: ${attribute} is ${value}.`,
}));

const kb = {
  note: 'Synthetic operations handbook for bench/kb. Every entity is invented.',
  products,
  services,
  teams,
  people,
  oncall,
  policies,
  facts,
  docs,
};

fs.writeFileSync(path.join(here, 'kb.json'), JSON.stringify(kb, null, 2));
console.log(`kb: ${products.length} products, ${services.length} services, ${teams.length} teams, ${people.length} people, ${policies.length} policies`);
console.log(`    ${facts.length} facts, ${docs.length} retrieval documents`);
