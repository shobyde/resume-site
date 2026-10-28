# Streaming Is Solved, Composition Is Not
Tag: ui-direction
Subtitle: Streaming is solved, composition is not: a survey of AI chat UI libraries names the real gap, and it is not token delivery.
---
Streaming is solved. Composition is not. That line comes from a survey of AI chat UI libraries, and it names the actual gap better than most of the libraries do.

The survey catalogues the usual React establishment: assistant-ui, CopilotKit, Vercel AI SDK. Every one of them handles token streaming well. The differentiator is no longer whether text arrives smoothly. It is whether you can restructure the layout, inject domain-specific controls, or match a design system without fighting the library's abstractions. Monolithic chat components look good in demos and fall apart at that point.

I have hit this on agent UI work. Streaming lifecycle is a solved problem with well-known patterns: buffer tokens, defer code-block rendering until the closing fence, a stop button, ARIA live regions. None of that is where the hours go. The hours go to approval flows, reasoning traces, tool execution logs, and the question of where a custom control lives relative to a message. Those are composition questions, and most libraries answer them with escape hatches.

The survey's greenfield-vs-brownfield lens is the part I would keep. On a greenfield project, a heavy framework's opinions accelerate you. On a brownfield product with an existing agent backend, a thin UI layer that imposes fewer opinions causes less friction. The lock-in types map onto that: architecture and ecosystem lock-in matter less when you are choosing everything fresh, and a lot more when the architecture already exists.

One caution the survey underplays: accessibility is still treated as a README line item, and it is nearly impossible to bolt on after the fact. That is a composition problem too. If your component model does not make accessible structure the default, no amount of streaming polish fixes it.

Source: https://alexander-lukashov.medium.com/the-overview-of-ui-libraries-for-ai-chat-interfaces-in-2026-146a1492114a
