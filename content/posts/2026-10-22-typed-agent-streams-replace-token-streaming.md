# Typed Agent Streams Replace Token Streaming
Tag: ui-direction
Subtitle: Typed agent streams replace token streaming with explicit events, which is what agentic UIs actually need.
---
LangChain's proposal is that LangGraph stops emitting a byte stream and emits typed events instead: message, tool_call, tool_result, state_update, subagent_event, human_review_request, custom. The frontend gets a structured record of what happened rather than text to append to a bubble.

I think this is the right shape, and it matches what I have seen building agent interfaces. The hard part of an agent UI is not getting tokens on screen fast enough. It is showing the user which step the agent is on, what tool it called, and what it is waiting for. A token stream gives you none of that. You end up reverse-engineering state from prose, or bolting on a spinner that hides the work.

Typed events make the UI a consumer of the agent's state machine instead of a renderer of its output. That is a better contract, and it is closer to how we already build non-agent interfaces: components respond to state changes, not to text.

Two caveats. First, the proposal is still a proposal; the event set will grow, and every new event type is a new thing a frontend must handle. Second, typing the stream does not solve cancellation or backpressure. Those still need their own plumbing.

Source: https://24-ai.news/en/news/2026-05-22/langchain-agent-streams-typed-channels-langgraph
