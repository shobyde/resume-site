// Five ways to answer the same handbook questions, without a model.
//
// Each system exposes `ask(question)` on a per-thread instance and returns
// { text, tools }. The harness runs tools and hands back results; none of these
// systems learns from them beyond the planning case, which declares both steps.
//
// The comparison is not about which is cleverest. It is which survives a
// knowledge base that was not hand-shaped for it, and which falls over the
// moment a question refers to the one before it.

const ATTRIBUTES = {
  owner: ['who owns', 'owner', 'owns', 'responsible for'],
  language: ['written in', 'language'],
  sla: ['sla', 'uptime'],
  database: ['database', 'store', 'storage', 'run on', 'runs on'],
  region: ['region', 'where does it run'],
  tier: ['tier'],
  lead: ['leads', 'lead', 'manager'],
  channel: ['channel', 'chat'],
  headcount: ['how big', 'headcount', 'size'],
  role: ['what does', 'role', 'do'],
  timezone: ['timezone', 'time zone'],
  oncall: ['on call', 'oncall'],
  team: ['which team', 'what team'],
  text: ['policy'],
};

const TOOLS = [
  { id: 'page_oncall', verbs: ['page', 'on call', 'oncall'], arg: 'team' },
  { id: 'create_ticket', verbs: ['ticket', 'file'], arg: 'title' },
  { id: 'deploy', verbs: ['deploy', 'ship it', 'release'], arg: 'service' },
  { id: 'rollback', verbs: ['roll back', 'rollback', 'revert', 'roll it back', 'roll that back'], arg: 'service' },
  { id: 'schedule_review', verbs: ['schedule', 'book a review'], arg: 'product' },
];

import { createFactIndex, rankFacts } from 'boaz/rules';

