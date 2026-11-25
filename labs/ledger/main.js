import '../shared/lab.css';
import './theme.css';
import { mountChat } from '../shared/shell.js';
import { capabilities, state } from './capabilities.js';
import { createLedgerEngine, demos } from './rules.js';
import { briefMessages, solutionMessages } from './surfaces.js';

const engine = createLedgerEngine(capabilities);

const lab = mountChat({
  capabilities,
  engine,
  getSnapshot: () => ({ currentRoute: '/labs/ledger/', state }),
  persona: { name: 'the book', mark: '▤' },
  stream: 'ledger',
  streaming: { chunkChars: 7, paceMs: 24, leadInMs: 600 },
  pending: 'reading the rows',
  patchReply: 'The table above carries that change now.',
  welcome:
    'Twenty-four invoices, dated 2 October. Ask about the money, or press a chip: I answer from the rows and draw the table I read underneath the sentence.',
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
