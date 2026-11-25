// Builds the thread suite from the KB, so expectations cannot drift from facts.
//   node bench/kb/suite.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const kb = JSON.parse(fs.readFileSync(path.join(here, 'kb.json'), 'utf8'));
const product = (name) => kb.products.find((p) => p.name === name);
const threads = [];

// Knowledge then follow-ups: the owner, then an attribute of the same thing,
// then a second attribute. Three turns, two of them only make sense in a thread.
for (const p of kb.products.slice(0, 8)) {
  threads.push({
    id: `product-${p.id}`,
    title: `${p.name}: owner, then attributes`,
    turns: [
      { ask: `who owns ${p.name}?`, kind: 'knowledge', expect: { include: [p.owner] } },
      { ask: 'and what is it written in?', kind: 'context', expect: { include: [p.language] } },
      { ask: 'what is its SLA?', kind: 'context', expect: { include: [p.sla] } },
    ],
  });
}

// Set questions: a list, then a filter of that list, then a position in it.
threads.push({
  id: 'database-list',
  title: 'Which products use Postgres, then narrow it',
  turns: [
    { ask: 'which products use Postgres?', kind: 'knowledge', expect: { include: ['Atlas', 'Beacon', 'Delta', 'Harbor'] } },
    { ask: 'which of those are tier 1?', kind: 'context', expect: { include: ['Atlas', 'Delta'], exclude: ['Beacon'] } },
    { ask: 'the first one?', kind: 'context', expect: { include: ['Atlas'] } },
  ],
});

threads.push({
  id: 'team-oncall',
  title: 'Oncall, then the team behind it',
  turns: [
    { ask: 'who is on call for Search?', kind: 'knowledge', expect: { include: ['Ravi Shah'] } },
    { ask: 'who leads that team?', kind: 'context', expect: { include: ['Tom Haddad'] } },
    { ask: 'how big is it?', kind: 'context', expect: { include: ['4'] } },
  ],
});

// Team threads: lead and channel, with the second turn pointing back.
for (const t of kb.teams.slice(0, 5)) {
  threads.push({
    id: `team-${t.id}`,
    title: `${t.name}: lead and channel`,
    turns: [
      { ask: `who leads ${t.name}?`, kind: 'knowledge', expect: { include: [t.lead] } },
      { ask: 'and which channel?', kind: 'context', expect: { include: [t.channel] } },
    ],
  });
}

// People: a role, then the team, then the lead of that team.
for (const person of kb.people.slice(0, 5)) {
  const team = kb.teams.find((t) => t.id === person.team);
  threads.push({
    id: `person-${person.id}`,
    title: `${person.name}: role and team`,
    turns: [
      { ask: `what does ${person.name} do?`, kind: 'knowledge', expect: { include: [person.role] } },
      { ask: 'which team?', kind: 'context', expect: { include: [person.team] } },
      { ask: 'who leads it?', kind: 'context', expect: { include: [team.lead] } },
    ],
  });
}

// Tools: one action per turn, the action id is the expectation.
for (const t of kb.teams.slice(0, 4)) {
  threads.push({
    id: `page-${t.id}`,
    title: `Page ${t.name} oncall`,
    turns: [
      { ask: `page the oncall for ${t.name}`, kind: 'tool', expect: { tool: 'page_oncall' } },
      { ask: 'and open a ticket for it', kind: 'tool', expect: { tool: 'create_ticket' } },
    ],
  });
}

for (const p of kb.products.slice(0, 4)) {
  threads.push({
    id: `deploy-${p.id}`,
    title: `Deploy and roll back ${p.name}`,
    turns: [
      { ask: `deploy ${p.name}`, kind: 'tool', expect: { tool: 'deploy' } },
      { ask: 'roll it back', kind: 'context', expect: { tool: 'rollback' } },
    ],
  });
}

// Planning: two actions from one sentence.
for (const p of kb.products.slice(0, 3)) {
  threads.push({
    id: `plan-${p.id}`,
    title: `Check and page for ${p.name}`,
    turns: [
      { ask: `check the SLA for ${p.name} and page its owner`, kind: 'planning', expect: { tool: 'page_oncall', include: [product(p.name).sla] } },
      { ask: 'summarise what we just did', kind: 'context', expect: { include: ['page'] } },
    ],
  });
}

// Readability: a summary from the facts, judged on whether it is readable.
for (const p of kb.products.slice(0, 4)) {
  threads.push({
    id: `read-${p.id}`,
    title: `Summarise ${p.name}`,
    turns: [
      { ask: `summarise ${p.name}`, kind: 'readability', expect: { include: [p.owner, p.language] } },
    ],
  });
}

// Policies: prose retrieval, then a follow-up that needs the same policy.
for (const policy of kb.policies.slice(0, 4)) {
  threads.push({
    id: `policy-${policy.id}`,
    title: `Policy: ${policy.name}`,
    turns: [
      { ask: `what is the ${policy.name} policy?`, kind: 'knowledge', expect: { include: [policy.text.split(' ').slice(0, 3).join(' ')] } },
      { ask: 'who owns it?', kind: 'context', expect: { include: [policy.owner] } },
    ],
  });
}

// Customers: a plan and an owner, then a filter over the list.
for (const customer of kb.customers.slice(0, 4)) {
  threads.push({
    id: `customer-${customer.id}`,
    title: `${customer.name}: plan and owner`,
    turns: [
      { ask: `what plan is ${customer.name} on?`, kind: 'knowledge', expect: { include: [customer.plan] } },
      { ask: 'and who owns that account?', kind: 'context', expect: { include: [customer.owner] } },
    ],
  });
}

// Incidents: severity, then its service, then that service's team.
for (const incident of kb.incidents.slice(0, 4)) {
  threads.push({
    id: `incident-${incident.id}`,
    title: `${incident.id}: severity and owner`,
    turns: [
      { ask: `what is the severity of ${incident.id}?`, kind: 'knowledge', expect: { include: [incident.severity] } },
      { ask: 'which team owns it?', kind: 'context', expect: { include: [incident.team] } },
    ],
  });
}

// Runbooks: the procedure for a service, then who owns the runbook.
for (const runbook of kb.runbooks.slice(0, 3)) {
  threads.push({
    id: `runbook-${runbook.id}`,
    title: `Runbook: ${runbook.title}`,
    turns: [
      { ask: `what are the steps for ${runbook.title}?`, kind: 'knowledge', expect: { include: [runbook.steps.split(' ').slice(0, 3).join(' ')] } },
      { ask: 'who owns that runbook?', kind: 'context', expect: { include: [runbook.owner] } },
    ],
  });
}

// Integrations: direction and product, then that product's owner.
for (const integration of kb.integrations.slice(0, 3)) {
  threads.push({
    id: `integration-${integration.id}`,
    title: `${integration.name}: direction and product`,
    turns: [
      { ask: `which direction does ${integration.name} sync?`, kind: 'knowledge', expect: { include: [integration.direction] } },
      { ask: 'and which product does it belong to?', kind: 'context', expect: { include: [integration.product] } },
    ],
  });
}

const out = {
  note: 'Generated from kb.json by suite.mjs. Products, teams, people, policies, customers, incidents, runbooks and integrations.',
  threads,
};
fs.writeFileSync(path.join(here, 'threads.json'), JSON.stringify(out, null, 2));
const turns = threads.flatMap((t) => t.turns);
const kinds = {};
for (const turn of turns) kinds[turn.kind] = (kinds[turn.kind] ?? 0) + 1;
console.log(`${threads.length} threads, ${turns.length} turns`, kinds);
