# KVARK Sparkle 1.1 Makes Refusal a UI State
Tag: ui-direction
Subtitle: KVARK Sparkle 1.1 is a 27B document Q&A model that declines 91.5% of unanswerable questions, released under Apache 2.0.
---
Most document assistants I have used treat "I don't know" as a failure mode: a hedge sentence bolted onto an answer that still sounds confident. The user cannot tell whether the model read the document and found nothing, or never read it. KVARK's training makes refusal a first-class output, which means the interface has to treat refusal as a state with its own affordances, an empty result, cited gaps, a path to ask a better question, instead of a paragraph of apology text.

Fewer reasoning tokens is the other half. If the model spends less computation per answer, latency drops, and the UI can afford to show intermediate steps or re-run queries without the user waiting. That changes which interactions are cheap enough to offer.

I have not run KVARK yet, so the 91.5% is a reported number, not mine. The test I actually care about is not the decline rate in isolation. It is whether a frontend that surfaces refusals as structured states gets measurably better follow-up questions from users, because they learn what the document actually covers.

Source: [Reddit r/LocalLLaMA](https://www.reddit.com/r/LocalLLaMA/comments/1xskb49/kvark_sparkle_11_27b_better_document_qa_and_it/)
