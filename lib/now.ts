// Temporal.Now namespace and setLength/toStringTag setup extracted from temporal.ts

import { binding } from './binding';
import { wrapInstant, wrapZonedDateTime, wrapPlainDateTime, wrapPlainDate, wrapPlainTime } from './helpers';
import { toNapiTimeZone } from './convert';
import { Duration } from './duration';
import { PlainDate } from './plaindate';
import { PlainTime } from './plaintime';
import { PlainDateTime } from './plaindatetime';
import { ZonedDateTime } from './zoneddatetime';
import { Instant } from './instant';
import { PlainYearMonth } from './plainyearmonth';
import { PlainMonthDay } from './plainmonthday';

// ─── Fix .length properties per spec ──────────────────────────
// The spec requires specific .length values that may differ from
// the JS formal parameter count due to internal constructor overloading.

export function setLength(fn: any, len: number): void {
  Object.defineProperty(fn, 'length', { value: len, writable: false, enumerable: false, configurable: true });
}

// Per spec, Symbol.toStringTag is a non-writable, non-enumerable, configurable data property
for (const [cls, tag] of [
  [Duration, 'Temporal.Duration'],
  [PlainDate, 'Temporal.PlainDate'],
  [PlainTime, 'Temporal.PlainTime'],
  [PlainDateTime, 'Temporal.PlainDateTime'],
  [ZonedDateTime, 'Temporal.ZonedDateTime'],
  [Instant, 'Temporal.Instant'],
  [PlainYearMonth, 'Temporal.PlainYearMonth'],
  [PlainMonthDay, 'Temporal.PlainMonthDay'],
] as [any, string][]) {
  Object.defineProperty(cls.prototype, Symbol.toStringTag, {
    value: tag,
    writable: false,
    enumerable: false,
    configurable: true,
  });
}

// Duration: constructor length 0, all params optional
setLength(Duration, 0);
setLength(Duration.compare, 2);
setLength(Duration.prototype.add, 1);
setLength(Duration.prototype.subtract, 1);
setLength(Duration.prototype.with, 1);
setLength(Duration.prototype.round, 1);
setLength(Duration.prototype.total, 1);
setLength(Duration.prototype.toString, 0);
setLength(Duration.prototype.toJSON, 0);
setLength(Duration.prototype.toLocaleString, 0);
setLength(Duration.prototype.valueOf, 0);
setLength(Duration.prototype.negated, 0);
setLength(Duration.prototype.abs, 0);
setLength(Duration.from, 1);

// PlainDate: constructor length 3 (year, month, day)
setLength(PlainDate, 3);
setLength(PlainDate.from, 1);
setLength(PlainDate.compare, 2);
setLength(PlainDate.prototype.with, 1);
setLength(PlainDate.prototype.withCalendar, 1);
setLength(PlainDate.prototype.add, 1);
setLength(PlainDate.prototype.subtract, 1);
setLength(PlainDate.prototype.until, 1);
setLength(PlainDate.prototype.since, 1);
setLength(PlainDate.prototype.equals, 1);
setLength(PlainDate.prototype.toPlainDateTime, 0);
setLength(PlainDate.prototype.toZonedDateTime, 1);
setLength(PlainDate.prototype.toPlainYearMonth, 0);
setLength(PlainDate.prototype.toPlainMonthDay, 0);
setLength(PlainDate.prototype.toString, 0);
setLength(PlainDate.prototype.toJSON, 0);
setLength(PlainDate.prototype.toLocaleString, 0);
setLength(PlainDate.prototype.valueOf, 0);

// PlainTime: constructor length 0, all params optional
setLength(PlainTime, 0);
setLength(PlainTime.from, 1);
setLength(PlainTime.compare, 2);
setLength(PlainTime.prototype.with, 1);
setLength(PlainTime.prototype.add, 1);
setLength(PlainTime.prototype.subtract, 1);
setLength(PlainTime.prototype.until, 1);
setLength(PlainTime.prototype.since, 1);
setLength(PlainTime.prototype.round, 1);
setLength(PlainTime.prototype.equals, 1);
setLength(PlainTime.prototype.toString, 0);
setLength(PlainTime.prototype.toJSON, 0);
setLength(PlainTime.prototype.toLocaleString, 0);
setLength(PlainTime.prototype.valueOf, 0);

// PlainDateTime: constructor length 3 (year, month, day; rest optional)
setLength(PlainDateTime, 3);
setLength(PlainDateTime.from, 1);
setLength(PlainDateTime.compare, 2);
setLength(PlainDateTime.prototype.with, 1);
setLength(PlainDateTime.prototype.withCalendar, 1);
setLength(PlainDateTime.prototype.withPlainTime, 0);
setLength(PlainDateTime.prototype.add, 1);
setLength(PlainDateTime.prototype.subtract, 1);
setLength(PlainDateTime.prototype.until, 1);
setLength(PlainDateTime.prototype.since, 1);
setLength(PlainDateTime.prototype.round, 1);
setLength(PlainDateTime.prototype.equals, 1);
setLength(PlainDateTime.prototype.toPlainDate, 0);
setLength(PlainDateTime.prototype.toPlainTime, 0);
setLength(PlainDateTime.prototype.toZonedDateTime, 1);
setLength(PlainDateTime.prototype.toString, 0);
setLength(PlainDateTime.prototype.toJSON, 0);
setLength(PlainDateTime.prototype.toLocaleString, 0);
setLength(PlainDateTime.prototype.valueOf, 0);

