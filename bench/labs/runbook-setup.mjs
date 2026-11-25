/* The module `boaz audit --module` loads for the Runbook lab.
   The capability factory needs a caller for `diagnose`, but routing never
   invokes it, so a throwing stub is enough here. */
import { createRulesEngine, KnowledgeBase } from '@shobyde/boaz/rules';
import { createCapabilities } from '../../labs/runbook/capabilities.js';

export const capabilities = createCapabilities({
  call: async () => {
    throw new Error('audit only measures routing');
  },
});

export function createEngine() {
  return createRulesEngine({ knowledge: new KnowledgeBase(), answers: [], capabilities });
}
