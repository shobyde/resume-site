# Chat Is a Job Transcript, Not a Conversation
Tag: ui-direction
Subtitle: Chat breaks down once an agent starts taking real actions, and prettier components alone will not fix it.
---
The HackerNoon piece argues agent UX is moving away from chat toward structured, component-driven surfaces, with generative UI streaming typed events (AG-UI 1.0, AI SDK 7) instead of markdown tokens. I agree with the diagnosis and disagree with the prescription as usually stated.

Chat fails because it treats an agent run as a conversation. An agent run is a job. It has steps, side effects, checkpoints, and a result that may arrive thirty seconds later. A chat transcript has no native place for any of that. You end up bolting on tool-call cards and progress spinners, which is how you get the current mess of agent UIs that look like chat with extra widgets.

The fix people reach for is components. Render a card instead of a paragraph. That helps, but components are a presentation choice, not a model of what happened. What I actually want is an event stream I can reason about: typed events for "started tool X", "waiting on approval", "partial result", "completed". Then the UI decides how to render them. CopilotKit's declarative patterns (A2UI/Open-JSON-UI) and structured streaming are steps in that direction.

The harder problem is state. A chat message is append-only and immutable; an agent step can be retried, amended, or rolled back. Until the UI primitive matches that, we are styling a transcript.

So yes, chat is a terrible interface for agents. But "components instead of chat" restates the symptom. The work is defining the event contract first.

Sources: https://hackernoon.com/chat-is-a-terrible-interface-for-agentsand-2026-will-prove-it and https://www.copilotkit.ai/blog/the-developer-s-guide-to-generative-ui-in-2026
