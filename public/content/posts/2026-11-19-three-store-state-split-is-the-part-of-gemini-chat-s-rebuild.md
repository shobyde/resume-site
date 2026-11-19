# Three-Store State Split Is the Part of Gemini Chat's Rebuild Worth Copying
Tag: ui-direction
Subtitle: Three-store state split is the part of Gemini Chat's 100M-user frontend rebuild worth copying into your own agent UI.
---
I read Abhirup Mitra's write-up on rebuilding Gemini Chat's frontend for 100M users, and the useful idea is not the scale. It is the state model. They split state into three stores: the UI tab, the server conversation, and the in-flight turn. Each has a different owner and a different lifetime. The tab state is local and disposable. The conversation is server-owned and can be rehydrated. The in-flight turn is the dangerous one, because it is the only state that can be lost mid-flight, and it is the one most agent UIs conflate with the conversation.

That conflation is why a refresh or a second tab corrupts an agent run. If the in-flight turn lives inside the conversation store, a rehydrate overwrites it or races it. Keeping it separate means a tab can die without taking the conversation with it, and a new tab can attach to an in-flight turn it did not start.

The other two ideas are smaller but specific. They warm the SSE connection on composer focus, so the first token arrives sooner without paying connection setup on send. And they tier the wait UX by TTFT: different loading treatment depending on how long the first token takes. That is an honest acknowledgment that latency is not one number, and that a spinner for 200ms and a spinner for 4 seconds are different products.

Multi-tab coordination rounds it out: one tab owns the turn, the others observe.

My take: most agent frontends I have built treat the chat as one store with a loading flag, and the pain shows up exactly where this design prevents it. The three-store split is the refactor I would do first.

Source: https://abhirupamitra.com/the-practice/designing-gemini-chat-frontend-for-100m-llm-users
