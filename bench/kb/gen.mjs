// A knowledge base that is not this site: a synthetic operations handbook.
// Deterministic, no randomness: the point is scale and shape (entities, facts,
// tools, policies), not surprises. Every entity and fact is invented.
//
// v2 widens it: 16 products, 30 services, 10 teams, 20 people, 16 policies, plus
// customers, incidents, runbooks and integrations, and ten tool actions. The
// question suites are built from this file, so a bigger table is a bigger bench.
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
  { id: 'iris', name: 'Iris', owner: 'Identity', language: 'Go', sla: '99.99%', database: 'Postgres', region: 'us-east', tier: 1 },
  { id: 'juno', name: 'Juno', owner: 'Identity', language: 'Rust', sla: '99.95%', database: 'Redis', region: 'us-east', tier: 1 },
  { id: 'kestrel', name: 'Kestrel', owner: 'Search', language: 'Java', sla: '99.5%', database: 'Elasticsearch', region: 'eu-west', tier: 2 },
  { id: 'lumen', name: 'Lumen', owner: 'Infra', language: 'Go', sla: '99.9%', database: 'Prometheus', region: 'us-west', tier: 2 },
  { id: 'mica', name: 'Mica', owner: 'Infra', language: 'Python', sla: '99.0%', database: 'Postgres', region: 'us-west', tier: 3 },
  { id: 'nimbus', name: 'Nimbus', owner: 'Platform', language: 'TypeScript', sla: '99.5%', database: 'DynamoDB', region: 'ap-south', tier: 3 },
  { id: 'opal', name: 'Opal', owner: 'Payments', language: 'Rust', sla: '99.95%', database: 'Postgres', region: 'eu-west', tier: 1 },
  { id: 'quartz', name: 'Quartz', owner: 'Data', language: 'Python', sla: '99.0%', database: 'ClickHouse', region: 'us-east', tier: 3 },
];

const teams = [
  { id: 'platform', name: 'Platform', lead: 'Maya Chen', headcount: 9, channel: '#platform' },
  { id: 'growth', name: 'Growth', lead: 'Ivan Okafor', headcount: 6, channel: '#growth' },
  { id: 'data', name: 'Data', lead: 'Priya Raman', headcount: 7, channel: '#data' },
  { id: 'payments', name: 'Payments', lead: 'Lena Ortiz', headcount: 5, channel: '#payments' },
  { id: 'search', name: 'Search', lead: 'Tom Haddad', headcount: 4, channel: '#search' },
  { id: 'identity', name: 'Identity', lead: 'Sofia Brandt', headcount: 6, channel: '#identity' },
  { id: 'infra', name: 'Infra', lead: 'Marco Silva', headcount: 8, channel: '#infra' },
  { id: 'support', name: 'Support', lead: 'Hana Sato', headcount: 11, channel: '#support' },
  { id: 'security', name: 'Security', lead: 'Omar Aziz', headcount: 4, channel: '#security' },
  { id: 'docs', name: 'Docs', lead: 'Elsa Novak', headcount: 3, channel: '#docs' },
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
  { id: 'sofia', name: 'Sofia Brandt', team: 'identity', role: 'Staff engineer', timezone: 'CET' },
  { id: 'marco', name: 'Marco Silva', team: 'infra', role: 'Engineering manager', timezone: 'PT' },
  { id: 'hana', name: 'Hana Sato', team: 'support', role: 'Support lead', timezone: 'JST' },
  { id: 'omar', name: 'Omar Aziz', team: 'security', role: 'Security engineer', timezone: 'ET' },
  { id: 'elsa', name: 'Elsa Novak', team: 'docs', role: 'Technical writer', timezone: 'CET' },
  { id: 'jules', name: 'Jules Marchand', team: 'identity', role: 'Platform engineer', timezone: 'CET' },
  { id: 'kai', name: 'Kai Tanaka', team: 'support', role: 'Support engineer', timezone: 'JST' },
  { id: 'nina', name: 'Nina Petrov', team: 'infra', role: 'SRE', timezone: 'CET' },
  { id: 'rex', name: 'Rex Okonkwo', team: 'security', role: 'Incident commander', timezone: 'ET' },
  { id: 'yuki', name: 'Yuki Mori', team: 'docs', role: 'Docs engineer', timezone: 'JST' },
];

