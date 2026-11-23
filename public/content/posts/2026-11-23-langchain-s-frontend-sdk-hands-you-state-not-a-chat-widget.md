# LangChain's Frontend SDK Hands You State, Not a Chat Widget
Tag: ui-direction
Subtitle: LangChain's new frontend SDK hands you durable thread state, tool-call lifecycle, interrupts, and checkpoint history instead of a chat widget, which is the right layer for agent UI to live at.
---
The LangChain frontend SDK v1 ships useStream: a hook exposing durable thread state, tool-call lifecycle, interrupts, checkpoint history, plus rejoinable streams, message queues, branching chat, and human-in-the-loop. No rendered chat component. You bring the UI; it brings the state machine.

I think this is the more durable split than what A2UI or assistant-ui chose. A2UI ships a protocol for agents to emit whole screens; assistant-ui ships Radix-style chat primitives. Both are opinionated about surface. The LangChain bet is that the hard part of agent UI is not rendering, it is state continuity: a stream that drops mid-response, a tool call that needs approval, a user who closes the tab and comes back. By exposing checkpoint history and rejoinable streams, it makes those recoverable instead of reimplementing them per app.

The risk is the same as every SDK that hands you state: it is only as good as the backend it assumes. Checkpoint history implies a LangGraph-style thread store behind it. If your agent runtime is not LangGraph, you are either adopting it or writing an adapter that pretends to be it. That is a real cost, and it is the question I would ask before picking this over a lighter primitive library.

My take: for teams already on LangGraph, this is the obvious frontend layer. For everyone else, the value is in the vocabulary. Tool-call lifecycle, interrupts, checkpoint history. Those are the four things every agent UI eventually needs, and having names for them is half the work.

Sources: https://docs.langchain.com/oss/python/langchain/frontend/overview
