/* Development smoke for the Rota lab. `node bench/labs/smoke-rota.mjs [--approve]`. */
import { AgentRuntime, CapabilityRegistry } from '@shobyde/boaz/core';
import { capabilities, state } from '../../labs/rota/capabilities.js';
import { createRotaEngine } from '../../labs/rota/rules.js';

const registry = new CapabilityRegistry();
for (const capability of capabilities) registry.register(capability);
const engine = createRotaEngine(capabilities);
const approved = process.argv.includes('--approve');

const runtime = new AgentRuntime({
  engine,
  capabilities,
  registry,
  getSnapshot: () => ({ currentRoute: '/labs/rota/', state }),
  confirm: async () => approved,
  onEvent: (event) => {
    if (event.type !== 'step') return;
    const step = event.step;
    const bits = [step.type, step.capabilityId ?? '', step.goal ?? ''].filter(Boolean);
    if (step.type === 'surface') bits.push(`${step.messages.length} message(s)`);
    if (step.type === 'confirmation') bits.push(step.approved ? 'approved' : 'declined');
    if (step.type === 'error') bits.push(step.message);
    console.log(`   · ${bits.join(' ')}`);
  },
});

const questions = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const script = questions.length
  ? questions
  : [
      'where is the week short?',
      'who can cover saturday night?',
      'propose priya for saturday night',
      'propose ana for saturday night',
      'who is carrying the week?',
      'how much of the week is covered?',
      'what is the rest rule?',
    ];

for (const question of script) {
  const result = await runtime.send(question);
  console.log(`\nQ ${question}\nA ${result.text}\n  stopped: ${result.stoppedBy}`);
}