const oncall = [
  { team: 'platform', person: 'Ada Ferreira', week: '2026-W48' },
  { team: 'growth', person: 'Ben Yamada', week: '2026-W48' },
  { team: 'data', person: 'Cy Mensah', week: '2026-W48' },
  { team: 'payments', person: 'Noa Levi', week: '2026-W48' },
  { team: 'search', person: 'Ravi Shah', week: '2026-W48' },
  { team: 'identity', person: 'Jules Marchand', week: '2026-W48' },
  { team: 'infra', person: 'Nina Petrov', week: '2026-W48' },
  { team: 'support', person: 'Kai Tanaka', week: '2026-W48' },
  { team: 'security', person: 'Rex Okonkwo', week: '2026-W48' },
  { team: 'docs', person: 'Yuki Mori', week: '2026-W48' },
];

const policies = [
  { id: 'p1', name: 'Incident severity', text: 'Sev 1 is customer-visible downtime, paged immediately to the owning team. Sev 2 is degraded service, acknowledged within 30 minutes. Sev 3 is cosmetic and handled in business hours.', owner: 'Platform' },
  { id: 'p2', name: 'Deploy freeze', text: 'No production deploys during the last two business days of the quarter, except for Sev 1 fixes approved by the owning team lead.', owner: 'Platform' },
  { id: 'p3', name: 'Data retention', text: 'Application logs are kept 30 days. Audit logs are kept 400 days. Customer records are deleted within 30 days of a verified request.', owner: 'Data' },
  { id: 'p4', name: 'Oncall handoff', text: 'Oncall rotates weekly on Monday at 09:00 in the team lead timezone, with a written handoff in the team channel.', owner: 'Platform' },
  { id: 'p5', name: 'Access review', text: 'Production access is reviewed quarterly. Any access unused for 90 days is revoked automatically.', owner: 'Platform' },
  { id: 'p6', name: 'Cost guardrail', text: 'Any service above 2,000 dollars a month in compute needs a named owner and a monthly review.', owner: 'Data' },
  { id: 'p7', name: 'Search relevance', text: 'Every relevance change ships behind a traffic split of at least 5%, held for 72 hours before full rollout.', owner: 'Search' },
  { id: 'p8', name: 'Payment retries', text: 'Failed charges retry three times over 48 hours with exponential backoff, then settle to manual review.', owner: 'Payments' },
  { id: 'p9', name: 'Secrets rotation', text: 'Service credentials rotate every 90 days. Database credentials rotate every 30 days. A rotation that fails pages the Security oncall.', owner: 'Security' },
  { id: 'p10', name: 'Backup testing', text: 'Every production database restore is tested monthly into a scratch environment, and the result is attached to the runbook.', owner: 'Infra' },
  { id: 'p11', name: 'Customer escalation', text: 'A customer marked priority one gets an engineer on the call within 15 minutes. Priority two gets a written update within four hours.', owner: 'Support' },
  { id: 'p12', name: 'Change windows', text: 'Routine changes ship Monday through Thursday between 09:00 and 16:00 in the service region. Friday changes need a rollback plan.', owner: 'Infra' },
  { id: 'p13', name: 'Incident review', text: 'Every Sev 1 gets a written review within five business days, and the action items are tracked to closure by the owning team.', owner: 'Security' },
  { id: 'p14', name: 'Feature flags', text: 'A flag older than 90 days is either made permanent or removed. Flags that gate a payment path need an owner and an expiry.', owner: 'Payments' },
  { id: 'p15', name: 'Documentation freshness', text: 'A runbook untouched for 180 days is marked stale and routed to its owning team for review.', owner: 'Docs' },
  { id: 'p16', name: 'Third party integrations', text: 'Every external integration has a named owner, a fallback path when it is down, and a quarterly health check.', owner: 'Identity' },
];

const customers = [
  { id: 'northwind', name: 'Northwind', tier: 'enterprise', plan: 'annual', owner: 'Support', since: '2021', seats: 4200 },
  { id: 'contoso', name: 'Contoso', tier: 'enterprise', plan: 'annual', owner: 'Support', since: '2020', seats: 9100 },
  { id: 'fabrikam', name: 'Fabrikam', tier: 'midmarket', plan: 'monthly', owner: 'Growth', since: '2023', seats: 380 },
  { id: 'tailspin', name: 'Tailspin', tier: 'midmarket', plan: 'annual', owner: 'Growth', since: '2022', seats: 640 },
  { id: 'adatum', name: 'Adatum', tier: 'enterprise', plan: 'annual', owner: 'Support', since: '2019', seats: 12800 },
  { id: 'proseware', name: 'Proseware', tier: 'startup', plan: 'monthly', owner: 'Growth', since: '2024', seats: 45 },
  { id: 'lucerne', name: 'Lucerne', tier: 'midmarket', plan: 'annual', owner: 'Payments', since: '2022', seats: 1200 },
  { id: 'wingtip', name: 'Wingtip', tier: 'startup', plan: 'monthly', owner: 'Growth', since: '2024', seats: 80 },
  { id: 'relecloud', name: 'Relecloud', tier: 'enterprise', plan: 'annual', owner: 'Support', since: '2018', seats: 15300 },
  { id: 'alpineski', name: 'Alpine Ski House', tier: 'midmarket', plan: 'annual', owner: 'Search', since: '2021', seats: 900 },
  { id: 'graphicdesign', name: 'Graphic Design Institute', tier: 'startup', plan: 'monthly', owner: 'Docs', since: '2025', seats: 30 },
  { id: 'lorem', name: 'Lorem Medical', tier: 'enterprise', plan: 'annual', owner: 'Identity', since: '2020', seats: 7400 },
];

