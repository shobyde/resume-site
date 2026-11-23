/* ============================================================
   Site assistant: a navigator, explainer and answerer for shobyde.com.

   Engine policy:
     1. Every answer comes from data on this page: the capability
        manifest, the facts declared below, and the rules over them.
     2. No model is downloaded, no GPU is required, nothing is sent
        to a server, and no answer is invented.
     3. Replies stream as deltas, and a rule answer carries the fact
        set it came from, so the trace under a reply is real.

   The agent never touches the DOM. Replies are prose or an A2UI
   surface (src/agent/surfaces.js), rendered against the site's own
   components.
   ============================================================ */
import manifest from 'client-agent:manifest';
import { AgentRuntime, registry } from 'client-agent/core';
import { KnowledgeBase, createRulesEngine, fact } from 'client-agent/rules';
import { siteCapabilities } from './capabilities.js';
import { renderA2UI } from './a2ui.js';
import { DATA } from '../data.js';
import { motionPrefs } from '../motionPrefs.js';
import '../styles/agent.css';

const SUGGESTIONS = {
  '#hero': ['What does Sho work on?', 'Show me the Hobnob card', 'Which projects use TypeScript?'],
  '#about': ['What does Sho work on?', 'Where is he based?', 'Show me the projects'],
  '#projects': ['Which projects use Python?', 'Expand the Hobnob card', 'Read the newest article'],
  '#experience': ['What is his current role?', 'Show the skills', 'Open the printable resume'],
  '#skills': ['Show me the Readback card', 'Which projects use Flask?', 'Show the contact card'],
  '#blog': ['Show the newest article card', 'Open the archive', 'Show me the projects'],
  '#contact': ['Show the contact card', 'Copy his email', 'Open LinkedIn'],
};

const slugOf = (title) =>
  String(title)
    .split(':')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Projects and their stacks, straight from the page's own data file. */
function buildKnowledge(posts) {
  const facts = [];
  for (const project of DATA.projects) {
    const slug = slugOf(project.title);
    facts.push(fact('project', slug, project.title.split(':')[0].trim()));
    for (const tech of project.stack || []) facts.push(fact('uses', slug, tech));
  }
  for (const post of posts) facts.push(fact('post', post.slug, post.title, post.date));

  return new KnowledgeBase({
    facts,
    // `asked(?T)` is supplied by the engine for every declared term the visitor
    // names, so a rule can talk about the question without reading raw text.
    rules: ['projects_using(?P) :- uses(?P, ?T), asked(?T).'],
  });
}

function answersFor(knowledge) {
  return [
    {
      id: 'projects.using',
      title: 'Which projects use a technology',
      keywords: ['which projects use', 'built with', 'uses', 'written in', 'stack'],
      goal: 'projects_using(?P)',
      compose: ({ solutions, terms, knowledge: kb }) => {
        if (solutions.length === 0) {
          // The term is declared (it is a project stack entry) but no project
          // claims it: say so instead of answering something unrelated.
          return terms.length ? `No project lists ${terms.join(' or ')} in its stack.` : '';
        }
        const titles = solutions
          .map(
            (solution) =>
              kb
                .query('project(?P, ?T)', { assume: [['asked', solution.bindings['?P'] ?? '']] })
                .find((hit) => hit.bindings['?P'] === solution.bindings['?P'])?.bindings['?T'] ??
              solution.bindings['?P'],
          )
          .filter(Boolean);
        if (titles.length === 0) return '';
        const list = titles.length === 1 ? titles[0] : `${titles.slice(0, -1).join(', ')} and ${titles.at(-1)}`;
        return `${list} ${titles.length === 1 ? 'uses' : 'use'} it.`;
      },
    },
    {
      id: 'posts.latest',
      title: 'The newest article',
      keywords: ['newest post', 'latest article', 'last thing he wrote'],
      goal: 'post(?S, ?T, ?D)',
      threshold: 3,
      compose: ({ solutions }) => {
        const newest = [...solutions].sort((a, b) => String(b.bindings['?D']).localeCompare(String(a.bindings['?D'])))[0];
        return newest ? `The newest post is "${newest.bindings['?T']}".` : '';
      },
    },
  ];
}

function activeSection() {
  const active = document.querySelector('.nav__link.is-active');
  if (active) return active.getAttribute('href') || '#hero';
  if (location.hash && document.querySelector(location.hash)) return location.hash;
  return '#hero';
}

