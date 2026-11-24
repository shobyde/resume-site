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
import manifest from 'boaz:manifest';
import { AgentRuntime, registry } from 'boaz/core';
import { createRulesEngine } from 'boaz/rules';
import { createDomContextReader } from 'boaz/dom';
import { createAssistantKnowledge } from './knowledge.js';
import { describeTrace } from './trace.js';
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
  '#contact': ['What is his email?', 'Show the contact card', 'What is his LinkedIn?'],
};

const CONTACT_PAGE_SECTIONS = [
  { selector: '#about', label: 'About' },
  { selector: '#projects', label: 'Projects' },
  { selector: '#experience', label: 'Experience' },
  { selector: '#skills', label: 'Skills' },
  { selector: '#contact', label: 'Contact' },
];

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

  const { knowledge, answers } = createAssistantKnowledge({ posts: sorted });
  const readSection = createDomContextReader({ sections: CONTACT_PAGE_SECTIONS, maxChars: 2600 });
  // Field questions need the whole page, including link targets: the contact
  // section says "Email me" and the address itself lives in the mailto href.
  const readPage = (query) => {
    const links = [...document.querySelectorAll('a[href]')]
      .map((anchor) => anchor.getAttribute('href'))
      .filter((href) => /^(mailto:|https?:|tel:)/i.test(href));
    return [readSection(query), ...links].join('\n');
  };
  const engine = createRulesEngine({
    knowledge,
    answers,
    capabilities: manifest.capabilities,
    grounding: { read: (query) => readPage(query) },
    // Values that arrive with a tool result. Declaring them lets a question
    // about a technology be recognised before the project list is read.
    constants: [...new Set(DATA.projects.flatMap((project) => project.stack))],
  });
  const runtime = new AgentRuntime({
    engine,
    capabilities: manifest.capabilities,
    registry,
    getSnapshot: () => ({ currentRoute: activeSection(), state }),
    navigate: goTo,
    dispatch,
    topK: 8,
    maxToolCalls: 3,
    streaming: motionPrefs.reduced ? false : { chunkChars: 14, paceMs: 16, leadInMs: 650 },
    onEvent: (event) => {
      if (event.type === 'step') appendTrace(event.step);
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
      <p class="agent__foot">Answers come from the facts on this page. Nothing is downloaded and nothing is sent to a server. <a href="/boaz/">How this works</a></p>
      <details class="agent__diag" id="agentDiag">
        <summary>Diagnostics</summary>
        <p class="agent__diag-line" id="agentDiagOut">Press to check this page.</p>
        <button class="agent__diag-copy" id="agentDiagCopy" type="button">Copy the report</button>
      </details>
    </section>
  `;
  document.body.appendChild(root);

  if (new URLSearchParams(location.search).has('agentDebug')) {
    // ?agentDebug=1 exposes the engine so a stuck answer can be inspected
    // without a rebuild: __boaz.engine.memory says what it last did.
    window.__boaz = { engine, runtime };
  }

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

  const describeStep = (step) => describeTrace(step, titleOf);

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

  /**
   * One bubble per answer: the steps it took on top, the words underneath. The
   * bubble opens on the first step so the trace is on screen before the answer
   * starts, and each step line fades in on its own beat.
   */
  function ensureLive() {
    if (live) return live;
    const bubble = document.createElement('div');
    bubble.className = 'agent__bubble agent__bubble--assistant';
    const trace = document.createElement('ul');
    trace.className = 'agent__trace';
    const body = document.createElement('p');
    bubble.append(trace, body);
    messagesEl.appendChild(bubble);
    live = { bubble, body, trace, text: '', lines: 0 };
    return live;
  }

  function appendTrace(step) {
    const line = describeStep(step);
    if (!line) return;
    const bubble = ensureLive();
    const item = document.createElement('li');
    item.textContent = line;
    // The plain sentence is the label; the rule stays available on hover for
    // anyone who wants to see the machinery.
    if (step.type === 'inference' && (step.rule || step.goal)) item.title = step.rule || step.goal;
    item.style.animationDelay = `${Math.min(bubble.lines, 5) * 110}ms`;
    bubble.trace.appendChild(item);
    bubble.lines += 1;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendDelta(text) {
    if (!text) return;
    const bubble = ensureLive();
    bubble.text += text;
    bubble.body.textContent = bubble.text;
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
      const streamed = live;
      // A host bug must not put JSON on screen: the visitor asked a question.
      const safeReply = /^\s*[[{]/.test(result.text)
        ? 'That came back as data rather than a sentence. Try asking something narrower.'
        : result.text;
      if (safeReply) {
        if (streamed) {
          // The stream is pacing, not inference: trust the finished text.
          streamed.text = safeReply;
          streamed.body.textContent = safeReply;
        } else {
          addBubble('assistant', safeReply);
        }
      }
      // An engine that emits no step events still has steps worth showing.
      if (streamed && streamed.lines === 0) {
        for (const step of result.steps) appendTrace(step);
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
