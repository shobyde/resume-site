/* ============================================================
   Ledger · the book.

   A fictional studio's receivables, fixed to one reference date so
   every answer on the page is reproducible. Nothing here talks to a
   network: the whole lab is rows, rules and a renderer.

   The arrays are mutable on purpose. A settling action appends a fact
   ("settled") and changes the row, so the assistant can answer for the
   book as it stands now rather than as it was at load.
   ============================================================ */

export const REFERENCE_DATE = '2026-11-24';
export const STUDIO = {
  name: 'Fieldnote Studio',
  book: 'Receivables · FY26 Q4',
  owner: 'R. Okonkwo',
};

export const CUSTOMERS = [
  { name: 'Meridian Health', segment: 'healthcare', contact: 'Dana Whitfield', email: 'ap@meridianhealth.example', city: 'Portland' },
  { name: 'Ardent Freight', segment: 'logistics', contact: 'Luis Ortega', email: 'billing@ardentfreight.example', city: 'El Paso' },
  { name: 'Vesper Audio', segment: 'hardware', contact: 'Ruth Kim', email: 'ruth@vesperaudio.example', city: 'Boulder' },
  { name: 'Northwind Analytics', segment: 'saas', contact: 'Priya Shah', email: 'finance@northwind.example', city: 'Chicago' },
  { name: 'Copperline Studio', segment: 'agency', contact: 'Mateo Silva', email: 'accounts@copperline.example', city: 'Austin' },
  { name: 'Halcyon Labs', segment: 'biotech', contact: 'Ada Chen', email: 'ap@halcyonlabs.example', city: 'San Diego' },
  { name: 'Fieldstone Co-op', segment: 'retail', contact: 'Nora Bell', email: 'nora@fieldstone.example', city: 'Burlington' },
  { name: 'Beacon Municipal', segment: 'public', contact: 'Greg Halloran', email: 'ap@beaconmunicipal.example', city: 'Providence' },
  { name: 'Tidelift Marine', segment: 'shipping', contact: 'Yusuf Adeyemi', email: 'accounts@tidelift.example', city: 'Norfolk' },
  { name: 'Orchard & Vine', segment: 'food', contact: 'Camille Roux', email: 'camille@orchardvine.example', city: 'Napa' },
];

/** issued is the send date; terms is days to pay. paidOn is null until settled. */
export const INVOICES = [
  { id: 'INV-2031', customer: 'Meridian Health', amount: 9600, issued: '2026-09-12', terms: 30, paidOn: null },
  { id: 'INV-2032', customer: 'Vesper Audio', amount: 560, issued: '2026-09-02', terms: 30, paidOn: null },
  { id: 'INV-2033', customer: 'Ardent Freight', amount: 3120, issued: '2026-09-18', terms: 45, paidOn: null },
  { id: 'INV-2034', customer: 'Northwind Analytics', amount: 14800, issued: '2026-10-01', terms: 30, paidOn: null },
  { id: 'INV-2035', customer: 'Copperline Studio', amount: 2400, issued: '2026-10-06', terms: 15, paidOn: null },
  { id: 'INV-2036', customer: 'Fieldstone Co-op', amount: 6800, issued: '2026-09-25', terms: 45, paidOn: null },
  { id: 'INV-2037', customer: 'Tidelift Marine', amount: 1450, issued: '2026-10-10', terms: 30, paidOn: null },
  { id: 'INV-2038', customer: 'Meridian Health', amount: 7600, issued: '2026-10-28', terms: 30, paidOn: null },
  { id: 'INV-2039', customer: 'Northwind Analytics', amount: 3200, issued: '2026-10-30', terms: 30, paidOn: null },
  { id: 'INV-2040', customer: 'Orchard & Vine', amount: 4200, issued: '2026-11-02', terms: 30, paidOn: null },
  { id: 'INV-2041', customer: 'Halcyon Labs', amount: 9800, issued: '2026-11-05', terms: 30, paidOn: null },
  { id: 'INV-2042', customer: 'Beacon Municipal', amount: 5400, issued: '2026-10-20', terms: 45, paidOn: null },
  { id: 'INV-2043', customer: 'Copperline Studio', amount: 1250, issued: '2026-11-10', terms: 15, paidOn: null },
  { id: 'INV-2044', customer: 'Ardent Freight', amount: 4800, issued: '2026-11-12', terms: 30, paidOn: null },
  { id: 'INV-2045', customer: 'Vesper Audio', amount: 890, issued: '2026-11-14', terms: 15, paidOn: null },
  { id: 'INV-2046', customer: 'Meridian Health', amount: 2100, issued: '2026-08-20', terms: 30, paidOn: '2026-09-15' },
  { id: 'INV-2047', customer: 'Northwind Analytics', amount: 6300, issued: '2026-09-01', terms: 30, paidOn: '2026-09-28' },
  { id: 'INV-2048', customer: 'Copperline Studio', amount: 4800, issued: '2026-08-28', terms: 45, paidOn: '2026-10-10' },
  { id: 'INV-2049', customer: 'Halcyon Labs', amount: 11200, issued: '2026-07-15', terms: 45, paidOn: '2026-08-26' },
  { id: 'INV-2050', customer: 'Fieldstone Co-op', amount: 940, issued: '2026-09-30', terms: 15, paidOn: '2026-10-12' },
  { id: 'INV-2051', customer: 'Beacon Municipal', amount: 2700, issued: '2026-10-05', terms: 30, paidOn: '2026-11-03' },
  { id: 'INV-2052', customer: 'Orchard & Vine', amount: 3600, issued: '2026-10-12', terms: 15, paidOn: '2026-10-26' },
  { id: 'INV-2053', customer: 'Tidelift Marine', amount: 5900, issued: '2026-10-18', terms: 30, paidOn: '2026-11-16' },
  { id: 'INV-2054', customer: 'Ardent Freight', amount: 8200, issued: '2026-10-22', terms: 30, paidOn: '2026-11-19' },
];

