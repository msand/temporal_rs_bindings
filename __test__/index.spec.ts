import { describe, it, expect } from 'vitest';
import {
  Calendar,
  TimeZone,
  PlainDate,
  PlainTime,
  PlainDateTime,
  ZonedDateTime,
  Instant,
  Duration,
  PlainYearMonth,
  PlainMonthDay,
  nowInstant,
  nowTimeZone,
  nowPlainDateIso,
  nowPlainTimeIso,
  nowPlainDateTimeIso,
  nowZonedDateTimeIso,
  Unit,
  RoundingMode,
} from '../index.js';

// ─── Calendar ───────────────────────────────────────────────

describe('Calendar', () => {
  it('creates ISO calendar', () => {
    const cal = Calendar.iso();
    expect(cal.id).toBe('iso8601');
    expect(cal.isIso).toBe(true);
  });

  it('creates from string', () => {
    const cal = new Calendar('gregory');
    expect(cal.id).toBe('gregory');
    expect(cal.isIso).toBe(false);
  });

  it('has factory methods for all calendars', () => {
    expect(Calendar.gregorian().id).toBe('gregory');
    expect(Calendar.japanese().id).toBe('japanese');
    expect(Calendar.buddhist().id).toBe('buddhist');
    expect(Calendar.chinese().id).toBe('chinese');
    expect(Calendar.hebrew().id).toBe('hebrew');
    expect(Calendar.persian().id).toBe('persian');
  });

  it('toString returns identifier', () => {
    expect(Calendar.iso().toString()).toBe('iso8601');
  });
});

// ─── TimeZone ───────────────────────────────────────────────

describe('TimeZone', () => {
  it('creates UTC', () => {
    const tz = TimeZone.utc();
    expect(tz.id).toBe('UTC');
  });

  it('creates from IANA identifier', () => {
    const tz = new TimeZone('America/New_York');
    expect(tz.id).toBe('America/New_York');
  });

  it('creates from UTC offset', () => {
    const tz = new TimeZone('+05:30');
    expect(tz.id).toBe('+05:30');
  });

  it('throws on invalid identifier', () => {
    expect(() => new TimeZone('Invalid/Zone')).toThrow(Error);
  });
});

// ─── Duration ───────────────────────────────────────────────

