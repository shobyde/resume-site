/* The module `boaz audit --module` loads for the Ledger lab.
   It exports the same capabilities and engine the page runs, so a probe
   measures the shipped decision path rather than a second wiring. */
import { capabilities } from '../../labs/ledger/capabilities.js';
import { answers, createLedgerEngine } from '../../labs/ledger/rules.js';

export { answers, capabilities };
export function createEngine() {
  return createLedgerEngine(capabilities);
}