const DAY = 86_400_000;
const asDate = (iso) => new Date(`${iso}T00:00:00Z`);
export const daysBetween = (from, to) => Math.round((asDate(to) - asDate(from)) / DAY);
export const addDays = (iso, days) => new Date(asDate(iso).getTime() + days * DAY).toISOString().slice(0, 10);

export const money = (value) =>
  `$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export const customersByName = new Map(CUSTOMERS.map((customer) => [customer.name, customer]));

/** The live book: rows carry a computed due date, status and age. */
export const invoices = INVOICES.map((invoice) => decorate(invoice));

function decorate(invoice) {
  const due = addDays(invoice.issued, invoice.terms);
  const customer = customersByName.get(invoice.customer);
  const status = invoice.paidOn ? 'paid' : daysBetween(due, REFERENCE_DATE) > 0 ? 'overdue' : 'open';
  const daysLate = status === 'overdue' ? daysBetween(due, REFERENCE_DATE) : 0;
  return {
    ...invoice,
    due,
    status,
    daysLate,
    age: daysBetween(invoice.issued, REFERENCE_DATE),
    remindedAt: invoice.remindedAt ?? null,
    segment: customer?.segment ?? 'other',
    contact: customer?.contact ?? '',
    email: customer?.email ?? '',
  };
}

export const byId = (id) => invoices.find((invoice) => invoice.id === id);

export function view(status = 'all', sort = 'age') {
  const rows = invoices.filter((invoice) => status === 'all' || invoice.status === status);
  const sorted = [...rows];
  if (sort === 'amount') sorted.sort((a, b) => b.amount - a.amount);
  else if (sort === 'customer') sorted.sort((a, b) => a.customer.localeCompare(b.customer));
  else sorted.sort((a, b) => b.daysLate - a.daysLate || b.amount - a.amount);
  return sorted;
}

export function totals(status = 'all') {
  const rows = view(status, 'age');
  const sum = rows.reduce((total, invoice) => total + invoice.amount, 0);
  const overdue = rows.filter((invoice) => invoice.status === 'overdue');
  return {
    count: rows.length,
    sum,
    overdueCount: overdue.length,
    overdueSum: overdue.reduce((total, invoice) => total + invoice.amount, 0),
    oldest: [...overdue].sort((a, b) => b.daysLate - a.daysLate)[0] ?? null,
    largest: [...rows].sort((a, b) => b.amount - a.amount)[0] ?? null,
  };
}

/** Customers ordered by what they still owe, for "who owes the most". */
export function debtors() {
  const open = invoices.filter((invoice) => invoice.status !== 'paid');
  const map = new Map();
  for (const invoice of open) {
    const current = map.get(invoice.customer) ?? { customer: invoice.customer, sum: 0, count: 0, oldest: 0, ids: [] };
    current.sum += invoice.amount;
    current.count += 1;
    current.oldest = Math.max(current.oldest, invoice.daysLate);
    current.ids.push(invoice.id);
    map.set(invoice.customer, current);
  }
  return [...map.values()].sort((a, b) => b.sum - a.sum);
}

/** Marks an invoice settled. Kept here so a handler and a test share one path. */
export function settle(id, today = REFERENCE_DATE) {
  const invoice = byId(id);
  if (!invoice) throw new Error(`no invoice ${id} in the book`);
  if (invoice.status === 'paid') throw new Error(`${id} is already settled`);
  invoice.paidOn = today;
  const refunded = decorate(invoice);
  Object.assign(invoice, refunded);
  return invoice;
}

export function markReminded(ids, today = REFERENCE_DATE) {
  const stamped = [];
  for (const id of ids) {
    const invoice = byId(id);
    if (!invoice || invoice.status === 'paid') continue;
    invoice.remindedAt = today;
    stamped.push(invoice);
  }
  return stamped;
}
