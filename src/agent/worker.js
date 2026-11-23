// Worker entry for the on-device engine. Vite compiles this into its own chunk,
// so WebLLM is only fetched when a visitor asks for the model.
import 'client-agent/webllm/worker';
