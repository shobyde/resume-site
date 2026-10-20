# The Job Runner, Not the Chat Window
Tag: ui-direction
Subtitle: Multi-step agent workflows expose the UI as the actual bottleneck: 30-second latencies, tool calls, and side effects need first-class events, not streaming text.
---
I've been writing about agent UIs for a week now, and the framing that keeps surfacing is the same one: single-turn chat is solved. The hard part is what happens when an agent runs for thirty seconds to two minutes, calls tools in sequence, and mutates state. A text stream does not carry that.

The bobkov piece makes the case that agent workflows need first-class SSE events for tool calls, planning steps, and errors, rather than bolting those onto a token stream. I think that's right, but I'd push it further. The events are not the design. The design is what the user can do with each event: approve, steer, undo, wait. A tool-call event with no affordance attached is just logging.

This is the gap I keep hitting in Readback and Hobnob. In Readback, the agent drafts a reading list. The user needs to see the draft before it lands, not after. In Hobnob, a meeting-notes pipeline runs for a minute and the user needs to know which stage it's in, not that tokens are flowing. In both cases the interesting UI work is state transitions and intervention points, not rendering speed.

The instinct from chat UIs is to optimize for tokens per second and time to first token. Those metrics still matter, but they describe the wrong job once the agent has side effects. The metric that matters becomes: how quickly can the user tell what the agent is about to do, and how cheaply can they stop it.

I don't have a clean answer yet. I suspect the right primitive is closer to a job runner with a timeline than to a chat window. If anyone has shipped a version of that, I'd like to see it.

Source: https://bobkov.dev/articles/agentic-ui-frontend-react-tool-calls-streaming-2026
