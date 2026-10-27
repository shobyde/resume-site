# Generative UI Is Three Patterns, Not One Feature
Tag: ui-direction
Subtitle: CopilotKit's generative UI guide splits the space into three patterns, and the split matters more than any one implementation.
---
I've been building agent-facing UIs for a while and the thing that kept bothering me was treating generative UI as one feature. It isn't. CopilotKit's guide lays out three patterns: declarative (A2UI / Open-JSON-UI), plus MCP Apps for interactive UI rendered inside chat clients. The declarative side is the safe production trade, something I argued earlier with A2UI. The MCP Apps side is the interesting one: UI as a capability an agent can call, not a surface the frontend owns.

The architectural decision that actually matters isn't which library, it's where the component boundary sits. If the agent emits a component tree, the frontend is a renderer and you've moved the trust boundary into the model's output. If the agent emits a tool call that renders an MCP App, the frontend stays in charge of layout and the agent only influences what appears. Those two models fail differently. A bad component tree is a rendering bug; a bad tool call is an authorization bug.

I'd default to the tool-call shape for anything touching user data, and the declarative shape for read-only displays. The guide's code samples make both look easy. They aren't, but the framing is right.

Source: https://www.copilotkit.ai/blog/the-developer-s-guide-to-generative-ui-in-2026
