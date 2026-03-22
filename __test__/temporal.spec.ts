import { describe, it, expect } from 'vitest';
import { Temporal } from '../lib/temporal.mjs';

// ─── PlainDate ──────────────────────────────────────────────

describe('Temporal.PlainDate', () => {
  it('constructs from year/month/day', () => {
    const d = new Temporal.PlainDate(2024, 3, 15);
    expect(d.year).toBe(2024);
    expect(d.month).toBe(3);
    expect(d.day).toBe(15);
  });

  it('from() with ISO string', () => {
    const d = Temporal.PlainDate.from('2024-03-15');
    expect(d.year).toBe(2024);
    expect(d.month).toBe(3);
    expect(d.day).toBe(15);
  });

  it('from() with property bag', () => {
    const d = Temporal.PlainDate.from({ year: 2024, month: 3, day: 15 });
    expect(d.year).toBe(2024);
    expect(d.month).toBe(3);
    expect(d.day).toBe(15);
  });

  it('calendarId returns iso8601 by default', () => {
    const d = new Temporal.PlainDate(2024, 1, 1);
    expect(d.calendarId).toBe('iso8601');
  });

  it('add() with property bag duration', () => {
    const d = new Temporal.PlainDate(2024, 1, 31);
    const result = d.add({ months: 1 });
    expect(result.month).toBe(2);
    expect(result.day).toBe(29); // 2024 is leap year
  });

  it('compare() orders dates', () => {
    const d1 = new Temporal.PlainDate(2024, 1, 1);
    const d2 = new Temporal.PlainDate(2024, 12, 31);
    expect(Temporal.PlainDate.compare(d1, d2)).toBeLessThan(0);
    expect(Temporal.PlainDate.compare(d2, d1)).toBeGreaterThan(0);
    expect(Temporal.PlainDate.compare(d1, d1)).toBe(0);
  });

  it('equals() checks equality', () => {
    const d1 = new Temporal.PlainDate(2024, 6, 15);
    const d2 = Temporal.PlainDate.from('2024-06-15');
    expect(d1.equals(d2)).toBe(true);
  });

  it('valueOf() throws TypeError', () => {
    const d = new Temporal.PlainDate(2024, 1, 1);
    expect(() => d.valueOf()).toThrow(TypeError);
  });

  it('instanceof checks', () => {
    const d = new Temporal.PlainDate(2024, 1, 1);
    expect(d instanceof Temporal.PlainDate).toBe(true);
  });

  it('calendar support with hebrew calendar', () => {
    const d = Temporal.PlainDate.from({
      year: 5784,
      monthCode: 'M01',
      day: 1,
      calendar: 'hebrew',
    });
    expect(d.calendarId).toBe('hebrew');
    expect(d.day).toBe(1);
  });

  it('getters: dayOfWeek, dayOfYear, daysInMonth, inLeapYear', () => {
    const d = new Temporal.PlainDate(2024, 3, 15);
    expect(d.dayOfWeek).toBe(5); // Friday
    expect(d.dayOfYear).toBe(75);
    expect(d.daysInMonth).toBe(31);
    expect(d.inLeapYear).toBe(true);
  });

  it('toString() returns ISO string', () => {
    const d = new Temporal.PlainDate(2024, 3, 15);
    expect(d.toString()).toBe('2024-03-15');
  });
});

// ─── Duration ───────────────────────────────────────────────

describe('Temporal.Duration', () => {
  it('constructs with components', () => {
    const d = new Temporal.Duration(1, 2, 3, 4, 5, 6, 7, 8, 9, 10);
    expect(d.years).toBe(1);
    expect(d.months).toBe(2);
    expect(d.weeks).toBe(3);
    expect(d.days).toBe(4);
    expect(d.hours).toBe(5);
    expect(d.minutes).toBe(6);
    expect(d.seconds).toBe(7);
    expect(d.milliseconds).toBe(8);
    expect(d.microseconds).toBe(9);
    expect(d.nanoseconds).toBe(10);
  });

  it('from() parses ISO string', () => {
    const d = Temporal.Duration.from('P1Y2M3DT4H5M6S');
    expect(d.years).toBe(1);
    expect(d.months).toBe(2);
    expect(d.days).toBe(3);
    expect(d.hours).toBe(4);
    expect(d.minutes).toBe(5);
    expect(d.seconds).toBe(6);
  });

  it('negated() returns negated duration', () => {
    const d = Temporal.Duration.from('P1D');
    const neg = d.negated();
    expect(neg.days).toBe(-1);
    expect(neg.sign).toBe(-1);
  });

  it('abs() returns absolute duration', () => {
    const d = new Temporal.Duration(0, 0, 0, -5);
    const a = d.abs();
    expect(a.days).toBe(5);
    expect(a.sign).toBe(1);
  });

  it('valueOf() throws TypeError', () => {
    const d = new Temporal.Duration(1);
    expect(() => d.valueOf()).toThrow(TypeError);
  });

  it('instanceof checks', () => {
    const d = new Temporal.Duration(1);
    expect(d instanceof Temporal.Duration).toBe(true);
  });
});

