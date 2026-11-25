import '../shared/lab.css';
import { mountLab } from '../shared/shell.js';
import { capabilities, state } from './capabilities.js';
import { createRotaEngine, demos } from './rules.js';
import { gridMessages } from './surfaces.js';

const engine = createRotaEngine(capabilities);

const lab = mountLab({
  capabilities,
  engine,
  getSnapshot: () => ({ currentRoute: '/labs/rota/', state }),
  welcome: 'Ask about the week, or press a chip. A refusal names the rule and the hours that failed it.',
  chips: demos,
  initial: () => gridMessages(),
  placeholder: 'Who can cover Saturday night?',
  instructions:
    'Answer from the roster and the live assignment rows. Quote the rule that fails; never invent a person or a skill. The week after an assignment is the new row set.',
});

if (new URLSearchParams(location.search).has('debug')) {
  window.__rota = { engine, lab };
}
