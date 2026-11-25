/* Development smoke for the three labs: sends real questions through the
   runtime and prints the decision (rule, call, surface) for each. Run with
   `node bench/labs/smoke.mjs`. Not part of the build; the probes are. */
import { AgentRuntime, CapabilityRegistry } from '@shobyde/boaz/core';
import { capabilities, state } from '../../labs/ledger/capabilities.js';
import { createLedgerEngine } from '../../labs/ledger/rules.js';

const registry = new CapabilityRegistry();
for (const capability of capabilities) registry.register(capability);
const engine = createLedgerEngine(capabilities);

let approved = process.argv.includes('--approve');
const runtime = new AgentRuntime({
  engine,
  capabilities,
  registry,
  getSnapshot: () => ({ currentRoute: '/labs/ledger/', state }),
  confirm: async () => approved,
  onEvent: (event) => {
    if (event.type !== 'step') return;
    const step = event.step;
    const bits = [step.type, step.capabilityId ?? '', step.goal ?? ''].filter(Boolean);
    if (step.type === 'surface') bits.push(`${step.messages.length} message(s)`);
    if (step.type === 'confirmation') bits.push(step.approved ? 'approved' : 'declined');
    console.log(`   · ${bits.join(' ')}`);
  },
});

const questions = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const script = questions.length
  ? questions
  : [
      'how much is overdue?',
      'who owes the most?',
      'which invoice has been waiting longest?',
      'how many invoices are overdue?',
      'which overdue invoices are under $2,500?',
      'show the overdue book',
      'remind the overdue accounts',
      'who did you remind?',
      'how does this work?',
    ];

for (const question of script) {
  const result = await runtime.send(question);
  console.log(`\nQ ${question}\nA ${result.text}\n  stopped: ${result.stoppedBy}`);
}
