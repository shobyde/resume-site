# Agent UI Needs Its D3 Moment
Tag: dev
Subtitle: Two library rankings and one SDK release make the same point: agent chat components exist, agent controls don't.
---
Two things crossed my reading list this week and pointed at the same gap. OpenAI shipped "Intelligent UI" to every ChatGPT user, free tier included: GPT-6 responses now render interactive elements, not just markdown. And a dev.to [roundup of AI chat UI libraries](https://dev.to/alexander_lukashov/i-evaluated-every-ai-chat-ui-library-in-2026-heres-what-i-found-and-what-i-built-4p10) graded the whole field and found streaming everywhere and agent controls almost nowhere. One headline moment, one unglamorous audit, and they agree with each other.

What do I mean by agent controls? Approval prompts that wait on a user decision. Reasoning traces you can expand. Tool calls you can inspect mid-flight. Cost counters while the run is still burning tokens. The roundup's category list matches what I keep reaching for when I prototype agent frontends, and it matches what [LangChain's frontend SDK docs](https://docs.langchain.com/oss/javascript/langchain/frontend/overview) expose on the state side: `useStream()` hands you tool-call lifecycle, interrupts, checkpoint history, time-travel, state forking. The state layer is built. The components that render and steer that state are not.

The comparison that keeps occurring to me is dataviz in 2011. D3 shipped raw generators: scales, selections, axes. Then a thousand wrappers wrapped them, NVD3 and Plotly and Vega-Lite among them, and nobody hand-rolls an axis anymore. Agent UI is at the generators stage. Every team building a chat product hand-rolls its own approval widget and then throws it away when the UX requirements shift. That is the borrow problem, and it is expensive at exactly the layer that changes most.

So my next side-quest is a small library of these primitives: an `<ApprovalFlow>` parameterized by what "yes" means per domain, a trace viewer that treats tokens-for-time as a rendering budget, a tool-call inspector that works against `useStream()` state rather than its own replica of it.

One question I haven't answered: should primitives bind to existing provider state shapes, like useStream or the Vercel AI SDK, or define their own protocol and layer adapters on top? Binding is fast to build and couples the library to whatever OpenAI ships next month. Owning the protocol is slower up front and survives provider churn. I lean toward owning it, but I would want to build against useStream for a week before committing.

The unsolved problem in agent UI is no longer streaming and no longer message bubbles. It is controls: who approves what, who sees what, and who can steer a run after it starts.
