import '../shared/lab.css';
import { mountLab } from '../shared/shell.js';
import { capabilities, state } from './capabilities.js';
import { createLedgerEngine, demos } from './rules.js';
import { briefMessages, solutionMessages } from './surfaces.js';

const engine = createLedgerEngine(capabilities);

const lab = mountLab({
  capabilities,
  engine,
  getSnapshot: () => ({ currentRoute: '/labs/ledger/', state }),
  welcome: 'Ask about the money, or press a chip. Every answer arrives with the rows it read.',
  chips: demos,
  initial: briefMessages,
  placeholder: 'Which invoices are overdue?',
  instructions:
    'Answer from the invoice facts only. Money is summed from the rows you bound; never estimate an amount. If a row is not in the book, say so.',
  renderInference: (step, question) => solutionMessages(step.capabilityId, step.solutions, question),
});

// ?debug=1 exposes the engine, so a stuck answer can be inspected without a rebuild.
if (new URLSearchParams(location.search).has('debug')) {
  window.__ledger = { engine, lab };
}
