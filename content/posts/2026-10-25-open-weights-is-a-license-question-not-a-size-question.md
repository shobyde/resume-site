# Open Weights Is a License Question, Not a Size Question
Tag: dev
Subtitle: Four open-weights drops in 72 hours, and the licenses mattered more than the param counts.
---
Four open-weights models shipped in 72 hours: Muse Spark Open at 816B/42B under a custom license with a revenue clause, Reflection Beam at 501B/23B under Apache 2.0, DeepSeek V4.1 Flash under MIT, and Nemotron 3.5 Bolt at 74B/9B active that fits in 24GB. The interesting part was not the sizes. It was the license terms.

For anyone building on top of these, the practical question is not how big the model is but what they are allowed to do with it. A 501B model under Apache 2.0 that I can fine-tune and ship in a product I sell is more useful to me than an 816B model I can read but cannot monetize. The revenue clause is the kind of term that looks harmless in an announcement and becomes a problem six months later when the product starts making money.

There is a second catch. Open weight does not mean runs on local hardware. An 816B or 501B model needs a $38k rig. Of the four drops, only Nemotron actually fits on a 24GB card. So "open weights" is describing availability of weights, not accessibility of running them.

My take: read the license terms before the benchmark table, and treat them as a spec requirement the same way you would treat a dependency's license in a commercial codebase. The param count is marketing. The license is the contract.

Sources: https://reddit.com/r/LocalLLaMA/comments/1x9d23j/72_hours_four_big_open_weights_drops_the_only_one, https://aiweekly.co/ai-news-today