const norm = (text) => String(text ?? '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
const DECLINE = "I'm not sure about that.";

const rowsOf = (kb) => kb.facts.map(([relation, ...args]) => [relation, ...args]);

function vocabulary(kb) {
  return {
    products: kb.products.map((p) => p.name),
    teams: kb.teams.map((t) => t.name),
    people: kb.people.map((p) => p.name),
    services: kb.services.map((s) => s.id),
    policies: kb.policies.map((p) => p.name),
  };
}

const FIELD = { product: 'product', service: 'service', team: 'team', person: 'person', policy: 'policy' };

function findEntity(kb, question) {
  const q = norm(question);
  const vocab = vocabulary(kb);
  // Longest name wins: "Atlas" must not shadow "Atlas API" style names, and a
  // person named "May" must not shadow "Maya Chen" if both existed.
  const hits = [];
  for (const kind of ['products', 'services', 'people', 'teams', 'policies']) {
    for (const name of vocab[kind]) {
      if (q.includes(norm(name))) hits.push({ kind, name, length: name.length });
    }
  }
  hits.sort((a, b) => b.length - a.length);
  const hit = hits[0];
  if (!hit) return null;
  const SINGULAR = { products: 'product', services: 'service', people: 'person', teams: 'team', policies: 'policy' };
  return { ...hit, kind: SINGULAR[hit.kind] ?? hit.kind };
}

function attributeOf(question) {
  const q = norm(question);
  // Earliest phrase wins, not the longest: "check the SLA for Delta and page its
  // owner" asks about the SLA and mentions the owner as the target of the action.
  let best = null;
  for (const [attribute, phrases] of Object.entries(ATTRIBUTES)) {
    for (const phrase of phrases) {
      const at = q.search(new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`));
      if (at < 0) continue;
      if (!best || at < best.at || (at === best.at && phrase.length > best.phrase.length)) {
        best = { attribute, phrase, at };
      }
    }
  }
  return best?.attribute ?? null;
}

function toolOf(question) {
  const q = norm(question);
  // "who is on call" is a question, not a page.
  if (/^(who|what|when|where|how)\b/.test(q)) return null;
  let best = null;
  for (const tool of TOOLS) {
    for (const verb of tool.verbs) {
      if (q.includes(verb) && (!best || verb.length > best.verb.length)) best = { tool, verb };
    }
  }
  return best?.tool ?? null;
}

function factsFor(kb, kind, name) {
  const field = FIELD[kind] ?? KIND_FALLBACK[kind];
  const rows = kb.facts.filter(([k, subject]) => k === field && norm(subject) === norm(name));
  return Object.fromEntries(rows.map(([, , attribute, value]) => [attribute, value]));
}

const KIND_FALLBACK = { product: 'product', service: 'service', team: 'team', person: 'person', policy: 'policy' };

function subjectsWith(kb, kind, attribute, value) {
  const field = FIELD[kind] ?? KIND_FALLBACK[kind];
  return kb.facts
    .filter(([k, , a, v]) => k === field && a === attribute && norm(v) === norm(value))
    .map(([, subject]) => subject);
}

function oncallFor(kb, team) {
  return kb.facts.find(([k, subject, a]) => k === 'oncall' && norm(subject) === norm(team) && a === 'person')?.[3] ?? null;
}

/** A tool call, in the shape a host's runtime would parse. */
function callTool(tool, entity, extra = {}) {
  const args = { [tool.arg]: entity ?? extra.value };
  return { text: JSON.stringify({ tool: tool.id, arguments: args }), tools: [{ id: tool.id, args }] };
}

/* ---------------------------------------------------------------- systems */

/** The ten-minute approach: a phrase table and a flat lookup. */
export function createTemplates(kb) {
  return {
    id: 'templates',
    ask(question) {
      const q = norm(question);
      const entity = findEntity(kb, question);
      const tool = toolOf(question);
      if (tool && entity) return callTool(tool, entity.name);
      if (!entity) return { text: DECLINE, tools: [] };
      const facts = factsFor(kb, entity.kind, entity.name);
      if (entity.kind === 'person' && /^who is\b/i.test(q)) {
        const parts = [facts.role, facts.team && `on ${facts.team}`].filter(Boolean);
        if (parts.length) return { text: `${entity.name}: ${parts.join(', ')}.`, tools: [] };
      }
      const attribute = attributeOf(question);
      if (attribute && facts[attribute]) return { text: `${entity.name}: ${facts[attribute]}.`, tools: [] };
      return { text: DECLINE, tools: [] };
    },
  };
}

/** Retrieval: the library's fact index, then quote the best sentence. */
export function createBm25(kb) {
  const index = createFactIndex(rowsOf(kb));
  return {
    id: 'bm25',
    ask(question) {
      const tool = toolOf(question);
      const entity = findEntity(kb, question);
      if (tool && entity) return callTool(tool, entity.name);
      const [hit] = index.search(question, 1);
      return hit ? { text: hit.text, tools: [] } : { text: DECLINE, tools: [] };
    },
  };
}

/** Rules over the fact table: entity plus attribute, no memory. */
export function createRules(kb) {
  return {
    id: 'rules',
    ask(question) {
      const q = norm(question);
      // A policy is prose: the text is the answer, and the word "deploy" inside
      // its name must not be read as an action.
      const entity = findEntity(kb, question);
      if (entity?.kind === 'policies' || entity?.kind === 'policy') {
        const facts = factsFor(kb, 'policy', entity.name);
        if (facts.text) return { text: `${entity.name}: ${facts.text}.`, tools: [] };
      }
      // Lists: "which products use Postgres".
      const uses = question.match(/which\s+(products?|services?|teams?)\s+(?:use|runs? on|run|are|is)\s+(?:on\s+)?(?:tier\s+)?(\w+)/i);
      if (uses) {
        const kind = uses[1].replace(/s$/, '');
        const value = uses[2];
        const byTier = subjectsWith(kb, kind, 'tier', `tier ${value}`);
        const byDatabase = subjectsWith(kb, kind, 'database', value);
        const byRuntime = subjectsWith(kb, kind, 'runtime', value);
        const names = [...new Set([...byTier, ...byDatabase, ...byRuntime])];
        return names.length ? { text: `${names.join(', ')}.`, tools: [] } : { text: DECLINE, tools: [] };
      }
      // A ranking question: "which product has the highest SLA". The library
      // reads the number in the value, so "unknown" cannot win.
      const best = question.match(/which\s+(product|service|team)\s+(?:has|had)\s+the\s+(highest|lowest|largest|smallest)\s+(\w+)/i);
      if (best) {
        const relation = best[1].toLowerCase();
        const attribute = best[3].toLowerCase();
        const winner = rankFacts(rowsOf(kb), { relation, attribute, direction: /lowest|smallest/.test(best[2]) ? 'min' : 'max' })[0];
        if (winner) return { text: `${winner.subject} has the ${best[2]} ${attribute} at ${winner.value}.`, tools: [] };
      }

      // A relation the rules never declared: which services sit under a product.
      const belongs = question.match(/which services (?:belong to|are under|sit under)\s+([A-Za-z]+)/i);
      if (belongs) {
        const product = kb.products.find((row) => norm(row.name) === norm(belongs[1]));
        const names = product ? kb.services.filter((row) => norm(row.product) === norm(product.id)).map((row) => row.id) : [];
        return names.length ? { text: `${names.join(', ')}.`, tools: [] } : { text: DECLINE, tools: [] };
      }

      if (/who is on call|who's on call/.test(q)) {
        const team = entity?.kind === 'team' ? entity.name : entity ? factsFor(kb, entity.kind, entity.name).oncall : null;
        const person = team ? oncallFor(kb, team) : null;
        return person ? { text: `${team}: ${person} is on call.`, tools: [] } : { text: DECLINE, tools: [] };
      }
      const tool = toolOf(question);
      if (tool && entity) return callTool(tool, entity.name);
      if (!entity) return { text: DECLINE, tools: [] };
      const facts = factsFor(kb, entity.kind, entity.name);
      if (entity.kind === 'person' && /^who is\b/i.test(q)) {
        const parts = [facts.role, facts.team && `on ${facts.team}`].filter(Boolean);
        if (parts.length) return { text: `${entity.name}: ${parts.join(', ')}.`, tools: [] };
      }
      const attribute = attributeOf(question);
      if (attribute && facts[attribute]) return { text: `${entity.name}: ${facts[attribute]}.`, tools: [] };
      if (facts.text) return { text: `${entity.name}: ${facts.text}.`, tools: [] };
      return { text: DECLINE, tools: [] };
    },
  };
}

/**
 * The shipping shape: rules, plus a session that carries the subject and the
 * last list forward. Every branch sets the state it means, instead of guessing
 * the subject back out of the sentence it just wrote.
 */
export function createRulesMemory(kb) {
  const base = createRules(kb);
  const state = { subject: null, kind: null, entities: [], attribute: null, tool: null, toolTarget: null };

  const say = (text, { subject, kind, entities, attribute } = {}) => {
    if (subject) state.subject = subject;
    if (kind) state.kind = kind;
    if (entities) state.entities = entities;
    if (attribute) state.attribute = attribute;
    return { text, tools: [] };
  };

  return {
    id: 'rules+memory',
    state,
    /** Lets a retrieval fallback leave the session with the subject it found. */
    absorb(question, text) {
      const entity = findEntity(kb, question) ?? findEntity(kb, text);
      if (entity) {
        state.subject = entity.name;
        state.kind = entity.kind;
      }
    },
    ask(question) {
      const q = norm(question);
      const tool = toolOf(question);
      const attribute = attributeOf(question);

      if (process.env.KB_DEBUG) console.error('[ask]', JSON.stringify(q), 'state=', JSON.stringify(state), 'attr=', attribute, 'tool=', tool?.id ?? null);

      // 1. A pointer into the last list.
      const ordinal = q.match(/\b(first|second|third|last)\b/);
      if (ordinal && state.entities.length > 1) {
        const index = ordinal[1] === 'last' ? state.entities.length - 1 : ['first', 'second', 'third'].indexOf(ordinal[1]);
        const target = state.entities[index];
        const entity = target ? findEntity(kb, target) : null;
        if (entity) {
          const facts = factsFor(kb, entity.kind, entity.name);
          const attribute = attributeOf(question) ?? state.attribute;
          const text = attribute && facts[attribute]
            ? `${entity.name}: ${facts[attribute]}.`
            : `${entity.name}: ${Object.entries(facts).slice(0, 2).map(([k, v]) => `${k} ${v}`).join(', ')}.`;
          return say(text, { subject: entity.name, kind: entity.kind, attribute });
        }
      }

      // 2. A filter over the last list: "which of those are tier 1".
      const filter = q.match(/which of (?:those|them|these) (?:are|is) (?:tier )?(\d|tier \d)/);
      if (filter && state.entities.length) {
        const wanted = filter[1].startsWith('tier') ? filter[1] : `tier ${filter[1]}`;
        const kept = state.entities.filter((name) => {
          const entity = findEntity(kb, name);
          return entity && factsFor(kb, entity.kind, entity.name).tier === wanted;
        });
        if (kept.length) return say(`${kept.join(', ')}.`, { entities: kept, attribute: 'tier' });
      }

      // A sentence that asks for a fact and an action: "check the SLA for Delta and
      // page its owner" is two steps, declared before either runs.
      if (/\band\b/.test(q) && tool && attribute) {
        const entity = findEntity(kb, question);
        if (entity) {
          const facts = factsFor(kb, entity.kind, entity.name);
          const team = facts.owner ?? facts.oncall ?? null;
          if (facts[attribute] && team) {
            const call = callTool(tool, team);
            state.tool = tool.id;
            state.toolTarget = team;
            return {
              text: `${entity.name}: ${facts[attribute]}. Paged ${team} for it.`,
              tools: call.tools,
            };
          }
        }
      }

      // 3. An action that points at what was just discussed: "roll it back".
      if (tool && /\b(it|that|this|the same)\b/.test(q) && state.toolTarget) {
        return { ...callTool(tool, state.toolTarget), };
      }

      // 4. A pronoun or an ellipsis: carry the subject.
      // A pronoun, an ellipsis, or a bare attribute question ("which team?") after
      // a subject is the same move: it asks about the thing still in play.
      const pointer =
        /^(and\b|what about\b)/.test(q) ||
        /\b(its|their|it|that team|that product|the same)\b/.test(q) ||
        (Boolean(attribute) && !findEntity(kb, question));
      if (pointer && attribute && state.subject) {
        // "who leads that team" asked after a person: the team is the subject's
        // team, not the person.
        let subject = state.subject;
        let kind = state.kind;
        if (attribute === 'team' && kind === 'person') {
          const team = factsFor(kb, 'person', subject).team;
          if (team) {
            return say(`${subject}: team is ${team}.`, { subject: team, kind: 'team', attribute: 'team' });
          }
        }
        if (attribute === 'lead' && kind === 'product') {
          const team = factsFor(kb, 'product', subject).owner;
          const lead = team ? factsFor(kb, 'team', team).lead : null;
          if (lead) return say(`${team}: ${lead} leads it.`, { subject: team, kind: 'team', attribute: 'lead' });
        }
        if (attribute === 'lead' && kind === 'person') {
          const team = factsFor(kb, 'person', subject).team;
          const lead = team ? factsFor(kb, 'team', team).lead : null;
          if (lead) return say(`${team}: ${lead} leads it.`, { subject: team, kind: 'team', attribute: 'lead' });
        }
        const facts = factsFor(kb, kind, subject);
        if (facts[attribute]) return say(`${subject}: ${facts[attribute]}.`, { subject, kind, attribute });
      }

      // 5. A summary from facts, which is the readability case.
      const summarySubject = state.subject ?? findEntity(kb, question)?.name ?? null;
      if (/^(summari[sz]e|tell me about|describe)\b/.test(q) && summarySubject) {
        const summaryKind = state.subject ? state.kind : findEntity(kb, question)?.kind;
        const facts = factsFor(kb, summaryKind, summarySubject);
        const parts = [
          facts.owner && `owned by ${facts.owner}`,
          facts.language && `written in ${facts.language}`,
          facts.sla && `holding a ${facts.sla} SLA`,
          facts.database && `on ${facts.database}`,
        ].filter(Boolean);
        if (parts.length) return say(`${summarySubject} is ${parts.slice(0, 3).join(', ')}.`, { subject: summarySubject, kind: summaryKind, attribute: null });
      }

      if (/^summari[sz]e what we (just )?did/.test(q) && state.tool) {
        return { text: `We ran ${state.tool} on ${state.toolTarget ?? 'the thing in play'}.`, tools: [] };
      }

      // A count over the list still in play: "how many is that".
      if (/^how many\b/.test(q) && state.entities.length) {
        return { text: `${state.entities.length}.`, tools: [] };
      }

      // "who is on call for that" points at the thing the last action touched.
      if (/on call|oncall/.test(q) && /\b(that|it|those)\b/.test(q)) {
        const target = state.toolTarget ?? state.subject;
        const entity = target ? findEntity(kb, target) : null;
        if (entity) {
          const facts = factsFor(kb, entity.kind, entity.name);
          const teamName =
            entity.kind === 'service'
              ? factsFor(kb, 'product', facts.product).owner
              : entity.kind === 'product'
                ? facts.owner
                : facts.oncall ?? facts.team ?? null;
          const person = teamName ? oncallFor(kb, teamName) : null;
          if (person) return { text: `${teamName}: ${person} is on call.`, tools: [] };
        }
      }

      // 6. Plain routing, then remember what it answered about.
      const answer = base.ask(question);
      if (process.env.KB_DEBUG) console.error('  -> base:', answer.text, JSON.stringify(answer.tools ?? []));
      const entity = findEntity(kb, question);
      if (entity && !/not sure/i.test(answer.text)) {
        const facts = factsFor(kb, entity.kind, entity.name);
        state.subject = entity.name;
        state.kind = entity.kind;
        state.attribute = attributeOf(question);
        if (Array.isArray(facts) === false) state.entities = [entity.name];
      }
      if (!/not sure/i.test(answer.text)) {
        const listMatch = answer.text.match(/^(.+?, .+)\.$/);
        if (listMatch) state.entities = listMatch[1].split(',').map((name) => name.trim());
      }
      const call = answer.tools?.[0];
      if (call?.args) state.tool = call.id;
      if (call?.args) state.toolTarget = Object.values(call.args)[0] ?? state.toolTarget;
      return answer;
    },
  };
}

/** Rules with memory, then retrieval when the rules decline. */
export function createHybrid(kb) {
  const rules = createRulesMemory(kb);
  const bm25 = createBm25(kb);
  return {
    id: 'hybrid',
    ask(question) {
      const answer = rules.ask(question);
      if (!/not sure/i.test(answer.text)) return answer;
      const retrieved = bm25.ask(question);
      if (/not sure/i.test(retrieved.text)) return answer;
      // Retrieval is a fallback for facts the rules did not reach, not a licence
      // to answer about whichever sentence shares a word. When the question names
      // a subject the document must be about it; when it names none (a topic
      // question) the index's own floor is the guard, and the answer is absorbed
      // into the session so the next turn has a subject.
      const named = findEntity(kb, question)?.name ?? null;
      if (named && !norm(retrieved.text).includes(norm(named))) return answer;
      rules.absorb?.(question, retrieved.text);
      return retrieved;
    },
  };
}

export const SYSTEMS = [
  ['templates', createTemplates],
  ['bm25', createBm25],
  ['rules', createRules],
  ['rules+memory', createRulesMemory],
  ['hybrid', createHybrid],
];
