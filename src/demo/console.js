/**
 * The live console on /client-agent/: the same knowledge, rules and capabilities
 * the site's assistant uses, wired to this page's own text so a reader can try
 * the engine without opening the panel.
 */
import manifest from 'client-agent:manifest';
import { AgentRuntime, registry } from 'client-agent/core';
import { createRulesEngine } from 'client-agent/rules';
import { DATA } from '../data.js';
import { siteCapabilities } from '../agent/capabilities.js';
import { createAssistantKnowledge } from '../agent/knowledge.js';
import { describeTrace } from '../agent/trace.js';
import { renderA2UI } from '../agent/a2ui.js';
// The A2UI components are styled by the assistant stylesheet, which is scoped to
// .agent and .a2ui classes and has no global element selectors.
import '../styles/agent.css';

const log = document.getElementById('demoLog');
const form = document.getElementById('demoForm');
const input = document.getElementById('demoInput');
const send = document.getElementById('demoSend');
const chips = document.getElementById('demoChips');
const eventsEl = document.getElementById('demoEvents');

async function boot() {
  if (!log || !form || !input) return;
  // Read-only capabilities only: this page has no app to navigate or mutate.
  // The actions kept here answer with a surface, which is the point of the demo.
  // projects.expand needs a card the SPA has already rendered, so it stays out:
  // on this page there is no card in the document to expand.
  const SURFACE_ACTIONS = new Set(['projects.card', 'blog.card', 'contact.card']);
  const capabilities = manifest.capabilities.filter(
    (capability) =>
      capability.kind === 'query' ||
      capability.kind === 'knowledge' ||
      (capability.kind === 'action' && SURFACE_ACTIONS.has(capability.id)),
  );
  const ids = new Set(capabilities.map((capability) => capability.id));
  for (const capability of siteCapabilities) {
    if (ids.has(capability.id)) registry.register(capability);
  }

  const empty = log.querySelector('.console__empty');
  let posts = [];
  try {
    const response = await fetch('/content/posts/index.json', { cache: 'no-store' });
    const data = await response.json();
    posts = data.posts ?? data ?? [];
  } catch {
    // The console still works without the blog list; only post questions need it.
  }

  const sorted = [...posts].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const state = { postCount: posts.length, newestPost: sorted[0] ?? null };
  const { knowledge, answers } = createAssistantKnowledge({ posts: sorted });

  const titleOf = (id) => manifest.capabilities.find((capability) => capability.id === id)?.title || id;
  let live = null;
  let busy = false;
  const events = [];

  const ensureBubble = () => {
    if (live) return live;
    empty?.remove();
    const bubble = document.createElement('div');
    bubble.className = 'bubble bubble--demo';
    const trace = document.createElement('ul');
    trace.className = 'trace';
    const body = document.createElement('p');
    body.className = 'answer';
    bubble.append(trace, body);
    log.appendChild(bubble);
    live = { bubble, trace, body, text: '' };
    return live;
  };

  const eventLine = (event) => {
    const stamp = String(Math.round(performance.now()) % 100000).padStart(5, '0');
    if (event.type === 'delta') return `${stamp}  delta    ${JSON.stringify(event.text)}`;
    if (event.type === 'step') {
      const step = event.step;
      return `${stamp}  step     ${step.type}${step.capabilityId ? ` ${step.capabilityId}` : ''}${step.label ? ` · ${step.label}` : ''}`;
    }
    if (event.type === 'turn') return `${stamp}  turn     ${event.steps?.length ?? 0} steps, ${String(event.text ?? '').length} chars`;
    return `${stamp}  ${event.type}`;
  };

  const runtime = new AgentRuntime({
    engine: createRulesEngine({
      knowledge,
      answers,
      capabilities,
      // The page is the corpus: field questions read the text you are looking at.
      grounding: { read: () => document.body.innerText },
      constants: [...new Set(DATA.projects.flatMap((project) => project.stack))],
    }),
    capabilities,
    registry,
    getSnapshot: () => ({ currentRoute: '/client-agent/', state }),
    navigate: () => {},
    dispatch: () => {},
    confirm: async () => true,
    streaming: { chunkChars: 12, paceMs: 16, leadInMs: 520 },
    onEvent: (event) => {
      if (event.type === 'step') {
        const line = describeTrace(event.step, titleOf);
        if (line) {
          const bubble = ensureBubble();
          const item = document.createElement('li');
          item.textContent = line;
          if (event.step.type === 'inference' && event.step.rule) item.title = event.step.rule;
          bubble.trace.appendChild(item);
          log.scrollTop = log.scrollHeight;
        }
      }
      if (event.type === 'delta') {
        const bubble = ensureBubble();
        bubble.text += String(event.text ?? '');
        bubble.body.textContent = bubble.text;
        log.scrollTop = log.scrollHeight;
      }
      if (event.type === 'step' || event.type === 'delta' || event.type === 'turn') {
        events.push(eventLine(event));
        if (eventsEl) eventsEl.textContent = events.slice(-40).join('\n');
      }
    },
  });

  /** Paints an A2UI surface with the site's own components, like the panel does. */
  function renderSurface(capabilityId, messages) {
    const holder = document.createElement('div');
    holder.className = 'agent__surface';
    log.appendChild(holder);
    renderA2UI(messages, holder, { onAction: () => {} });
    const note = document.createElement('p');
    note.className = 'agent__surface-note';
    note.title = capabilityId;
    note.textContent = `◇ A2UI · ${titleOf(capabilityId)}`;
    holder.appendChild(note);
    log.scrollTop = log.scrollHeight;
  }

  async function ask(text) {
    const question = String(text || '').trim();
    if (!question || busy) return;
    busy = true;
    send.disabled = true;
    input.disabled = true;

    empty?.remove();
    live = null;
    const mine = document.createElement('div');
    mine.className = 'bubble bubble--user';
    mine.textContent = question;
    log.appendChild(mine);
    log.scrollTop = log.scrollHeight;

    try {
      const result = await runtime.send(question);
      // Never render the wire format, whatever a host returned.
      for (const step of result.steps) {
        if (step.type === 'surface') renderSurface(step.capabilityId, step.messages);
      }
      const safe = /^\s*[[{]/.test(result.text)
        ? 'That came back as data rather than a sentence. Try a narrower question.'
        : result.text;
      if (safe) {
        const bubble = live ?? ensureBubble();
        bubble.text = safe;
        bubble.body.textContent = safe;
      }
    } catch (error) {
      ensureBubble().body.textContent = `That did not work: ${error.message}`;
    } finally {
      live = null;
      busy = false;
      send.disabled = false;
      input.disabled = false;
      input.value = '';
      input.focus();
      log.scrollTop = log.scrollHeight;
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void ask(input.value);
  });
  chips?.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button) void ask(button.textContent);
  });
}

void boot();
