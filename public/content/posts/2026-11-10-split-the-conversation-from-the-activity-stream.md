# Split the Conversation From the Activity Stream
Tag: ui-direction
Subtitle: The conversation stream and the activity stream are different things, and conflating them is why agent UIs feel broken.
---
One line in the brief caught my attention: the architectural fix for agent UX is to separate the conversation stream from the activity stream. That is a better framing than most of what I have read on this topic, and it is worth saying why.

Chat UIs work because the transcript is the state. The user reads what was said and infers what happened. That breaks the moment an agent takes real actions, because the actions are not conversation. A tool call, a file write, a retry after an error: these are events in a system, not turns in a dialogue. Stuffing them into the chat as "assistant" messages turns the transcript into a log nobody reads, and the user loses the thread of what was actually asked.

The fix is to stop pretending the chat is the whole interface. Keep the conversation for intent and decisions. Route tool calls, progress, and side effects into a separate activity surface that can be collapsed, filtered, or expanded. The two surfaces share a session but not a rendering contract.

This matches what I have seen building Hobnob's on-device pipeline. The transcript of what the user asked and the log of what the agent did diverged quickly, and mixing them made both harder to follow. Splitting them is not a visual preference. It is a data-model decision, and it has to be made before components get written.

Source: https://fuselabcreative.com/ui-design-for-ai-agents/