describe('Duration', () => {
  it('creates with components', () => {
    const d = new Duration(1, 2, 3, 4, 5, 6, 7, 8, 9, 10);
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

  it('creates with defaults (all zero)', () => {
    const d = new Duration();
    expect(d.isZero).toBe(true);
    expect(d.sign).toBe(0);
  });

  it('parses from ISO string', () => {
    const d = Duration.from('P1Y2M3W4DT5H6M7S');
    expect(d.years).toBe(1);
    expect(d.months).toBe(2);
    expect(d.weeks).toBe(3);
    expect(d.days).toBe(4);
    expect(d.hours).toBe(5);
    expect(d.minutes).toBe(6);
    expect(d.seconds).toBe(7);
  });

  it('negates', () => {
    const d = Duration.from('P1D');
    const neg = d.negated();
    expect(neg.days).toBe(-1);
    expect(neg.sign).toBe(-1);
  });

  it('abs', () => {
    const d = new Duration(0, 0, 0, -5);
    expect(d.abs().days).toBe(5);
  });

  it('add and subtract', () => {
    const d1 = Duration.from('P1D');
    const d2 = Duration.from('P2D');
    expect(d1.add(d2).days).toBe(3);
    expect(d2.subtract(d1).days).toBe(1);
  });

  it('toString returns ISO format', () => {
    const d = Duration.from('P1Y2M3DT4H5M6S');
    const s = d.toString();
    expect(s).toContain('P');
    expect(s).toContain('Y');
  });
});

// ─── PlainDate ──────────────────────────────────────────────

describe('PlainDate', () => {
  it('creates from components', () => {
    const d = new PlainDate(2024, 3, 15);
    expect(d.year).toBe(2024);
    expect(d.month).toBe(3);
    expect(d.day).toBe(15);
  });

  it('parses from string', () => {
    const d = PlainDate.from('2024-03-15');
    expect(d.year).toBe(2024);
    expect(d.month).toBe(3);
    expect(d.day).toBe(15);
  });

  it('provides calendar properties', () => {
    const d = new PlainDate(2024, 3, 15);
    expect(d.dayOfWeek).toBe(5); // Friday
    expect(d.dayOfYear).toBe(75);
    expect(d.daysInMonth).toBe(31);
    expect(d.daysInYear).toBe(366);
    expect(d.inLeapYear).toBe(true);
    expect(d.monthsInYear).toBe(12);
    expect(d.daysInWeek).toBe(7);
  });

  it('has month code', () => {
    const d = new PlainDate(2024, 3, 15);
    expect(d.monthCode).toBe('M03');
  });

  it('has calendar getter', () => {
    const d = new PlainDate(2024, 1, 1);
    expect(d.calendar.isIso).toBe(true);
  });

  it('adds duration', () => {
    const d = new PlainDate(2024, 1, 31);
    const dur = Duration.from('P1M');
    const result = d.add(dur);
    expect(result.month).toBe(2);
    expect(result.day).toBe(29); // 2024 is leap year
  });

  it('subtracts duration', () => {
    const d = new PlainDate(2024, 3, 1);
    const dur = Duration.from('P1D');
    expect(d.subtract(dur).day).toBe(29);
  });

  it('computes difference with until', () => {
    const d1 = PlainDate.from('2024-01-01');
    const d2 = PlainDate.from('2024-03-01');
    const diff = d1.until(d2);
    expect(diff.days).toBe(60);
  });

  it('computes difference with since', () => {
    const d1 = PlainDate.from('2024-03-01');
    const d2 = PlainDate.from('2024-01-01');
    const diff = d1.since(d2);
    expect(diff.days).toBe(60);
  });

  it('compares dates', () => {
    const d1 = new PlainDate(2024, 1, 1);
    const d2 = new PlainDate(2024, 12, 31);
    expect(PlainDate.compare(d1, d2)).toBeLessThan(0);
    expect(PlainDate.compare(d2, d1)).toBeGreaterThan(0);
    expect(PlainDate.compare(d1, d1)).toBe(0);
  });

  it('equals', () => {
    const d1 = new PlainDate(2024, 6, 15);
    const d2 = PlainDate.from('2024-06-15');
    expect(d1.equals(d2)).toBe(true);
  });

  it('converts to string', () => {
    const d = new PlainDate(2024, 3, 15);
    expect(d.toString()).toBe('2024-03-15');
  });

  it('with calendar', () => {
    const d = new PlainDate(2024, 1, 1);
    const greg = d.withCalendar(Calendar.gregorian());
    expect(greg.calendar.id).toBe('gregory');
  });

  it('valueOf throws', () => {
    const d = new PlainDate(2024, 1, 1);
    expect(() => {
      d.valueOf();
    }).toThrow(Error);
  });

  it('constrains invalid dates by default', () => {
    // PlainDate.new uses Constrain overflow by default
    const d1 = new PlainDate(2024, 13, 1);
    expect(d1.month).toBe(12); // constrained to max month
    const d2 = new PlainDate(2024, 2, 30);
    expect(d2.day).toBe(29); // constrained to max day in Feb 2024 (leap)
  });

  it('supports non-ISO calendar', () => {
    const d = new PlainDate(2024, 3, 15, Calendar.gregorian());
    expect(d.calendar.id).toBe('gregory');
    expect(d.era).not.toBeNull();
  });
});

// ─── PlainTime ──────────────────────────────────────────────

describe('PlainTime', () => {
  it('creates from components', () => {
    const t = new PlainTime(13, 30, 45);
    expect(t.hour).toBe(13);
    expect(t.minute).toBe(30);
    expect(t.second).toBe(45);
    expect(t.millisecond).toBe(0);
  });

  it('creates with sub-second precision', () => {
    const t = new PlainTime(10, 20, 30, 100, 200, 300);
    expect(t.millisecond).toBe(100);
    expect(t.microsecond).toBe(200);
    expect(t.nanosecond).toBe(300);
  });

  it('parses from string', () => {
    const t = PlainTime.from('13:30:45');
    expect(t.hour).toBe(13);
    expect(t.minute).toBe(30);
    expect(t.second).toBe(45);
  });

  it('adds duration', () => {
    const t = new PlainTime(23, 30, 0);
    const dur = new Duration(0, 0, 0, 0, 1); // 1 hour
    const result = t.add(dur);
    expect(result.hour).toBe(0);
    expect(result.minute).toBe(30);
  });

  it('computes difference', () => {
    const t1 = PlainTime.from('10:00:00');
    const t2 = PlainTime.from('13:30:00');
    const diff = t1.until(t2);
    expect(diff.hours).toBe(3);
    expect(diff.minutes).toBe(30);
  });

  it('rounds', () => {
    const t = new PlainTime(13, 45, 30);
    const rounded = t.round({
      smallestUnit: Unit.Hour,
      roundingMode: RoundingMode.HalfExpand,
    });
    expect(rounded.hour).toBe(14);
    expect(rounded.minute).toBe(0);
  });

  it('equals', () => {
    const t1 = new PlainTime(12, 0, 0);
    const t2 = PlainTime.from('12:00:00');
    expect(t1.equals(t2)).toBe(true);
  });

  it('converts to string', () => {
    const t = new PlainTime(13, 30, 45);
    expect(t.toString()).toBe('13:30:45');
  });

  it('constrains invalid time by default', () => {
    // NOTE: This tests the raw NAPI binding behavior which constrains by default.
    // The TC39 spec conformance layer (Temporal.PlainTime) rejects out-of-range values instead.
    const t = new PlainTime(25, 0, 0);
    expect(t.hour).toBe(23); // constrained to max hour
  });
});

// ─── PlainDateTime ──────────────────────────────────────────

describe('PlainDateTime', () => {
  it('creates from components', () => {
    const dt = new PlainDateTime(2024, 3, 15, 13, 30, 45);
    expect(dt.year).toBe(2024);
    expect(dt.month).toBe(3);
    expect(dt.day).toBe(15);
    expect(dt.hour).toBe(13);
    expect(dt.minute).toBe(30);
    expect(dt.second).toBe(45);
  });

  it('parses from string', () => {
    const dt = PlainDateTime.from('2024-03-15T13:30:45');
    expect(dt.year).toBe(2024);
    expect(dt.hour).toBe(13);
  });

  it('provides all date properties', () => {
    const dt = new PlainDateTime(2024, 3, 15, 12);
    expect(dt.dayOfWeek).toBe(5);
    expect(dt.inLeapYear).toBe(true);
  });

  it('adds duration', () => {
    const dt = new PlainDateTime(2024, 12, 31, 23, 59);
    const dur = new Duration(0, 0, 0, 0, 0, 1); // 1 minute
    const result = dt.add(dur);
    expect(result.year).toBe(2025);
    expect(result.month).toBe(1);
    expect(result.day).toBe(1);
    expect(result.hour).toBe(0);
    expect(result.minute).toBe(0);
  });

  it('converts to PlainDate and PlainTime', () => {
    const dt = new PlainDateTime(2024, 6, 15, 10, 30);
    const date = dt.toPlainDate();
    const time = dt.toPlainTime();
    expect(date.year).toBe(2024);
    expect(date.month).toBe(6);
    expect(time.hour).toBe(10);
    expect(time.minute).toBe(30);
  });

  it('compares', () => {
    const dt1 = new PlainDateTime(2024, 1, 1);
    const dt2 = new PlainDateTime(2024, 12, 31);
    expect(PlainDateTime.compare(dt1, dt2)).toBeLessThan(0);
  });

  it('converts to string', () => {
    const dt = new PlainDateTime(2024, 3, 15, 13, 30, 45);
    const s = dt.toString();
    expect(s).toContain('2024-03-15');
    expect(s).toContain('13:30:45');
  });
});

// ─── Instant ────────────────────────────────────────────────

describe('Instant', () => {
  it('creates from epoch milliseconds', () => {
    const inst = Instant.fromEpochMilliseconds(1710500000000);
    expect(inst.epochMilliseconds).toBe(1710500000000);
  });

  it('parses from string', () => {
    const inst = Instant.from('2024-03-15T12:00:00Z');
    expect(inst.epochMilliseconds).toBeGreaterThan(0);
  });

  it('adds duration', () => {
    const inst = Instant.fromEpochMilliseconds(0);
    const dur = new Duration(0, 0, 0, 0, 1); // 1 hour
    const result = inst.add(dur);
    expect(result.epochMilliseconds).toBe(3600000);
  });

  it('computes difference', () => {
    const i1 = Instant.fromEpochMilliseconds(0);
    const i2 = Instant.fromEpochMilliseconds(3600000);
    const diff = i1.until(i2, { largestUnit: Unit.Hour });
    expect(diff.hours).toBe(1);
  });

  it('compares', () => {
    const i1 = Instant.fromEpochMilliseconds(1000);
    const i2 = Instant.fromEpochMilliseconds(2000);
    expect(Instant.compare(i1, i2)).toBeLessThan(0);
    expect(i1.equals(i1)).toBe(true);
  });

  it('converts to string', () => {
    const inst = Instant.from('2024-03-15T12:00:00Z');
    const s = inst.toString();
    expect(s).toContain('2024-03-15');
    expect(s).toContain('12:00:00');
  });
});

// ─── ZonedDateTime ──────────────────────────────────────────

describe('ZonedDateTime', () => {
  it('creates from epoch milliseconds + timezone', () => {
    const tz = new TimeZone('America/New_York');
    const zdt = ZonedDateTime.fromEpochMilliseconds(1710500000000, tz);
    expect(zdt.year).toBe(2024);
    expect(zdt.timeZone.id).toBe('America/New_York');
  });

  it('parses from string', () => {
    const zdt = ZonedDateTime.from('2024-03-15T12:00:00-04:00[America/New_York]');
    expect(zdt.year).toBe(2024);
    expect(zdt.month).toBe(3);
    expect(zdt.day).toBe(15);
    expect(zdt.hour).toBe(12);
  });

  it('provides offset info', () => {
    const zdt = ZonedDateTime.from('2024-03-15T12:00:00-04:00[America/New_York]');
    expect(zdt.offset).toBe('-04:00');
    expect(zdt.offsetNanoseconds).toBe(-14400000000000);
  });

  it('provides epoch values', () => {
    const zdt = ZonedDateTime.from('2024-03-15T12:00:00Z[UTC]');
    expect(zdt.epochMilliseconds).toBeGreaterThan(0);
  });

  it('adds duration across DST', () => {
    // March 10, 2024 is DST spring-forward in Eastern
    const zdt = ZonedDateTime.from('2024-03-09T12:00:00-05:00[America/New_York]');
    const dur = new Duration(0, 0, 0, 1); // +1 day
    const result = zdt.add(dur);
    expect(result.hour).toBe(12); // Same wall time
    expect(result.day).toBe(10);
  });

  it('converts to Instant', () => {
    const zdt = ZonedDateTime.from('2024-03-15T12:00:00Z[UTC]');
    const inst = zdt.toInstant();
    expect(inst.epochMilliseconds).toBe(zdt.epochMilliseconds);
  });

  it('converts to PlainDate/PlainTime/PlainDateTime', () => {
    const zdt = ZonedDateTime.from('2024-06-15T10:30:00+02:00[Europe/Berlin]');
    expect(zdt.toPlainDate().year).toBe(2024);
    expect(zdt.toPlainTime().hour).toBe(10);
    expect(zdt.toPlainDateTime().minute).toBe(30);
  });

  it('start of day', () => {
    const zdt = ZonedDateTime.from('2024-06-15T15:30:00Z[UTC]');
    const sod = zdt.startOfDay();
    expect(sod.hour).toBe(0);
    expect(sod.minute).toBe(0);
    expect(sod.day).toBe(15);
  });

  it('hours in day', () => {
    const zdt = ZonedDateTime.from('2024-06-15T12:00:00Z[UTC]');
    expect(zdt.hoursInDay).toBe(24);
  });

  it('with timezone', () => {
    const zdt = ZonedDateTime.from('2024-06-15T12:00:00Z[UTC]');
    const eastern = zdt.withTimeZone(new TimeZone('America/New_York'));
    expect(eastern.timeZone.id).toBe('America/New_York');
    // Same instant, different wall time
    expect(eastern.epochMilliseconds).toBe(zdt.epochMilliseconds);
  });

  it('converts to string', () => {
    const zdt = ZonedDateTime.from('2024-03-15T12:00:00Z[UTC]');
    const s = zdt.toString();
    expect(s).toContain('2024-03-15');
    expect(s).toContain('UTC');
  });
});

// ─── PlainYearMonth ─────────────────────────────────────────

describe('PlainYearMonth', () => {
  it('creates from components', () => {
    const ym = new PlainYearMonth(2024, 3);
    expect(ym.year).toBe(2024);
    expect(ym.month).toBe(3);
  });

  it('parses from string', () => {
    const ym = PlainYearMonth.from('2024-03');
    expect(ym.year).toBe(2024);
    expect(ym.month).toBe(3);
  });

  it('provides calendar properties', () => {
    const ym = new PlainYearMonth(2024, 2);
    expect(ym.daysInMonth).toBe(29); // leap year
    expect(ym.daysInYear).toBe(366);
    expect(ym.monthsInYear).toBe(12);
    expect(ym.inLeapYear).toBe(true);
  });

  it('adds months', () => {
    const ym = new PlainYearMonth(2024, 11);
    const dur = Duration.from('P3M');
    const result = ym.add(dur);
    expect(result.year).toBe(2025);
    expect(result.month).toBe(2);
  });

  it('compares', () => {
    const ym1 = new PlainYearMonth(2024, 1);
    const ym2 = new PlainYearMonth(2024, 12);
    expect(PlainYearMonth.compare(ym1, ym2)).toBeLessThan(0);
  });

  it('converts to string', () => {
    const ym = new PlainYearMonth(2024, 3);
    expect(ym.toString()).toBe('2024-03');
  });
});

// ─── PlainMonthDay ──────────────────────────────────────────

describe('PlainMonthDay', () => {
  it('creates from components', () => {
    const md = new PlainMonthDay(12, 25);
    expect(md.day).toBe(25);
    expect(md.monthCode).toBe('M12');
  });

  it('parses from string', () => {
    const md = PlainMonthDay.from('--12-25');
    expect(md.day).toBe(25);
    expect(md.monthCode).toBe('M12');
  });

  it('equals', () => {
    const md1 = new PlainMonthDay(12, 25);
    const md2 = new PlainMonthDay(12, 25);
    expect(md1.equals(md2)).toBe(true);
  });

  it('converts to string', () => {
    const md = new PlainMonthDay(12, 25);
    const s = md.toString();
    expect(s).toContain('12-25');
  });
});

// ─── Error paths ────────────────────────────────────────────

describe('Error paths for invalid input', () => {
  it('Duration.from throws on invalid string', () => {
    expect(() => Duration.from('invalid')).toThrow();
  });

  it('PlainDate.from throws on invalid string', () => {
    expect(() => PlainDate.from('invalid')).toThrow();
  });

  it('PlainTime.from throws on invalid string', () => {
    expect(() => PlainTime.from('invalid')).toThrow();
  });

  it('Instant.from throws on invalid string', () => {
    expect(() => Instant.from('invalid')).toThrow();
  });

  it('PlainDateTime.from throws on invalid string', () => {
    expect(() => PlainDateTime.from('invalid')).toThrow();
  });

  it('ZonedDateTime.from throws on invalid string', () => {
    expect(() => ZonedDateTime.from('invalid')).toThrow();
  });
});

// ─── Now ────────────────────────────────────────────────────

describe('Now', () => {
  it('returns current instant', () => {
    const inst = nowInstant();
    expect(inst.epochMilliseconds).toBeGreaterThan(0);
  });

  it('returns current timezone', () => {
    const tz = nowTimeZone();
    expect(tz.id).toBeTruthy();
  });

  it('returns current plain date', () => {
    const d = nowPlainDateIso();
    expect(d.year).toBeGreaterThanOrEqual(new Date().getFullYear() - 1);
  });

  it('returns current plain time', () => {
    const t = nowPlainTimeIso();
    expect(t.hour).toBeGreaterThanOrEqual(0);
    expect(t.hour).toBeLessThan(24);
  });

  it('returns current plain date time', () => {
    const dt = nowPlainDateTimeIso();
    expect(dt.year).toBeGreaterThanOrEqual(new Date().getFullYear() - 1);
  });

  it('returns current zoned date time', () => {
    const zdt = nowZonedDateTimeIso();
    expect(zdt.year).toBeGreaterThanOrEqual(new Date().getFullYear() - 1);
    expect(zdt.timeZone.id).toBeTruthy();
  });

  it('accepts timezone parameter', () => {
    const utc = TimeZone.utc();
    const d = nowPlainDateIso(utc);
    expect(d.year).toBeGreaterThanOrEqual(new Date().getFullYear() - 1);
  });
});
