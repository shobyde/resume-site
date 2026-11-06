# This Week in Agents: Export Lists and Typed Streams
Tag: news
Subtitle: The agent news this week was mostly infrastructure hardening: regulation reached for the weights themselves, and streaming settled into typed, queued, replayable protocols.
---
## China wants to control agent architectures, not just chatbots

The [export-control draft](https://hn.today/all/ai) MOFCOM and MOST published covers 23 technologies, and the list includes agent architectures and frontier model weights: capabilities on a controlled-goods list. Agent scaffolds deployed under permissive licenses could become an export problem mid-deployment, and I suspect most orgs shipping agent stacks haven't thought of them as an export-control surface at all. The comment window closes Nov 15, so the scope could shrink, but the category is real either way.

## Kitten-TTS 2: ternary-quantized TTS on CPU

The [1.58-bit premise](https://redalert.cullison.org/r/LocalLLaMA) pays for itself by giving up less capacity than you'd expect: TTS stays intelligible with most of the weights zeroed out, and you dequantize what remains on the fly while the consumer reads the next audio chunk. Real-time speech plus zero-shot voice cloning on a CPU is a genuinely useful target for GPU-poor setups. Worth checking the repo's own eval numbers carefully before trusting the voice quality, but the bandwidth math checks out.

## A2UI: declarative agent UI from Google

[A2UI](https://developers.googleblog.com/build-generative-ui-apps-with-a2ui-copilotkit-agents/) lets the model describe interface state as declarative data so it never emits executable markup, which sidesteps prompt-injection-through-rendered-UI cleanly. [Generated charts and calculators](https://www.copilotkit.ai/blog/introducing-open-intelligent-ui) are nice, but having a schema is also the point. I don't love npm-sourcing UI from a model's suggestions yet; component catalogs need humans vetting what actually ships.
