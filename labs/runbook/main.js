import '../shared/lab.css';
import './theme.css';
import { createRulesEngine, KnowledgeBase } from '@shobyde/boaz/rules';
import { mountChat } from '../shared/shell.js';
import { createCapabilities, state } from './capabilities.js';
import { recapMessages } from './surfaces.js';

let lab;
const capabilities = createCapabilities({ getRuntime: () => lab.runtime });
const engine = createRulesEngine({
  knowledge: new KnowledgeBase(),
  answers: [],
  capabilities,
});

lab = mountChat({
  capabilities,
  engine,
  getSnapshot: () => ({ currentRoute: '/labs/runbook/', state }),
  persona: { name: 'runbook', mark: '›' },
  stream: 'runbook',
  streaming: { chunkChars: 26, paceMs: 7, leadInMs: 240 },
  pending: 'walking the checks',
  patchReply: 'The checklist above carries that change now.',
  welcome:
    'Pick a symptom, or press a chip. I walk the declared checks in order and write the checklist into the reply as each one returns; a thin result gets a stop, not a guess.',
  chips: [
    { label: 'The build is failing on CI', ask: 'The build is failing on CI' },
    { label: 'The tests are flaky', ask: 'The tests are flaky' },
    { label: 'The site 500s after deploy', ask: 'The site 500s after deploy' },
    { label: 'Deploys got slow', ask: 'Deploys got slow' },
    { label: 'What do we know?', ask: 'What do we know?' },
    { label: 'How does this work?', ask: 'How does this work?' },
  ],
  initial: () => recapMessages(state),
  placeholder: 'Describe a symptom, or press a chip',
  instructions:
    'Walk the declared skill. Name the check that produced each statement, and stop when the stop condition fires instead of guessing a cause.',
});

if (new URLSearchParams(location.search).has('debug')) {
  window.__runbook = { engine, lab, state };
}
