# A2UI's Healing Parser Is the Part Worth Copying
Tag: ui-direction
Subtitle: A2UI v0.9 streams generative UI by healing partial LLM output, and the parser is the part I'd copy before the protocol.
---
Google's A2UI v0.9 release adds resilient streaming that incrementally parses and heals LLM output so clients can render UI components as they generate, plus framework-agnostic renderers (https://developers.googleblog.com/a2ui-v0-9-generative-ui/). The headline is the protocol. The part I care about is the parser.

Most agent UIs I've built buffer the model's output until it is valid JSON, then render once. That is safe and slow, and it makes streaming feel like a lie: tokens arrive, nothing moves, then a block pops in. Healing partial output flips that. The client renders a component skeleton as soon as it can identify one, then fills fields as they arrive. The cost is that the parser has to guess about incomplete structures and reconcile when the full output lands, which means every component needs an identity that survives that reconciliation or the UI flickers and state resets.

Framework-agnostic renderers are the other half. If the agent emits a UI tree rather than React elements, the same payload can drive a web client, a mobile client, or a terminal renderer without a second model call. That is a real boundary: the model stops knowing about your component library.

The risk is the obvious one. A model that emits arbitrary component trees can emit arbitrary component trees. Healing makes that worse because it renders before the output is complete, so a bad early guess can flash before correction. The mitigation is a declarative, closed vocabulary of components the client understands, which is what A2UI already implies. The open question for me: whether the healing parser ships as a reusable library or stays buried inside the reference client. If it is reusable, I'd adopt it. If not, the protocol is just a spec.
