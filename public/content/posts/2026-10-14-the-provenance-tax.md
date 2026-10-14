# The Provenance Tax
Tag: dev
Subtitle: Watermarking turns out to slow down AI agents — which tells us something about what agents actually are
---

Two items from this morning's reading collided in my head, and the collision is the interesting part.

The first: Lasso Security's writeup on [LLM watermarking's impact on agent behavior](https://www.lasso.security/blog/the-provenance-tax-understanding-the-impact-of-llm-watermarking-on-ai-agent-behavior). The headline finding is blunt — watermarking text doesn't just tag it, it changes how agents perform when they produce or consume it. The overhead is what they call the "provenance tax": tokens spent being verifiable instead of being useful.

The second: [MIT Tech Review's piece on AI labs buying training data from dead startups](https://www.technologyreview.com/2026/10/13/1145755/ai-labs-buying-data-from-dead-startups-to-train-models/). Provenance, it turns out, is now a product category. You can literally acquire someone else's corpus by acquiring the corpse of their company.

Here's my take: these are the same problem viewed from opposite ends of the model lifecycle. At the input end, labs pay (in dollars and lawsuits) to establish where data came from. At the output end, downstream systems pay (in latency and quality) to prove where text went. Provenance used to be metadata you possessed; increasingly it's compute you spend.

What bugs me is who absorbs the tax. The lab bootstraps trust by shipping watermarked output, then the ecosystem of agents consuming that output eats the friction. It's a classic externality dressed up as a compliance checkbox. If you're building agent plumbing — tool chains, RAG pipelines, whatever — you're going to encounter watermarked text whether you opted in or not, and you should know it measurably degrades throughput before a benchmark shows up in your postmortem.

None of this means watermarking is bad. It means it's now a real engineering input, like TLS or rate limits. Cost was hidden; now you can measure it. I'll take visible friction over invisible assumptions any day.
