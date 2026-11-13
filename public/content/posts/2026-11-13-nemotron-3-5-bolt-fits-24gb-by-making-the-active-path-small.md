# Nemotron 3.5 Bolt Fits 24GB by Making the Active Path Small
Tag: tools
Subtitle: NVIDIA Nemotron 3.5 Bolt ships 74B total parameters with 9B active, quantized down to 2-bit, sized to fit 24GB, with Unsloth GGUFs and Ollama/LM Studio support on day one. The headline is 74B. The useful numbers are 9B active, 22GB of weights, and a 1.7GB vision projector.
---
I run local models on a 24GB card, and the wall has never been total parameters. It is active memory during inference plus the vision projector plus KV cache. A model that advertises 74B and fits in 24GB is telling you the active path is small and the weights are aggressively quantized. That is a design choice, not a trick.

The trade-off is precision. 2-bit quantization is where accuracy starts to fall off for reasoning-heavy work. Unsloth reports 99% of BF16 for their IQ_3S GSQ RCO on a different model, but that is their measurement on their benchmark, and 2-bit is a different floor. I would treat Nemotron Bolt as a strong candidate for tool-calling and vision tasks where latency and memory matter more than long-form reasoning, and I would not assume it replaces a 14B-class model for coding without testing it myself.

Day-one Unsloth GGUFs and Ollama support matter more than the parameter count. The friction in local AI is rarely model quality. It is the gap between announcement and a working `ollama run`. Closing that gap on launch day is the real feature.

Source: https://reddit.com/r/LocalLLaMA/