// ─── PlainTime ──────────────────────────────────────────────

describe('Temporal.PlainTime', () => {
  it('constructs from components', () => {
    const t = new Temporal.PlainTime(13, 30, 45);
    expect(t.hour).toBe(13);
    expect(t.minute).toBe(30);
    expect(t.second).toBe(45);
  });

  it('from() parses string', () => {
    const t = Temporal.PlainTime.from('13:30:45');
    expect(t.hour).toBe(13);
    expect(t.minute).toBe(30);
    expect(t.second).toBe(45);
  });

  it('add() wraps around midnight', () => {
    const t = new Temporal.PlainTime(23, 30, 0);
    const result = t.add({ hours: 1 });
    expect(result.hour).toBe(0);
    expect(result.minute).toBe(30);
  });

  it('instanceof checks', () => {
    const t = new Temporal.PlainTime(12, 0, 0);
    expect(t instanceof Temporal.PlainTime).toBe(true);
  });
});

// ─── PlainDateTime ──────────────────────────────────────────

describe('Temporal.PlainDateTime', () => {
  it('constructs from components', () => {
    const dt = new Temporal.PlainDateTime(2024, 3, 15, 13, 30, 45);
    expect(dt.year).toBe(2024);
    expect(dt.month).toBe(3);
    expect(dt.day).toBe(15);
    expect(dt.hour).toBe(13);
    expect(dt.minute).toBe(30);
    expect(dt.second).toBe(45);
  });

  it('from() parses string', () => {
    const dt = Temporal.PlainDateTime.from('2024-03-15T13:30:45');
    expect(dt.year).toBe(2024);
    expect(dt.hour).toBe(13);
  });

  it('add() rolls over year boundary', () => {
    const dt = new Temporal.PlainDateTime(2024, 12, 31, 23, 59);
    const result = dt.add({ minutes: 1 });
    expect(result.year).toBe(2025);
    expect(result.month).toBe(1);
    expect(result.day).toBe(1);
    expect(result.hour).toBe(0);
    expect(result.minute).toBe(0);
  });

  it('toPlainDate() and toPlainTime()', () => {
    const dt = new Temporal.PlainDateTime(2024, 6, 15, 10, 30);
    const date = dt.toPlainDate();
    const time = dt.toPlainTime();
    expect(date.year).toBe(2024);
    expect(date.month).toBe(6);
    expect(time.hour).toBe(10);
    expect(time.minute).toBe(30);
  });

  it('instanceof checks', () => {
    const dt = new Temporal.PlainDateTime(2024, 1, 1);
    expect(dt instanceof Temporal.PlainDateTime).toBe(true);
  });
});

// ─── Instant ────────────────────────────────────────────────

describe('Temporal.Instant', () => {
  it('from() parses ISO string', () => {
    const inst = Temporal.Instant.from('2024-03-15T12:00:00Z');
    expect(inst.epochMilliseconds).toBeGreaterThan(0);
  });

  it('fromEpochMilliseconds()', () => {
    const inst = Temporal.Instant.fromEpochMilliseconds(1710500000000);
    expect(inst.epochMilliseconds).toBe(1710500000000);
  });

  it('add() adds duration', () => {
    const inst = Temporal.Instant.fromEpochMilliseconds(0);
    const result = inst.add({ hours: 1 });
    expect(result.epochMilliseconds).toBe(3600000);
  });

  it('compare() orders instants', () => {
    const i1 = Temporal.Instant.fromEpochMilliseconds(1000);
    const i2 = Temporal.Instant.fromEpochMilliseconds(2000);
    expect(Temporal.Instant.compare(i1, i2)).toBeLessThan(0);
  });

  it('instanceof checks', () => {
    const inst = Temporal.Instant.from('2024-03-15T12:00:00Z');
    expect(inst instanceof Temporal.Instant).toBe(true);
  });
});

