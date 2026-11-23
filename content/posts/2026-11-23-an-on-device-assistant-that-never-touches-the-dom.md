# An On-Device Assistant That Never Touches the DOM
Tag: project
Subtitle: An on-device assistant that never touches the DOM, and the two engines it falls back through.
---
I shipped a site assistant for shobyde.com this month. It answers questions about me, opens cards, navigates the page, and renders structured surfaces through A2UI. The constraint I set for it: no request leaves the browser unless the visitor explicitly opts in. The model, if it installs at all, installs once into Cache Storage and then runs in the tab.

The architecture starts with a decision most agent UIs get backwards: the agent never touches the DOM. In src/agent/assistant.js the runtime dispatches typed actions (navigate, surface, query, action) and a separate rendering layer in src/agent/a2ui.js turns those into components. The agent emits intent; the site renders. That separation is what makes the surfaces trustworthy, because the model cannot invent markup.

The engine layer has three tiers. First, Chrome's built-in model via the Prompt API, detected in detectChromeAI. If it is already available, the assistant uses it with no download. If it is downloadable, the install needs a user gesture, and the code stops rather than falling through to a network host that is blocked here. Second, a self-hosted WebLLM model, fetched from this origin when VITE_MODEL_BASE is set, otherwise from HuggingFace. Third, a lexical keyword engine built from client-agent's capability manifest, which answers immediately and is always available. The visitor can switch back to keyword matching at any time.

The interesting trade-off is the watchdog. A WebLLM shard that never arrives looks identical to a slow download, and I spent a day guessing at stalled installs from outside. The fix in loadWithWatchdog wraps the load in a twelve-second grace timer that rejects on stall. The retry resumes from Cache Storage, so a stalled install does not restart from zero. There is also a plan fallback: compact tier first, then the smallest model. If the host is blocked, both are skipped rather than burning eight minutes.

The install is gated by shouldPreloadModel, which checks navigator.connection.saveData, effectiveType for 2g, and deviceMemory under 4 GB. On a metered link or a small device, the assistant starts in keyword mode and the launcher is available immediately. The warming UI shows progress with megabytes parsed from the download text, and a diagnostics panel collects browser-model, WebGPU, HuggingFace, and mirror probe results into one line a visitor can copy.

What I would do differently: the capability registry and the lexical engine come from client-agent as a dependency, and the site's surfaces are hand-written against A2UI. That boundary works, but the mapping between agent intent and component is still bespoke. The next step is making that mapping declarative so a new surface does not require editing assistant.js.
