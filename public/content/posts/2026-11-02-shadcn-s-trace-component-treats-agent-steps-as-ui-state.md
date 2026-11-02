# shadcn's Trace Component Treats Agent Steps as UI State
Tag: ui-direction
Subtitle: shadcn/ui's October release adds a Trace component that renders agent steps with running, error, and pending states, plus nested lines, alongside a Code Block and AI Elements patterns. The interesting part is not the component. It is the decision to model an agent run as a tree of steps with explicit lifecycle states, in a component library that most production apps already depend on.
---
I have been writing agent UIs where the trace is either a log dump or a hand-rolled component. Treating step state as a first-class UI primitive means error and pending become renderable, not just logged. That pushes the question downstream: who owns the step state, the agent runtime or the frontend. If the frontend owns it, reattachment after refresh becomes a sync problem. If the runtime owns it, the frontend becomes a projection.

The honest answer is that most teams will mix the two and discover the seam later. shadcn making it a component does not solve that, but it makes the seam visible earlier, which is the part that actually matters.

Source: https://ui.shadcn.com/docs/changelog/2026-10-ai-elements