function goTo(route) {
  if (!route) return;
  if (!route.startsWith('#')) {
    location.assign(route);
    return;
  }
  const target = document.querySelector(route);
  if (!target) return;
  if (location.hash !== route) history.replaceState(null, '', route);
  target.scrollIntoView({ behavior: motionPrefs.reduced ? 'auto' : 'smooth', block: 'start' });
}

function newestFirst(items) {
  return [...items].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function initAssistant({ posts = [] } = {}) {
  if (document.getElementById('agentRoot')) return null;

  const sorted = newestFirst(posts);
  const newestPost = sorted[0] || null;
  const state = { postCount: posts.length, newestPost };

  const dispatch = (event, payload) => {
    switch (event) {
      case 'resume:print':
        window.print();
        break;
      case 'contact:linkedin':
        window.open('https://www.linkedin.com/in/sho-byde-556954138/', '_blank', 'noopener');
        break;
      case 'site:open_url':
        if (payload?.url) window.open(payload.url, '_blank', 'noopener');
        break;
      case 'blog:open':
        if (payload?.slug) location.assign(`/posts/${payload.slug}/`);
        break;
      case 'blog:archive':
        location.assign('/archive/');
        break;
      default:
        break;
    }
  };

  for (const capability of siteCapabilities) registry.register(capability);

  const knowledge = buildKnowledge(sorted);
  const runtime = new AgentRuntime({
    engine: createRulesEngine({
      knowledge,
      answers: answersFor(knowledge),
      capabilities: manifest.capabilities,
    }),
    capabilities: manifest.capabilities,
    registry,
    getSnapshot: () => ({ currentRoute: activeSection(), state }),
    navigate: goTo,
    dispatch,
    topK: 8,
    maxToolCalls: 3,
    streaming: motionPrefs.reduced ? false : { chunkChars: 14, paceMs: 16 },
    onEvent: (event) => {
      if (event.type === 'delta') appendDelta(String(event.text ?? ''));
    },
    confirm: async (req) =>
      new Promise((resolve) => {
        const bubble = document.createElement('div');
        bubble.className = 'agent__bubble agent__bubble--assistant';
        const body = document.createElement('p');
        body.textContent = `${req.title}: ${String(req.description).replace(/\.$/, '')}. Proceed?`;
        bubble.appendChild(body);
        const buttons = document.createElement('div');
        buttons.className = 'agent__confirm-btns';
        const yes = document.createElement('button');
        yes.type = 'button';
        yes.className = 'agent__chip';
        yes.textContent = 'Yes';
        const no = document.createElement('button');
        no.type = 'button';
        no.className = 'agent__chip';
        no.textContent = 'No';
        buttons.append(yes, no);
        bubble.appendChild(buttons);
        messagesEl.appendChild(bubble);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        const finish = (value) => {
          yes.disabled = true;
          no.disabled = true;
          bubble.classList.add('is-done');
          resolve(value);
        };
        yes.addEventListener('click', () => finish(true));
        no.addEventListener('click', () => finish(false));
      }),
  });

  const root = document.createElement('div');
  root.id = 'agentRoot';
  root.className = 'agent';
  root.innerHTML = `
    <button class="agent__launcher" id="agentLauncher" type="button" aria-expanded="false" aria-controls="agentPanel">
      <span class="agent__glyph" aria-hidden="true">&#9096;</span>
      <span>Ask about Sho</span>
    </button>
    <div class="agent__scrim" id="agentScrim" hidden></div>
    <section class="agent__panel" id="agentPanel" aria-label="Ask about Sho" hidden>
      <header class="agent__head">
        <div>
          <p class="agent__eyebrow">Site assistant</p>
          <h2 class="agent__title">Ask about Sho</h2>
          <p class="agent__meta"><span class="agent__dot" aria-hidden="true"></span><span id="agentEngine">Rules over this page</span> <span class="agent__meta-sep">&middot;</span> <span class="agent__meta-count">${manifest.capabilities.length} capabilities</span></p>
        </div>
        <button class="agent__close" id="agentClose" type="button" aria-label="Close the assistant">&times;</button>
      </header>
      <div class="agent__messages" id="agentMessages" role="log" aria-live="polite"></div>
      <div class="agent__chips" id="agentChips"></div>
      <form class="agent__composer" id="agentForm" autocomplete="off">
        <label class="sr-only" for="agentInput">Ask about Sho</label>
        <input class="agent__input" id="agentInput" type="text" placeholder="Which projects use Python?" />
        <button class="agent__send" type="submit">Send</button>
      </form>
      <p class="agent__foot">Answers come from the facts on this page. Nothing is downloaded and nothing is sent to a server.</p>
      <details class="agent__diag" id="agentDiag">
        <summary>Diagnostics</summary>
        <p class="agent__diag-line" id="agentDiagOut">Press to check this page.</p>
        <button class="agent__diag-copy" id="agentDiagCopy" type="button">Copy the report</button>
      </details>
    </section>
  `;
  document.body.appendChild(root);

  const panel = root.querySelector('#agentPanel');
  const scrim = root.querySelector('#agentScrim');
  const launcher = root.querySelector('#agentLauncher');
  const closeBtn = root.querySelector('#agentClose');
  const messagesEl = root.querySelector('#agentMessages');
  const chipsEl = root.querySelector('#agentChips');
  const form = root.querySelector('#agentForm');
  const input = root.querySelector('#agentInput');
  const sendBtn = root.querySelector('.agent__send');
  const diag = root.querySelector('#agentDiag');
  const diagOut = root.querySelector('#agentDiagOut');
  const diagCopy = root.querySelector('#agentDiagCopy');

  let busy = false;
  let live = null; // streaming bubble: { body, text }

  const syncSend = () => {
    sendBtn.disabled = busy || input.value.trim().length === 0;
    sendBtn.classList.toggle('is-busy', busy);
  };

  const setOpen = (open) => {
    panel.hidden = !open;
    scrim.hidden = !open;
    launcher.setAttribute('aria-expanded', String(open));
    launcher.classList.toggle('is-hidden', open);
    if (open) {
      renderChips();
      input.focus();
    }
  };

  const titleOf = (id) => manifest.capabilities.find((capability) => capability.id === id)?.title || id;
  const sentence = (title) => title.charAt(0).toLowerCase() + title.slice(1);

  function describeStep(step) {
    switch (step.type) {
      case 'navigate':
        return `\u2192 ${sentence(titleOf(step.capabilityId))}`;
      case 'query':
        return `\u25ce ${sentence(titleOf(step.capabilityId))}`;
      case 'inference':
        return `\u2234 ${step.rule || step.goal}${step.terms?.length ? ` \u00b7 ${step.terms.join(', ')}` : ''}`;
      case 'surface':
        return `\u25a6 ${sentence(titleOf(step.capabilityId))}`;
      case 'error':
        return `could not finish: ${step.message}`;
      default:
        return null;
    }
  }

  async function runCapabilityFromSurface(name, context) {
    const liveCapability = registry.get(name);
    if (!liveCapability || typeof liveCapability.handler !== 'function') {
      addBubble('assistant', `I cannot run ${name} from here.`);
      return;
    }
    try {
      const result = await liveCapability.handler(context || {}, {
        currentRoute: activeSection(),
        navigate: goTo,
        dispatch,
        read: (key) => state[key],
      });
      const surface = result && Array.isArray(result.surface) ? result.surface : null;
      if (surface) {
        addSurface(name, surface);
        return;
      }
      const summary = result && (result.opened || result.expanded || result.copied || result.appliedFilter);
      addBubble('assistant', summary ? `${titleOf(name)}: ${summary}` : `${titleOf(name)}: done.`);
    } catch (error) {
      addBubble('assistant', `${titleOf(name)} failed: ${error.message}`);
    }
  }

  const addSurface = (capabilityId, messages) => {
    const holder = document.createElement('div');
    holder.className = 'agent__surface';
    messagesEl.appendChild(holder);
    renderA2UI(messages, holder, {
      onAction: (name, context) => {
        void runCapabilityFromSurface(name, context);
      },
    });
    const label = document.createElement('p');
    label.className = 'agent__surface-note';
    label.title = capabilityId;
    label.textContent = `\u25c8 A2UI \u00b7 ${titleOf(capabilityId)}`;
    holder.appendChild(label);
    // A card can be taller than the panel; land on its top edge so the title is
    // never scrolled out of view. scrollIntoView handles the nested scroll
    // container correctly, while offsetTop is relative to a different parent.
    holder.scrollIntoView({ block: 'nearest' });
  };

  function addBubble(role, text, steps = []) {
    const bubble = document.createElement('div');
    bubble.className = `agent__bubble agent__bubble--${role}`;
    if (text) {
      const body = document.createElement('p');
      body.textContent = text;
      bubble.appendChild(body);
    }
    const lines = steps.map(describeStep).filter(Boolean);
    if (lines.length) {
      const trace = document.createElement('ul');
      trace.className = 'agent__trace';
      for (const line of lines) {
        const item = document.createElement('li');
        item.textContent = line;
        trace.appendChild(item);
      }
      bubble.appendChild(trace);
    }
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return bubble;
  }

  /** Opens the bubble on the first delta and appends each chunk to it. */
  function appendDelta(text) {
    if (!text) return;
    if (!live) {
      const bubble = document.createElement('div');
      bubble.className = 'agent__bubble agent__bubble--assistant';
      const body = document.createElement('p');
      bubble.appendChild(body);
      messagesEl.appendChild(bubble);
      live = { bubble, body, text: '' };
    }
    live.text += text;
    live.body.textContent = live.text;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  const setBusy = (value) => {
    busy = value;
    input.disabled = value;
    syncSend();
  };

  async function ask(text) {
    const question = String(text || '').trim();
    if (!question || busy) return;
    setOpen(true);
    chipsEl.innerHTML = '';
    addBubble('user', question);
    setBusy(true);
    live = null;
    try {
      const result = await runtime.send(question);
      let bubble = live ? live.bubble : null;
      if (result.text) {
        if (live) {
          // The stream is pacing, not inference: trust the finished text.
          live.text = result.text;
          live.body.textContent = result.text;
        } else {
          bubble = addBubble('assistant', result.text);
        }
      }
      // Trace and surfaces go under the reply, never above it.
      const lines = result.steps.map(describeStep).filter(Boolean);
      if (bubble && lines.length) {
        const trace = document.createElement('ul');
        trace.className = 'agent__trace';
        for (const line of lines) {
          const item = document.createElement('li');
          item.textContent = line;
          trace.appendChild(item);
        }
        bubble.appendChild(trace);
      }
      for (const step of result.steps) {
        if (step.type === 'surface') addSurface(step.capabilityId, step.messages);
      }
      const renderedSurface = result.steps.some((step) => step.type === 'surface');
      const changedPage = result.steps.some((step) => step.type === 'navigate' || step.type === 'action');
      if (changedPage && !renderedSurface) {
        setTimeout(() => {
          if (!input.value) setOpen(false);
        }, 900);
      }
    } catch (error) {
      addBubble('assistant', `That did not work: ${error.message}`);
    } finally {
      live = null;
      setBusy(false);
      input.value = '';
      syncSend();
      input.focus();
    }
  }

  function renderChips() {
    const route = activeSection();
    const list = SUGGESTIONS[route] || SUGGESTIONS['#hero'];
    chipsEl.innerHTML = '';
    for (const suggestion of list) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'agent__chip';
      chip.textContent = suggestion;
      chip.addEventListener('click', () => ask(suggestion));
      chipsEl.appendChild(chip);
    }
  }

  /**
   * One line that says what answered and what it had to work with. No model
   * probes: there is no model.
   */
  function collectDiagnostics() {
    const started = performance.now();
    const rules = knowledge.rules.length;
    const facts = knowledge.query('project(?P, ?T)').length;
    const parts = [
      `engine=rules+keyword`,
      `capabilities=${manifest.capabilities.length}`,
      `rules=${rules}`,
      `projects=${facts}`,
      `posts=${posts.length}`,
      `reduced-motion=${motionPrefs.reduced}`,
      `query-ms=${(performance.now() - started).toFixed(2)}`,
    ];
    const connection = navigator.connection;
    if (connection) parts.push(`net=${connection.effectiveType || '?'}`);
    return parts.join(' ');
  }

  diag.addEventListener('toggle', () => {
    if (!diag.open) return;
    diagOut.textContent = collectDiagnostics();
  });

  diagCopy.addEventListener('click', async () => {
    const text = diagOut.textContent || '';
    try {
      await navigator.clipboard.writeText(text);
      diagCopy.textContent = 'Copied';
    } catch {
      diagCopy.textContent = 'Select the line above to copy';
    }
    setTimeout(() => {
      diagCopy.textContent = 'Copy the report';
    }, 2500);
  });

  input.addEventListener('input', syncSend);
  launcher.addEventListener('click', () => setOpen(true));
  closeBtn.addEventListener('click', () => setOpen(false));
  scrim.addEventListener('click', () => setOpen(false));
  scrim.addEventListener('wheel', (event) => event.preventDefault(), { passive: false });
  scrim.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || busy) return;
    input.value = '';
    syncSend();
    void ask(text);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) setOpen(false);
  });

  if (newestPost) state.newestPost = newestPost;
  renderChips();
  syncSend();
  return runtime;
}
