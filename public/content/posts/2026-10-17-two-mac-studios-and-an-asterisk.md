# Two Mac Studios and an Asterisk
Tag: dev
---
# Two Mac Studios and an Asterisk
Tag: dev
Subtitle: Meta's 816B Muse Spark Open reportedly runs on two Mac Studios; sparsity makes it fit, the score tempers it, and the serving stack wobbles.
---
The open-weights item from yesterday's briefing that I keep returning to: [Muse Spark Open](https://capitalandcompute.net/blog/new-ai-models-october-2026/), Meta's new 816B-parameter MoE with 42B active, reportedly served from a pair of M5 Ultra Mac Studios. The same tracker supplies the fine print: Q4 weights need more memory than one 512GB Studio holds, so two boxes is the desk version's real price, and third-party hosts serve it at $1.25/$4.25 per million tokens.

Sparsity is what makes this fit, and the two numbers deserve separating. At 4-bit, all 816B parameters come to roughly 400GB before KV cache, which is why a single 512GB Studio doesn't hold them. But each token is processed against only 42B of those weights: about 21GB moved per token at 4-bit, against roughly 400GB for a dense model of the same size. Memory bandwidth is the hard ceiling on desk decode, and that ~19:1 ratio is what keeps this model under it. A dense model of this size would fit the same memory and still crawl, because every token moves all of it. The number to watch in the next open-weights release is the ratio of total to active parameters.

The score is its own asterisk. 39 on the Artificial Analysis index is the best US open-weight result, roughly level with DeepSeek V4.1 Flash and nine points below Meta's own closed Muse Spark 1.3 at the same per-token price, per [capitalandcompute's benchmark breakdown](https://capitalandcompute.net/blog/muse-spark-open-pricing-benchmarks/). Close to the frontier, still short of it.

Then there's the serving software. Elsewhere in the briefing, an [open Ollama regression](https://github.com/ollama/ollama/issues/18968): 25 to 30 percent throughput loss on all models in 0.40.4-rc0 versus 0.40.1, plus MLX kernel panics on Apple Silicon in the 0.40.x line. That's the ecosystem a two-Studio setup would serve from. I benchmarked the small local models on my own machines and ended up pinning my assistant to cloud-only failover; frontier-class weights are a different proposition from those. But the hardware arithmetic is only half of what "runs locally" has to mean, and the software half is still shipping double-digit regressions and kernel panics.

What I haven't seen is the number that turns any of this into a recommendation: tokens per second on the pair, context length once KV cache takes its share, how two boxes share one model. Everything published so far establishes that it runs. I'm filing "runs on two Mac Studios" as a memory-capacity milestone and waiting on serving benchmarks before calling the desk frontier practical.
