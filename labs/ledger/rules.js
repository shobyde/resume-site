/* ============================================================
   Ledger · the reasoning.

   The knowledge base holds the book as facts; the answer rules join
   them and compose a sentence from the rows they bound. Money is a
   string in a fact and a number in the sentence, so no arithmetic is
   hidden inside the engine: `compose` gets the solutions and does the
   sum where a reader can see it.

   Actions append facts (`reminded`, `settled`) instead of mutating
   the base, so "who did we chase?" is a query over the same record
   the page draws.
   ============================================================ */

import { KnowledgeBase, createRulesEngine, fact } from '@shobyde/boaz/rules';
import { CUSTOMERS, debtors, invoices, money, byId } from './data.js';
import { debtorMessages } from './surfaces.js';

const STATUSES = ['open', 'overdue', 'paid'];
const SEGMENTS = [...new Set(CUSTOMERS.map((customer) => customer.segment))];

export const knowledge = new KnowledgeBase({
  facts: [
    ...invoices.map((invoice) =>
      fact(
        'invoice',
        invoice.id,
        invoice.customer,
        invoice.status,
        String(invoice.amount),
        String(invoice.daysLate),
        String(invoice.terms),
      ),
    ),
    ...CUSTOMERS.map((customer) => fact('account', customer.name, customer.segment, customer.contact)),
  ],
  rules: [
    'unpaid_status(?I, ?C, open, ?A, ?D) :- invoice(?I, ?C, open, ?A, ?D, ?T).',
    'unpaid_status(?I, ?C, overdue, ?A, ?D) :- invoice(?I, ?C, overdue, ?A, ?D, ?T).',
    'overdue_only(?I, ?C, overdue, ?A, ?D) :- invoice(?I, ?C, overdue, ?A, ?D, ?T).',
    'counted(?I, ?C, ?S, ?A, ?D) :- invoice(?I, ?C, ?S, ?A, ?D, ?T).',
  ],
});

export const LEDGER_CONSTANTS = [
  ...STATUSES,
  ...SEGMENTS,
  ...CUSTOMERS.map((customer) => customer.name),
  ...CUSTOMERS.map((customer) => customer.contact),
];

const bindingsOf = (solution) => solution.bindings ?? solution;

const live = (solution) => byId(bindingsOf(solution)['?I']);

const sum = (rows) => rows.reduce((total, row) => total + row.amount, 0);

const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

function moneyThreshold(query) {
  const match = /(?:under|below|less than|up to)\s*\$?\s*([\d,.]+)\s*(k|thousand)?/i.exec(query);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(value) || value <= 0) return null;
  return match[2] ? value * 1000 : value;
}

const ASKS_WHO = /\b(who|which customer)\b/i;
const ASKS_COUNT = /\bhow many\b/i;

