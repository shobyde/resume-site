/* ============================================================
   Site assistant: a navigator and explainer for shobyde.com.

   Engine policy:
     1. On load, if the device looks capable, the compact model is
        fetched in the background and the launcher appears once it is
        warm. That is the "agentic bubble" this site wants to show.
     2. If WebGPU, memory, or the download rule says no, the keyword
        engine answers immediately and the launcher is available at
        once. Nothing is ever silently broken.
     3. The visitor can always switch back to keyword match.

   The agent never touches the DOM. Replies are prose or an A2UI
   surface (src/agent/surfaces.js), rendered against the site's own
   components.
   ============================================================ */
import manifest from 'client-agent:manifest';
import { AgentRuntime, createLexicalEngine, registry } from 'client-agent/core';
import { createDomContextReader } from 'client-agent/dom';
import { createWebLLMEngine, detectWebGPU } from 'client-agent/webllm';
import { siteCapabilities } from './capabilities.js';
import { renderA2UI } from './a2ui.js';
import { motionPrefs } from '../motionPrefs.js';
import '../styles/agent.css';

const SUGGESTIONS = {
  '#hero': ['What does Sho work on?', 'Show me the Hobnob card', 'How many years has he been building?'],
  '#about': ['What does Sho work on?', 'Where is he based?', 'Show me the projects'],
  '#projects': ['Tell me about Groundglass', 'Expand the Hobnob card', 'Read the newest article'],
  '#experience': ['What is his current role?', 'Show the skills', 'Open the printable resume'],
  '#skills': ['Show me the Readback card', 'What is his current role?', 'Show the contact card'],
  '#blog': ['Show the newest article card', 'Open the archive', 'Show me the projects'],
  '#contact': ['Show the contact card', 'Copy his email', 'Open LinkedIn'],
};

const CONTEXT_SECTIONS = [
  { selector: '#about', label: 'About' },
  { selector: '#projects', label: 'Projects' },
  { selector: '#experience', label: 'Experience' },
  { selector: '#skills', label: 'Skills' },
  { selector: '#blog', label: 'Writing' },
  { selector: '#contact', label: 'Contact' },
];

