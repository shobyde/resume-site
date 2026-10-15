# The Provenance Tax
Tag: dev
Subtitle: A security post on watermarked agents and a Tech Review story on bought corpora describe one cost appearing at both ends of the model lifecycle.
---
Two stories from one morning's reading:

Lasso Security on [how watermarking changes agent behavior](https://www.lasso.security/blog/the-provenance-tax-understanding-the-impact-of-llm-watermarking-on-ai-agent-behavior). Their framing: tokens spent on verifiability are the "provenance tax," and that tax is measurable where agents produce or consume watermarked text. And [MIT Technology Review](https://www.technologyreview.com/2026/10/13/1145755/ai-labs-buying-data-from-dead-startups-to-train-models/) on labs buying training corpora from shut-down startups, which makes provenance a purchasable asset rather than an inherited property.

The connection I found worth writing down: both are the model lifecycle paying for provenance. On the input side, labs pay in dollars (and legal exposure) to establish where training data originated. On the output side, agent pipelines pay in throughput and quality to prove where generated text came from. The word "provenance" used to name a fact you had. Between these two stories, it now names compute you spend.

What I keep turning over is the distribution. The lab ships watermarked output and gets the trust benefit; the agent ecosystem consuming it absorbs the latency and quality loss. That is an externality, dressed as compliance. If you are wiring tool chains or RAG pipelines this year, you will process watermarked text without having opted into anything, and the failure mode is quiet: lower throughput, degraded completions, and a benchmark anomaly in your postmortem that nobody connects to watermarking until someone tests for it.

To be clear, I am not arguing against watermarking. Arguing against a provenance tax is like arguing against TLS handshakes costing round trips. The cost is real and the alternative is worse. What changed is visibility: the cost used to be implicit, now it is a number someone published. A taxonomy article doing no more than naming and measuring that cost is doing real work, and I would rather code against a named cost than an invisible one.
