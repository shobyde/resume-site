/* ============================================================
   Ledger · surfaces.

   Pure functions: rows in, A2UI 1.0 messages out. The table binds
   every cell through the data model, which is what lets a reminder
   patch one path per row instead of replacing the screen.
   ============================================================ */

import { CUSTOMERS, debtors, invoices, money, totals, view, byId, REFERENCE_DATE } from './data.js';
import {
  Button,
  Bound,
  Card,
  Column,
  Divider,
  Row,
  Text,
  createSurface,
  updateDataModel,
} from '../shared/a2ui-builders.js';

export const LEDGER_BOOK = 'ledger_book';

const statusWord = (invoice) => {
  if (invoice.status === 'paid') return '✓ settled';
  const base = invoice.status === 'overdue' ? `▲ ${invoice.daysLate}d late` : '● open';
  return invoice.remindedAt ? `${base} · reminded` : base;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 2026-10-02 reads as 2 Oct in a table cell; the reference year is fixed. */
const shortDate = (iso) => {
  const [, month, day] = String(iso).split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1]}`;
};

const ageWord = (invoice) => {
  if (invoice.status === 'paid') return `settled ${shortDate(invoice.paidOn)}`;
  return `due ${shortDate(invoice.due)}`;
};

const rowModel = (invoice) => ({
  label: `${invoice.id} · ${invoice.customer}`,
  amount: money(invoice.amount),
  age: ageWord(invoice),
  status: statusWord(invoice),
});

/** The order the last table rendered, so a patch can name a row by id. */
let lastRows = [];
let lastKind = 'brief';

const unpaidSum = () => invoices.filter((invoice) => invoice.status !== 'paid').reduce((sum, invoice) => sum + invoice.amount, 0);

function statCell(index, value, caption) {
  return Column(`stat_${index}`, [
    Bound(`stat_${index}_value`, `/meta/stats/${index}/value`, { variant: 'h4' }),
    Bound(`stat_${index}_caption`, `/meta/stats/${index}/caption`, { variant: 'caption' }),
  ]);
}

function tableRow(index, invoice) {
  const children = [
    Bound(`row_${index}_label`, `/rows/${index}/label`),
    Bound(`row_${index}_amount`, `/rows/${index}/amount`),
    Bound(`row_${index}_age`, `/rows/${index}/age`),
    Bound(`row_${index}_status`, `/rows/${index}/status`),
  ];
  if (invoice.status !== 'paid') {
    children.push(Button(`row_${index}_settle`, 'Settle', 'ledger.settle', { invoice: invoice.id }));
  } else {
    children.push(Text(`row_${index}_done`, '—', { variant: 'caption' }));
  }
  return Row(`row_${index}`, children);
}

/**
 * The receivables table. `rows` defaults to the live view; a rule can pass
 * the exact rows it bound, which is how asking a question puts its own
 * evidence on the canvas.
 */
export function tableMessages(options = {}) {
  const {
    rows = null,
    status = 'all',
    sort = 'age',
    title = 'The book',
    sub = null,
    note = '',
    filterable = true,
  } = options;

  const tableRows = rows ?? view(status, sort);
  const summary = totals(status);
  lastRows = tableRows.map((invoice) => invoice.id);
  lastKind = 'table';

  const stats = [
    { value: money(tableRows.reduce((sum, invoice) => sum + invoice.amount, 0)), caption: `${tableRows.length} invoices shown` },
    { value: money(unpaidSum()), caption: 'unpaid in the book' },
    {
      value: summary.oldest ? `${summary.oldest.daysLate}d` : '0d',
      caption: summary.oldest ? `oldest · ${summary.oldest.id}` : 'nothing overdue',
    },
  ];

  const components = [
    Column('root', ['head', 'toolbar', 'table_card', 'note']),
    Column('head', [
      Text('title', title, { variant: 'h2' }),
      Text('sub', sub ?? `${CUSTOMERS.length} accounts · book dated ${REFERENCE_DATE}`),
      Row('stats', stats.map((_, index) => statCell(index, stats[index].value, stats[index].caption))),
    ]),
    Row(
      'toolbar',
      filterable
        ? [
            Button('filter_all', 'All', 'ledger.view', { status: 'all' }),
            Button('filter_open', 'Open', 'ledger.view', { status: 'open' }),
            Button('filter_overdue', 'Overdue', 'ledger.view', { status: 'overdue' }),
            Button('filter_paid', 'Settled', 'ledger.view', { status: 'paid' }),
          ]
        : [Text('filter_note', 'Rows bound by the rule', { variant: 'caption' })],
    ),
    Card('table_card', 'table'),
    Column('table', [
      'table_head',
      ...tableRows.map((_, index) => `row_${index}`),
    ]),
    Row('table_head', [
      Text('th_what', 'Invoice · customer', { variant: 'caption' }),
      Text('th_amount', 'Amount', { variant: 'caption' }),
      Text('th_age', 'Due', { variant: 'caption' }),
      Text('th_status', 'Status', { variant: 'caption' }),
      Text('th_action', 'Action', { variant: 'caption' }),
    ]),
    ...tableRows.map((invoice, index) => tableRow(index, invoice)),
    Bound('note', '/meta/note', { variant: 'caption' }),
  ];

  return [
    createSurface(LEDGER_BOOK, components, {
      meta: { stats, note },
      rows: tableRows.map(rowModel),
    }),
  ];
}

/** The unasked view: what the book looks like before a question. */
export function briefMessages() {
  const summary = totals('all');
  const overdue = totals('overdue');
  const ranked = debtors().slice(0, 3);
  const atRisk = overdue.oldest;
  lastRows = [];
  lastKind = 'brief';

  const components = [
    Column('root', ['head', 'stats', 'divider', 'risk', 'actions', 'note']),
    Column('head', [
      Text('title', 'The book, as it stands', { variant: 'h2' }),
      Text('sub', `${summary.count} invoices · ${money(summary.sum)} billed · reference date ${REFERENCE_DATE}`),
    ]),
    Row('stats', [
      Column('stat_a', [
        Text('stat_a_value', money(unpaidSum()), { variant: 'h4' }),
        Text('stat_a_caption', 'still unpaid', { variant: 'caption' }),
      ]),
      Column('stat_b', [
        Text('stat_b_value', money(overdue.overdueSum), { variant: 'h4' }),
        Text('stat_b_caption', `${overdue.overdueCount} invoices overdue`, { variant: 'caption' }),
      ]),
      Column('stat_c', [
        Text('stat_c_value', atRisk ? `${atRisk.daysLate}d` : '0d', { variant: 'h4' }),
        Text('stat_c_caption', atRisk ? `oldest · ${atRisk.id}` : 'nothing overdue', { variant: 'caption' }),
      ]),
      Column('stat_d', [
        Text('stat_d_value', ranked[0] ? money(ranked[0].sum) : '$0', { variant: 'h4' }),
        Text('stat_d_caption', ranked[0] ? `largest · ${ranked[0].customer}` : 'no open balance', { variant: 'caption' }),
      ]),
    ]),
    Divider('divider'),
    Card('risk', 'risk_body'),
    Column('risk_body', [
      Text('risk_kicker', 'Largest open balances', { variant: 'caption' }),
      ...ranked.map((entry, index) =>
        Text(`risk_${index}`, `${index + 1}. ${entry.customer} · ${money(entry.sum)} across ${entry.count} invoice${entry.count === 1 ? '' : 's'}`),
      ),
      Text('risk_note', 'Ask a question and the answer arrives as this table, with the rows it bound underneath it.', { variant: 'caption' }),
    ]),
    Row('actions', [
      Button('open_overdue', 'Open the overdue book', 'ledger.view', { status: 'overdue' }),
      Button('open_debtors', 'Who owes the most', 'ledger.debtors', {}),
      Button('draft_reminders', 'Draft reminders', 'ledger.remind', { status: 'overdue' }),
    ]),
    Text('note', 'Nothing is sent. A reminder is recorded in the book, not in a mailbox.', { variant: 'caption' }),
  ];

  return [createSurface(LEDGER_BOOK, components, {})];
}

/** Ranked customers, with a bar drawn from block characters. */
export function debtorMessages(note = 'Open balance by customer · live') {
  const ranked = debtors();
  const top = ranked[0]?.sum ?? 1;
  lastRows = [];
  lastKind = 'debtors';

  const components = [
    Column('root', ['head', 'list', 'note']),
    Column('head', [
      Text('title', 'Who owes the most', { variant: 'h2' }),
      Text('sub', `${ranked.length} accounts with an open balance · ${money(ranked.reduce((sum, entry) => sum + entry.sum, 0))} outstanding`),
    ]),
    Column('list', ranked.map((_, index) => `debtor_${index}`)),
    ...ranked.map((entry, index) => Card(`debtor_${index}`, `debtor_body_${index}`)),
    ...ranked.map((entry, index) =>
      Column(`debtor_body_${index}`, [
        Row(`debtor_row_${index}`, [
          Text(`debtor_name_${index}`, `${index + 1}. ${entry.customer}`),
          Text(`debtor_sum_${index}`, money(entry.sum)),
        ]),
        Text(`debtor_meta_${index}`, `${entry.count} invoice${entry.count === 1 ? '' : 's'} · oldest ${entry.oldest} days`, { variant: 'caption' }),
        Text(`debtor_bar_${index}`, '▇'.repeat(Math.max(1, Math.round((entry.sum / top) * 22))), { variant: 'caption' }),
      ]),
    ),
    Text('note', note, { variant: 'caption' }),
  ];

  return [createSurface(LEDGER_BOOK, components, {})];
}

/**
 * Binds a rule's solutions to the rows they named. Returns null when the rule
 * was prose without rows, so the canvas keeps what it had.
 */
export function solutionMessages(ruleId, solutions, query = '') {
  const ids = [...new Set(solutions.map((solution) => solution['?I']).filter(Boolean))];
  if (ids.length === 0) return null;
  if (ruleId === 'ledger.biggest_debtor') {
    return debtorMessages('Ranked by open balance · the rows the rule summed');
  }
  const overdueOnly = ruleId === 'ledger.oldest_overdue' || /\boverdue\b/i.test(query);
  const rows = ids
    .map((id) => byId(id))
    .filter((row) => row && (!overdueOnly || row.status === 'overdue'));
  if (rows.length === 0) return null;
  const filtered = overdueOnly && rows.length !== ids.length;
  return tableMessages({
    rows,
    title: 'The rows behind that answer',
    sub: filtered
      ? `${rows.length} of the ${ids.length} rows it bound · filtered to overdue · ${money(rows.reduce((sum, row) => sum + row.amount, 0))}`
      : `${rows.length} invoice${rows.length === 1 ? '' : 's'} · ${money(rows.reduce((sum, row) => sum + row.amount, 0))} · read to compose the reply above`,
    note: `${ruleId} · every cell came from the rows in the trace, not from a guess`,
    filterable: false,
  });
}

/**
 * In-place patch: a reminder changes one bound path per row plus the note.
 * The table's structure (filters, buttons) stays exactly as it was.
 */
export function reminderPatch(ids, summary) {
  if (lastKind !== 'table') return null;
  const messages = [updateDataModel(LEDGER_BOOK, '/meta/note', summary)];
  for (const id of ids) {
    const index = lastRows.indexOf(id);
    if (index === -1) continue;
    const invoice = byId(id);
    if (!invoice) continue;
    messages.push(updateDataModel(LEDGER_BOOK, `/rows/${index}/status`, statusWord(invoice)));
  }
  return messages;
}
