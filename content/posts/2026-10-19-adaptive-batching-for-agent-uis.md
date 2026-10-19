# Adaptive Batching for Agent UIs
Tag: ui-direction
Subtitle: Streaming 100 tokens per second will jank your UI unless you batch adaptively with scheduler.yield().
---
Most agent UIs I've seen stream tokens straight into the DOM as they arrive. That works at 20 tok/s. At 100+ tok/s it stops working, because each token triggers layout and paint work on the main thread. The user sees stutter, not speed.

The fix in the briefing I read today is adaptive batching: group tokens and flush them on a frame boundary using scheduler.yield() so the browser keeps painting. The interesting part is that the bottleneck is not the model. It is the render loop. Faster models make the UI problem worse, not better.

I think this is the right frame. For two years the conversation about agent UX has been about prompts and tool calls. The rendering layer got treated as solved because chat is simple. It is not simple once the agent runs for thirty seconds, calls tools, and streams structured output at the same time. Token batching, WebAssembly markdown parsing in a worker, and HITL gates are all the same kind of fix: move work off the main thread and give the user a brake pedal.

One thing I want to push back on. Confidence indicators sound nice in a spec, but I have not seen one that a user actually trusted. They read like decoration unless the model is calibrated, and most are not. I would ship the batching and the gates first.

Source: https://yaroslavboiko.com/blog/agentic-ux-primitives
