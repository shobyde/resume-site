/* ============================================================
   Site assistant: a small navigator for shobyde.com.

   It knows the sections and operations of this page because the
   build crawler read src/agent/capabilities.js and emitted
   agent-manifest.json. The model never sees the DOM, and it can only
   call ids that appear in that manifest.

   The engine here is the keyword engine: it matches the visitor's
   words against the declared capabilities and needs no download.
   That is deliberate for a resume site. The WebLLM adapter ships in
   the package when a page wants a real model in the tab.
   ============================================================ */
import manifest from 'client-agent:manifest';
import { AgentRuntime, createLexicalEngine, registry } from 'client-agent/core';
import { siteCapabilities } from './capabilities.js';
import { motionPrefs } from '../motionPrefs.js';
import '../styles/agent.css';

const SUGGESTIONS = {
  '#hero': ['What does Sho work on?', 'Show me the projects', 'How many years has he been building?'],
  '#about': ['What does Sho work on?', 'Where is he based?', 'Show me the projects'],
  '#projects': ['List the projects', 'Expand the Hobnob card', 'Read the newest article'],
  '#experience': ['What is his current role?', 'Show the skills', 'Open the printable resume'],
  '#skills': ['List the projects', 'What is his current role?', 'Copy his email'],
  '#blog': ['Read the newest article', 'Open the archive', 'Show me the projects'],
  '#contact': ['Copy his email', 'Open LinkedIn', 'Open the printable resume'],
};

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

function newestFirst(posts) {
  return [...posts].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function initAssistant({ posts = [] } = {}) {
  if (document.getElementById('agentRoot')) return null;

  const sorted = newestFirst(posts);
  const newestPost = sorted[0] || null;

  // Handlers live in the registry; the manifest supplies what the model may
  // choose from. Registering eagerly is fine: every handler here only touches
  // the page that already exists.
  for (const capability of siteCapabilities) registry.register(capability);

  const runtime = new AgentRuntime({
    engine: createLexicalEngine({ capabilities: manifest.capabilities }),
    capabilities: manifest.capabilities,
    registry,
    getSnapshot: () => ({
      currentRoute: activeSection(),
      state: { postCount: posts.length, newestPost },
    }),
    navigate: goTo,
    dispatch: (event, payload) => {
      switch (event) {
        case 'resume:print':
          window.print();
          break;
        case 'contact:linkedin':
          window.open('https://www.linkedin.com/in/sho-byde-556954138/', '_blank', 'noopener');
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
    },
    topK: 6,
    maxToolCalls: 2,
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
          <p class="agent__meta"><span class="agent__dot" aria-hidden="true"></span>Runs in this browser &middot; ${manifest.capabilities.length} things it can do</p>
        </div>
        <button class="agent__close" id="agentClose" type="button" aria-label="Close the assistant">&times;</button>
      </header>
      <div class="agent__messages" id="agentMessages" role="log" aria-live="polite"></div>
      <div class="agent__chips" id="agentChips"></div>
      <form class="agent__composer" id="agentForm" autocomplete="off">
        <label class="sr-only" for="agentInput">Ask about Sho</label>
        <input class="agent__input" id="agentInput" type="text" placeholder="Where is his experience?" />
        <button class="agent__send" type="submit">Send</button>
      </form>
      <p class="agent__foot">Answers come from the declared sections of this page. Nothing is sent to a server and no model is downloaded.</p>
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

  let busy = false;

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

  const addBubble = (role, text, steps = []) => {
    const bubble = document.createElement('div');
    bubble.className = `agent__bubble agent__bubble--${role}`;
    const body = document.createElement('p');
    body.textContent = text;
    bubble.appendChild(body);
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
  };

  const sendBtn = root.querySelector('.agent__send');

  const syncSend = () => {
    sendBtn.disabled = busy || input.value.trim().length === 0;
  };

  const setBusy = (value) => {
    busy = value;
    form.classList.toggle('is-busy', value);
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
    try {
      const result = await runtime.send(question);
      addBubble('assistant', result.text, result.steps);
      // A navigation or an action changed the page; get out of the way so the
      // visitor can see it, unless they are already typing the next question.
      const changedSomething = result.steps.some((step) => step.type === 'navigate' || step.type === 'action');
      if (changedSomething) {
        setTimeout(() => {
          if (!input.value) setOpen(false);
        }, 900);
      }
    } catch (error) {
      addBubble('assistant', `That did not work: ${error.message}`);
    } finally {
      setBusy(false);
      input.value = '';
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

  input.addEventListener('input', syncSend);
  launcher.addEventListener('click', () => setOpen(true));
  scrim.addEventListener('click', () => setOpen(false));
  // The backdrop is inert: wheel and touch over it must not scroll the page
  // behind the panel.
  scrim.addEventListener('wheel', (event) => event.preventDefault(), { passive: false });
  scrim.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
  closeBtn.addEventListener('click', () => setOpen(false));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    ask(input.value);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) setOpen(false);
  });

  renderChips();
  syncSend();
  return runtime;
}

const capabilityTitles = new Map(manifest.capabilities.map((c) => [c.id, c.title]));

function titleFor(step) {
  const title = capabilityTitles.get(step.capabilityId) || step.capabilityId;
  return title.charAt(0).toLowerCase() + title.slice(1);
}

function describeStep(step) {
  switch (step.type) {
    case 'navigate':
      return `\u2192 ${titleFor(step)}`;
    case 'action':
      // The reply already names the action ("Done: Copy the email address."),
      // so a second identical line is noise.
      return null;
    case 'query':
      return `\u25ce ${titleFor(step)}`;
    case 'error':
      return `could not finish: ${step.message}`;
    default:
      return null;
  }
}