// ZonedDateTime: constructor length 2 (epochNanoseconds, timeZone)
setLength(ZonedDateTime, 2);
setLength(ZonedDateTime.from, 1);
setLength(ZonedDateTime.compare, 2);
setLength(ZonedDateTime.prototype.with, 1);
setLength(ZonedDateTime.prototype.withCalendar, 1);
setLength(ZonedDateTime.prototype.withTimeZone, 1);
setLength(ZonedDateTime.prototype.withPlainTime, 0);
setLength(ZonedDateTime.prototype.add, 1);
setLength(ZonedDateTime.prototype.subtract, 1);
setLength(ZonedDateTime.prototype.until, 1);
setLength(ZonedDateTime.prototype.since, 1);
setLength(ZonedDateTime.prototype.round, 1);
setLength(ZonedDateTime.prototype.equals, 1);
setLength(ZonedDateTime.prototype.startOfDay, 0);
setLength(ZonedDateTime.prototype.getTimeZoneTransition, 1);
setLength(ZonedDateTime.prototype.toInstant, 0);
setLength(ZonedDateTime.prototype.toPlainDate, 0);
setLength(ZonedDateTime.prototype.toPlainTime, 0);
setLength(ZonedDateTime.prototype.toPlainDateTime, 0);
setLength(ZonedDateTime.prototype.toString, 0);
setLength(ZonedDateTime.prototype.toJSON, 0);
setLength(ZonedDateTime.prototype.toLocaleString, 0);
setLength(ZonedDateTime.prototype.valueOf, 0);

// Instant: constructor length 1 (epochNanoseconds)
setLength(Instant, 1);
setLength(Instant.from, 1);
setLength(Instant.fromEpochMilliseconds, 1);
setLength(Instant.fromEpochNanoseconds, 1);
setLength(Instant.compare, 2);
setLength(Instant.prototype.add, 1);
setLength(Instant.prototype.subtract, 1);
setLength(Instant.prototype.until, 1);
setLength(Instant.prototype.since, 1);
setLength(Instant.prototype.round, 1);
setLength(Instant.prototype.equals, 1);
setLength(Instant.prototype.toZonedDateTimeISO, 1);
setLength(Instant.prototype.toString, 0);
setLength(Instant.prototype.toJSON, 0);
setLength(Instant.prototype.toLocaleString, 0);
setLength(Instant.prototype.valueOf, 0);

// PlainYearMonth: constructor length 2 (year, month)
setLength(PlainYearMonth, 2);
setLength(PlainYearMonth.from, 1);
setLength(PlainYearMonth.compare, 2);
setLength(PlainYearMonth.prototype.with, 1);
setLength(PlainYearMonth.prototype.add, 1);
setLength(PlainYearMonth.prototype.subtract, 1);
setLength(PlainYearMonth.prototype.until, 1);
setLength(PlainYearMonth.prototype.since, 1);
setLength(PlainYearMonth.prototype.equals, 1);
setLength(PlainYearMonth.prototype.toPlainDate, 1);
setLength(PlainYearMonth.prototype.toString, 0);
setLength(PlainYearMonth.prototype.toJSON, 0);
setLength(PlainYearMonth.prototype.toLocaleString, 0);
setLength(PlainYearMonth.prototype.valueOf, 0);

// PlainMonthDay: constructor length 2 (monthCode, day)
setLength(PlainMonthDay, 2);
setLength(PlainMonthDay.from, 1);
setLength(PlainMonthDay.prototype.with, 1);
setLength(PlainMonthDay.prototype.equals, 1);
setLength(PlainMonthDay.prototype.toPlainDate, 1);
setLength(PlainMonthDay.prototype.toString, 0);
setLength(PlainMonthDay.prototype.toJSON, 0);
setLength(PlainMonthDay.prototype.toLocaleString, 0);
setLength(PlainMonthDay.prototype.valueOf, 0);

// ═══════════════════════════════════════════════════════════════
//  Temporal.Now
// ═══════════════════════════════════════════════════════════════

export const Now: Record<string, any> = {};
Object.defineProperty(Now, Symbol.toStringTag, {
  value: 'Temporal.Now',
  writable: false,
  enumerable: false,
  configurable: true,
});

// Use a helper object to create method-definition functions (non-constructable)
function _defineNowMethod(name: string, fn: any): void {
  setLength(fn, 0);
  Object.defineProperty(Now, name, { value: fn, writable: true, enumerable: false, configurable: true });
}

// Methods created via concise method syntax are non-constructable
const _nowMethods: Record<string, (...args: any[]) => any> = {
  instant() {
    return wrapInstant(binding.nowInstant());
  },
  timeZoneId() {
    return binding.nowTimeZone().id;
  },
  zonedDateTimeISO(timeZone) {
    const tz = timeZone !== undefined ? toNapiTimeZone(timeZone) : undefined;
    return wrapZonedDateTime(binding.nowZonedDateTimeIso(tz));
  },
  plainDateTimeISO(timeZone) {
    const tz = timeZone !== undefined ? toNapiTimeZone(timeZone) : undefined;
    return wrapPlainDateTime(binding.nowPlainDateTimeIso(tz));
  },
  plainDateISO(timeZone) {
    const tz = timeZone !== undefined ? toNapiTimeZone(timeZone) : undefined;
    return wrapPlainDate(binding.nowPlainDateIso(tz));
  },
  plainTimeISO(timeZone) {
    const tz = timeZone !== undefined ? toNapiTimeZone(timeZone) : undefined;
    return wrapPlainTime(binding.nowPlainTimeIso(tz));
  },
};

for (const name of ['instant', 'timeZoneId', 'zonedDateTimeISO', 'plainDateTimeISO', 'plainDateISO', 'plainTimeISO']) {
  _defineNowMethod(name, _nowMethods[name]);
}

// Per spec, Temporal.Now is extensible (not frozen)

// Now and setLength are already exported inline via their declarations
