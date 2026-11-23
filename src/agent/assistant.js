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
import { TINY_MODEL, createWebLLMEngine, detectWebGPU } from 'client-agent/webllm';
import { createChromeAIEngine, detectChromeAI } from 'client-agent/chrome-ai';
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
      <details class="agent__diag" id="agentDiag">
        <summary>Diagnostics</summary>
        <p class="agent__diag-line" id="agentDiagOut">Press to check this browser.</p>
        <button class="agent__diag-copy" id="agentDiagCopy" type="button">Copy the report</button>
      </details>
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
  const diag = root.querySelector('#agentDiag');
  const diagOut = root.querySelector('#agentDiagOut');
  const diagCopy = root.querySelector('#agentDiagCopy');
  const modelBtn = root.querySelector('#agentModelBtn');
  const modelLabel = root.querySelector('#agentModelLabel');
  const progressEl = root.querySelector('#agentProgress');
  const progressBar = progressEl.querySelector('span');

  let busy = false;
  let modelEngine = null;
  let modelState = 'probing'; // probing | loading | ready | keyword | error
  let gpuAvailable = true;
  let lastProgressAt = 0;
  let chromeEngine = null;
  let chromeAI = 'unsupported';
  const chromePending = () => chromeAI === 'downloadable' || chromeAI === 'downloading';
  let installToken = 0;

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
    const usingChrome = activeEngine === chromeEngine && chromeEngine !== null;
    engineLabel.textContent = usingChrome
      ? "Your browser's own model"
      : usingModel
        ? 'Your agent, on this device'
        : modelState === 'probing' || modelState === 'loading'
          ? 'Installing your agent'
          : 'Keyword matching';
    const chromeCouldHelp = chromeAI === 'available' || chromePending();
    modelBtn.hidden = modelState === 'probing' || (!gpuAvailable && !chromeCouldHelp);
    root.querySelector('.agent__dot').classList.toggle('is-fallback', !usingModel);
    // A long browser install must stay cancellable, so the control stays live
    // while Chrome is preparing and reads as a cancel.
    modelBtn.disabled = false;
    if (modelState === 'loading' && chromePending()) {
      modelLabel.textContent = 'Cancel the install';
    } else if (usingModel || usingChrome) {
      modelLabel.textContent = 'Switch to keyword matching';
    } else if (modelState !== 'loading') {
      modelLabel.textContent =
        modelState === 'error'
          ? 'Retry the install'
          : chromeAI === 'downloading'
            ? "Check the browser's model"
            : chromeAI === 'downloadable'
              ? "Install the browser's model"
              : 'Install the on-device agent';
    }
    modelBtn.classList.toggle('is-on', usingModel || usingChrome);
    progressEl.hidden = modelState !== 'loading';
  }

  // Add ?agent=debug to the URL to see every install event in the console.
  const debug = new URLSearchParams(location.search).get('agent') === 'debug';
  const log = (...args) => {
    if (debug) console.info('[agent]', ...args);
  };

  /** Compact agent first; if it will not install, try the smallest one. */
  const INSTALL_PLANS = [
    { model: undefined, copy: 'Installing your agent' },
    { model: TINY_MODEL, copy: 'Installing the lighter agent' },
  ];
  let installError = '';

  function progressLabel(progress, text, copy) {
    const pct = Math.round(progress * 100);
    const megabytes = /(\d{2,5})\s*MB/i.exec(text || '')?.[1];
    const label = copy || 'Installing your agent';
    return megabytes ? `${label} · ${pct}% · ${megabytes} MB` : `${label} · ${pct}%`;
  }

  function createModelEngine(plan) {
    const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    return createWebLLMEngine({
      worker,
      ...(plan.model ? { model: plan.model } : { tier: 'compact' }),
      onProgress: ({ progress, text }) => {
        lastProgressAt = Date.now();
        const pct = Math.round(progress * 100);
        progressBar.style.width = `${pct}%`;
        if (!warming.hidden) warmingText.textContent = progressLabel(progress, text, plan.copy);
        engineLabel.textContent = `Installing ${pct}%`;
        log('progress', pct, text);
      },
      onStateChange: (state, detail) => {
        log('state', state, detail?.message || '');
        if (state === 'error' && detail?.message) installError = detail.message;
      },
    });
  }

  async function loadPlan(plan) {
    modelState = 'loading';
    updateEngineUi();
    progressBar.style.width = '0%';
    progressEl.hidden = false;
    lastProgressAt = Date.now();
    if (modelEngine) {
      try {
        modelEngine.dispose();
      } catch {
        /* terminating a dead worker is best effort */
      }
      modelEngine = null;
    }
    modelEngine = createModelEngine(plan);
    log('install start', plan.model || 'compact tier');
    await modelEngine.load();
    modelState = 'ready';
    activeEngine = modelEngine;
    updateEngineUi();
    log('install ready');
  }

  /**
   * One shard that never arrives looks exactly like a slow download. Watch for
   * a minute of no movement, then let the caller retry: the shards already
   * fetched are in Cache Storage, so a retry resumes instead of restarting.
   */
  function watchdog(run, graceMs = 12000) {
    lastProgressAt = Date.now();
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setInterval(() => {
        if (settled) return;
        if (Date.now() - lastProgressAt > graceMs) {
          settled = true;
          clearInterval(timer);
          reject(new Error('install stalled'));
        }
      }, 4000);
      run().then(
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

  function loadWithWatchdog(plan) {
    return watchdog(() => loadPlan(plan));
  }

  /**
   * Chrome ships its own model. Using it means no request to huggingface.co at
   * all, which is the difference between an install that finishes and one that
   * never starts on a network where the model host is unreachable.
   */
  async function installChromeAgent() {
    if (chromeAI !== 'available' && !chromePending()) return false;
    const activated = navigator.userActivation ? navigator.userActivation.isActive : true;
    if (chromeAI !== 'available' && !activated) {
      installError = 'Chrome needs the button pressed to start its own model download. Press install again.';
      log('built-in model needs a press');
      return false;
    }
    try {
      setWarming(
        chromeAI === 'available'
          ? "Waking your browser's model"
          : chromeAI === 'downloading'
            ? "Checking your browser's model"
            : "Getting your browser's model ready",
        0.15,
      );
      engineNote.textContent =
        chromeAI === 'available'
          ? "This browser already has a model installed, so there is nothing to fetch."
          : "This browser can fetch its own model once and share it across sites.";
      const engine = createChromeAIEngine({
        onProgress: ({ progress }) => {
          lastProgressAt = Date.now();
          const pct = Math.max(5, Math.round(progress * 100));
          progressBar.style.width = `${pct}%`;
          if (!warming.hidden) warmingText.textContent = `Installing your agent · ${pct}%`;
        },
      });
      // Chrome hands the request to its component updater, which reports
      // nothing until it starts. A stall watchdog would abort a healthy
      // install, so this waits, with a hard ceiling instead.
      engineLabel.textContent = 'Chrome is preparing its model';
      const token = ++installToken;
      await Promise.race([
        engine.prepare(),
        new Promise((_, reject) => {
          setTimeout(
            () => reject(new Error("Chrome did not start its model within ten minutes")),
            10 * 60 * 1000,
          );
        }),
      ]);
      if (token !== installToken) {
        log('built-in install cancelled by the visitor');
        return false;
      }
      chromeEngine = engine;
      activeEngine = engine;
      modelState = 'ready';
      updateEngineUi();
      showLauncher();
      log('built-in model ready');
      return true;
    } catch (error) {
      console.warn('[assistant] built-in model unavailable:', error.message);
      log('built-in model failed', error.message);
      installError = /user gesture/i.test(error.message)
        ? 'Chrome needs the button pressed to start its own model download. Press install again.'
        : error.message;
      return false;
    }
  }

  async function ensureAgent() {
    if (await installChromeAgent()) return true;
    if (installError.startsWith('Chrome needs')) return false;

    for (const [planIndex, plan] of INSTALL_PLANS.entries()) {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          setWarming(plan.copy, 0.05);
          await loadWithWatchdog(plan);
          return true;
        } catch (error) {
          const reason = installError || error.message;
          console.warn('[assistant] install attempt failed:', reason);
          log('attempt failed', plan.copy, 'attempt', attempt, reason);
          const hostBlocked = reason.startsWith('cannot reach');
          if (!hostBlocked) installError = '';
          if (modelEngine) {
            try {
              modelEngine.dispose();
            } catch {
              /* terminating a dead worker is best effort */
            }
            modelEngine = null;
          }
          if (hostBlocked) {
            // Same host for every model, so retrying and trying the lighter
            // agent would only waste another eight minutes.
            return false;
          }
          if (attempt === 1) {
            setWarming('Install paused, picking up where it left off', 0.05);
            engineNote.textContent = 'The install paused. Resuming from the part already saved on this device.';
          } else if (planIndex === 0) {
            setWarming('Trying the lighter agent', 0.04);
            engineNote.textContent = 'The full agent would not install here, so the lighter one is being tried.';
          }
        }
      }
    }
    return false;
  }

  /**
   * One line that names the failing hop. Guessing at a stalled install from the
   * outside wasted a day; this turns it into a sentence the visitor can send.
   */
  async function collectDiagnostics() {
    const parts = [];
    parts.push(`browser-model=${chromeAI}`);
    let gpu = 'none';
    try {
      const adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
      gpu = adapter ? 'adapter' : navigator.gpu ? 'no-adapter' : 'no-webgpu';
    } catch (error) {
      gpu = `error(${String(error.message || error).slice(0, 40)})`;
    }
    parts.push(`webgpu=${gpu}`);
    const probe = (url) =>
      Promise.race([
        fetch(url, { mode: 'no-cors', cache: 'no-store' }).then(() => 'ok'),
        new Promise((resolve) => setTimeout(() => resolve('timeout'), 8000)),
      ]).catch((error) => `fail(${String(error.message || error).slice(0, 30)})`);
    const model = 'mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC/resolve/main/mlc-chat-config.json';
    parts.push(`huggingface=${await probe(`https://huggingface.co/${model}`)}`);
    parts.push(`mirror=${await probe(`https://hf-mirror.com/${model}`)}`);
    parts.push(`engine=${modelState}/${activeEngine === chromeEngine ? 'browser-model' : activeEngine === modelEngine ? 'downloaded-model' : 'keyword'}`);
    if (installError) parts.push(`error=${installError.slice(0, 120)}`);
    const connection = navigator.connection;
    if (connection) parts.push(`net=${connection.effectiveType || '?'}/${connection.downlink ?? '?'}Mbps`);
    parts.push(`mem=${navigator.deviceMemory ?? '?'}GB`);
    return parts.join(' ');
  }

  diag.addEventListener('toggle', async () => {
    if (!diag.open) return;
    diagOut.textContent = 'Checking this browser...';
    diagOut.textContent = await collectDiagnostics();
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

  async function bootEngine() {
    chromeAI = await detectChromeAI();
    log('built-in model availability:', chromeAI);

    // Best case: the browser already ships a model, so there is nothing to
    // fetch and the agent is available immediately.
    if (chromeAI === 'available') {
      setWarming("Waking your browser's model", 0.15);
      if (await installChromeAgent()) {
        engineNote.textContent = "Your browser's own model is answering. Nothing was downloaded.";
        showLauncher();
        return;
      }
    }

    // Chrome has a model but will not fetch it without a real press. Starting
    // that here fails ("requires a user gesture"), and falling through to the
    // HuggingFace path is what leaves the page stuck: that host is unreachable
    // on this network. Stop, and ask for the press.
    if (chromePending()) {
      modelState = 'keyword';
      gpuAvailable = false;
      engineNote.textContent =
        chromeAI === 'downloading'
          ? "Your browser is installing its own model. Press to pick it up when it is ready."
          : "This browser can install its own model, shared across all sites. Press install to set it up.";
      updateEngineUi();
      showLauncher();
      return;
    }

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
        chromeAI === 'downloadable'
          ? "This browser can install its own model and share it across sites. Press install to set it up."
          : gpu === 'unsupported'
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
      const ready = await ensureAgent();
      if (ready) {
        engineNote.textContent = 'Your agent is ready. It reads this page and can do everything listed below.';
      } else {
        modelState = 'error';
        engineNote.textContent = installError.startsWith('cannot reach')
          ? 'The model host is blocked from this network, so answers use keyword matching.'
          : installError.startsWith('Chrome needs')
            ? installError
            : 'The install did not finish. Keyword matching is answering until you retry.';
        engineNote.title = installError || 'no error detail reported';
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
    if (modelState === 'loading' && chromePending()) {
      installToken += 1;
      modelState = 'keyword';
      activeEngine = keywordEngine;
      engineNote.textContent = 'Install cancelled. Keyword matching is answering.';
      showLauncher();
      updateEngineUi();
      return;
    }
    if (activeEngine === modelEngine) {
      activeEngine = keywordEngine;
      engineNote.textContent = 'Keyword matching is answering, with no setup at all. Your agent stays installed.';
      updateEngineUi();
      return;
    }
    engineNote.textContent = 'Setting up your agent on this device…';
    const ready = await ensureAgent();
    engineNote.textContent = ready
      ? activeEngine === chromeEngine
        ? "Your browser's own model is ready. Nothing was downloaded by this site."
        : 'Your agent is ready. It reads this page and can do everything listed below.'
      : installError.startsWith('cannot reach')
        ? 'The model host is blocked from this network, so answers use keyword matching.'
        : installError.startsWith('Chrome needs')
          ? installError
          : 'The install did not finish. Keyword matching is answering until you retry.';
    engineNote.title = ready ? '' : installError || 'no error detail reported';
    if (!ready) modelState = 'error';
    updateEngineUi();
    if (ready) showLauncher();
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
