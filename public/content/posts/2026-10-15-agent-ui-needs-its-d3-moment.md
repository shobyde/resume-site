# Agent UI Needs Its D3 Moment
Tag: dev
Subtitle: The chat interface didn't die, it grew apps inside itself — and we're all still writing the component layer for it from scratch.
---
Two moving pieces from this week that I keep circling back to. First, OpenAI rolled its "Intelligent UI" to all ChatGPT users, free tier included: GPT-6 now renders interactive elements inside chat responses, not just markdown. A chat surface quietly becoming an app surface should be the loudest signal any frontend engineer has heard this year.

Second, this [library roundup on dev.to](https://dev.to/alexander_lukashov/i-evaluated-every-ai-chat-ui-library-in-2026-heres-what-i-found-and-what-i-built-4p10) puts numbers on the gap: tens of options, all with streaming (now table stakes), and almost none with the layer that actually matters — agent-specific composition. Approval flows, reasoning traces, tool-call displays, cost transparency. Libraries give you bubbles; agents need controls, gauges, and dashboards.

LangChain's [frontend SDK docs](https://docs.langchain.com/oss/javascript/langchain/frontend/overview) point the same direction: `useStream()` exposes tool-call lifecycle, interrupts, checkpoint history, time-travel, state forking. An agent isn't a message stream — it's a control plane with a transactable state you can fork and rewind.

The catch: nobody has componentized this. Every team building agent UI hand-rolls an approval widget, hand-rolls a trace viewer, and calls it done. Compare with dataviz: D3 exists, someone wrapped it in a thousand higher-level charts, the ecosystem compounds. Agent UI is still at the D3 stage — raw generators, no wrappers.

So that's my next side-quest: a small library of agent primitives — an `<ApprovalFlow>` where the therapist-customizer "minivan approval" pattern is a prop, a trace view with first-class tokens-for-time rendering, a tool-call inspector. Open question: do primitives chase provider state shapes (useStream, Vercel AI SDK) or define their own protocol and adapt?

If you're building agent UI in 2026, streaming was the easy part. The unsolved layer is composition — and the team that ships it first gets the ecosystem gravity.