const incidents = [
  { id: 'INC-4101', title: 'Atlas ingest backlog', service: 'ingest-worker', severity: 'Sev 1', status: 'resolved', team: 'Platform' },
  { id: 'INC-4102', title: 'Ledger duplicate charges', service: 'ledger-api', severity: 'Sev 1', status: 'mitigated', team: 'Payments' },
  { id: 'INC-4103', title: 'Search latency spike', service: 'search-index', severity: 'Sev 2', status: 'resolved', team: 'Search' },
  { id: 'INC-4104', title: 'Signup rate limit too tight', service: 'signup-web', severity: 'Sev 2', status: 'open', team: 'Growth' },
  { id: 'INC-4105', title: 'Pipeline retry storm', service: 'pipeline-runner', severity: 'Sev 2', status: 'resolved', team: 'Data' },
  { id: 'INC-4106', title: 'Metrics gap after rollup', service: 'metrics-rollup', severity: 'Sev 3', status: 'open', team: 'Data' },
  { id: 'INC-4107', title: 'Docs portal expired certificate', service: 'docs-portal', severity: 'Sev 2', status: 'resolved', team: 'Docs' },
  { id: 'INC-4108', title: 'Identity token refresh loop', service: 'iris', severity: 'Sev 1', status: 'resolved', team: 'Identity' },
  { id: 'INC-4109', title: 'Cache eviction churn', service: 'query-cache', severity: 'Sev 3', status: 'mitigated', team: 'Data' },
  { id: 'INC-4110', title: 'Notification fanout delay', service: 'notify-fanout', severity: 'Sev 2', status: 'resolved', team: 'Platform' },
];

const runbooks = [
  { id: 'rb-atlas', title: 'Atlas ingest backlog', service: 'ingest-api', owner: 'Platform', steps: 'Check queue depth, scale workers, drain oldest partition' },
  { id: 'rb-delta', title: 'Ledger reconciliation', service: 'ledger-api', owner: 'Payments', steps: 'Freeze writes, replay the settlement window, compare totals' },
  { id: 'rb-flint', title: 'Search index rebuild', service: 'search-index', owner: 'Search', steps: 'Snapshot the index, rebuild shard by shard, flip the alias' },
  { id: 'rb-cinder', title: 'Pipeline backfill', service: 'pipeline-runner', owner: 'Data', steps: 'Pick the date range, run the backfill, verify row counts' },
  { id: 'rb-iris', title: 'Token rotation', service: 'iris', owner: 'Identity', steps: 'Rotate the signing key, publish the new JWKS, watch the error rate' },
  { id: 'rb-lumen', title: 'Metrics gap', service: 'lumen', owner: 'Infra', steps: 'Check scrape targets, restart the shipper, backfill the gap' },
  { id: 'rb-beacon', title: 'Experiment rollback', service: 'experiment-api', owner: 'Growth', steps: 'Set the split to zero, confirm exposure, archive the result' },
  { id: 'rb-harbor', title: 'Certificate renewal', service: 'docs-portal', owner: 'Docs', steps: 'Renew the certificate, deploy the secret, verify the chain' },
];

const integrations = [
  { id: 'stripe', name: 'Stripe', product: 'Delta', direction: 'outbound', owner: 'Payments' },
  { id: 'salesforce', name: 'Salesforce', product: 'Harbor', direction: 'bidirectional', owner: 'Growth' },
  { id: 'okta', name: 'Okta', product: 'Iris', direction: 'inbound', owner: 'Identity' },
  { id: 'segment', name: 'Segment', product: 'Beacon', direction: 'outbound', owner: 'Growth' },
  { id: 'slack', name: 'Slack', product: 'Nimbus', direction: 'outbound', owner: 'Platform' },
  { id: 'snowflake', name: 'Snowflake', product: 'Quartz', direction: 'outbound', owner: 'Data' },
  { id: 'pagerduty', name: 'PagerDuty', product: 'Lumen', direction: 'outbound', owner: 'Infra' },
  { id: 'zendesk', name: 'Zendesk', product: 'Harbor', direction: 'bidirectional', owner: 'Support' },
  { id: 'github', name: 'GitHub', product: 'Kestrel', direction: 'inbound', owner: 'Search' },
  { id: 'twilio', name: 'Twilio', product: 'Ember', direction: 'outbound', owner: 'Platform' },
];

