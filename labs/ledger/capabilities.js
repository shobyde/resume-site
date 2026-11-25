/* ============================================================
   Ledger · what the assistant may do.

   Four capabilities, each with a schema the runtime enforces before
   the handler runs. The two writes are gated by confirmation; the two
   reads return surfaces. `defineCapability` fails fast on a bad
   declaration, which is what keeps the lab honest as it changes.
   ============================================================ */

import { defineCapability, defineKnowledge } from '@shobyde/boaz/core';
import { fact } from '@shobyde/boaz/rules';
import { invoices, markReminded, money, settle, view } from './data.js';
import { knowledge } from './rules.js';
import { debtorMessages, reminderPatch, tableMessages } from './surfaces.js';

export const state = { status: 'all', sort: 'age' };

const STATUS = ['all', 'open', 'overdue', 'paid', 'settled'];

const titleFor = (status) => {
  if (status === 'all') return 'The book';
  if (status === 'overdue') return 'Overdue';
  if (status === 'open') return 'Open, not yet due';
  return 'Settled';
};

const tableNote = (count, sort) =>
  `${count} row${count === 1 ? '' : 's'} · sorted by ${sort} · the only writes are Settle and Draft reminders`;

export const viewBook = defineCapability({
  id: 'ledger.view',
  kind: 'query',
  title: 'Show invoices by status',
  description:
    'Filters the invoice book to paid, open, overdue or all invoices, and shows the exact rows that match so the visitor can act on them.',
  keywords: ['show invoices', 'filter invoices', 'open invoices', 'settled invoices', 'invoice book', 'show the book', 'the book'],
  route: '/labs/ledger/',
  paramsSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: STATUS },
      sort: { type: 'string', enum: ['age', 'amount', 'customer'] },
    },
    required: ['status'],
    additionalProperties: false,
  },
  handler: async ({ status, sort = 'age' }) => {
    // "Settled" is how a person says paid; the rows keep one status value.
    const filter = status === 'settled' ? 'paid' : status;
    state.status = filter;
    state.sort = sort;
    const rows = view(filter, sort);
    return {
      surface: tableMessages({
        status: filter,
        sort,
        title: titleFor(filter),
        sub: `${rows.length} invoice${rows.length === 1 ? '' : 's'} · ${money(rows.reduce((sum, invoice) => sum + invoice.amount, 0))} · the book dated 2026-11-24`,
        note: tableNote(rows.length, sort),
      }),
    };
  },
});

export const debtors = defineCapability({
  id: 'ledger.debtors',
  kind: 'query',
  title: 'Rank customers by what they owe',
  description: 'Ranks every customer with an open balance, largest first, with the number of invoices and the oldest one behind each balance.',
  keywords: ['who owes the most', 'rank customers', 'debtor list', 'largest balance', 'open balance by customer'],
  route: '/labs/ledger/',
  paramsSchema: { type: 'object', properties: {}, additionalProperties: false },
  handler: async () => ({ surface: debtorMessages() }),
});

export const remind = defineCapability({
  id: 'ledger.remind',
  kind: 'action',
  title: 'Draft reminders',
  description:
    'Queues a payment reminder for every unpaid invoice in the chosen view and records it in the book. Nothing is emailed: the demo logs the reminder so it can be queried afterwards.',
  keywords: ['remind', 'remind overdue', 'remind the overdue accounts', 'draft reminders', 'chase', 'follow up', 'send reminders'],
  route: '/labs/ledger/',
  requiresConfirmation: true,
  paramsSchema: {
    type: 'object',
    properties: { status: { type: 'string', enum: STATUS } },
    required: ['status'],
    additionalProperties: false,
  },
  handler: async ({ status }) => {
    const targets = invoices.filter(
      (invoice) => (status === 'all' || invoice.status === status) && invoice.status !== 'paid' && !invoice.remindedAt,
    );
    if (targets.length === 0) {
      throw new Error('every invoice in that view has already been reminded');
    }
    const stamped = markReminded(targets.map((invoice) => invoice.id));
    for (const invoice of stamped) {
      knowledge.add(fact('reminded', invoice.id, invoice.customer, String(invoice.amount), String(invoice.daysLate)));
    }
    const total = stamped.reduce((sum, invoice) => sum + invoice.amount, 0);
    const note = `${stamped.length} reminder${stamped.length === 1 ? '' : 's'} queued · ${money(total)} · recorded in the book, not sent`;
    const patch = reminderPatch(stamped.map((invoice) => invoice.id), note);
    if (patch) return { surface: patch };
    return { surface: tableMessages({ status: state.status, sort: state.sort, note }) };
  },
});

export const settleInvoice = defineCapability({
  id: 'ledger.settle',
  kind: 'action',
  title: 'Settle an invoice',
  description:
    'Marks one invoice paid and updates the book in place. This changes the page’s own copy of the book, so the next question answers from the new state.',
  keywords: ['settle', 'mark paid', 'mark as paid', 'paid in full'],
  route: '/labs/ledger/',
  requiresConfirmation: true,
  paramsSchema: {
    type: 'object',
    properties: { invoice: { type: 'string', minLength: 4 } },
    required: ['invoice'],
    additionalProperties: false,
  },
  handler: async ({ invoice: id }) => {
    const invoice = settle(id);
    knowledge.add(fact('settled', invoice.id, invoice.customer, String(invoice.amount)));
    const note = `${invoice.id} settled · ${money(invoice.amount)} · ${money(
      invoices.filter((row) => row.status !== 'paid').reduce((sum, row) => sum + row.amount, 0),
    )} still unpaid`;
    return { surface: tableMessages({ status: state.status, sort: state.sort, note }) };
  },
});

export const howItWorks = defineKnowledge({
  id: 'ledger.how',
  title: 'How the ledger lab answers',
  description: 'Explains that the book is facts, the sentences come from rules, and the table is rendered from the rows the rule bound.',
  keywords: ['how does this work', 'where do the numbers come from', 'is this a model', 'how do you know'],
  route: '/labs/ledger/',
  knowledge:
    'The book is declared as facts — one row per invoice with its customer, status, amount and age. A question is joined against those facts by a rule, the sentence is composed from the rows that matched, and the same rows are rendered as an A2UI surface. There is no model and no network: if a row is not in the book, the answer cannot mention it. The Settle and Draft reminders buttons are the only writes, and both ask first.',
});

export const capabilities = [viewBook, debtors, remind, settleInvoice, howItWorks];
