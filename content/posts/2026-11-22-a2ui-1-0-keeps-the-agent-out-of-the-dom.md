# A2UI 1.0 Keeps the Agent Out of the DOM
Tag: ui-direction
Subtitle: A2UI 1.0 has agents emit interactive screens, forms and charts, rendered by your own native components, with bidirectional function calls and streaming.
---
A2UI 1.0 has agents emit interactive screens, forms and charts, rendered by your own native components, with bidirectional function calls and streaming. Google's framing is that the agent describes UI and the host application renders it. The interesting part is what that implies about trust.

The obvious alternative is generated code. An agent emits HTML or JSX, the host evals it, and you hope the sandbox holds. A2UI inverts that. The agent emits a declarative description; the renderer maps it onto components you already ship and already review. The agent never touches the DOM directly. That is a real architectural boundary, not a styling preference, and it is the part worth copying even if you never adopt A2UI itself.

The cost is that you now own a rendering contract. Every component the agent can ask for has to exist in every renderer you support: React, Angular, Lit, Flutter, SwiftUI, Jetpack Compose. The protocol's value scales with how many of those you actually ship. For a single-platform app, much of the pitch evaporates.

I have not built on A2UI yet, so treat this as a read of the spec and the adopter list (Atlassian, Bloomberg, ByteDance), not a production report. The open question for me is whether bidirectional function calls stay clean once the agent starts driving multi-step forms. That is where declarative UI descriptions usually get awkward.

Source: https://developers.googleblog.com/en/a2ui-10-build-delightful-fast-reliable-agentic-experiences/
"<rfl:parameter name="
