/* Development smoke for the Runbook lab. `node bench/labs/smoke-runbook.mjs [--approve]`. */
import { AgentRuntime, CapabilityRegistry } from '@shobyde/boaz/core';
import { createRulesEngine, KnowledgeBase } from '@shobyde/boaz/rules';
import { createCapabilities, state } from '../../labs/runbook/capabilities.js';

const registry = new CapabilityRegistry();
let runtime;
const capabilities = createCapabilities({ call: (id, args) => runtime.runCapability(id, args) });
for (const capability of capabilities) registry.register(capability);
const engine = createRulesEngine({ knowledge: new KnowledgeBase(), answers: [], capabilities });
const approved = process.argv.includes('--approve');

runtime = new AgentRuntime({
  engine,
  capabilities,
  registry,
  getSnapshot: () => ({ currentRoute: '/labs/runbook/', state }),
  confirm: async () => approved,
  onEvent: (event) => {
    if (event.type !== 'step') return;
    const step = event.step;
    const bits = [step.type, step.capabilityId ?? ''].filter(Boolean);
    if (step.type === 'surface') bits.push(`${step.messages.length} message(s)`);
    if (step.type === 'confirmation') bits.push(step.approved ? 'approved' : 'declined');
    if (step.type === 'error') bits.push(step.message);
    console.log(`   · ${bits.join(' ')}`);
  },
});

const questions = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const script = questions.length ? questions : ['The build is failing on CI'];

for (const question of script) {
  const result = await runtime.send(question);
  console.log(`\nQ ${question}\nA ${result.text}\n  stopped: ${result.stoppedBy}`);
}

console.log('\n--- run the build skill ---');
let run = await runtime.runCapability('runbook.diagnose', { symptom: 'build-fails' });
console.log('ok', run.ok, 'steps', run.steps.map((step) => step.type).join(', '));

console.log('\n--- flaky skill (expected stop) ---');
run = await runtime.runCapability('runbook.diagnose', { symptom: 'tests-flaky' });
console.log('ok', run.ok, 'steps', run.steps.map((step) => step.type).join(', '));
console.log('stopped', JSON.stringify(state.run?.run?.stopped));

console.log('\n--- recap ---');
const recap = await runtime.send('what do we know?');
console.log('A', recap.text || '(surface)');
console.log('state', JSON.stringify({ symptom: state.symptom, applied: state.applied, results: Object.keys(state.results) }));