export const answers = [
  {
    id: 'ledger.overdue_total',
    title: 'How much is outstanding',
    keywords: [
      'how much is overdue',
      'total outstanding',
      'how much do we have outstanding',
      'receivables',
      'total owed',
      'what is unpaid',
    ],
    goal: 'unpaid_status(?I, ?C, ?S, ?A, ?D)',
    requiresSubject: false,
    threshold: 6,
    match: (query) =>
      /\b(how much|total|outstanding|receivables|owed|unpaid)\b/i.test(query) &&
      !ASKS_WHO.test(query) &&
      !ASKS_COUNT.test(query) &&
      !/\b(which|list|show)\b/i.test(query) &&
      moneyThreshold(query) === null &&
      !/\b(remind|reminded|reminder)\b/i.test(query),
    explain: ({ solutions }) => `Joined ${solutions.length} unpaid invoice rows and summed the amounts in the app.`,
    compose: ({ solutions }) => {
      const rows = solutions.map(live).filter((row) => row && row.status !== 'paid');
      if (rows.length === 0) return 'Nothing is unpaid in this book.';
      const overdue = rows.filter((row) => row.status === 'overdue');
      const oldest = [...overdue].sort((a, b) => b.daysLate - a.daysLate)[0];
      const total = sum(rows);
      if (!oldest) {
        return `${plural(rows.length, 'invoice')} still unpaid, worth ${money(total)}. Nothing is past its terms yet.`;
      }
      return (
        `${plural(rows.length, 'invoice')} still unpaid, worth ${money(total)}. ` +
        `${money(sum(overdue))} is overdue across ${overdue.length}; the oldest is ${oldest.id} ` +
        `(${oldest.customer}, ${money(oldest.amount)}), ${oldest.daysLate} days late.`
      );
    },
  },
  {
    id: 'ledger.biggest_debtor',
    title: 'Who owes the most',
    keywords: ['who owes the most', 'biggest debtor', 'largest balance', 'which customer owes', 'top debtors'],
    goal: 'unpaid_status(?I, ?C, ?S, ?A, ?D)',
    requiresSubject: false,
    threshold: 6,
    match: (query) => ASKS_WHO.test(query) && /\b(owe|owes|debt|balance|behind)\b/i.test(query),
    explain: ({ solutions }) => `Grouped ${solutions.length} unpaid rows by customer and ranked the sums.`,
    compose: ({ solutions }) => {
      const rows = solutions.map(live).filter((row) => row && row.status !== 'paid');
      if (rows.length === 0) return 'Nobody owes anything in this book.';
      const ranked = debtors().slice(0, 3);
      const leader = ranked[0];
      const rest = ranked
        .slice(1)
        .map((entry) => `${entry.customer} (${money(entry.sum)})`)
        .join(', ');
      const late = leader.oldest > 0 ? `, the older invoice ${leader.oldest} days late` : '';
      return `${leader.customer} owes the most: ${money(leader.sum)} across ${leader.count} invoice${leader.count === 1 ? '' : 's'}${late}. ${rest ? `Behind them: ${rest}.` : ''}`;
    },
  },
  {
    id: 'ledger.oldest_overdue',
    title: 'What has been waiting longest',
    keywords: ['oldest invoice', 'longest overdue', 'most overdue', 'which one has been waiting', 'oldest unpaid'],
    goal: 'overdue_only(?I, ?C, ?S, ?A, ?D)',
    requiresSubject: false,
    threshold: 6,
    match: (query) => /\b(oldest|longest|most overdue|been waiting|sitting)\b/i.test(query),
    explain: ({ solutions }) => `Compared the age of ${solutions.length} overdue rows.`,
    compose: ({ solutions }) => {
      const rows = solutions.map(live).filter((row) => row && row.status === 'overdue');
      if (rows.length === 0) return 'Nothing is overdue.';
      const ranked = [...rows].sort((a, b) => b.daysLate - a.daysLate);
      const [first, second] = ranked;
      const tail = second ? ` Next: ${second.id} ${second.customer}, ${second.daysLate} days.` : '';
      return `${first.id} has been waiting longest: ${first.customer}, ${money(first.amount)}, ${first.daysLate} days late (due ${first.due}).${tail}`;
    },
  },
  {
    id: 'ledger.count_status',
    title: 'How many invoices are in each state',
    keywords: ['how many are overdue', 'how many invoices', 'count the invoices', 'how many unpaid', 'number of invoices'],
    goal: 'counted(?I, ?C, ?S, ?A, ?D)',
    requiresSubject: false,
    threshold: 6,
    match: (query) => ASKS_COUNT.test(query),
    explain: ({ solutions, terms }) => {
      const wanted = terms.filter((term) => STATUSES.includes(term.toLowerCase()));
      return wanted.length
        ? `Counted the rows whose status the question named (${wanted.join(', ')}).`
        : 'Counted every row in the book and split it by status.';
    },
    compose: ({ solutions, terms }) => {
      const wanted = terms.map((term) => term.toLowerCase()).filter((term) => STATUSES.includes(term));
      const rows = solutions
        .map(live)
        .filter((row) => row && (wanted.length === 0 || wanted.includes(row.status)));
      if (rows.length === 0) return '';
      if (wanted.length === 1 && wanted[0] === 'overdue') {
        return `${plural(rows.length, 'invoice')} ${rows.length === 1 ? 'is' : 'are'} overdue, worth ${money(sum(rows))}.`;
      }
      const byStatus = STATUSES.map((status) => [status, rows.filter((row) => row.status === status)]);
      const parts = byStatus
        .filter(([, list]) => list.length > 0)
        .map(([status, list]) => `${list.length} ${status === 'paid' ? 'settled' : status}`);
      return `${plural(rows.length, 'invoice')}: ${parts.join(', ')}. ${money(sum(rows))} in total.`;
    },
  },
  {
    id: 'ledger.threshold',
    title: 'Which invoices are under an amount',
    keywords: ['under two thousand', 'below', 'less than', 'small invoices', 'under a thousand'],
    goal: 'unpaid_status(?I, ?C, ?S, ?A, ?D)',
    requiresSubject: false,
    threshold: 6,
    match: (query) => /\b(under|below|less than|up to)\b/i.test(query) && moneyThreshold(query) !== null,
    explain: ({ solutions, query }) => {
      const threshold = moneyThreshold(query);
      return `Kept the ${solutions.length} unpaid rows at or under $${threshold.toLocaleString('en-US')}.`;
    },
    compose: ({ solutions, query }) => {
      const threshold = moneyThreshold(query);
      if (threshold === null) return '';
      const overdueOnly = /\boverdue\b/i.test(query);
      const rows = solutions
        .map(live)
        .filter((row) => row && row.status !== 'paid' && row.amount <= threshold && (!overdueOnly || row.status === 'overdue'))
        .sort((a, b) => a.amount - b.amount);
      if (rows.length === 0) return `No unpaid invoice is ${money(threshold)} or less.`;
      const listed = rows
        .slice(0, 6)
        .map((row) => `${row.id} (${row.customer}, ${money(row.amount)})`)
        .join(', ');
      const more = rows.length > 6 ? `, and ${rows.length - 6} more` : '';
      return `${plural(rows.length, 'unpaid invoice')} at or under ${money(threshold)}: ${listed}${more}. ${money(sum(rows))} in total.`;
    },
  },
  {
    id: 'ledger.reminded',
    title: 'What was reminded this session',
    keywords: ['who did you remind', 'what did you remind', 'which invoices were reminded', 'reminder log'],
    goal: 'reminded(?I, ?C, ?A, ?D)',
    requiresSubject: false,
    threshold: 6,
    match: (query) =>
      /\b(remind|reminded|reminder|chased|followed up)\b/i.test(query) &&
      /\b(who|what|which|did|have|any|log)\b/i.test(query) &&
      !/^\s*(remind|chase|send|draft)\b/i.test(query),
    explain: ({ solutions }) => `Read the reminder facts this session appended (${solutions.length}).`,
    compose: ({ solutions, query }) => {
      // "Remind the overdue accounts" is an instruction, not a question: leave it
      // to the capability that owns the write.
      if (/^\s*(remind|chase|send|draft|follow up)\b/i.test(query)) return '';
      if (solutions.length === 0) return 'Nothing has been reminded this session.';
      const rows = solutions
        .map((solution) => bindingsOf(solution))
        .map((bindings) => ({ id: bindings['?I'], customer: bindings['?C'], late: Number(bindings['?D']) }))
        .sort((a, b) => b.late - a.late);
      const listed = rows.slice(0, 5).map((row) => `${row.id} (${row.customer})`).join(', ');
      const more = rows.length > 5 ? `, and ${rows.length - 5} more` : '';
      return `${plural(rows.length, 'reminder')} queued this session: ${listed}${more}. They are logged in the book; nothing was sent.`;
    },
  },
];

export const demos = [
  { label: 'How much is overdue?', ask: 'How much is overdue?' },
  { label: 'Who owes the most?', ask: 'Who owes the most?' },
  { label: 'Oldest overdue invoice', ask: 'Which invoice has been waiting longest?' },
  { label: 'Overdue under $2,500', ask: 'Which overdue invoices are under $2,500?' },
  { label: 'Show the overdue book', ask: 'Show the overdue book' },
  { label: 'Remind the overdue accounts', ask: 'Remind the overdue accounts' },
  { label: 'What did you remind?', ask: 'Who did you remind?' },
];

export function createLedgerEngine(capabilities) {
  return createRulesEngine({
    knowledge,
    answers,
    capabilities,
    constants: LEDGER_CONSTANTS,
    threshold: 6,
  });
}

