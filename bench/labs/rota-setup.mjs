/* The module `boaz audit --module` loads for the Rota lab. */
import { capabilities } from '../../labs/rota/capabilities.js';
import { answers, createRotaEngine } from '../../labs/rota/rules.js';

export { answers, capabilities };
export function createEngine() {
  return createRotaEngine(capabilities);
}