const services = [];
for (const product of products) {
  services.push({ id: `${product.id}-api`, product: product.id, runtime: product.language, replicas: 4 + (product.tier === 1 ? 8 : product.tier === 2 ? 4 : 0), oncall: product.owner });
  services.push({ id: `${product.id}-worker`, product: product.id, runtime: product.language, replicas: 2 + (product.tier === 1 ? 6 : 2), oncall: product.owner });
}

// Facts are triples the way a rules engine sees them: subject, attribute, value.
const facts = [];
for (const item of products) {
  facts.push(['product', item.name, 'owner', item.owner]);
  facts.push(['product', item.name, 'language', item.language]);
  facts.push(['product', item.name, 'sla', item.sla]);
  facts.push(['product', item.name, 'database', item.database]);
  facts.push(['product', item.name, 'region', item.region]);
  facts.push(['product', item.name, 'tier', `tier ${item.tier}`]);
}
for (const service of services) {
  facts.push(['service', service.id, 'product', products.find((item) => item.id === service.product).name]);
  facts.push(['service', service.id, 'runtime', service.runtime]);
  facts.push(['service', service.id, 'replicas', String(service.replicas)]);
  facts.push(['service', service.id, 'oncall', service.oncall]);
}
for (const team of teams) {
  facts.push(['team', team.name, 'lead', team.lead]);
  facts.push(['team', team.name, 'headcount', String(team.headcount)]);
  facts.push(['team', team.name, 'channel', team.channel]);
}
for (const person of people) {
  facts.push(['person', person.name, 'team', teams.find((team) => team.id === person.team).name]);
  facts.push(['person', person.name, 'role', person.role]);
  facts.push(['person', person.name, 'timezone', person.timezone]);
}
for (const row of oncall) facts.push(['oncall', row.team, 'person', row.person]);
for (const policy of policies) {
  facts.push(['policy', policy.name, 'owner', policy.owner]);
  facts.push(['policy', policy.name, 'text', policy.text]);
}
for (const customer of customers) {
  facts.push(['customer', customer.name, 'tier', customer.tier]);
  facts.push(['customer', customer.name, 'plan', customer.plan]);
  facts.push(['customer', customer.name, 'owner', customer.owner]);
  facts.push(['customer', customer.name, 'since', customer.since]);
  facts.push(['customer', customer.name, 'seats', String(customer.seats)]);
}
for (const incident of incidents) {
  facts.push(['incident', incident.id, 'title', incident.title]);
  facts.push(['incident', incident.id, 'service', incident.service]);
  facts.push(['incident', incident.id, 'severity', incident.severity]);
  facts.push(['incident', incident.id, 'status', incident.status]);
  facts.push(['incident', incident.id, 'team', incident.team]);
}
for (const runbook of runbooks) {
  facts.push(['runbook', runbook.title, 'service', runbook.service]);
  facts.push(['runbook', runbook.title, 'owner', runbook.owner]);
  facts.push(['runbook', runbook.title, 'steps', runbook.steps]);
}
for (const integration of integrations) {
  facts.push(['integration', integration.name, 'product', integration.product]);
  facts.push(['integration', integration.name, 'direction', integration.direction]);
  facts.push(['integration', integration.name, 'owner', integration.owner]);
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
  note: 'Synthetic operations handbook for bench/kb. Every entity is invented. v2: wider tables and ten tool actions.',
  products,
  services,
  teams,
  people,
  oncall,
  policies,
  customers,
  incidents,
  runbooks,
  integrations,
  facts,
  docs,
};

fs.writeFileSync(path.join(here, 'kb.json'), JSON.stringify(kb, null, 2));
console.log(
  `kb: ${products.length} products, ${services.length} services, ${teams.length} teams, ${people.length} people, ` +
    `${policies.length} policies, ${customers.length} customers, ${incidents.length} incidents, ` +
    `${runbooks.length} runbooks, ${integrations.length} integrations`,
);
console.log(`    ${facts.length} facts, ${docs.length} retrieval documents`);
