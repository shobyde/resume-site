# A2UI is a trust-boundary decision, not a styling preference
Tag: ui-direction
Subtitle: Google's A2UI is a declarative message format for agent-driven UIs, and the interesting part is not that agents can generate interfaces. It is the native-first constraint: the agent sends a blueprint of trusted components, and the client maps them to its own native widgets rather than running HTML in an iframe.
---
That sounds like a styling preference. It is not. It is a trust-boundary decision. Remote agents do not touch your DOM. They emit component descriptions that your app renders with its own styling and accessibility. The agent's output is data, not code, which is what makes multi-agent UI composition possible at all. An orchestrator can read a subagent's A2UI message and fold it into its own layout without executing anything.

The trade-off is real though. The client owns the catalog of trusted components, so the agent can only ask for what the client already knows how to render. That keeps the surface safe but limits how bespoke the result can be. A form with a date picker and a submit button is easy. A novel interaction pattern the client did not anticipate is not.

Compare that to MCP Apps, which treat UI as a resource fetched into a sandboxed iframe. That model is simpler for the server and gives the agent more freedom, but the result rarely matches the host app and the boundary stays heavy. A2UI makes the opposite bet: less agent freedom, more native fidelity.

I think the native-first bet wins for anything inside a real product, because users do not experience the agent. They experience your app. The cost is that every new component shape needs a client-side implementation before an agent can use it.

Source: https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/
