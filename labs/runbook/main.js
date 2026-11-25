import '../shared/lab.css';
import { createRulesEngine, KnowledgeBase } from '@shobyde/boaz/rules';
import { mountLab } from '../shared/shell.js';
import { createCapabilities, state } from './capabilities.js';
import { recapMessages } from './surfaces.js';

let lab;
const capabilities = createCapabilities({ getRuntime: () => lab.runtime });
const engine = createRulesEngine({
  knowledge: new KnowledgeBase(),
  answers: [],
  capabilities,
});

lab = mountLab({
  capabilities,
  engine,
  getSnapshot: () => ({ currentRoute: '/labs/runbook/', state }),
  welcome: 'Pick a symptom, or press a chip. The checks run in order and the canvas fills in as they return.',
  chips: [
    { label: 'The build is failing on CI', ask: 'The build is failing on CI' },
    { label: 'The tests are flaky', ask: 'The tests are flaky' },
    { label: 'The site 500s after deploy', ask: 'The site 500s after deploy' },
    { label: 'Deploys got slow', ask: 'Deploys got slow' },
    { label: 'What do we know?', ask: 'What do we know?' },
    { label: 'How does this work?', ask: 'How does this work?' },
  ],
  initial: () => recapMessages(state),
  placeholder: 'The build is failing on CI',
  instructions:
    'Walk the declared skill. Name the check that produced each statement, and stop when the stop condition fires instead of guessing a cause.',
});

if (new URLSearchParams(location.search).has('debug')) {
  window.__runbook = { engine, lab, state };
}
