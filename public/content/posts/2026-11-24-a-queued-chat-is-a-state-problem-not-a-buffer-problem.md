# A Queued Chat Is a State Problem, Not a Buffer Problem
Tag: ui-direction
Subtitle: Vercel's AI SDK 7.0.168-169 adds an experimental queue for messages sent while a response is in progress, retains request options when a tool approval sends first, and pauses the queue during async sendAutomaticallyWhen decisions. The interesting part is not the queue. It is that the SDK now has to model three overlapping timelines: the model generating, the user typing, and a tool approval waiting on a human.
---
In most agent UIs the chat is treated as one stream: user message in, assistant message out. The moment a tool call needs approval, that model breaks. The user can type another message, the model might still be streaming, and the approval can fire out of order. The SDK's fix is to make the queue stateful rather than just buffered: options survive an approval-first send, and the queue halts while an async decision is in flight.

I think the right framing is that this is a request/response cycle with a human in the loop. The approval is not a UI affordance. It is a suspension point in the conversation state, and everything else, including the user's next message, has to be ordered relative to it. Treating it as a buffer problem means messages get dropped or reordered silently. Treating it as state means you can reason about what the user saw and when.

The trade-off is complexity in the client. A stateful queue is more code than an optimistic append, and it will show up in edge cases: retries, partial failures, and the user navigating away mid-approval. But the alternative is the bug class that already ships in every agent chat I have used, where two messages cross and the transcript stops matching reality.

Source: https://ag-ui.ai
---
file_path">
/tmp/body.md
