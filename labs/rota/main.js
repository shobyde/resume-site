import '../shared/lab.css';
import './theme.css';
import { mountChat } from '../shared/shell.js';
import { capabilities, state } from './capabilities.js';
import { createRotaEngine, demos } from './rules.js';
import { gridMessages } from './surfaces.js';

const engine = createRotaEngine(capabilities);

const lab = mountChat({
  capabilities,
  engine,
  getSnapshot: () => ({ currentRoute: '/labs/rota/', state }),
  persona: { name: 'the rota', mark: '▦' },
  stream: 'rota',
  streaming: { chunkChars: 14, paceMs: 13, leadInMs: 380 },
  pending: 'checking the week',
  patchReply: 'The week above carries that change now.',
  welcome:
    'Six people, fourteen shifts, three open. Ask for cover and I check skills, hours and the rest rule first: a refusal names the rule and the hours that failed it.',
  chips: demos,
  initial: () => gridMessages(),
  placeholder: 'Ask about the week, or press a chip',
  instructions:
    'Answer from the roster and the live assignment rows. Quote the rule that fails; never invent a person or a skill. The week after an assignment is the new row set.',
});

if (new URLSearchParams(location.search).has('debug')) {
  window.__rota = { engine, lab };
}
