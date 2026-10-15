# The Provenance Tax
Tag: dev
Subtitle: A security post on watermarked agents and a Tech Review story on bought corpora describe one cost appearing at both ends of the model lifecycle.
---
Two stories from one morning's reading:

Lasso Security on [how watermarking changes agent behavior](https://www.lasso.security/blog/the-provenance-tax-understanding-the-impact-of-llm-watermarking-on-ai-agent-behavior). Their term, the "provenance tax": tokens spent being verifiable are tokens not spent being useful. And [MIT Technology Review](https://www.technologyreview.com/2026/10/13/1145755/ai-labs-buying-data-from-dead-startups-to-train-models/) on labs buying training corpora from shut-down startups, which turns provenance into something you can purchase rather than something you inherit.

![One lifecycle, two provenance payments: dead-startup corpora flow into labs who pay in dollars and legal risk, the trained model emits watermarked text, and downstream agent pipelines pay in throughput and quality; a who-pays table shows the benefit accruing upstream at the lab while the cost lands downstream on agent pipelines without opt-in, labeled as my own reading](/content/posts/assets/2026-10-14-the-provenance-tax/provenance-lifecycle.svg)

The diagram above is the connection I found worth writing down. These are not two stories; they are one lifecycle photographed at both ends. On the input side, labs pay in dollars and legal exposure to establish where training data came from. On the output side, agent pipelines pay in throughput and quality to prove where generated text came from. The word "provenance" used to name a fact you possessed. Between these two stories it has become compute you spend, at purchase time and at inference time alike.

What I keep turning over is the distribution in the bottom half of that diagram. The lab ships watermarked output and banks the trust benefit: attributable text, defensible training data. The agent ecosystem consuming that output absorbs the slower runs and degraded completions, without having opted into anything. That is an externality by my reading, though I want to be careful here: I haven't seen either article work through the distribution explicitly, so treat it as my inference from their findings, and watch for evidence rather than assume it.

If you're wiring tool chains or RAG pipelines this year, the practical version is: you will process watermarked text whether you chose it or not, and the failure mode is quiet. Lower throughput, degraded completions, and a benchmark anomaly that nobody connects to watermarking until someone tests for it. Neither article gives me a number I can cite for that cost, which is the gap in both stories: named, not yet measured.

None of this argues against watermarking. That would be like arguing against TLS because handshakes cost round trips: the cost is real and the alternative is worse. What changed is visibility. The cost used to be implicit and unclaimed. Now someone has measured it on one end and someone else has priced the other end. A tax you can see on the invoice is a cost you can budget for, and I'd rather code against a named cost than an invisible one.
