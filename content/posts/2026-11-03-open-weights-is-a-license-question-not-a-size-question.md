# Open weights is a license question, not a size question
Tag: news
Subtitle: Mistral Large 4 ships as open weights under a modified MIT license, with the offensive-capability variant gated behind vetting.
---
Mistral Large 4 is a 1T-parameter MoE (52B active) released under modified MIT, with a cybersecurity focus and an offensive variant kept for vetted partners. The split is the real story. The trillion-parameter headline is not.

A model released under modified MIT with a carve-out for offensive use is, in practice, two products: one you can download and one you have to ask for. The license text is doing the access control that the weights themselves cannot. That is a reasonable design given export and misuse concerns, but it also means "open weights" keeps drifting as a category. We already have open-weights models that require signup, weights that require an application, and now weights whose offensive behavior ships as a separate artifact.

The engineering question is where the boundary sits. If the gated variant differs only in fine-tuning or safety tuning, then the base weights already contain the capability and the gate is policy, not capability. If it differs in architecture or training data, then the open artifact is genuinely a different model. Mistral's announcement does not say which, and that distinction matters more than the parameter count.

For anyone building on open weights, the practical takeaway is to read the license before the model card. The license tells you what you can ship; the model card tells you what the vendor hopes you will ship. Modified MIT with a use restriction is closer to a commercial license than to the MIT most developers assume.

Sources:
- [Mistral Large 4 open weights](https://mistral.ai/news/mistral-large-4-oss/)
- [Le Chonk public preview](https://cnet.com/tech/services-and-software/anthropic-google-and-mistral-unveil-their-latest-ai-models-for-claude-sonnet-haiku-and-gemini)
