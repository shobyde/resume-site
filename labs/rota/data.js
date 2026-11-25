/* ============================================================
   Rota · the week.

   Six people, fourteen shifts, three holes. The roster is fixed; the
   assignments are live, because assigning cover is the action the lab
   demonstrates. Every rule the page enforces is written down in
   `eligibility()` so a refusal can name the one that fired.
   ============================================================ */

export const REFERENCE_WEEK = '23–29 Nov 2026';
export const TODAY = '2026-11-24';
export const REST_HOURS = 11;

export const DAYS = [
  { id: 'mon', label: 'Mon', date: '23 Nov' },
  { id: 'tue', label: 'Tue', date: '24 Nov' },
  { id: 'wed', label: 'Wed', date: '25 Nov' },
  { id: 'thu', label: 'Thu', date: '26 Nov' },
  { id: 'fri', label: 'Fri', date: '27 Nov' },
  { id: 'sat', label: 'Sat', date: '28 Nov' },
  { id: 'sun', label: 'Sun', date: '29 Nov' },
];

export const SLOTS = {
  day: { id: 'day', label: 'Day', hours: '09:00–17:00', start: 9, end: 17 },
  night: { id: 'night', label: 'Night', hours: '21:00–05:00', start: 21, end: 29 },
};

export const PEOPLE = [
  { id: 'priya', name: 'Priya Raman', level: 'staff', skills: ['backend', 'nights'], cap: 40, unavailable: [] },
  { id: 'ana', name: 'Ana Duarte', level: 'senior', skills: ['backend', 'nights'], cap: 40, unavailable: ['sun'] },
  { id: 'marcus', name: 'Marcus Lee', level: 'senior', skills: ['frontend', 'nights'], cap: 38, unavailable: ['sat', 'sun'] },
  { id: 'sofia', name: 'Sofia Nwosu', level: 'mid', skills: ['frontend', 'data', 'nights'], cap: 36, unavailable: [] },
  { id: 'dev', name: 'Dev Patel', level: 'mid', skills: ['backend'], cap: 40, unavailable: [] },
  { id: 'hana', name: 'Hana Sato', level: 'mid', skills: ['data'], cap: 36, unavailable: [] },
];

export const peopleById = new Map(PEOPLE.map((person) => [person.id, person]));

export const SHIFTS = [
  ['mon-day', 'mon', 'day', 'backend', false],
  ['mon-night', 'mon', 'night', 'backend', true],
  ['tue-day', 'tue', 'day', 'frontend', false],
  ['tue-night', 'tue', 'night', 'backend', true],
  ['wed-day', 'wed', 'day', 'data', false],
  ['wed-night', 'wed', 'night', 'data', true],
  ['thu-day', 'thu', 'day', 'data', false],
  ['thu-night', 'thu', 'night', 'backend', true],
  ['fri-day', 'fri', 'day', 'backend', false],
  ['fri-night', 'fri', 'night', 'frontend', true],
  ['sat-day', 'sat', 'day', 'backend', false],
  ['sat-night', 'sat', 'night', 'backend', true],
  ['sun-day', 'sun', 'day', 'data', false],
  ['sun-night', 'sun', 'night', 'backend', true],
].map(([id, day, slot, skill, nights]) => ({
  id,
  day,
  slot,
  skill,
  nights,
  label: `${dayLabel(day)} · ${slot}`,
  hours: 8,
}));

function dayLabel(day) {
  const entry = DAYS.find((row) => row.id === day);
  return `${entry.label} ${entry.date}`;
}

export const shiftsById = new Map(SHIFTS.map((shift) => [shift.id, shift]));

/** Who is on what, live. Ids only; the roster above never changes. */
export const assignments = new Map([
  ['mon-day', 'priya'],
  ['mon-night', 'ana'],
  ['tue-day', 'marcus'],
  ['tue-night', 'priya'],
  ['wed-night', 'sofia'],
  ['thu-day', 'hana'],
  ['thu-night', 'ana'],
  ['fri-day', 'dev'],
  ['fri-night', 'sofia'],
  ['sat-day', 'priya'],
  ['sun-day', 'hana'],
]);

export const assigneeOf = (shiftId) => {
  const id = assignments.get(shiftId);
  return id ? peopleById.get(id) : null;
};