// ─── ZonedDateTime ──────────────────────────────────────────

describe('Temporal.ZonedDateTime', () => {
  it('from() parses string with timezone', () => {
    const zdt = Temporal.ZonedDateTime.from('2024-03-15T12:00:00-04:00[America/New_York]');
    expect(zdt.year).toBe(2024);
    expect(zdt.month).toBe(3);
    expect(zdt.day).toBe(15);
    expect(zdt.hour).toBe(12);
  });

  it('provides timeZoneId', () => {
    const zdt = Temporal.ZonedDateTime.from('2024-03-15T12:00:00-04:00[America/New_York]');
    expect(zdt.timeZoneId).toBe('America/New_York');
  });

  it('toInstant() preserves epoch', () => {
    const zdt = Temporal.ZonedDateTime.from('2024-03-15T12:00:00Z[UTC]');
    const inst = zdt.toInstant();
    expect(inst.epochMilliseconds).toBe(zdt.epochMilliseconds);
  });

  it('toPlainDate() extracts date', () => {
    const zdt = Temporal.ZonedDateTime.from('2024-06-15T10:30:00+02:00[Europe/Berlin]');
    expect(zdt.toPlainDate().year).toBe(2024);
  });

  it('instanceof checks', () => {
    const zdt = Temporal.ZonedDateTime.from('2024-03-15T12:00:00Z[UTC]');
    expect(zdt instanceof Temporal.ZonedDateTime).toBe(true);
  });
});

// ─── Now ────────────────────────────────────────────────────

describe('Temporal.Now', () => {
  it('instant() returns current instant', () => {
    const inst = Temporal.Now.instant();
    expect(inst.epochMilliseconds).toBeGreaterThan(0);
    expect(inst instanceof Temporal.Instant).toBe(true);
  });

  it('plainDateISO() returns current date', () => {
    const d = Temporal.Now.plainDateISO();
    expect(d.year).toBeGreaterThanOrEqual(new Date().getFullYear() - 1);
    expect(d instanceof Temporal.PlainDate).toBe(true);
  });
});

// ─── with() methods ─────────────────────────────────────

describe('with() methods', () => {
  it('PlainDate.with() overrides day', () => {
    const d = Temporal.PlainDate.from('2024-01-15').with({ day: 20 });
    expect(d.day).toBe(20);
    expect(d.month).toBe(1);
    expect(d.year).toBe(2024);
  });

  it('PlainTime.with() overrides hour', () => {
    const t = Temporal.PlainTime.from('10:30:00').with({ hour: 14 });
    expect(t.hour).toBe(14);
    expect(t.minute).toBe(30);
    expect(t.second).toBe(0);
  });

  it('PlainDateTime.with() overrides month', () => {
    const dt = Temporal.PlainDateTime.from('2024-01-15T10:30:00').with({ month: 6 });
    expect(dt.month).toBe(6);
    expect(dt.day).toBe(15);
    expect(dt.hour).toBe(10);
  });
});

// ─── round() methods ────────────────────────────────────

describe('round() methods', () => {
  it('PlainDateTime.round() rounds to hour', () => {
    const dt = Temporal.PlainDateTime.from('2024-01-15T10:30:45.123');
    const rounded = dt.round('hour');
    expect(rounded.hour).toBe(11);
    expect(rounded.minute).toBe(0);
    expect(rounded.second).toBe(0);
  });

  it('Instant.round() rounds to second', () => {
    const inst = Temporal.Instant.fromEpochMilliseconds(1000500);
    const rounded = inst.round('second');
    // 1000500 ms = 1000.5 s, rounds to 1001 s = 1001000 ms (halfExpand)
    // or 1000 s = 1000000 ms depending on default rounding mode
    expect(rounded.epochMilliseconds % 1000).toBe(0);
  });

  it('ZonedDateTime.round() rounds to hour', () => {
    const zdt = Temporal.ZonedDateTime.from('2024-01-15T10:30:45+00:00[UTC]');
    const rounded = zdt.round('hour');
    expect(rounded.hour).toBe(11);
    expect(rounded.minute).toBe(0);
    expect(rounded.second).toBe(0);
  });
});

