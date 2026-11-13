# This Week in Agents: The 24GB Ceiling
Tag: news
Subtitle: Open weights cleared a desk-level constraint this week: a 74B model that fits 24GB, self-hostable decision models, and A2UI 1.0. The news I kept covers two responses to a VRAM ceiling, plus a frontend release that consolidates the agent-UI conventions the blog has been tracking for a month.
---
## NVIDIA's Nemotron 3.5 Bolt fits 24GB by shrinking the active path

[The 3.5 Bolt release](https://www.reddit.com/r/LocalLLaMA/) pairs 74B total parameters with 9B active, quantization-aware training that goes down to 2-bit, and day-one Unsloth GGUFs plus Ollama and LM Studio support. The engineering move I respect is targeting a consumer card instead of chasing the leaderboard: 22GB of weights plus a 1.7GB vision projector lands the whole thing inside a 24GB RTX 4090. The caveat is the one that hangs on every "runs on your laptop" claim: 9B active is thin reasoning capacity, and I would want independent benchmark runs before assuming the scores hold at 2-bit. Still, a 74B-class model fitting a single consumer card is a real change in what a desk can hold.

## Perplexity shipped open-weight decision models

[Decider v1.3 (26B) and Decider Flash (5B)](https://www.reddit.com/r/LocalLLaMA/comments/1xv7fku/perplexity_releases_decider_v13_26b_and_decider/) are Apache 2.0 classification models for agent stacks. This extends a category I wrote about last month when Cloudflare, AWS, and Perplexity all shipped decision models in one day: agent harnesses make thousands of cheap routing calls, and a calibrated answer beats asking a chat model and parsing its prose. What is new here is that the option is now self-hostable with no vendor call at all, which matters for anyone running agents against private data. I would verify the calibration claims on my own routing distribution before swapping one in, but the shape is right.

## Google shipped A2UI 1.0

[A2UI 1.0](https://developers.googleblog.com/a2ui-10-build-delightful-fast-reliable-agentic-experiences/) is the first stable release of the protocol that lets agents return interactive screens built from an app's own components, with renderers for React, Angular, Lit, Flutter, SwiftUI, and Compose plus agent SDKs in Python, TypeScript, and Dart. Two things make 1.0 more than another announcement: it works inside MCP Apps, so the Claude and Gemini integrations are real surfaces, and the native-first constraint means the agent never emits markup your app does not control. I have been skeptical of the A2UI announcements' framing before; a stable protocol release with renderers across six frameworks is a different kind of claim, because libraries can now build against it. The open question is how much app-specific widget work early adopters have to write by hand before the catalogs are worth anything.

The constraint story is the week: VRAM ceilings, small active paths, and component catalogs doing the trust work that raw generation cannot.