export const assignedShifts = (personId) =>
  SHIFTS.filter((shift) => assignments.get(shift.id) === personId);

export const hoursFor = (personId) => assignedShifts(personId).length * 8;

export const gapShifts = () => SHIFTS.filter((shift) => !assignments.has(shift.id));

const dayIndex = (day) => DAYS.findIndex((row) => row.id === day);

/** Absolute hour on the week's clock, so a night shift can end after midnight. */
const startHour = (shift) => dayIndex(shift.day) * 24 + SLOTS[shift.slot].start;
const endHour = (shift) => dayIndex(shift.day) * 24 + SLOTS[shift.slot].end;

export function restBetween(a, b) {
  const gapForward = startHour(b) - endHour(a);
  const gapBackward = startHour(a) - endHour(b);
  return Math.max(gapForward, gapBackward);
}

export function restChecks(personId) {
  const shifts = assignedShifts(personId);
  const checks = [];
  for (let i = 0; i < shifts.length; i += 1) {
    for (let j = i + 1; j < shifts.length; j += 1) {
      const gap = restBetween(shifts[i], shifts[j]);
      if (gap < REST_HOURS) checks.push({ a: shifts[i], b: shifts[j], gap });
    }
  }
  return checks;
}

/**
 * Every rule that decides whether a person can take a shift, in the order a
 * refusal should cite them. Returns the failed reasons rather than a boolean:
 * "no" without the rule is the thing this lab is arguing against.
 */
export function eligibility(shiftId, personId) {
  const shift = shiftsById.get(shiftId);
  const person = peopleById.get(personId);
  if (!shift || !person) return { ok: false, reasons: ['There is no such shift or person.'] };

  const reasons = [];
  const current = assigneeOf(shiftId);
  if (current) reasons.push(`${shift.label} is already covered by ${current.name}.`);
  if (person.unavailable.includes(shift.day)) {
    reasons.push(`${person.name} is unavailable on ${dayLabel(shift.day)}.`);
  }
  if (!person.skills.includes(shift.skill)) {
    reasons.push(`${person.name} has no ${shift.skill} skill.`);
  }
  if (shift.nights && !person.skills.includes('nights')) {
    reasons.push(`${person.name} is not on the night rota.`);
  }
  const sameDay = assignedShifts(person.id).filter((owned) => owned.day === shift.day);
  if (sameDay.length > 0) {
    reasons.push(`${person.name} already holds the ${sameDay[0].slot} shift that day.`);
  }
  const hours = hoursFor(person.id);
  if (hours + shift.hours > person.cap) {
    reasons.push(`${person.name} is at ${hours}h of a ${person.cap}h week; this would make ${hours + shift.hours}h.`);
  }
  for (const owned of assignedShifts(person.id)) {
    const gap = restBetween(owned, shift);
    if (gap < REST_HOURS) {
      reasons.push(
        `Only ${gap}h between ${owned.label} and ${shift.label}; the rest rule is ${REST_HOURS}h.`,
      );
    }
  }

  return { ok: reasons.length === 0, reasons };
}

export function candidatesFor(shiftId) {
  return PEOPLE.map((person) => {
    const check = eligibility(shiftId, person.id);
    return {
      person,
      ok: check.ok,
      reasons: check.reasons,
      hours: hoursFor(person.id),
      shifts: assignedShifts(person.id),
    };
  }).sort((a, b) => Number(b.ok) - Number(a.ok) || a.person.name.localeCompare(b.person.name));
}

export function assign(shiftId, personId) {
  const check = eligibility(shiftId, personId);
  if (!check.ok) {
    const error = new Error(check.reasons[0]);
    error.reasons = check.reasons;
    throw error;
  }
  assignments.set(shiftId, personId);
  return { shift: shiftsById.get(shiftId), person: peopleById.get(personId) };
}

export const summary = () => ({
  gaps: gapShifts().length,
  hours: PEOPLE.reduce((sum, person) => sum + hoursFor(person.id), 0),
  atCap: PEOPLE.filter((person) => hoursFor(person.id) >= person.cap - 8).length,
  shifts: SHIFTS.length,
});

export const short = (shift) => `${shift.label} · ${SLOTS[shift.slot].hours}`;