// ─── toString() with options ────────────────────────────

describe('toString() with options', () => {
  it('PlainDate.toString() with calendarName always', () => {
    const d = Temporal.PlainDate.from('2024-01-15');
    const s = d.toString({ calendarName: 'always' });
    expect(s).toContain('2024-01-15');
    expect(s).toContain('[u-ca=iso8601]');
  });

  it('PlainTime.toString() with fractionalSecondDigits', () => {
    const t = Temporal.PlainTime.from('10:30:00.123456789');
    const s = t.toString({ fractionalSecondDigits: 3 });
    expect(s).toBe('10:30:00.123');
  });

  it('PlainDateTime.toString() with calendarName never', () => {
    const dt = Temporal.PlainDateTime.from('2024-01-15T10:30:00');
    const s = dt.toString({ calendarName: 'never' });
    expect(s).toContain('2024-01-15');
    expect(s).not.toContain('[u-ca=');
  });
});

// ─── toLocaleString() ───────────────────────────────────

describe('toLocaleString()', () => {
  it('PlainDate.toLocaleString() returns non-empty string', () => {
    const d = Temporal.PlainDate.from('2024-01-15');
    const s = d.toLocaleString('en-US');
    expect(typeof s).toBe('string');
    expect(s.length).toBeGreaterThan(0);
  });
});

// ─── Duration.total() and Duration.round() with relativeTo ─

describe('Duration.total() and Duration.round() with relativeTo', () => {
  it('total() computes total days for months + days', () => {
    const d = Temporal.Duration.from({ months: 1, days: 15 });
    const relativeTo = Temporal.PlainDate.from('2024-01-01');
    const total = d.total({ unit: 'days', relativeTo });
    // January has 31 days, so 1 month + 15 days = 46 days
    expect(total).toBeGreaterThan(40);
    expect(total).toBe(46);
  });

  it('round() rounds duration with relativeTo', () => {
    const d = Temporal.Duration.from({ months: 1, days: 15 });
    const relativeTo = Temporal.PlainDate.from('2024-01-01');
    const rounded = d.round({ largestUnit: 'days', relativeTo });
    expect(rounded.days).toBe(46);
    expect(rounded.months).toBe(0);
  });
});

// ─── BigInt precision ─────────────────────────────────────

describe('BigInt epochNanoseconds precision', () => {
  it('Instant round-trips large BigInt epochNanoseconds', () => {
    const ns = 1710500000000000000n; // ~2024-03-15 in nanoseconds
    const inst = new Temporal.Instant(ns);
    expect(inst.epochNanoseconds).toBe(ns);
  });

  it('Instant round-trips negative BigInt epochNanoseconds', () => {
    const ns = -8640000000000000000000n; // minimum representable
    const inst = new Temporal.Instant(ns);
    expect(inst.epochNanoseconds).toBe(ns);
  });

  it('ZonedDateTime round-trips BigInt epochNanoseconds', () => {
    const ns = 1710500000123456789n;
    const zdt = new Temporal.ZonedDateTime(ns, 'UTC');
    expect(zdt.epochNanoseconds).toBe(ns);
  });

  it('Instant rejects number as epochNanoseconds', () => {
    expect(() => new Temporal.Instant(0)).toThrow(TypeError);
  });

  it('Instant rejects out-of-range BigInt', () => {
    expect(() => new Temporal.Instant(9000000000000000000000n)).toThrow(RangeError);
  });
});

// ─── Error type correctness ──────────────────────────────

describe('Error type mapping', () => {
  it('PlainDate.from throws RangeError for invalid date', () => {
    expect(() => Temporal.PlainDate.from('2024-13-01')).toThrow(RangeError);
  });

  it('PlainDate constructor throws RangeError for invalid month', () => {
    expect(() => new Temporal.PlainDate(2024, 13, 1)).toThrow(RangeError);
  });

  it('Duration.from throws RangeError for invalid string', () => {
    expect(() => Temporal.Duration.from('not-a-duration')).toThrow(RangeError);
  });

  it('PlainDate.from throws TypeError for null', () => {
    expect(() => Temporal.PlainDate.from(null as any)).toThrow(TypeError);
  });
});