/** Background preload is a courtesy, not a right: skip metered links and small devices. */
function shouldPreloadModel() {
  const connection = navigator.connection || {};
  if (connection.saveData) return false;
  if (connection.effectiveType && /(^|-)2g$/.test(connection.effectiveType)) return false;
  const memory = navigator.deviceMemory || 8;
  return memory >= 4;
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

function newestFirst(posts) {
  return [...posts].sort((a, b) => String(b.date).localeCompare(String(a.date)));
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

  const readPageContext = createDomContextReader({ sections: CONTEXT_SECTIONS, maxChars: 2600 });

  const keywordEngine = createLexicalEngine({ capabilities: manifest.capabilities });
  let activeEngine = keywordEngine;
  const switchboard = { id: 'switchboard', complete: (request) => activeEngine.complete(request) };

  const runtime = new AgentRuntime({
    engine: switchboard,
    capabilities: manifest.capabilities,
    registry,
    getSnapshot: () => ({ currentRoute: activeSection(), state }),
    navigate: goTo,
    dispatch,
    readContext: readPageContext,
    topK: 8,
    maxToolCalls: 3,
  });

  const root = document.createElement('div');
  root.id = 'agentRoot';
  root.className = 'agent';
  root.innerHTML = `
    <button class="agent__launcher" id="agentLauncher" type="button" aria-expanded="false" aria-controls="agentPanel" hidden>
      <span class="agent__glyph" aria-hidden="true">&#9096;</span>
      <span>Ask about Sho</span>
    </button>
    <div class="agent__warming" id="agentWarming" aria-live="polite">
      <span class="agent__glyph" aria-hidden="true">&#9096;</span>
      <span id="agentWarmingText">Setting up your agent</span>
      <span class="agent__warming-bar" aria-hidden="true"><i id="agentWarmingBar"></i></span>
    </div>
    <div class="agent__scrim" id="agentScrim" hidden></div>
    <section class="agent__panel" id="agentPanel" aria-label="Ask about Sho" hidden>
      <header class="agent__head">
        <div>
          <p class="agent__eyebrow">Site assistant</p>
          <h2 class="agent__title">Ask about Sho</h2>
          <p class="agent__meta"><span class="agent__dot" aria-hidden="true"></span><span id="agentEngine">Starting your agent</span> <span class="agent__meta-sep">&middot;</span> <span class="agent__meta-count">${manifest.capabilities.length} capabilities</span></p>
        </div>
        <button class="agent__close" id="agentClose" type="button" aria-label="Close the assistant">&times;</button>
      </header>
      <div class="agent__engine" id="agentEngineRow">
        <button class="agent__toggle" id="agentModelBtn" type="button" hidden>
          <span class="agent__toggle-dot" aria-hidden="true"></span><span id="agentModelLabel">Use the on-device model</span>
        </button>
        <span class="agent__hint" id="agentEngineNote"></span>
        <div class="agent__progress" id="agentProgress" hidden><span></span></div>
      </div>
      <div class="agent__messages" id="agentMessages" role="log" aria-live="polite"></div>
      <div class="agent__chips" id="agentChips"></div>
      <form class="agent__composer" id="agentForm" autocomplete="off">
        <label class="sr-only" for="agentInput">Ask about Sho</label>
        <input class="agent__input" id="agentInput" type="text" placeholder="What does Sho work on?" />
        <button class="agent__send" type="submit">Send</button>
      </form>
      <p class="agent__foot">Answers use only this page. Nothing is sent to a server. Your agent installs once, then runs in this tab.</p>
    </section>
  `;
  document.body.appendChild(root);

  const panel = root.querySelector('#agentPanel');
  const scrim = root.querySelector('#agentScrim');
  const launcher = root.querySelector('#agentLauncher');
  const warming = root.querySelector('#agentWarming');
  const warmingText = root.querySelector('#agentWarmingText');
  const warmingBar = root.querySelector('#agentWarmingBar');
  const closeBtn = root.querySelector('#agentClose');
  const messagesEl = root.querySelector('#agentMessages');
  const chipsEl = root.querySelector('#agentChips');
  const form = root.querySelector('#agentForm');
  const input = root.querySelector('#agentInput');
  const sendBtn = root.querySelector('.agent__send');
  const engineLabel = root.querySelector('#agentEngine');
  const engineNote = root.querySelector('#agentEngineNote');
  const modelBtn = root.querySelector('#agentModelBtn');
  const modelLabel = root.querySelector('#agentModelLabel');
  const progressEl = root.querySelector('#agentProgress');
  const progressBar = progressEl.querySelector('span');

  let busy = false;
  let modelEngine = null;
  let modelState = 'probing'; // probing | loading | ready | keyword | error
  let gpuAvailable = true;
  let lastProgressAt = 0;

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

  const titleOf = (id) => manifest.capabilities.find((c) => c.id === id)?.title || id;
  const sentence = (title) => title.charAt(0).toLowerCase() + title.slice(1);

  function describeStep(step) {
    switch (step.type) {
      case 'navigate':
        return `\u2192 ${sentence(titleOf(step.capabilityId))}`;
      case 'action':
        return null;
      case 'query':
        return `\u25ce ${sentence(titleOf(step.capabilityId))}`;
      case 'surface':
        return `\u25a6 ${sentence(titleOf(step.capabilityId))}`;
      case 'error':
        return `could not finish: ${step.message}`;
      default:
        return null;
    }
  }

  async function runCapabilityFromSurface(name, context) {
    const live = registry.get(name);
    if (!live || typeof live.handler !== 'function') {
      addBubble('assistant', `I cannot run ${name} from here.`);
      return;
    }
    try {
      const result = await live.handler(context || {}, {
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

  const addBubble = (role, text, steps = []) => {
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
  };

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
    try {
      const result = await runtime.send(question);
      if (result.text) addBubble('assistant', result.text, result.steps);
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

  function showLauncher() {
    warming.hidden = true;
    launcher.hidden = false;
  }

  function setWarming(text, progress) {
    warming.hidden = false;
    launcher.hidden = true;
    warmingText.textContent = text;
    if (typeof progress === 'number') {
      const pct = Math.max(4, Math.round(progress * 100));
      warmingBar.style.width = `${pct}%`;
      warmingText.textContent = `${text} · ${pct}%`;
    }
  }

  function updateEngineUi() {
    const usingModel = activeEngine === modelEngine && modelState === 'ready';
    engineLabel.textContent = usingModel
      ? 'Your agent, on this device'
      : modelState === 'probing' || modelState === 'loading'
        ? 'Installing your agent'
        : 'Keyword matching';
    modelBtn.hidden = modelState === 'probing' || !gpuAvailable;
    root.querySelector('.agent__dot').classList.toggle('is-fallback', !usingModel);
    if (!usingModel && modelState !== 'loading') {
      modelLabel.textContent = modelState === 'error' ? 'Retry the install' : 'Install the on-device agent';
    }
    modelBtn.disabled = modelState === 'loading';
    modelLabel.textContent = usingModel ? 'Switch to keyword matching' : 'Install the on-device agent';
    modelBtn.classList.toggle('is-on', usingModel);
    progressEl.hidden = modelState !== 'loading';
  }

  function progressLabel(progress, text) {
    const pct = Math.round(progress * 100);
    const megabytes = /(\d{2,5})\s*MB/i.exec(text || '')?.[1];
    return megabytes
      ? `Installing your agent · ${pct}% · ${megabytes} MB`
      : `Installing your agent · ${pct}%`;
  }

  async function loadModel() {
    modelState = 'loading';
    updateEngineUi();
    progressBar.style.width = '0%';
    progressEl.hidden = false;
    lastProgressAt = Date.now();
    if (!modelEngine) {
      const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      modelEngine = createWebLLMEngine({
        worker,
        tier: 'compact',
        onProgress: ({ progress, text }) => {
          lastProgressAt = Date.now();
          const pct = Math.round(progress * 100);
          progressBar.style.width = `${pct}%`;
          if (!warming.hidden) warmingText.textContent = progressLabel(progress, text);
          engineLabel.textContent = `Installing ${pct}%`;
        },
      });
    }
    await modelEngine.load();
    modelState = 'ready';
    activeEngine = modelEngine;
    updateEngineUi();
  }

  /**
   * One shard that never arrives looks exactly like a slow download. Watch for
   * a minute of no movement, then let the caller retry: the shards already
   * fetched are in Cache Storage, so a retry resumes instead of restarting.
   */
  function loadWithWatchdog() {
    lastProgressAt = Date.now();
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setInterval(() => {
        if (settled) return;
        if (Date.now() - lastProgressAt > 30000) {
          settled = true;
          clearInterval(timer);
          reject(new Error('download stalled'));
        }
      }, 5000);
      loadModel().then(
        () => {
          if (settled) return;
          settled = true;
          clearInterval(timer);
          resolve();
        },
        (error) => {
          if (settled) return;
          settled = true;
          clearInterval(timer);
          reject(error);
        },
      );
    });
  }

  async function ensureModel() {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await loadWithWatchdog();
        return true;
      } catch (error) {
        console.warn('[assistant] model load attempt failed:', error.message);
        if (modelEngine) {
          try {
            modelEngine.dispose();
          } catch {
            /* terminating a dead worker is best effort */
          }
          modelEngine = null;
        }
        if (attempt === 1) {
          setWarming('Install paused, picking up where it left off', 0.05);
          engineNote.textContent = 'The install paused. Resuming from the part already saved on this device.';
        }
      }
    }
    return false;
  }

  async function bootEngine() {
    if (!shouldPreloadModel()) {
      gpuAvailable = false;
      modelState = 'keyword';
      engineNote.textContent = 'Answers use keyword matching. The on-device model can be turned on when you want it.';
      updateEngineUi();
      showLauncher();
      return;
    }

    setWarming('Looking for a GPU to run on', 0.04);
    const gpu = await detectWebGPU();
    if (gpu !== 'available') {
      gpuAvailable = false;
      modelState = 'keyword';
      engineNote.textContent =
        gpu === 'unsupported'
          ? 'This browser cannot run your agent on-device, so answers use keyword matching.'
          : 'This device has no usable GPU, so answers use keyword matching.';
      updateEngineUi();
      showLauncher();
      return;
    }

    setWarming('Setting up your agent', 0.06);
    engineNote.textContent = 'Your agent is installing in the background. It only happens once.';
    try {
      // Let the page finish painting first; the install is not urgent.
      await new Promise((resolve) => {
        const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 2000));
        idle(resolve, { timeout: 4000 });
      });
      const ready = await ensureModel();
      if (ready) {
        engineNote.textContent = 'Your agent is ready. It reads this page and can do everything listed below.';
      } else {
        modelState = 'error';
        engineNote.textContent = 'The install did not finish. Keyword matching is answering until you retry.';
      }
      showLauncher();
    } catch (error) {
      modelState = 'error';
      engineNote.textContent = 'The install did not finish. Keyword matching is answering until you retry.';
      console.warn('[assistant] agent install failed:', error);
      updateEngineUi();
      showLauncher();
    }
  }

  async function toggleEngine() {
    if (activeEngine === modelEngine) {
      activeEngine = keywordEngine;
      engineNote.textContent = 'Keyword matching is answering, with no setup at all. Your agent stays installed.';
      updateEngineUi();
      return;
    }
    engineNote.textContent = 'Setting up your agent on this device…';
    const ready = await ensureModel();
    engineNote.textContent = ready
      ? 'Your agent is ready. It reads this page and can do everything listed below.'
      : 'The install did not finish. Keyword matching is answering until you retry.';
    if (!ready) modelState = 'error';
    updateEngineUi();
  }

  input.addEventListener('input', syncSend);
  launcher.addEventListener('click', () => setOpen(true));
  warming.addEventListener('click', () => setOpen(true));
  closeBtn.addEventListener('click', () => setOpen(false));
  scrim.addEventListener('click', () => setOpen(false));
  scrim.addEventListener('wheel', (event) => event.preventDefault(), { passive: false });
  scrim.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
  modelBtn.addEventListener('click', () => {
    void toggleEngine();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void ask(input.value);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) setOpen(false);
  });

  renderChips();
  syncSend();
  updateEngineUi();
  void bootEngine();
  return runtime;
}
