// TC39 Temporal spec conformance layer over temporal_rs NAPI bindings.
// Bridges the gap between the NAPI binding API and the TC39 Temporal specification.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const binding = require('../index.js');

const NapiCalendar = binding.Calendar;
const NapiTimeZone = binding.TimeZone;
const NapiPlainDate = binding.PlainDate;
const NapiPlainTime = binding.PlainTime;
const NapiPlainDateTime = binding.PlainDateTime;
const NapiZonedDateTime = binding.ZonedDateTime;
const NapiInstant = binding.Instant;
const NapiDuration = binding.Duration;
const NapiPlainYearMonth = binding.PlainYearMonth;
const NapiPlainMonthDay = binding.PlainMonthDay;

// ─── Enum mapping (spec lowercase → NAPI PascalCase) ─────────

const UNIT_MAP = {
  auto: 'Auto',
  nanosecond: 'Nanosecond', nanoseconds: 'Nanosecond',
  microsecond: 'Microsecond', microseconds: 'Microsecond',
  millisecond: 'Millisecond', milliseconds: 'Millisecond',
  second: 'Second', seconds: 'Second',
  minute: 'Minute', minutes: 'Minute',
  hour: 'Hour', hours: 'Hour',
  day: 'Day', days: 'Day',
  week: 'Week', weeks: 'Week',
  month: 'Month', months: 'Month',
  year: 'Year', years: 'Year',
};

const ROUNDING_MODE_MAP = {
  ceil: 'Ceil',
  floor: 'Floor',
  expand: 'Expand',
  trunc: 'Trunc',
  halfCeil: 'HalfCeil',
  halfFloor: 'HalfFloor',
  halfExpand: 'HalfExpand',
  halfTrunc: 'HalfTrunc',
  halfEven: 'HalfEven',
};

const OVERFLOW_MAP = {
  constrain: 'Constrain',
  reject: 'Reject',
};

const DISAMBIGUATION_MAP = {
  compatible: 'Compatible',
  earlier: 'Earlier',
  later: 'Later',
  reject: 'Reject',
};

const OFFSET_DISAMBIGUATION_MAP = {
  use: 'Use',
  prefer: 'Prefer',
  ignore: 'Ignore',
  reject: 'Reject',
};

const DISPLAY_CALENDAR_MAP = {
  auto: 'Auto',
  always: 'Always',
  never: 'Never',
  critical: 'Critical',
};

const DISPLAY_OFFSET_MAP = {
  auto: 'Auto',
  never: 'Never',
};

const DISPLAY_TIMEZONE_MAP = {
  auto: 'Auto',
  never: 'Never',
  critical: 'Critical',
};

// ─── Helper: map enum with validation ─────────────────────────

function mapUnit(val) {
  if (val === undefined) return undefined;
  const str = String(val);
  const mapped = UNIT_MAP[str];
  if (!mapped) throw new RangeError(`Invalid unit: ${val}`);
  return mapped;
}

function mapRoundingMode(val) {
  if (val === undefined) return undefined;
  const str = String(val);
  const mapped = ROUNDING_MODE_MAP[str];
  if (!mapped) throw new RangeError(`Invalid rounding mode: ${val}`);
  return mapped;
}

function mapOverflow(val) {
  if (val === undefined) return undefined;
  const str = String(val);
  const mapped = OVERFLOW_MAP[str];
  if (!mapped) throw new RangeError(`Invalid overflow: ${val}`);
  return mapped;
}

function mapDisplayCalendar(val) {
  if (val === undefined) return undefined;
  const str = String(val);
  const mapped = DISPLAY_CALENDAR_MAP[str];
  if (!mapped) throw new RangeError(`Invalid calendarName option: ${val}`);
  return mapped;
}

function mapDisplayTimeZone(val) {
  if (val === undefined) return undefined;
  const str = String(val);
  const mapped = DISPLAY_TIMEZONE_MAP[str];
  if (!mapped) throw new RangeError(`Invalid timeZoneName option: ${val}`);
  return mapped;
}

function mapDisplayOffset(val) {
  if (val === undefined) return undefined;
  const str = String(val);
  const mapped = DISPLAY_OFFSET_MAP[str];
  if (!mapped) throw new RangeError(`Invalid offset option: ${val}`);
  return mapped;
}

// ─── Helper: wrap NAPI errors ─────────────────────────────────

function wrapError(e) {
  if (e instanceof TypeError || e instanceof RangeError) return e;
  const msg = e?.message || String(e);
  // NAPI binding prefixes errors with the intended type: "RangeError: ..." or "TypeError: ..."
  if (msg.startsWith('TypeError:')) {
    return new TypeError(msg.slice('TypeError:'.length).trim());
  }
  if (msg.startsWith('RangeError:')) {
    return new RangeError(msg.slice('RangeError:'.length).trim());
  }
  // Heuristic fallback for messages without a prefix
  if (msg.includes('not a') || msg.includes('expected') || msg.includes('requires') || msg.includes('must be')) {
    return new TypeError(msg);
  }
  return new RangeError(msg);
}

function call(fn) {
  try {
    return fn();
  } catch (e) {
    throw wrapError(e);
  }
}

// ─── Helper: convert to NAPI Calendar ─────────────────────────

function toNapiCalendar(cal) {
  if (cal === undefined) return undefined;
  if (cal === null || typeof cal === 'boolean' || typeof cal === 'number' || typeof cal === 'bigint' || typeof cal === 'symbol') {
    throw new TypeError(`${typeof cal === 'symbol' ? 'symbol' : String(cal)} is not a valid calendar`);
  }
  if (cal instanceof NapiCalendar) return cal;
  if (typeof cal === 'string') {
    const canonCal = canonicalizeCalendarId(cal);
    // Try direct calendar ID first
    if (VALID_CALENDAR_IDS.has(canonCal)) return call(() => new NapiCalendar(canonCal));
    // Per spec, reject -000000 (negative year zero)
    if (/^-000000/.test(cal) || /\[u-ca=[^\]]*-000000/.test(cal)) {
      throw new RangeError('negative zero year is not allowed');
    }
    // Per spec, ToTemporalCalendar extracts the calendar from ISO/time strings
    // Try to extract calendar annotation from the string
    const match = cal.match(/\[u-ca=([^\]]+)\]/);
    if (match) return call(() => new NapiCalendar(canonicalizeCalendarId(match[1])));
    // Check if it looks like an ISO datetime string
    if (/^\d{4}-\d{2}/.test(cal) || /^[+-]\d{6}/.test(cal) || /^\+\d{4}/.test(cal)) {
      return call(() => new NapiCalendar('iso8601'));
    }
    // Check if it looks like a time string (e.g. "15:23", "152330", "T15:23:30")
    const timeStr = cal.startsWith('T') || cal.startsWith('t') ? cal.substring(1) : cal;
    if (/^\d{2}(:\d{2}(:\d{2})?)?/.test(timeStr) || /^\d{6}/.test(timeStr) || /^\d{4}$/.test(timeStr)) {
      return call(() => new NapiCalendar('iso8601'));
    }
    return call(() => new NapiCalendar(cal));
  }
  if (typeof cal === 'object') {
    // Handle Temporal objects used as calendar (extract calendarId)
    if (cal._inner instanceof NapiPlainDate || cal._inner instanceof NapiPlainDateTime ||
        cal._inner instanceof NapiPlainYearMonth || cal._inner instanceof NapiPlainMonthDay ||
        cal._inner instanceof NapiZonedDateTime) {
      const calId = cal._inner.calendar.id;
      return call(() => new NapiCalendar(calId));
    }
    if (cal._inner instanceof NapiCalendar) return cal._inner;
    // Handle Duration instances (wrong type)
    if (cal._inner instanceof NapiDuration) {
      throw new TypeError('Duration is not a valid calendar');
    }
    if (cal.id !== undefined) return call(() => new NapiCalendar(String(cal.id)));
    if (cal.calendarId !== undefined) return call(() => new NapiCalendar(cal.calendarId));
    if (cal.calendar !== undefined) return toNapiCalendar(cal.calendar);
  }
  throw new TypeError('Invalid calendar');
}

const VALID_CALENDAR_IDS = new Set([
  'iso8601', 'gregory', 'japanese', 'buddhist', 'chinese', 'coptic',
  'dangi', 'ethiopian', 'ethioaa', 'hebrew', 'indian', 'islamic',
  'islamic-civil', 'islamic-tbla', 'islamic-umalqura', 'islamic-rgsa',
  'persian', 'roc',
]);

// Calendar ID canonicalization per CLDR
const CALENDAR_ALIASES = {
  'islamicc': 'islamic-civil',
  'ethiopic-amete-alem': 'ethioaa',
};

function canonicalizeCalendarId(id) {
  return CALENDAR_ALIASES[id] || id;
}

// ─── Helper: convert to NAPI TimeZone ─────────────────────────

function toNapiTimeZone(tz) {
  if (tz === undefined) return undefined;
  if (tz === null || typeof tz === 'boolean' || typeof tz === 'number' || typeof tz === 'bigint' || typeof tz === 'symbol') {
    throw new TypeError(`${typeof tz === 'symbol' ? 'symbol' : String(tz)} is not a valid time zone`);
  }
  if (tz instanceof NapiTimeZone) return tz;
  if (typeof tz === 'string') return call(() => new NapiTimeZone(tz));
  if (typeof tz === 'object' && tz._inner instanceof NapiTimeZone) return tz._inner;
  if (typeof tz === 'object' && tz._inner instanceof NapiZonedDateTime) {
    // Temporal.ZonedDateTime can be used as a timeZone (extract its timeZone)
    return tz._inner.timeZone;
  }
  if (typeof tz === 'object' && tz.id) return call(() => new NapiTimeZone(String(tz.id)));
  if (typeof tz === 'object' && tz.timeZone !== undefined) return toNapiTimeZone(tz.timeZone);
  throw new TypeError('Invalid time zone');
}

// ─── Helper: convert to NAPI Duration ─────────────────────────

const _wrapperSet = new WeakSet();

function toNapiDuration(arg) {
  if (arg instanceof NapiDuration) return arg;
  if (arg && _wrapperSet.has(arg) && arg._inner instanceof NapiDuration) return arg._inner;
  if (typeof arg === 'string') return call(() => NapiDuration.from(arg));
  if (typeof arg === 'object' && arg !== null) {
    const { years, months, weeks, days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds } = arg;
    // Per spec, at least one duration-like property must be present
    if (years === undefined && months === undefined && weeks === undefined && days === undefined &&
        hours === undefined && minutes === undefined && seconds === undefined &&
        milliseconds === undefined && microseconds === undefined && nanoseconds === undefined) {
      throw new TypeError('Invalid duration-like argument: at least one property must be present');
    }
    // Convert to numbers with ToIntegerIfIntegral per spec
    const vals = {
      years: toIntegerIfIntegral(years),
      months: toIntegerIfIntegral(months),
      weeks: toIntegerIfIntegral(weeks),
      days: toIntegerIfIntegral(days),
      hours: toIntegerIfIntegral(hours),
      minutes: toIntegerIfIntegral(minutes),
      seconds: toIntegerIfIntegral(seconds),
      milliseconds: toIntegerIfIntegral(milliseconds),
      microseconds: toIntegerIfIntegral(microseconds),
      nanoseconds: toIntegerIfIntegral(nanoseconds),
    };
    return call(() => new NapiDuration(
      vals.years, vals.months, vals.weeks, vals.days,
      vals.hours, vals.minutes, vals.seconds,
      vals.milliseconds, vals.microseconds, vals.nanoseconds,
    ));
  }
  throw new TypeError('Invalid duration-like argument');
}

// ─── Helper: parse monthCode to month number ─────────────────

const THIRTEEN_MONTH_CALENDARS = new Set(['hebrew', 'chinese', 'dangi', 'ethiopian', 'ethioaa', 'ethiopic', 'coptic']);

function monthCodeToMonth(monthCode, calendarId) {
  if (monthCode === undefined) return undefined;
  // Per spec, monthCode is converted via ToString (not RequireString)
  if (typeof monthCode === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
  const str = String(monthCode);
  if (!str) throw new RangeError('Invalid monthCode: empty string');
  const m = str.match(/^M(\d{2})(L?)$/);
  if (!m) throw new RangeError(`Invalid monthCode: ${str}`);
  const monthNum = parseInt(m[1], 10);
  const isLeap = m[2] === 'L';
  // Validate month number: must be >= 1
  if (monthNum < 1) throw new RangeError(`Invalid monthCode: ${str}`);
  // For non-13-month calendars, month must be <= 12 and no leap suffix
  if (calendarId && !THIRTEEN_MONTH_CALENDARS.has(calendarId)) {
    if (monthNum > 12) throw new RangeError(`Invalid monthCode for ${calendarId} calendar: ${str}`);
    if (isLeap) throw new RangeError(`Invalid monthCode for ${calendarId} calendar: ${str}`);
  } else {
    // For 13-month calendars, month <= 13
    if (monthNum > 13) throw new RangeError(`Invalid monthCode: ${str}`);
  }
  return monthNum;
}

// ─── Helper: resolve month from month/monthCode ───────────────

function resolveMonth(bag, calendarId) {
  let month = toInteger(bag.month);
  // Per spec, month is truncated to integer (ToPositiveIntegerWithTruncation)
  if (month !== undefined) month = _trunc(month);
  const { monthCode } = bag;
  if (month !== undefined && monthCode !== undefined) {
    const fromCode = monthCodeToMonth(monthCode, calendarId);
    if (fromCode !== month) {
      throw new RangeError(`month ${month} and monthCode ${monthCode} do not agree`);
    }
    return month;
  }
  if (month !== undefined) return month;
  if (monthCode !== undefined) return monthCodeToMonth(monthCode, calendarId);
  return undefined;
}

// ─── Helper: resolve era/eraYear to year ──────────────────────

function resolveEraYear(fields, calendarId) {
  if (fields.era !== undefined && fields.eraYear !== undefined) {
    if (fields.year === undefined) {
      if (calendarId === 'gregory' || calendarId === 'iso8601') {
        if (fields.era === 'ce' || fields.era === 'ad') {
          fields.year = fields.eraYear;
        } else if (fields.era === 'bce' || fields.era === 'bc') {
          fields.year = 1 - fields.eraYear;
        }
      } else if (calendarId === 'japanese') {
        // Japanese calendar - approximate: just use eraYear
        fields.year = fields.eraYear;
      } else if (calendarId === 'roc') {
        // ROC calendar: era "minguo" -> year = eraYear, era "before-roc" -> year = 1 - eraYear
        if (fields.era === 'minguo') {
          fields.year = fields.eraYear;
        } else if (fields.era === 'before-roc') {
          fields.year = 1 - fields.eraYear;
        } else {
          fields.year = fields.eraYear;
        }
      } else if (calendarId === 'ethiopian' || calendarId === 'ethioaa') {
        fields.year = fields.eraYear;
      } else if (calendarId === 'coptic') {
        if (fields.era === 'era1' || fields.era === 'coptic') {
          fields.year = fields.eraYear;
        } else if (fields.era === 'era0' || fields.era === 'coptic-inverse') {
          fields.year = 1 - fields.eraYear;
        } else {
          fields.year = fields.eraYear;
        }
      } else {
        // For other calendars, just use eraYear as year
        fields.year = fields.eraYear;
      }
    }
  }
  // Per spec, if only one of era/eraYear is present, ignore them and use year
  // Do NOT throw - just silently ignore the incomplete era pair
  return fields;
}

// ─── Helper: get calendar ID from various sources ─────────────

function getCalendarId(calArg) {
  if (calArg === undefined || calArg === null) return 'iso8601';
  if (typeof calArg === 'string') return calArg;
  if (calArg && typeof calArg === 'object' && calArg.id) return calArg.id;
  return 'iso8601';
}

// ─── Calendars where months align with ISO months ─────────────
// These calendars only differ from ISO in the year offset; months are the same.
const ISO_MONTH_ALIGNED_CALENDARS = new Set(['iso8601', 'gregory', 'buddhist', 'roc', 'japanese']);

// ─── Helper: convert calendar date fields to ISO date fields ──
// For non-ISO calendars, the "year", "month", "day" in a property bag are
// calendar values, but the NAPI constructors expect ISO year/month/day.
// This function converts (calYear, calMonth, calDay, calId) → {isoYear, isoMonth, isoDay}.

function calendarDateToISO(targetCalYear, calMonth, calDay, calId) {
  // ISO and Gregorian: no conversion needed
  if (calId === 'iso8601' || calId === 'gregory') {
    return { isoYear: targetCalYear, isoMonth: calMonth, isoDay: calDay };
  }

  const cal = toNapiCalendar(calId);

  // For month-aligned calendars (buddhist, roc, japanese), only the year differs
  if (ISO_MONTH_ALIGNED_CALENDARS.has(calId)) {
    let isoYear = targetCalYear;
    try {
      let d = new NapiPlainDate(isoYear, calMonth || 6, calDay || 15, cal);
      let diff = targetCalYear - d.year;
      for (let i = 0; i < 10 && diff !== 0; i++) {
        isoYear += diff;
        try {
          d = new NapiPlainDate(isoYear, calMonth || 6, calDay || 15, cal);
        } catch {
          d = new NapiPlainDate(isoYear, 1, 1, cal);
        }
        diff = targetCalYear - d.year;
      }
    } catch {
      // Fallback: return as-is
    }
    return { isoYear, isoMonth: calMonth, isoDay: calDay };
  }

  // For all other calendars (indian, persian, coptic, ethiopic, ethioaa, hebrew,
  // islamic-*, chinese, dangi), months don't align with ISO months.
  // Strategy: find the ISO date that corresponds to (calYear, calMonth, calDay).
  // 1. Find approximate ISO year via mid-year probe
  // 2. Then scan for the exact date by iterating ISO dates and checking calendar fields

  let isoYear = targetCalYear;
  try {
    // Step 1: Find approximate ISO year
    let d = new NapiPlainDate(isoYear, 6, 15, cal);
    let diff = targetCalYear - d.year;
    for (let i = 0; i < 10 && diff !== 0; i++) {
      isoYear += diff;
      try {
        d = new NapiPlainDate(isoYear, 6, 15, cal);
      } catch {
        d = new NapiPlainDate(isoYear, 1, 1, cal);
      }
      diff = targetCalYear - d.year;
    }

    // Step 2: Find the first day of the target calendar month in this ISO year range.
    // We need to scan ISO dates to find the one where calYear/calMonth/calDay match.
    // Start from beginning of the ISO year and scan forward.
    const targetMonth = calMonth || 1;
    const targetDay = calDay || 1;

    // Try each month in a range of ISO months around the expected area
    // For calendars with year start not in January, we may need to look in isoYear-1 or isoYear+1
    for (let yOff = -1; yOff <= 1; yOff++) {
      const tryIsoYear = isoYear + yOff;
      for (let m = 1; m <= 12; m++) {
        for (const tryDay of [1, 15, 28]) {
          try {
            const probe = new NapiPlainDate(tryIsoYear, m, tryDay, cal);
            if (probe.year === targetCalYear && probe.month === targetMonth) {
              // Found the right month. Now find the exact day.
              // Calculate day offset from probe
              const dayDiff = targetDay - probe.day;
              if (dayDiff === 0) {
                return { isoYear: tryIsoYear, isoMonth: m, isoDay: tryDay };
              }
              // Adjust ISO day
              let exactIsoDay = tryDay + dayDiff;
              // Handle month boundaries
              if (exactIsoDay >= 1 && exactIsoDay <= 28) {
                try {
                  const exact = new NapiPlainDate(tryIsoYear, m, exactIsoDay, cal);
                  if (exact.year === targetCalYear && exact.month === targetMonth && exact.day === targetDay) {
                    return { isoYear: tryIsoYear, isoMonth: m, isoDay: exactIsoDay };
                  }
                } catch { /* continue */ }
              }
              // If simple offset didn't work, try a date arithmetic approach
              // Use the probe date and add/subtract days via epoch calculation
              const probeEpoch = isoDateToEpochDays(tryIsoYear, m, tryDay);
              const targetEpoch = probeEpoch + dayDiff;
              const result = epochDaysToISO(targetEpoch);
              try {
                const verify = new NapiPlainDate(result.year, result.month, result.day, cal);
                if (verify.year === targetCalYear && verify.month === targetMonth && verify.day === targetDay) {
                  return { isoYear: result.year, isoMonth: result.month, isoDay: result.day };
                }
              } catch { /* continue */ }
            }
          } catch { /* out of range, continue */ }
        }
      }
    }
  } catch {
    // Fallback
  }

  // Final fallback: return the year-only conversion (better than nothing)
  return { isoYear: isoYear, isoMonth: calMonth, isoDay: calDay };
}

// Helper: convert ISO date to epoch days (days since 1970-01-01)
function isoDateToEpochDays(year, month, day) {
  // Use Date.UTC for simplicity
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

// Helper: convert epoch days back to ISO date
function epochDaysToISO(epochDays) {
  const ms = epochDays * 86400000;
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}


// ─── Helper: convert to NAPI PlainDate ────────────────────────

function toNapiPlainDate(arg) {
  if (arg instanceof NapiPlainDate) return arg;
  if (arg && arg._inner instanceof NapiPlainDate) return arg._inner;
  if (typeof arg === 'string') { rejectTooManyFractionalSeconds(arg); return call(() => NapiPlainDate.from(arg)); }
  if (typeof arg === 'object' && arg !== null) {
    // Accept PlainDateTime-like objects too (they have year/month/day)
    if (arg._inner instanceof NapiPlainDateTime) {
      const dt = arg._inner;
      return call(() => new NapiPlainDate(dt.year, dt.month, dt.day, dt.calendar));
    }
    if (arg._inner instanceof NapiZonedDateTime) {
      return arg._inner.toPlainDate();
    }
    const calId = getCalendarId(arg.calendar);
    const cal = toNapiCalendar(arg.calendar);
    const fields = { year: toInteger(arg.year), day: toInteger(arg.day), era: arg.era, eraYear: toInteger(arg.eraYear) };
    resolveEraYear(fields, calId);
    const year = fields.year;
    const day = fields.day;
    const month = resolveMonth(arg, calId);
    if (year !== undefined && month !== undefined && day !== undefined) {
      rejectPropertyBagInfinity({ year, month, day }, 'year', 'month', 'day');
      const iso = calendarDateToISO(year, month, day, calId);
      return call(() => new NapiPlainDate(iso.isoYear, iso.isoMonth, iso.isoDay, cal));
    }
    if (year === undefined) throw new TypeError('Required property year is missing');
    if (month === undefined && arg.monthCode === undefined) throw new TypeError('Required property month or monthCode is missing');
    if (day === undefined) throw new TypeError('Required property day is missing');
    throw new TypeError('Missing required date fields');
  }
  throw new TypeError('Invalid PlainDate argument');
}

// ─── Helper: convert to NAPI PlainTime ────────────────────────

function toNapiPlainTime(arg) {
  if (arg instanceof NapiPlainTime) return arg;
  if (arg && arg._inner instanceof NapiPlainTime) return arg._inner;
  if (typeof arg === 'string') { rejectTooManyFractionalSeconds(arg); return call(() => NapiPlainTime.from(arg)); }
  if (typeof arg === 'object' && arg !== null) {
    if (arg._inner instanceof NapiPlainDateTime) {
      const dt = arg._inner;
      return call(() => new NapiPlainTime(dt.hour, dt.minute, dt.second, dt.millisecond, dt.microsecond, dt.nanosecond));
    }
    if (arg._inner instanceof NapiZonedDateTime) {
      return arg._inner.toPlainTime();
    }
    // Per spec, at least one time-like property must be present
    if (arg.hour === undefined && arg.minute === undefined && arg.second === undefined &&
        arg.millisecond === undefined && arg.microsecond === undefined && arg.nanosecond === undefined) {
      throw new TypeError('Invalid PlainTime argument: at least one time property must be present');
    }
    rejectPropertyBagInfinity(arg, 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond');
    return call(() => new NapiPlainTime(
      arg.hour || 0,
      arg.minute || 0,
      arg.second || 0,
      arg.millisecond,
      arg.microsecond,
      arg.nanosecond,
    ));
  }
  throw new TypeError('Invalid PlainTime argument');
}

// ─── Helper: convert to NAPI PlainDateTime ────────────────────

function toNapiPlainDateTime(arg) {
  if (arg instanceof NapiPlainDateTime) return arg;
  if (arg && arg._inner instanceof NapiPlainDateTime) return arg._inner;
  if (typeof arg === 'string') { rejectTooManyFractionalSeconds(arg); return call(() => NapiPlainDateTime.from(arg)); }
  if (typeof arg === 'object' && arg !== null) {
    if (arg._inner instanceof NapiPlainDate) {
      const d = arg._inner;
      return call(() => new NapiPlainDateTime(d.year, d.month, d.day, 0, 0, 0, 0, 0, 0, d.calendar));
    }
    if (arg._inner instanceof NapiZonedDateTime) {
      return arg._inner.toPlainDateTime();
    }
    const calId = getCalendarId(arg.calendar);
    const cal = toNapiCalendar(arg.calendar);
    const fields = { year: toInteger(arg.year), era: arg.era, eraYear: toInteger(arg.eraYear) };
    resolveEraYear(fields, calId);
    if (fields.year === undefined) throw new TypeError('Required property year is missing or undefined');
    const month = resolveMonth(arg, calId);
    if (month === undefined && arg.monthCode === undefined) throw new TypeError('Required property month or monthCode is missing');
    const day = toInteger(arg.day);
    if (day === undefined) throw new TypeError('Required property day is missing or undefined');
    const hour = toInteger(arg.hour);
    const minute = toInteger(arg.minute);
    const second = toInteger(arg.second);
    const millisecond = toInteger(arg.millisecond);
    const microsecond = toInteger(arg.microsecond);
    const nanosecond = toInteger(arg.nanosecond);
    rejectPropertyBagInfinity({ year: fields.year, month, day, hour, minute, second, millisecond, microsecond, nanosecond }, 'year', 'month', 'day', 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond');
    const iso = calendarDateToISO(fields.year, month, day, calId);
    return call(() => new NapiPlainDateTime(
      iso.isoYear, iso.isoMonth, iso.isoDay,
      hour, minute, second,
      millisecond, microsecond, nanosecond,
      cal,
    ));
  }
  throw new TypeError('Invalid PlainDateTime argument');
}

// ─── Helper: convert to NAPI ZonedDateTime ────────────────────

function toNapiZonedDateTime(arg) {
  if (arg instanceof NapiZonedDateTime) return arg;
  if (arg && arg._inner instanceof NapiZonedDateTime) return arg._inner;
  if (typeof arg === 'string') { rejectTooManyFractionalSeconds(arg); return call(() => NapiZonedDateTime.from(arg)); }
  if (typeof arg === 'object' && arg !== null) {
    // Property bag with timeZone required
    if (arg.timeZone === undefined) {
      throw new TypeError('Missing timeZone in ZonedDateTime property bag');
    }
    const calId = getCalendarId(arg.calendar);
    const fields = { year: toInteger(arg.year), era: arg.era, eraYear: toInteger(arg.eraYear) };
    resolveEraYear(fields, calId);
    const tz = toNapiTimeZone(arg.timeZone);
    const calYear = fields.year || 0;
    const monthVal = resolveMonth(arg, calId);
    let month = monthVal || 1;
    let day = toInteger(arg.day) || 1;
    const hour = toInteger(arg.hour) || 0;
    const minute = toInteger(arg.minute) || 0;
    const second = toInteger(arg.second) || 0;
    // Constrain values to valid ISO ranges
    month = Math.max(1, Math.min(month, 13));
    day = Math.max(1, Math.min(day, 31));
    const pad2 = n => String(n).padStart(2, '0');
    const padYear = n => {
      if (n < 0 || n >= 10000) {
        const s = String(Math.abs(n)).padStart(6, '0');
        return (n < 0 ? '-' : '+') + s;
      }
      return String(n).padStart(4, '0');
    };
    // Convert calendar date to ISO date for non-ISO calendars
    const cal = toNapiCalendar(arg.calendar);
    const iso = calendarDateToISO(calYear, month, day, calId);
    let isoMonth = iso.isoMonth;
    let isoDay = iso.isoDay;
    const year = iso.isoYear;
    try {
      const pd = call(() => new NapiPlainDate(year, isoMonth, isoDay, cal));
      isoDay = pd.day;
      isoMonth = pd.month;
    } catch {
      // Try max valid day
      for (let d = 28; d <= 31; d++) {
        try { call(() => new NapiPlainDate(year, isoMonth, d, cal)); isoDay = d; } catch { break; }
      }
    }
    let str = `${padYear(year)}-${pad2(isoMonth)}-${pad2(isoDay)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
    if (arg.millisecond || arg.microsecond || arg.nanosecond) {
      const pad3 = n => String(n || 0).padStart(3, '0');
      const frac = pad3(arg.millisecond || 0) + pad3(arg.microsecond || 0) + pad3(arg.nanosecond || 0);
      str += '.' + frac.replace(/0+$/, '');
    }
    const calStr = arg.calendar ? `[u-ca=${typeof arg.calendar === 'string' ? arg.calendar : arg.calendar.id || 'iso8601'}]` : '';
    str += '[' + tz.id + ']' + calStr;
    return call(() => NapiZonedDateTime.from(str));
  }
  throw new TypeError('Invalid ZonedDateTime argument');
}

// ─── Helper: convert to NAPI Instant ──────────────────────────

function toNapiInstant(arg) {
  if (arg instanceof NapiInstant) return arg;
  if (arg && arg._inner instanceof NapiInstant) return arg._inner;
  if (typeof arg === 'string') return call(() => NapiInstant.from(arg));
  throw new TypeError('Invalid Instant argument');
}

// ─── Helper: convert to NAPI PlainYearMonth ───────────────────

function toNapiPlainYearMonth(arg) {
  if (arg instanceof NapiPlainYearMonth) return arg;
  if (arg && arg._inner instanceof NapiPlainYearMonth) return arg._inner;
  if (typeof arg === 'string') { rejectTooManyFractionalSeconds(arg); return call(() => NapiPlainYearMonth.from(arg)); }
  if (typeof arg === 'object' && arg !== null) {
    const calId = getCalendarId(arg.calendar);
    const cal = toNapiCalendar(arg.calendar);
    const fields = { year: toInteger(arg.year), era: arg.era, eraYear: toInteger(arg.eraYear) };
    resolveEraYear(fields, calId);
    if (fields.year === undefined) throw new TypeError('Required property year is missing or undefined');
    const month = resolveMonth(arg, calId);
    if (month === undefined && arg.monthCode === undefined) throw new TypeError('Required property month or monthCode is missing');
    rejectPropertyBagInfinity({ year: fields.year, month }, 'year', 'month');
    const refDay = toInteger(arg.day) || 1;
    const iso = calendarDateToISO(fields.year, month, refDay, calId);
    return call(() => new NapiPlainYearMonth(iso.isoYear, iso.isoMonth, cal, iso.isoDay));
  }
  throw new TypeError('Invalid PlainYearMonth argument');
}

// ─── Helper: convert to NAPI PlainMonthDay ────────────────────

function toNapiPlainMonthDay(arg) {
  if (arg instanceof NapiPlainMonthDay) return arg;
  if (arg && arg._inner instanceof NapiPlainMonthDay) return arg._inner;
  if (typeof arg === 'string') { rejectTooManyFractionalSeconds(arg); return call(() => NapiPlainMonthDay.from(arg)); }
  if (typeof arg === 'object' && arg !== null) {
    const mdCalId = getCalendarId(arg.calendar);
    const cal = toNapiCalendar(arg.calendar);
    if (arg.day === undefined) throw new TypeError('Required property day is missing or undefined');
    if (arg.month === undefined && arg.monthCode === undefined) throw new TypeError('Required property monthCode is missing');
    // If monthCode is provided, derive month from it; otherwise use the month directly
    let month = arg.month;
    if (arg.monthCode !== undefined) {
      month = monthCodeToMonth(arg.monthCode, mdCalId);
    }
    return call(() => new NapiPlainMonthDay(month, arg.day, cal, arg.year));
  }
  throw new TypeError('Invalid PlainMonthDay argument');
}

// ─── Helper: convert DifferenceSettings ───────────────────────

function convertDifferenceSettings(options) {
  if (options === undefined) return undefined;
  validateOptions(options);
  const result = {};
  if (options.largestUnit !== undefined) result.largestUnit = mapUnit(options.largestUnit);
  if (options.smallestUnit !== undefined) result.smallestUnit = mapUnit(options.smallestUnit);
  if (options.roundingMode !== undefined) result.roundingMode = mapRoundingMode(options.roundingMode);
  if (options.roundingIncrement !== undefined) {
    result.roundingIncrement = coerceRoundingIncrement(options.roundingIncrement);
  }
  return result;
}

// ─── Helper: coerce roundingIncrement per spec ────────────────

function coerceRoundingIncrement(value) {
  if (typeof value === 'bigint') throw new TypeError('Cannot convert a BigInt to a Number');
  if (typeof value === 'symbol') throw new TypeError('Cannot convert a Symbol to a Number');
  const n = Number(value);
  if (n !== n || n < 1 || n === Infinity || n === -Infinity) {
    throw new RangeError('roundingIncrement must be a positive finite number');
  }
  return Math.floor(n);
}

// ─── Helper: extract relativeTo for Duration methods ──────────

function extractRelativeTo(rt) {
  let relativeToDate = null;
  let relativeToZdt = null;
  if (rt === undefined) return { relativeToDate, relativeToZdt };
  if (rt === null || typeof rt === 'boolean' || typeof rt === 'number' || typeof rt === 'bigint' || typeof rt === 'symbol') {
    throw new TypeError('relativeTo must be a Temporal object or string');
  }
  if (rt instanceof ZonedDateTime || (rt && rt._inner instanceof NapiZonedDateTime)) {
    relativeToZdt = rt._inner || rt;
    return { relativeToDate, relativeToZdt };
  }
  if (rt instanceof PlainDate || (rt && rt._inner instanceof NapiPlainDate)) {
    relativeToDate = rt._inner || rt;
    return { relativeToDate, relativeToZdt };
  }
  if (rt instanceof PlainDateTime || (rt && rt._inner instanceof NapiPlainDateTime)) {
    const dt = rt._inner || rt;
    relativeToDate = call(() => new NapiPlainDate(dt.year, dt.month, dt.day, dt.calendar));
    return { relativeToDate, relativeToZdt };
  }
  if (typeof rt === 'string') {
    // Try parsing as ZonedDateTime first (has timezone annotation), then PlainDate
    try {
      if (rt.includes('[') && !rt.startsWith('[')) {
        const zdt = call(() => NapiZonedDateTime.from(rt));
        relativeToZdt = zdt;
        return { relativeToDate, relativeToZdt };
      }
    } catch { /* fall through */ }
    try {
      const pd = call(() => NapiPlainDate.from(rt));
      relativeToDate = pd;
      return { relativeToDate, relativeToZdt };
    } catch (e) { throw wrapError(e); }
  }
  if (typeof rt === 'object' && rt !== null) {
    if (rt.timeZone !== undefined) {
      const zdt = toNapiZonedDateTime(rt);
      relativeToZdt = zdt;
      return { relativeToDate, relativeToZdt };
    }
    const pd = toNapiPlainDate(rt);
    relativeToDate = pd;
    return { relativeToDate, relativeToZdt };
  }
  throw new TypeError('relativeTo must be a Temporal object or string');
}

// ─── Helper: convert RoundingOptions ──────────────────────────

function convertRoundingOptions(options) {
  if (options === undefined) return Object.assign(Object.create(null), { smallestUnit: undefined });
  if (typeof options === 'string') {
    return Object.assign(Object.create(null), { smallestUnit: mapUnit(options) });
  }
  validateOptions(options);
  const result = Object.create(null);
  const lu = options.largestUnit;
  if (lu !== undefined) result.largestUnit = mapUnit(lu);
  const su = options.smallestUnit;
  if (su !== undefined) result.smallestUnit = mapUnit(su);
  const rm = options.roundingMode;
  if (rm !== undefined) result.roundingMode = mapRoundingMode(rm);
  const ri = options.roundingIncrement;
  if (ri !== undefined) {
    result.roundingIncrement = coerceRoundingIncrement(ri);
  }
  return result;
}

// ─── Helper: resolve fractionalSecondDigits per spec ──────────

function resolveFractionalSecondDigits(fsd) {
  // GetStringOrNumberOption: if typeof is 'number', use as number; else convert to string
  if (fsd === undefined) return undefined; // use default
  if (typeof fsd === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
  if (typeof fsd === 'number') {
    if (fsd !== fsd) throw new RangeError('fractionalSecondDigits must be "auto" or a number 0-9');
    const n = Math.floor(fsd);
    if (n < 0 || n > 9) throw new RangeError('fractionalSecondDigits must be "auto" or an integer 0-9');
    return n;
  }
  // Not a number type: convert to string
  const str = String(fsd);
  if (str === 'auto') return 'auto';
  throw new RangeError(`${str} is not a valid value for fractionalSecondDigits`);
}

// ─── Helper: convert ToStringRoundingOptions for PlainTime/PlainDateTime ──

function convertToStringOptions(options) {
  if (options === undefined) return { roundingOptions: undefined, displayCalendar: undefined };
  validateOptions(options);
  const roundingOptions = {};
  const fsd = resolveFractionalSecondDigits(options.fractionalSecondDigits);
  if (fsd !== undefined && fsd !== 'auto') {
    roundingOptions.precision = fsd;
  }
  if (options.smallestUnit !== undefined) {
    roundingOptions.smallestUnit = mapUnit(options.smallestUnit);
    if (options.smallestUnit === 'minute') {
      roundingOptions.isMinute = true;
    }
  }
  if (options.roundingMode !== undefined) {
    roundingOptions.roundingMode = mapRoundingMode(options.roundingMode);
  }
  return {
    roundingOptions: Object.keys(roundingOptions).length > 0 ? roundingOptions : undefined,
    displayCalendar: mapDisplayCalendar(options.calendarName),
  };
}

// ─── Helper: convert ZonedDateTime/Instant toString options ───

function convertZdtToStringOptions(options) {
  if (options === undefined) return {};
  validateOptions(options);
  const result = {};
  const fsd = resolveFractionalSecondDigits(options.fractionalSecondDigits);
  if (fsd !== undefined && fsd !== 'auto') {
    result.precision = fsd;
  }
  if (options.smallestUnit !== undefined) {
    result.smallestUnit = mapUnit(options.smallestUnit);
  }
  if (options.roundingMode !== undefined) {
    result.roundingMode = mapRoundingMode(options.roundingMode);
  }
  if (options.calendarName !== undefined) {
    result.displayCalendar = mapDisplayCalendar(options.calendarName);
  }
  if (options.timeZoneName !== undefined) {
    result.displayTimeZone = mapDisplayTimeZone(options.timeZoneName);
  }
  if (options.offset !== undefined) {
    result.displayOffset = mapDisplayOffset(options.offset);
  }
  return result;
}

// ─── Helper: wrap NAPI result back into wrapper ───────────────

// ─── Helper: branding check for prototype methods ─────────────

function requireBranding(thisObj, NapiClass, typeName) {
  if (!thisObj || typeof thisObj !== 'object' || !(thisObj._inner instanceof NapiClass)) {
    throw new TypeError(`${typeName} expected`);
  }
}

function wrapDuration(napi) { return napi ? new Duration(napi) : napi; }
function wrapPlainDate(napi) { return napi ? new PlainDate(napi) : napi; }
function wrapPlainTime(napi) { return napi ? new PlainTime(napi) : napi; }
function wrapPlainDateTime(napi) { return napi ? new PlainDateTime(napi) : napi; }
function wrapZonedDateTime(napi) { return napi ? new ZonedDateTime(napi) : napi; }
function wrapInstant(napi) { return napi ? new Instant(napi) : napi; }
function wrapPlainYearMonth(napi) { return napi ? new PlainYearMonth(napi) : napi; }
function wrapPlainMonthDay(napi) { return napi ? new PlainMonthDay(napi) : napi; }

// ─── Helper: validate options argument per spec ───────────────

function validateOptions(options) {
  if (options === undefined) return undefined;
  if (options === null || (typeof options !== 'object' && typeof options !== 'function')) {
    throw new TypeError('Options must be an object or undefined');
  }
  return options;
}

// ─── Helper: extract overflow from options ────────────────────

function extractOverflow(options) {
  if (options === undefined) return undefined;
  validateOptions(options);
  return mapOverflow(options.overflow);
}

// ─── Helper: reject Infinity values per spec ─────────────────

function rejectInfinity(value, name) {
  if (value === Infinity || value === -Infinity) {
    throw new RangeError(`${name} property cannot be Infinity`);
  }
}

// ISO date range validation for constructors (always reject mode)
function rejectISODateRange(year, month, day) {
  if (month < 1 || month > 12) throw new RangeError(`Invalid month: ${month}`);
  if (day < 1) throw new RangeError(`Invalid day: ${day}`);
  // Days in each month for ISO calendar
  const daysInMonth = [31, (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > daysInMonth[month - 1]) throw new RangeError(`Invalid day ${day} for month ${month}`);
}

function rejectPropertyBagInfinity(bag, ...fields) {
  for (const f of fields) {
    if (bag[f] !== undefined) rejectInfinity(bag[f], f);
  }
}

// ─── Helper: coerce property bag values to numbers ────────────

function toInteger(val) {
  if (val === undefined) return undefined;
  if (typeof val === 'number') return val;
  if (typeof val === 'bigint') throw new TypeError('Cannot convert a BigInt value to a number');
  if (typeof val === 'symbol') throw new TypeError('Cannot convert a Symbol value to a number');
  return Number(val);
}

// ToIntegerIfIntegral per spec: rejects BigInt, Symbol, and non-integral numbers
// NOTE: Use cached intrinsics to avoid test262 monkey-patching detection
const _isFinite = Number.isFinite;
const _trunc = Math.trunc;
function toIntegerIfIntegral(val) {
  if (val === undefined) return undefined;
  if (typeof val === 'bigint') throw new TypeError('Cannot convert a BigInt value to a number');
  if (typeof val === 'symbol') throw new TypeError('Cannot convert a Symbol value to a number');
  const n = +val; // ToNumber abstract operation
  if (!_isFinite(n)) throw new RangeError(`${val} is not a finite number`);
  if (n !== _trunc(n)) throw new RangeError(`${val} is not an integer`);
  return n;
}

// ─── Helper: validate fields for with() methods ──────────────

const PLAIN_DATE_FIELDS = new Set(['year', 'month', 'monthCode', 'day']);
const PLAIN_TIME_FIELDS = new Set(['hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond']);
const PLAIN_DATETIME_FIELDS = new Set([...PLAIN_DATE_FIELDS, ...PLAIN_TIME_FIELDS]);
const PLAIN_YEARMONTH_FIELDS = new Set(['year', 'month', 'monthCode']);
const ZONED_DATETIME_FIELDS = new Set([...PLAIN_DATETIME_FIELDS, 'offset']);

function validateWithFields(fields, recognizedFields, typeName) {
  if (typeof fields !== 'object' || fields === null) {
    throw new TypeError('Invalid fields argument');
  }
  // Per spec, RejectObjectWithCalendarOrTimeZone: reject Temporal objects
  if (fields._inner instanceof NapiPlainDate || fields._inner instanceof NapiPlainDateTime ||
      fields._inner instanceof NapiPlainMonthDay || fields._inner instanceof NapiPlainYearMonth ||
      fields._inner instanceof NapiPlainTime || fields._inner instanceof NapiZonedDateTime) {
    throw new TypeError('A Temporal object is not allowed as a with() argument');
  }
  // Per spec, with() rejects calendar and timeZone properties
  if (fields.calendar !== undefined) {
    throw new TypeError(`${typeName}.with does not accept a calendar property`);
  }
  if (fields.timeZone !== undefined) {
    throw new TypeError(`${typeName}.with does not accept a timeZone property`);
  }
  // At least one recognized property must be present
  let hasRecognized = false;
  for (const key of recognizedFields) {
    if (fields[key] !== undefined) {
      hasRecognized = true;
      break;
    }
  }
  if (!hasRecognized) {
    throw new TypeError(`At least one recognized property must be provided`);
  }
}

// ─── Helper: validate ISO string fractional seconds ───────────

function rejectTooManyFractionalSeconds(str) {
  if (typeof str !== 'string') return;
  // Check for fractional seconds with more than 9 digits in time portion
  // Match patterns like :SS.dddddddddd or :SS,dddddddddd
  const match = str.match(/:\d{2}[.,](\d{10,})/);
  if (match) {
    throw new RangeError('no more than 9 decimal places are allowed');
  }
}

// ─── Helper: validate property bag ranges for overflow: reject ─

function validateOverflowReject(bag, overflow, cal) {
  if (overflow === 'Reject') {
    const month = bag.month !== undefined ? bag.month : (bag.monthCode !== undefined ? monthCodeToMonth(bag.monthCode) : undefined);
    if (month !== undefined && (month < 1 || month > 13)) {
      throw new RangeError('month out of range');
    }
    if (bag.day !== undefined && (bag.day < 1 || bag.day > 31)) {
      throw new RangeError('day out of range');
    }
    // For reject mode with ISO calendar, verify date is actually valid
    // by creating and checking if the result matches the input.
    // Only applies to ISO calendar since NAPI treats input as ISO dates.
    const calId = cal ? (cal.id || 'iso8601') : 'iso8601';
    if (calId === 'iso8601' && bag.year !== undefined && month !== undefined && bag.day !== undefined) {
      try {
        const pd = new NapiPlainDate(bag.year, month, bag.day, cal);
        if (pd.day !== bag.day || pd.month !== month) {
          throw new RangeError(`date component out of range: ${bag.year}-${month}-${bag.day}`);
        }
      } catch (e) {
        if (e instanceof RangeError) throw e;
        throw new RangeError(`date out of range: ${e.message || e}`);
      }
    }
  }
}

// ─── Helper: format time string with fractional seconds ───────

function formatFractionalSeconds(str, precision) {
  // str is an ISO string; we need to adjust fractional seconds to `precision` digits
  // Find the time portion
  const tIdx = str.indexOf('T');
  if (tIdx === -1) return str;

  // Find the fractional part
  const timeStart = tIdx + 1;
  // Time part could end at '[', '+', '-' (offset), or 'Z'
  let timeEnd = str.length;
  for (let i = timeStart; i < str.length; i++) {
    const c = str[i];
    if (c === '[' || c === 'Z' || ((c === '+' || c === '-') && i > timeStart + 2)) {
      timeEnd = i;
      break;
    }
  }
  const timePart = str.substring(tIdx, timeEnd);
  const suffix = str.substring(timeEnd);

  const dotIdx = timePart.indexOf('.');
  if (precision === 0) {
    // Remove fractional part entirely
    if (dotIdx !== -1) {
      return str.substring(0, tIdx) + timePart.substring(0, dotIdx) + suffix;
    }
    return str;
  }
  if (dotIdx !== -1) {
    const frac = timePart.substring(dotIdx + 1);
    const padded = (frac + '000000000').substring(0, precision);
    return str.substring(0, tIdx) + timePart.substring(0, dotIdx + 1) + padded + suffix;
  } else {
    // No fractional part, add one
    const padded = '000000000'.substring(0, precision);
    return str.substring(0, tIdx) + timePart + '.' + padded + suffix;
  }
}

// ─── Helper: format Duration string with precision ────────────

function formatDurationString(dur, precision) {
  const sign = dur.sign < 0 ? '-' : '';
  const years = Math.abs(dur.years);
  const months = Math.abs(dur.months);
  const weeks = Math.abs(dur.weeks);
  const days = Math.abs(dur.days);
  const hours = Math.abs(dur.hours);
  const minutes = Math.abs(dur.minutes);
  const seconds = Math.abs(dur.seconds);
  const milliseconds = Math.abs(dur.milliseconds);
  const microseconds = Math.abs(dur.microseconds);
  const nanoseconds = Math.abs(dur.nanoseconds);

  let datePart = '';
  if (years) datePart += `${years}Y`;
  if (months) datePart += `${months}M`;
  if (weeks) datePart += `${weeks}W`;
  if (days) datePart += `${days}D`;

  // Build the seconds + fractional part
  const totalNs = milliseconds * 1000000 + microseconds * 1000 + nanoseconds;
  const hasFrac = totalNs > 0;
  const hasTimePart = hours || minutes || seconds || hasFrac;

  // Determine if we need to show seconds
  // Per spec: seconds are shown if precision !== 'auto' or if there are seconds/sub-seconds
  const needSeconds = precision !== 'auto' || seconds || hasFrac;

  let timePart = '';
  if (hours) timePart += `${hours}H`;
  if (minutes) timePart += `${minutes}M`;

  if (needSeconds) {
    let fracStr = '';
    if (precision === 'auto') {
      // Show fractional digits, remove trailing zeros
      if (hasFrac) {
        const ns = String(totalNs).padStart(9, '0');
        fracStr = '.' + ns.replace(/0+$/, '');
      }
    } else if (precision === 0) {
      // No fractional digits
      fracStr = '';
    } else {
      // Exact number of digits
      const ns = String(totalNs).padStart(9, '0');
      fracStr = '.' + ns.substring(0, precision);
    }
    timePart += `${seconds}${fracStr}S`;
  }

  if (!datePart && !timePart) {
    return `${sign}PT0S`;
  }
  if (timePart) {
    return `${sign}P${datePart}T${timePart}`;
  }
  return `${sign}P${datePart}`;
}

// ═══════════════════════════════════════════════════════════════
//  Duration
// ═══════════════════════════════════════════════════════════════

class Duration {
  constructor(arg) {
    if (arg instanceof NapiDuration) {
      this._inner = arg;
    } else if (arg !== undefined && typeof arg === 'object' && arg !== null && arg instanceof Duration) {
      this._inner = arg._inner;
    } else if (arg === undefined || arg === null) {
      this._inner = call(() => new NapiDuration());
    } else {
      // Constructor signature: new Duration(years, months, weeks, days, hours, minutes, seconds, ms, us, ns)
      const args = Array.from(arguments);
      const y = toIntegerIfIntegral(args[0]);
      const mo = toIntegerIfIntegral(args[1]);
      const w = toIntegerIfIntegral(args[2]);
      const d = toIntegerIfIntegral(args[3]);
      const h = toIntegerIfIntegral(args[4]);
      const min = toIntegerIfIntegral(args[5]);
      const s = toIntegerIfIntegral(args[6]);
      const ms = toIntegerIfIntegral(args[7]);
      const us = toIntegerIfIntegral(args[8]);
      const ns = toIntegerIfIntegral(args[9]);
      this._inner = call(() => new NapiDuration(y, mo, w, d, h, min, s, ms, us, ns));
    }
    _wrapperSet.add(this);
  }

  static from(arg) {
    if (arg instanceof Duration) return new Duration(arg._inner);
    if (arg && arg._inner instanceof NapiDuration) return new Duration(arg._inner);
    if (typeof arg === 'string') return new Duration(call(() => NapiDuration.from(arg)));
    if (typeof arg === 'object' && arg !== null) {
      return new Duration(toNapiDuration(arg));
    }
    throw new TypeError('Invalid duration argument');
  }

  static compare(one, two, options) {
    const a = toNapiDuration(one);
    const b = toNapiDuration(two);
    let relativeToDate = null;
    let relativeToZdt = null;
    if (options !== undefined) {
      validateOptions(options);
      const rt = extractRelativeTo(options.relativeTo);
      relativeToDate = rt.relativeToDate;
      relativeToZdt = rt.relativeToZdt;
    }
    try {
      return NapiDuration.compare(a, b, relativeToDate, relativeToZdt);
    } catch (e) { throw wrapError(e); }
  }

  get years() { return this._inner.years; }
  get months() { return this._inner.months; }
  get weeks() { return this._inner.weeks; }
  get days() { return this._inner.days; }
  get hours() { return this._inner.hours; }
  get minutes() { return this._inner.minutes; }
  get seconds() { return this._inner.seconds; }
  get milliseconds() { return this._inner.milliseconds; }
  get microseconds() { return this._inner.microseconds; }
  get nanoseconds() { return this._inner.nanoseconds; }
  get sign() { return this._inner.sign; }
  get blank() { return this._inner.isZero; }

  negated() { return wrapDuration(this._inner.negated()); }
  abs() { return wrapDuration(this._inner.abs()); }

  add(other, options) {
    const dur = toNapiDuration(other);
    return wrapDuration(call(() => this._inner.add(dur)));
  }

  subtract(other, options) {
    const dur = toNapiDuration(other);
    return wrapDuration(call(() => this._inner.subtract(dur)));
  }

  with(temporalDurationLike) {
    requireBranding(this, NapiDuration, 'Temporal.Duration');
    if (typeof temporalDurationLike !== 'object' || temporalDurationLike === null) {
      throw new TypeError('Invalid duration-like argument');
    }
    const DURATION_FIELDS = ['years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds', 'milliseconds', 'microseconds', 'nanoseconds'];
    // Check that at least one recognized duration field is present
    let hasField = false;
    for (const f of DURATION_FIELDS) {
      if (temporalDurationLike[f] !== undefined) { hasField = true; break; }
    }
    if (!hasField) throw new TypeError('At least one recognized duration property must be provided');
    // Reject invalid properties (calendar, timeZone)
    if (temporalDurationLike.calendar !== undefined) throw new TypeError('calendar not allowed in Duration.with');
    if (temporalDurationLike.timeZone !== undefined) throw new TypeError('timeZone not allowed in Duration.with');
    const years = temporalDurationLike.years !== undefined ? toIntegerIfIntegral(temporalDurationLike.years) : this.years;
    const months = temporalDurationLike.months !== undefined ? toIntegerIfIntegral(temporalDurationLike.months) : this.months;
    const weeks = temporalDurationLike.weeks !== undefined ? toIntegerIfIntegral(temporalDurationLike.weeks) : this.weeks;
    const days = temporalDurationLike.days !== undefined ? toIntegerIfIntegral(temporalDurationLike.days) : this.days;
    const hours = temporalDurationLike.hours !== undefined ? toIntegerIfIntegral(temporalDurationLike.hours) : this.hours;
    const minutes = temporalDurationLike.minutes !== undefined ? toIntegerIfIntegral(temporalDurationLike.minutes) : this.minutes;
    const seconds = temporalDurationLike.seconds !== undefined ? toIntegerIfIntegral(temporalDurationLike.seconds) : this.seconds;
    const milliseconds = temporalDurationLike.milliseconds !== undefined ? toIntegerIfIntegral(temporalDurationLike.milliseconds) : this.milliseconds;
    const microseconds = temporalDurationLike.microseconds !== undefined ? toIntegerIfIntegral(temporalDurationLike.microseconds) : this.microseconds;
    const nanoseconds = temporalDurationLike.nanoseconds !== undefined ? toIntegerIfIntegral(temporalDurationLike.nanoseconds) : this.nanoseconds;
    return new Duration(call(() => new NapiDuration(years, months, weeks, days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds)));
  }

  round(options) {
    if (options === undefined) throw new TypeError('options parameter is required');
    if (typeof options === 'string') {
      const obj = Object.create(null);
      obj.smallestUnit = options;
      options = obj;
    }
    if (typeof options !== 'object' || options === null) {
      throw new TypeError('options must be an object');
    }
    // Per spec, must have at least smallestUnit or largestUnit
    if (options.smallestUnit === undefined && options.largestUnit === undefined) {
      throw new RangeError('at least one of smallestUnit or largestUnit is required');
    }
    const { relativeToDate, relativeToZdt } = extractRelativeTo(options.relativeTo);
    const napiOptions = convertRoundingOptions(options);
    try {
      const inner = this._inner.round(napiOptions, relativeToDate, relativeToZdt);
      return new Duration(inner);
    } catch (e) { throw wrapError(e); }
  }

  total(options) {
    if (options === undefined) throw new TypeError('options parameter is required');
    if (typeof options === 'string') {
      const obj = Object.create(null);
      obj.unit = options;
      options = obj;
    }
    if (typeof options !== 'object' || options === null) {
      throw new TypeError('options must be an object');
    }
    const unit = options.unit;
    if (unit === undefined) throw new RangeError('unit is required');
    const napiUnit = mapUnit(unit);
    const { relativeToDate, relativeToZdt } = extractRelativeTo(options.relativeTo);
    try {
      return this._inner.total(napiUnit, relativeToDate, relativeToZdt);
    } catch (e) { throw wrapError(e); }
  }

  toString(options) {
    if (options === undefined) return this._inner.toString();
    validateOptions(options);
    // Resolve fractionalSecondDigits
    const fsd = resolveFractionalSecondDigits(options.fractionalSecondDigits);
    // Validate smallestUnit
    let smallestUnit;
    if (options.smallestUnit !== undefined) {
      const su = String(options.smallestUnit);
      const DURATION_TOSTRING_UNITS = {
        'second': 'second', 'seconds': 'second',
        'millisecond': 'millisecond', 'milliseconds': 'millisecond',
        'microsecond': 'microsecond', 'microseconds': 'microsecond',
        'nanosecond': 'nanosecond', 'nanoseconds': 'nanosecond',
      };
      smallestUnit = DURATION_TOSTRING_UNITS[su];
      if (!smallestUnit) {
        throw new RangeError(`Invalid unit for Duration.toString: ${su}`);
      }
    }
    // Validate roundingMode
    const roundingMode = options.roundingMode !== undefined ? mapRoundingMode(options.roundingMode) : 'Trunc';

    // Determine precision
    let precision; // number of fractional digits, or 'auto'
    if (smallestUnit !== undefined) {
      // smallestUnit takes precedence over fractionalSecondDigits
      if (smallestUnit === 'second') precision = 0;
      else if (smallestUnit === 'millisecond') precision = 3;
      else if (smallestUnit === 'microsecond') precision = 6;
      else if (smallestUnit === 'nanosecond') precision = 9;
    } else if (fsd !== undefined && fsd !== 'auto') {
      precision = fsd;
    } else {
      precision = 'auto';
    }

    // If we need to round, use round() to do the rounding, then format
    let dur = this;
    if (precision !== 'auto' && precision !== 9) {
      // Round the duration's time portion
      const roundUnit = precision === 0 ? 'second' : precision <= 3 ? 'millisecond' : precision <= 6 ? 'microsecond' : 'nanosecond';
      // Calculate rounding increment
      let increment = 1;
      if (precision === 0) increment = 1; // round to seconds
      else if (precision === 1) increment = 100000000; // 10^8 ns
      else if (precision === 2) increment = 10000000;
      else if (precision === 3) increment = 1000000;
      else if (precision === 4) increment = 100000;
      else if (precision === 5) increment = 10000;
      else if (precision === 6) increment = 1000;
      else if (precision === 7) increment = 100;
      else if (precision === 8) increment = 10;

      // Only round if the duration has time components
      try {
        const napiOpts = Object.create(null);
        napiOpts.smallestUnit = mapUnit(roundUnit);
        napiOpts.roundingMode = roundingMode;
        if (roundUnit === 'second') {
          napiOpts.smallestUnit = 'Second';
        }
        const inner = this._inner.round(napiOpts, null, null);
        dur = new Duration(inner);
      } catch {
        // If round fails, use original
        dur = this;
      }
    }

    // Format the duration string with proper precision
    return formatDurationString(dur, precision);
  }
  toJSON() { requireBranding(this, NapiDuration, 'Temporal.Duration'); return this.toString(); }
  toLocaleString(...args) { requireBranding(this, NapiDuration, 'Temporal.Duration'); return this.toString(); }

  valueOf() {
    throw new TypeError('Use Temporal.Duration.compare() to compare Temporal.Duration');
  }

  get [Symbol.toStringTag]() { return 'Temporal.Duration'; }

  static [Symbol.hasInstance](v) {
    return v !== null && v !== undefined && typeof v === 'object' && '_inner' in v && v._inner instanceof NapiDuration;
  }
}

// ═══════════════════════════════════════════════════════════════
//  PlainDate
// ═══════════════════════════════════════════════════════════════

class PlainDate {
  constructor(year, month, day, calendar) {
    if (year instanceof NapiPlainDate) {
      this._inner = year;
    } else {
      rejectInfinity(year, 'year');
      rejectInfinity(month, 'month');
      rejectInfinity(day, 'day');
      const y = toIntegerIfIntegral(year);
      const m = toIntegerIfIntegral(month);
      const d = toIntegerIfIntegral(day);
      // Validate ISO date components (constructor always rejects)
      rejectISODateRange(y, m, d);
      const cal = toNapiCalendar(calendar);
      this._inner = call(() => new NapiPlainDate(y, m, d, cal));
    }
    _wrapperSet.add(this);
  }

  static from(arg, options) {
    if (typeof arg === 'string') {
      rejectTooManyFractionalSeconds(arg);
      const inner = call(() => NapiPlainDate.from(arg));
      if (options !== undefined) { validateOptions(options); extractOverflow(options); }
      return new PlainDate(inner);
    }
    if (options !== undefined) validateOptions(options);
    if (arg instanceof PlainDate) {
      if (options !== undefined) extractOverflow(options);
      return new PlainDate(arg._inner);
    }
    if (arg && arg._inner instanceof NapiPlainDate) {
      return new PlainDate(arg._inner);
    }
    if (arg instanceof PlainDateTime || (arg && arg._inner instanceof NapiPlainDateTime)) {
      if (options !== undefined) extractOverflow(options);
      const inner = arg._inner || arg;
      const dt = inner instanceof NapiPlainDateTime ? inner : arg._inner;
      return new PlainDate(call(() => new NapiPlainDate(dt.year, dt.month, dt.day, dt.calendar)));
    }
    if (arg instanceof ZonedDateTime || (arg && arg._inner instanceof NapiZonedDateTime)) {
      if (options !== undefined) extractOverflow(options);
      const inner = arg._inner || arg;
      const zdt = inner instanceof NapiZonedDateTime ? inner : arg._inner;
      return new PlainDate(zdt.toPlainDate());
    }
    if (typeof arg === 'object' && arg !== null) {
      const overflow = extractOverflow(options);
      const calId = getCalendarId(arg.calendar);
      const cal = toNapiCalendar(arg.calendar);
      const fields = { year: toInteger(arg.year), day: toInteger(arg.day), era: arg.era, eraYear: toInteger(arg.eraYear) };
      resolveEraYear(fields, calId);
      const year = fields.year;
      const day = fields.day;
      const month = resolveMonth(arg, calId);
      if (year === undefined) throw new TypeError('Required property year is missing or undefined');
      if (month === undefined) throw new TypeError('Required property month or monthCode is missing');
      if (day === undefined) throw new TypeError('Required property day is missing or undefined');
      rejectPropertyBagInfinity({ year, month, day }, 'year', 'month', 'day');
      validateOverflowReject({ year, month, day }, overflow, cal);
      const iso = calendarDateToISO(year, month, day, calId);
      const inner = call(() => new NapiPlainDate(iso.isoYear, iso.isoMonth, iso.isoDay, cal));
      return new PlainDate(inner);
    }
    throw new TypeError('Invalid argument for PlainDate.from()');
  }

  static compare(one, two) {
    const a = toNapiPlainDate(one);
    const b = toNapiPlainDate(two);
    return NapiPlainDate.compare(a, b);
  }

  get year() { return this._inner.year; }
  get month() { return this._inner.month; }
  get monthCode() { return this._inner.monthCode; }
  get day() { return this._inner.day; }
  get dayOfWeek() { return this._inner.dayOfWeek; }
  get dayOfYear() { return this._inner.dayOfYear; }
  get weekOfYear() { const v = this._inner.weekOfYear; return v === null ? undefined : v; }
  get yearOfWeek() { const v = this._inner.yearOfWeek; return v === null ? undefined : v; }
  get daysInWeek() { return this._inner.daysInWeek; }
  get daysInMonth() { return this._inner.daysInMonth; }
  get daysInYear() { return this._inner.daysInYear; }
  get monthsInYear() { return this._inner.monthsInYear; }
  get inLeapYear() { return this._inner.inLeapYear; }
  get era() { const v = this._inner.era; return v === null ? undefined : v; }
  get eraYear() { const v = this._inner.eraYear; return v === null ? undefined : v; }
  get calendarId() { return this._inner.calendar.id; }
  get calendar() { return this._inner.calendar.id; }

  with(fields, options) {
    requireBranding(this, NapiPlainDate, 'Temporal.PlainDate');
    validateWithFields(fields, PLAIN_DATE_FIELDS, 'PlainDate');
    const overflow = extractOverflow(options);
    const calId = this.calendarId;
    // Coerce and validate field values
    const year = fields.year !== undefined ? toInteger(fields.year) : this.year;
    const day = fields.day !== undefined ? toInteger(fields.day) : this.day;
    rejectPropertyBagInfinity({ year, day }, 'year', 'day');
    let month;
    if (fields.monthCode !== undefined) {
      month = monthCodeToMonth(fields.monthCode, calId);
    } else if (fields.month !== undefined) {
      month = toInteger(fields.month);
      rejectInfinity(month, 'month');
    } else {
      month = this.month;
    }
    const merged = { year, month, day, era: this.era, eraYear: this.eraYear };
    resolveEraYear(merged, calId);
    const cal = toNapiCalendar(calId);
    const iso = calendarDateToISO(merged.year, merged.month, merged.day, calId);
    return new PlainDate(call(() => new NapiPlainDate(iso.isoYear, iso.isoMonth, iso.isoDay, cal)));
  }

  withCalendar(calendar) {
    const cal = toNapiCalendar(calendar);
    return new PlainDate(this._inner.withCalendar(cal));
  }

  add(durationArg, options) {
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    return wrapPlainDate(call(() => this._inner.add(dur, overflow)));
  }

  subtract(durationArg, options) {
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    return wrapPlainDate(call(() => this._inner.subtract(dur, overflow)));
  }

  until(other, options) {
    const otherInner = toNapiPlainDate(other);
    const settings = convertDifferenceSettings(options);
    return wrapDuration(call(() => this._inner.until(otherInner, settings)));
  }

  since(other, options) {
    const otherInner = toNapiPlainDate(other);
    const settings = convertDifferenceSettings(options);
    return wrapDuration(call(() => this._inner.since(otherInner, settings)));
  }

  equals(other) {
    const otherInner = toNapiPlainDate(other);
    return this._inner.equals(otherInner);
  }

  toPlainDateTime(time) {
    requireBranding(this, NapiPlainDate, 'Temporal.PlainDate');
    if (time === undefined) {
      // midnight
      const dt = call(() => new NapiPlainDateTime(this.year, this.month, this.day, 0, 0, 0, 0, 0, 0, toNapiCalendar(this.calendarId)));
      return wrapPlainDateTime(dt);
    }
    const t = toNapiPlainTime(time);
    const dt = call(() => new NapiPlainDateTime(
      this.year, this.month, this.day,
      t.hour, t.minute, t.second,
      t.millisecond, t.microsecond, t.nanosecond,
      toNapiCalendar(this.calendarId),
    ));
    return wrapPlainDateTime(dt);
  }

  toZonedDateTime(item) {
    requireBranding(this, NapiPlainDate, 'Temporal.PlainDate');
    if (typeof item === 'string') {
      const tz = toNapiTimeZone(item);
      const dtStr = this.toString() + 'T00:00:00';
      const zdt = call(() => NapiZonedDateTime.from(dtStr + '[' + tz.id + ']'));
      return wrapZonedDateTime(zdt);
    }
    if (typeof item === 'object' && item !== null) {
      const tz = toNapiTimeZone(item.timeZone);
      let timeStr = 'T00:00:00';
      if (item.plainTime !== undefined) {
        const t = toNapiPlainTime(item.plainTime);
        const pad2 = n => String(n).padStart(2, '0');
        const pad3 = n => String(n).padStart(3, '0');
        timeStr = `T${pad2(t.hour)}:${pad2(t.minute)}:${pad2(t.second)}`;
        if (t.millisecond || t.microsecond || t.nanosecond) {
          const frac = pad3(t.millisecond) + pad3(t.microsecond) + pad3(t.nanosecond);
          timeStr += '.' + frac.replace(/0+$/, '');
        }
      }
      const zdt = call(() => NapiZonedDateTime.from(this.toString() + timeStr + '[' + tz.id + ']'));
      return wrapZonedDateTime(zdt);
    }
    throw new TypeError('Invalid argument to toZonedDateTime');
  }

  toPlainYearMonth() {
    requireBranding(this, NapiPlainDate, 'Temporal.PlainDate');
    const cal = toNapiCalendar(this.calendarId);
    return wrapPlainYearMonth(call(() => new NapiPlainYearMonth(this.year, this.month, cal)));
  }

  toPlainMonthDay() {
    requireBranding(this, NapiPlainDate, 'Temporal.PlainDate');
    const cal = toNapiCalendar(this.calendarId);
    return wrapPlainMonthDay(call(() => new NapiPlainMonthDay(this.month, this.day, cal)));
  }

  toString(options) {
    if (options !== undefined) validateOptions(options);
    const dc = options ? mapDisplayCalendar(options.calendarName) : undefined;
    return this._inner.toString(dc);
  }

  toJSON() { requireBranding(this, NapiPlainDate, 'Temporal.PlainDate'); return this.toString(); }
  toLocaleString(...args) { requireBranding(this, NapiPlainDate, 'Temporal.PlainDate'); return this.toString(); }

  valueOf() {
    throw new TypeError('Use Temporal.PlainDate.compare() to compare Temporal.PlainDate');
  }

  get [Symbol.toStringTag]() { return 'Temporal.PlainDate'; }

  static [Symbol.hasInstance](v) {
    return v !== null && v !== undefined && typeof v === 'object' && '_inner' in v && v._inner instanceof NapiPlainDate;
  }
}

// ═══════════════════════════════════════════════════════════════
//  PlainTime
// ═══════════════════════════════════════════════════════════════

class PlainTime {
  constructor(hour, minute, second, millisecond, microsecond, nanosecond) {
    if (hour instanceof NapiPlainTime) {
      this._inner = hour;
    } else {
      rejectInfinity(hour, 'hour');
      rejectInfinity(minute, 'minute');
      rejectInfinity(second, 'second');
      rejectInfinity(millisecond, 'millisecond');
      rejectInfinity(microsecond, 'microsecond');
      rejectInfinity(nanosecond, 'nanosecond');
      this._inner = call(() => new NapiPlainTime(
        hour || 0, minute || 0, second || 0,
        millisecond, microsecond, nanosecond,
      ));
    }
    _wrapperSet.add(this);
  }

  static from(arg, options) {
    if (typeof arg === 'string') {
      rejectTooManyFractionalSeconds(arg);
      const inner = call(() => NapiPlainTime.from(arg));
      if (options !== undefined) { validateOptions(options); extractOverflow(options); }
      return new PlainTime(inner);
    }
    validateOptions(options);
    if (arg instanceof PlainTime) {
      if (options !== undefined) extractOverflow(options);
      return new PlainTime(arg._inner);
    }
    if (arg && arg._inner instanceof NapiPlainTime) {
      if (options !== undefined) extractOverflow(options);
      return new PlainTime(arg._inner);
    }
    // PlainDateTime -> extract time
    if (arg instanceof PlainDateTime || (arg && arg._inner instanceof NapiPlainDateTime)) {
      const dt = arg._inner || arg;
      return new PlainTime(call(() => new NapiPlainTime(dt.hour, dt.minute, dt.second, dt.millisecond, dt.microsecond, dt.nanosecond)));
    }
    // ZonedDateTime -> extract time
    if (arg instanceof ZonedDateTime || (arg && arg._inner instanceof NapiZonedDateTime)) {
      const zdt = arg._inner || arg;
      return new PlainTime(zdt.toPlainTime());
    }
    if (typeof arg === 'object' && arg !== null) {
      // Reject Temporal objects that are not PlainTime-like
      if (arg._inner instanceof NapiPlainDate ||
          arg._inner instanceof NapiPlainYearMonth || arg._inner instanceof NapiPlainMonthDay ||
          arg._inner instanceof NapiDuration) {
        throw new TypeError('Invalid argument for PlainTime.from()');
      }
      // Per spec, at least one time property must be present
      if (arg.hour === undefined && arg.minute === undefined && arg.second === undefined &&
          arg.millisecond === undefined && arg.microsecond === undefined && arg.nanosecond === undefined) {
        throw new TypeError('Invalid PlainTime property bag: at least one time property must be present');
      }
      const overflow = extractOverflow(options);
      rejectPropertyBagInfinity(arg, 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond');
      return new PlainTime(call(() => new NapiPlainTime(
        arg.hour || 0, arg.minute || 0, arg.second || 0,
        arg.millisecond, arg.microsecond, arg.nanosecond,
      )));
    }
    throw new TypeError('Invalid argument for PlainTime.from()');
  }

  static compare(one, two) {
    const a = toNapiPlainTime(one);
    const b = toNapiPlainTime(two);
    const fields = ['hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond'];
    for (const f of fields) {
      if (a[f] < b[f]) return -1;
      if (a[f] > b[f]) return 1;
    }
    return 0;
  }

  get hour() { return this._inner.hour; }
  get minute() { return this._inner.minute; }
  get second() { return this._inner.second; }
  get millisecond() { return this._inner.millisecond; }
  get microsecond() { return this._inner.microsecond; }
  get nanosecond() { return this._inner.nanosecond; }

  with(fields, options) {
    requireBranding(this, NapiPlainTime, 'Temporal.PlainTime');
    validateWithFields(fields, PLAIN_TIME_FIELDS, 'PlainTime');
    const overflow = extractOverflow(options);
    return new PlainTime(call(() => new NapiPlainTime(
      fields.hour !== undefined ? fields.hour : this.hour,
      fields.minute !== undefined ? fields.minute : this.minute,
      fields.second !== undefined ? fields.second : this.second,
      fields.millisecond !== undefined ? fields.millisecond : this.millisecond,
      fields.microsecond !== undefined ? fields.microsecond : this.microsecond,
      fields.nanosecond !== undefined ? fields.nanosecond : this.nanosecond,
    )));
  }

  add(durationArg) {
    const dur = toNapiDuration(durationArg);
    return wrapPlainTime(call(() => this._inner.add(dur)));
  }

  subtract(durationArg) {
    const dur = toNapiDuration(durationArg);
    return wrapPlainTime(call(() => this._inner.subtract(dur)));
  }

  until(other, options) {
    const otherInner = toNapiPlainTime(other);
    const settings = convertDifferenceSettings(options);
    return wrapDuration(call(() => this._inner.until(otherInner, settings)));
  }

  since(other, options) {
    const otherInner = toNapiPlainTime(other);
    const settings = convertDifferenceSettings(options);
    return wrapDuration(call(() => this._inner.since(otherInner, settings)));
  }

  round(options) {
    const opts = convertRoundingOptions(options);
    return wrapPlainTime(call(() => this._inner.round(opts)));
  }

  equals(other) {
    const otherInner = toNapiPlainTime(other);
    return this._inner.equals(otherInner);
  }

  toString(options) {
    const opts = convertToStringOptions(options);
    return call(() => this._inner.toString(opts.roundingOptions));
  }

  toJSON() { requireBranding(this, NapiPlainTime, 'Temporal.PlainTime'); return this.toString(); }
  toLocaleString(...args) { requireBranding(this, NapiPlainTime, 'Temporal.PlainTime'); return this.toString(); }

  valueOf() {
    throw new TypeError('Use Temporal.PlainTime.compare() to compare Temporal.PlainTime');
  }

  get [Symbol.toStringTag]() { return 'Temporal.PlainTime'; }

  static [Symbol.hasInstance](v) {
    return v !== null && v !== undefined && typeof v === 'object' && '_inner' in v && v._inner instanceof NapiPlainTime;
  }
}

// ═══════════════════════════════════════════════════════════════
//  PlainDateTime
// ═══════════════════════════════════════════════════════════════

class PlainDateTime {
  constructor(year, month, day, hour, minute, second, millisecond, microsecond, nanosecond, calendar) {
    if (year instanceof NapiPlainDateTime) {
      this._inner = year;
    } else {
      rejectInfinity(year, 'year');
      rejectInfinity(month, 'month');
      rejectInfinity(day, 'day');
      rejectInfinity(hour, 'hour');
      rejectInfinity(minute, 'minute');
      rejectInfinity(second, 'second');
      rejectInfinity(millisecond, 'millisecond');
      rejectInfinity(microsecond, 'microsecond');
      rejectInfinity(nanosecond, 'nanosecond');
      // Validate ISO date range (constructor always rejects)
      const y = typeof year === 'number' ? year : Number(year);
      const mo = typeof month === 'number' ? month : Number(month);
      const d = typeof day === 'number' ? day : Number(day);
      if (_isFinite(y) && _isFinite(mo) && _isFinite(d)) {
        rejectISODateRange(_trunc(y), _trunc(mo), _trunc(d));
      }
      const cal = toNapiCalendar(calendar);
      this._inner = call(() => new NapiPlainDateTime(
        year, month, day,
        hour, minute, second,
        millisecond, microsecond, nanosecond,
        cal,
      ));
    }
    _wrapperSet.add(this);
  }

  static from(arg, options) {
    if (typeof arg === 'string') {
      rejectTooManyFractionalSeconds(arg);
      const inner = call(() => NapiPlainDateTime.from(arg));
      if (options !== undefined) { validateOptions(options); extractOverflow(options); }
      return new PlainDateTime(inner);
    }
    validateOptions(options);
    if (arg instanceof PlainDateTime) {
      if (options !== undefined) extractOverflow(options);
      return new PlainDateTime(arg._inner);
    }
    if (arg && arg._inner instanceof NapiPlainDateTime) {
      if (options !== undefined) extractOverflow(options);
      return new PlainDateTime(arg._inner);
    }
    if (arg instanceof PlainDate || (arg && arg._inner instanceof NapiPlainDate)) {
      if (options !== undefined) extractOverflow(options);
      const inner = arg._inner || arg;
      const d = inner instanceof NapiPlainDate ? inner : arg._inner;
      return new PlainDateTime(call(() => new NapiPlainDateTime(d.year, d.month, d.day, 0, 0, 0, 0, 0, 0, d.calendar)));
    }
    if (arg instanceof ZonedDateTime || (arg && arg._inner instanceof NapiZonedDateTime)) {
      if (options !== undefined) extractOverflow(options);
      const inner = arg._inner || arg;
      const zdt = inner instanceof NapiZonedDateTime ? inner : arg._inner;
      return new PlainDateTime(zdt.toPlainDateTime());
    }
    if (typeof arg === 'object' && arg !== null) {
      const overflow = extractOverflow(options);
      const calId = getCalendarId(arg.calendar);
      const cal = toNapiCalendar(arg.calendar);
      const fields = { year: toInteger(arg.year), era: arg.era, eraYear: toInteger(arg.eraYear) };
      resolveEraYear(fields, calId);
      const month = resolveMonth(arg, calId);
      const day = toInteger(arg.day);
      const hour = toInteger(arg.hour);
      const minute = toInteger(arg.minute);
      const second = toInteger(arg.second);
      const millisecond = toInteger(arg.millisecond);
      const microsecond = toInteger(arg.microsecond);
      const nanosecond = toInteger(arg.nanosecond);
      if (fields.year === undefined) throw new TypeError('Required property year is missing or undefined');
      if (month === undefined && arg.monthCode === undefined) throw new TypeError('Required property month or monthCode is missing');
      if (day === undefined) throw new TypeError('Required property day is missing or undefined');
      rejectPropertyBagInfinity({ year: fields.year, month, day, hour, minute, second, millisecond, microsecond, nanosecond }, 'year', 'month', 'day', 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond');
      validateOverflowReject({ year: fields.year, month, day }, overflow, cal);
      const iso = calendarDateToISO(fields.year, month, day, calId);
      return new PlainDateTime(call(() => new NapiPlainDateTime(
        iso.isoYear, iso.isoMonth, iso.isoDay,
        hour, minute, second,
        millisecond, microsecond, nanosecond,
        cal,
      )));
    }
    throw new TypeError('Invalid argument for PlainDateTime.from()');
  }

  static compare(one, two) {
    const a = toNapiPlainDateTime(one);
    const b = toNapiPlainDateTime(two);
    return NapiPlainDateTime.compare(a, b);
  }

  get year() { return this._inner.year; }
  get month() { return this._inner.month; }
  get monthCode() { return this._inner.monthCode; }
  get day() { return this._inner.day; }
  get dayOfWeek() { return this._inner.dayOfWeek; }
  get dayOfYear() { return this._inner.dayOfYear; }
  get weekOfYear() { const v = this._inner.weekOfYear; return v === null ? undefined : v; }
  get yearOfWeek() { const v = this._inner.yearOfWeek; return v === null ? undefined : v; }
  get daysInWeek() { return this._inner.daysInWeek; }
  get daysInMonth() { return this._inner.daysInMonth; }
  get daysInYear() { return this._inner.daysInYear; }
  get monthsInYear() { return this._inner.monthsInYear; }
  get inLeapYear() { return this._inner.inLeapYear; }
  get era() { const v = this._inner.era; return v === null ? undefined : v; }
  get eraYear() { const v = this._inner.eraYear; return v === null ? undefined : v; }
  get hour() { return this._inner.hour; }
  get minute() { return this._inner.minute; }
  get second() { return this._inner.second; }
  get millisecond() { return this._inner.millisecond; }
  get microsecond() { return this._inner.microsecond; }
  get nanosecond() { return this._inner.nanosecond; }
  get calendarId() { return this._inner.calendar.id; }
  get calendar() { return this._inner.calendar.id; }

  with(fields, options) {
    requireBranding(this, NapiPlainDateTime, 'Temporal.PlainDateTime');
    validateWithFields(fields, PLAIN_DATETIME_FIELDS, 'PlainDateTime');
    const overflow = extractOverflow(options);
    const calId = this.calendarId;
    const merged = {
      year: this.year,
      day: this.day,
      hour: this.hour,
      minute: this.minute,
      second: this.second,
      millisecond: this.millisecond,
      microsecond: this.microsecond,
      nanosecond: this.nanosecond,
      era: this.era,
      eraYear: this.eraYear,
      ...fields,
    };
    // Resolve month/monthCode override
    if (fields.monthCode !== undefined) {
      merged.month = monthCodeToMonth(fields.monthCode, calId);
    } else if (fields.month !== undefined) {
      merged.month = fields.month;
    } else {
      merged.month = this.month;
    }
    resolveEraYear(merged, calId);
    const cal = toNapiCalendar(calId);
    const iso = calendarDateToISO(merged.year, merged.month, merged.day, calId);
    return new PlainDateTime(call(() => new NapiPlainDateTime(
      iso.isoYear, iso.isoMonth, iso.isoDay,
      merged.hour, merged.minute, merged.second,
      merged.millisecond, merged.microsecond, merged.nanosecond,
      cal,
    )));
  }

  withCalendar(calendar) {
    const cal = toNapiCalendar(calendar);
    return new PlainDateTime(this._inner.withCalendar(cal));
  }

  withPlainTime(time) {
    requireBranding(this, NapiPlainDateTime, 'Temporal.PlainDateTime');
    if (time === undefined) {
      const cal = toNapiCalendar(this.calendarId);
      return new PlainDateTime(call(() => new NapiPlainDateTime(
        this.year, this.month, this.day, 0, 0, 0, 0, 0, 0, cal,
      )));
    }
    const t = toNapiPlainTime(time);
    const cal = toNapiCalendar(this.calendarId);
    return new PlainDateTime(call(() => new NapiPlainDateTime(
      this.year, this.month, this.day,
      t.hour, t.minute, t.second,
      t.millisecond, t.microsecond, t.nanosecond,
      cal,
    )));
  }

  add(durationArg, options) {
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    return wrapPlainDateTime(call(() => this._inner.add(dur, overflow)));
  }

  subtract(durationArg, options) {
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    return wrapPlainDateTime(call(() => this._inner.subtract(dur, overflow)));
  }

  until(other, options) {
    const otherInner = toNapiPlainDateTime(other);
    const settings = convertDifferenceSettings(options);
    return wrapDuration(call(() => this._inner.until(otherInner, settings)));
  }

  since(other, options) {
    const otherInner = toNapiPlainDateTime(other);
    const settings = convertDifferenceSettings(options);
    return wrapDuration(call(() => this._inner.since(otherInner, settings)));
  }

  round(options) {
    const opts = convertRoundingOptions(options);
    return wrapPlainDateTime(call(() => this._inner.round(opts)));
  }

  equals(other) {
    const otherInner = toNapiPlainDateTime(other);
    return this._inner.equals(otherInner);
  }

  toPlainDate() {
    return wrapPlainDate(this._inner.toPlainDate());
  }

  toPlainTime() {
    return wrapPlainTime(this._inner.toPlainTime());
  }

  toZonedDateTime(timeZone, options) {
    requireBranding(this, NapiPlainDateTime, 'Temporal.PlainDateTime');
    if (options !== undefined) validateOptions(options);
    let tz, disambiguation;
    if (typeof timeZone === 'string') {
      tz = toNapiTimeZone(timeZone);
    } else if (typeof timeZone === 'object' && timeZone !== null && !timeZone.id && timeZone.timeZone) {
      // options-style argument: { timeZone, disambiguation }
      tz = toNapiTimeZone(timeZone.timeZone);
      disambiguation = timeZone.disambiguation;
    } else {
      tz = toNapiTimeZone(timeZone);
    }
    if (options && options.disambiguation) {
      disambiguation = options.disambiguation;
    }
    const str = this.toString() + '[' + tz.id + ']';
    return wrapZonedDateTime(call(() => NapiZonedDateTime.from(str)));
  }

  toString(options) {
    const opts = convertToStringOptions(options);
    return call(() => this._inner.toString(opts.roundingOptions, opts.displayCalendar));
  }

  toJSON() { requireBranding(this, NapiPlainDateTime, 'Temporal.PlainDateTime'); return this.toString(); }
  toLocaleString(...args) { requireBranding(this, NapiPlainDateTime, 'Temporal.PlainDateTime'); return this.toString(); }

  valueOf() {
    throw new TypeError('Use Temporal.PlainDateTime.compare() to compare Temporal.PlainDateTime');
  }

  get [Symbol.toStringTag]() { return 'Temporal.PlainDateTime'; }

  static [Symbol.hasInstance](v) {
    return v !== null && v !== undefined && typeof v === 'object' && '_inner' in v && v._inner instanceof NapiPlainDateTime;
  }
}

// ═══════════════════════════════════════════════════════════════
//  ZonedDateTime
// ═══════════════════════════════════════════════════════════════

class ZonedDateTime {
  constructor(epochNanoseconds, timeZone, calendar) {
    if (epochNanoseconds instanceof NapiZonedDateTime) {
      this._inner = epochNanoseconds;
    } else {
      // Per spec, epochNanoseconds must be a BigInt
      if (typeof epochNanoseconds !== 'bigint') {
        throw new TypeError('ZonedDateTime constructor requires a BigInt epochNanoseconds');
      }
      const limit = 8640000000000000000000n;
      if (epochNanoseconds < -limit || epochNanoseconds > limit) {
        throw new RangeError('ZonedDateTime out of representable range');
      }
      const tz = toNapiTimeZone(timeZone);
      const cal = toNapiCalendar(calendar);
      const ns = Number(epochNanoseconds);
      this._inner = call(() => new NapiZonedDateTime(ns, tz, cal));
    }
    _wrapperSet.add(this);
  }

  static from(arg, options) {
    if (typeof arg === 'string') {
      rejectTooManyFractionalSeconds(arg);
      const inner = call(() => NapiZonedDateTime.from(arg));
      validateOptions(options);
      return new ZonedDateTime(inner);
    }
    validateOptions(options);
    if (arg instanceof ZonedDateTime) {
      return new ZonedDateTime(arg._inner);
    }
    if (arg && arg._inner instanceof NapiZonedDateTime) {
      return new ZonedDateTime(arg._inner);
    }
    if (typeof arg === 'object' && arg !== null) {
      // Property bag with timeZone required
      if (arg.timeZone === undefined) {
        throw new TypeError('Missing timeZone in ZonedDateTime property bag');
      }
      const overflow = options ? extractOverflow(options) : undefined;
      const calId = getCalendarId(arg.calendar);
      const fields = { year: toInteger(arg.year), era: arg.era, eraYear: toInteger(arg.eraYear) };
      resolveEraYear(fields, calId);
      const tz = toNapiTimeZone(arg.timeZone);
      // Validate required fields
      if (fields.year === undefined) throw new TypeError('Required property year is missing or undefined');
      const monthVal = resolveMonth(arg, calId);
      if (monthVal === undefined && arg.monthCode === undefined) throw new TypeError('Required property month or monthCode is missing');
      if (toInteger(arg.day) === undefined) throw new TypeError('Required property day is missing or undefined');
      const year = fields.year;
      let month = monthVal || 1;
      let day = toInteger(arg.day) || 1;
      let hour = toInteger(arg.hour) || 0;
      let minute = toInteger(arg.minute) || 0;
      let second = toInteger(arg.second) || 0;
      let millisecond = toInteger(arg.millisecond) || 0;
      let microsecond = toInteger(arg.microsecond) || 0;
      let nanosecond = toInteger(arg.nanosecond) || 0;
      // Handle overflow
      if (overflow === 'Reject') {
        // Reject out-of-range values
        if (month < 1 || month > 13) throw new RangeError('month out of range');
        if (day < 1 || day > 31) throw new RangeError('day out of range');
        if (hour < 0 || hour > 23) throw new RangeError('hour out of range');
        if (minute < 0 || minute > 59) throw new RangeError('minute out of range');
        if (second < 0 || second > 59) throw new RangeError('second out of range');
        if (millisecond < 0 || millisecond > 999) throw new RangeError('millisecond out of range');
        if (microsecond < 0 || microsecond > 999) throw new RangeError('microsecond out of range');
        if (nanosecond < 0 || nanosecond > 999) throw new RangeError('nanosecond out of range');
      } else {
        // Constrain values to valid ranges
        month = Math.max(1, Math.min(month, 13));
        day = Math.max(1, Math.min(day, 31));
        hour = Math.max(0, Math.min(hour, 23));
        minute = Math.max(0, Math.min(minute, 59));
        second = Math.max(0, Math.min(second, 59));
        millisecond = Math.max(0, Math.min(millisecond, 999));
        microsecond = Math.max(0, Math.min(microsecond, 999));
        nanosecond = Math.max(0, Math.min(nanosecond, 999));
      }
      // Build ISO string and parse
      const pad2 = n => String(n).padStart(2, '0');
      const padYear = n => {
        if (n < 0 || n >= 10000) {
          const s = String(Math.abs(n)).padStart(6, '0');
          return (n < 0 ? '-' : '+') + s;
        }
        return String(n).padStart(4, '0');
      };
      // Convert calendar date to ISO date for non-ISO calendars
      const cal = toNapiCalendar(arg.calendar);
      const iso = calendarDateToISO(year, month, day, calId);
      let isoYear = iso.isoYear;
      let isoMonth = iso.isoMonth;
      let isoDay = iso.isoDay;
      try {
        const pd = call(() => new NapiPlainDate(isoYear, isoMonth, isoDay, cal));
        isoDay = pd.day;
        isoMonth = pd.month;
      } catch (e) {
        if (overflow === 'Reject') throw wrapError(e);
        // If constrain mode and day still too large, try to find max day
        try {
          const pd28 = call(() => new NapiPlainDate(isoYear, isoMonth, 28, cal));
          for (let d = 29; d <= 31; d++) {
            try { call(() => new NapiPlainDate(isoYear, isoMonth, d, cal)); isoDay = d; } catch { break; }
          }
        } catch { isoDay = 28; }
      }
      let str = `${padYear(isoYear)}-${pad2(isoMonth)}-${pad2(isoDay)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
      if (millisecond || microsecond || nanosecond) {
        const pad3 = n => String(n || 0).padStart(3, '0');
        const frac = pad3(millisecond) + pad3(microsecond) + pad3(nanosecond);
        str += '.' + frac.replace(/0+$/, '');
      }
      const calStr = arg.calendar ? `[u-ca=${typeof arg.calendar === 'string' ? arg.calendar : arg.calendar.id || 'iso8601'}]` : '';
      str += '[' + tz.id + ']' + calStr;
      return new ZonedDateTime(call(() => NapiZonedDateTime.from(str)));
    }
    throw new TypeError('Invalid argument for ZonedDateTime.from()');
  }

  static compare(one, two) {
    const a = toNapiZonedDateTime(one);
    const b = toNapiZonedDateTime(two);
    return NapiZonedDateTime.compareInstant(a, b);
  }

  get year() { return this._inner.year; }
  get month() { return this._inner.month; }
  get monthCode() { return this._inner.monthCode; }
  get day() { return this._inner.day; }
  get dayOfWeek() { return this._inner.dayOfWeek; }
  get dayOfYear() { return this._inner.dayOfYear; }
  get weekOfYear() { const v = this._inner.weekOfYear; return v === null ? undefined : v; }
  get yearOfWeek() { const v = this._inner.yearOfWeek; return v === null ? undefined : v; }
  get daysInWeek() { return this._inner.daysInWeek; }
  get daysInMonth() { return this._inner.daysInMonth; }
  get daysInYear() { return this._inner.daysInYear; }
  get monthsInYear() { return this._inner.monthsInYear; }
  get inLeapYear() { return this._inner.inLeapYear; }
  get era() { const v = this._inner.era; return v === null ? undefined : v; }
  get eraYear() { const v = this._inner.eraYear; return v === null ? undefined : v; }
  get hour() { return this._inner.hour; }
  get minute() { return this._inner.minute; }
  get second() { return this._inner.second; }
  get millisecond() { return this._inner.millisecond; }
  get microsecond() { return this._inner.microsecond; }
  get nanosecond() { return this._inner.nanosecond; }
  get calendarId() { return this._inner.calendar.id; }
  get calendar() { return this._inner.calendar.id; }
  get timeZoneId() { return this._inner.timeZone.id; }
  get timeZone() { return this._inner.timeZone.id; }
  get offset() { return this._inner.offset; }
  get offsetNanoseconds() { return this._inner.offsetNanoseconds; }
  get epochMilliseconds() { return this._inner.epochMilliseconds; }
  get epochNanoseconds() { return BigInt(this._inner.epochNanoseconds); }
  get hoursInDay() { return this._inner.hoursInDay; }

  with(fields, options) {
    validateWithFields(fields, ZONED_DATETIME_FIELDS, 'ZonedDateTime');
    const calId = this.calendarId;
    // When monthCode is provided in fields, don't include the original month
    // (and vice versa), to avoid month/monthCode disagreement
    const merged = {
      year: this.year,
      day: this.day,
      hour: this.hour,
      minute: this.minute,
      second: this.second,
      millisecond: this.millisecond,
      microsecond: this.microsecond,
      nanosecond: this.nanosecond,
      era: this.era,
      eraYear: this.eraYear,
    };
    // Set month/monthCode from original only if not being overridden
    if (fields.monthCode !== undefined) {
      // monthCode is being set - use monthCode, don't set month from original
      merged.monthCode = fields.monthCode;
    } else if (fields.month !== undefined) {
      // month is being set - use it directly
      merged.month = fields.month;
    } else {
      // Neither - use original month
      merged.month = this.month;
    }
    // Apply all defined field overrides (undefined values are ignored per spec)
    for (const key of Object.keys(fields)) {
      if (key !== 'monthCode' && fields[key] !== undefined) {
        merged[key] = fields[key];
      }
    }
    merged.timeZone = this.timeZoneId;
    merged.calendar = calId;
    resolveEraYear(merged, calId);
    return ZonedDateTime.from(merged, options);
  }

  withCalendar(calendar) {
    const cal = toNapiCalendar(calendar);
    return new ZonedDateTime(this._inner.withCalendar(cal));
  }

  withTimeZone(timeZone) {
    const tz = toNapiTimeZone(timeZone);
    return new ZonedDateTime(call(() => this._inner.withTimeZone(tz)));
  }

  withPlainTime(time) {
    if (time === undefined) {
      return this.startOfDay();
    }
    const t = toNapiPlainTime(time);
    const merged = {
      year: this.year, month: this.month, day: this.day,
      hour: t.hour, minute: t.minute, second: t.second,
      millisecond: t.millisecond, microsecond: t.microsecond, nanosecond: t.nanosecond,
      timeZone: this.timeZoneId, calendar: this.calendarId,
    };
    return ZonedDateTime.from(merged);
  }

  add(durationArg, options) {
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    return wrapZonedDateTime(call(() => this._inner.add(dur, overflow)));
  }

  subtract(durationArg, options) {
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    return wrapZonedDateTime(call(() => this._inner.subtract(dur, overflow)));
  }

  until(other, options) {
    const otherInner = toNapiZonedDateTime(other);
    const settings = convertDifferenceSettings(options);
    return wrapDuration(call(() => this._inner.until(otherInner, settings)));
  }

  since(other, options) {
    const otherInner = toNapiZonedDateTime(other);
    const settings = convertDifferenceSettings(options);
    return wrapDuration(call(() => this._inner.since(otherInner, settings)));
  }

  round(options) {
    const opts = convertRoundingOptions(options);
    return wrapZonedDateTime(call(() => this._inner.round(opts)));
  }

  equals(other) {
    const otherInner = toNapiZonedDateTime(other);
    return call(() => this._inner.equals(otherInner));
  }

  startOfDay() {
    return wrapZonedDateTime(call(() => this._inner.startOfDay()));
  }

  toInstant() {
    return wrapInstant(this._inner.toInstant());
  }

  toPlainDate() {
    return wrapPlainDate(this._inner.toPlainDate());
  }

  toPlainTime() {
    return wrapPlainTime(this._inner.toPlainTime());
  }

  toPlainDateTime() {
    return wrapPlainDateTime(this._inner.toPlainDateTime());
  }

  getTimeZoneTransition(direction) {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    if (direction === undefined) throw new TypeError('direction is required');
    if (direction === null || typeof direction === 'boolean' || typeof direction === 'number' || typeof direction === 'bigint' || typeof direction === 'symbol') {
      throw new TypeError('direction must be a string or object');
    }
    if (typeof direction === 'string') {
      if (direction !== 'next' && direction !== 'previous') {
        throw new RangeError('direction must be "next" or "previous"');
      }
    } else if (typeof direction === 'object') {
      const d = direction.direction;
      if (d === undefined) throw new TypeError('direction is required');
      const ds = String(d);
      if (ds !== 'next' && ds !== 'previous') {
        throw new RangeError('direction must be "next" or "previous"');
      }
    }
    return null;
  }

  toString(options) {
    if (options !== undefined) validateOptions(options);
    // Try to use NAPI toString, then apply fractional second digit formatting
    let str = call(() => this._inner.toString());
    if (options !== undefined) {
      const opts = convertZdtToStringOptions(options);
      if (opts.precision !== undefined) {
        str = formatFractionalSeconds(str, opts.precision);
      }
      if (opts.smallestUnit !== undefined) {
        // Handle smallestUnit for toString
        if (options.smallestUnit === 'minute') {
          // Remove seconds and fractional parts
          const tIdx = str.indexOf('T');
          if (tIdx !== -1) {
            const bracketIdx = str.indexOf('[');
            const offsetMatch = str.substring(tIdx).match(/[+-]\d{2}:\d{2}|Z/);
            if (offsetMatch) {
              const offsetStart = tIdx + offsetMatch.index;
              const timePart = str.substring(tIdx + 1, offsetStart);
              const parts = timePart.split(':');
              if (parts.length >= 2) {
                str = str.substring(0, tIdx + 1) + parts[0] + ':' + parts[1] + str.substring(offsetStart);
              }
            }
          }
        }
      }
      // Handle calendarName display
      if (opts.displayCalendar === 'Never') {
        // Remove [u-ca=...] annotation
        str = str.replace(/\[u-ca=[^\]]*\]/, '');
      }
      // Handle timeZoneName display
      if (opts.displayTimeZone === 'Never') {
        // Remove [timezone] annotation
        str = str.replace(/\[[^\]]*\]/, '');
      }
      // Handle offset display
      if (opts.displayOffset === 'Never') {
        // Remove offset like +HH:MM or -HH:MM or Z before [
        str = str.replace(/([T\d.]+)[+-]\d{2}:\d{2}(\[)/, '$1$2');
        str = str.replace(/([T\d.]+)Z(\[)/, '$1$2');
      }
    }
    return str;
  }

  toJSON() { requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime'); return this.toString(); }
  toLocaleString(...args) { requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime'); return this.toString(); }

  valueOf() {
    throw new TypeError('Use Temporal.ZonedDateTime.compare() to compare Temporal.ZonedDateTime');
  }

  get [Symbol.toStringTag]() { return 'Temporal.ZonedDateTime'; }

  static [Symbol.hasInstance](v) {
    return v !== null && v !== undefined && typeof v === 'object' && '_inner' in v && v._inner instanceof NapiZonedDateTime;
  }
}

// ═══════════════════════════════════════════════════════════════
//  Instant
// ═══════════════════════════════════════════════════════════════

class Instant {
  constructor(epochNanoseconds) {
    if (epochNanoseconds instanceof NapiInstant) {
      this._inner = epochNanoseconds;
    } else {
      // Per spec, epochNanoseconds must be a BigInt
      if (typeof epochNanoseconds !== 'bigint') {
        throw new TypeError('Instant constructor requires a BigInt epochNanoseconds');
      }
      // Check range: |epochNanoseconds| <= 8.64e21
      const limit = 8640000000000000000000n;
      if (epochNanoseconds < -limit || epochNanoseconds > limit) {
        throw new RangeError('Instant out of representable range');
      }
      const ns = Number(epochNanoseconds);
      this._inner = call(() => new NapiInstant(ns));
    }
    _wrapperSet.add(this);
  }

  static from(arg) {
    if (typeof arg === 'string') {
      return new Instant(call(() => NapiInstant.from(arg)));
    }
    if (arg instanceof Instant) {
      return new Instant(arg._inner);
    }
    if (arg && arg._inner instanceof NapiInstant) {
      return new Instant(arg._inner);
    }
    throw new TypeError('Invalid argument for Instant.from()');
  }

  static fromEpochMilliseconds(ms) {
    if (typeof ms === 'bigint') throw new TypeError('Cannot convert a BigInt value to a number');
    if (typeof ms === 'symbol') throw new TypeError('Cannot convert a Symbol value to a number');
    const n = Number(ms);
    if (!_isFinite(n) || n !== _trunc(n)) {
      throw new RangeError('fromEpochMilliseconds requires an integer number');
    }
    return new Instant(call(() => NapiInstant.fromEpochMilliseconds(n)));
  }

  static fromEpochNanoseconds(ns) {
    if (typeof ns !== 'bigint') throw new TypeError('fromEpochNanoseconds requires a BigInt');
    const n = Number(ns);
    return new Instant(call(() => new NapiInstant(n)));
  }

  static compare(one, two) {
    const a = toNapiInstant(one);
    const b = toNapiInstant(two);
    return NapiInstant.compare(a, b);
  }

  get epochMilliseconds() { return this._inner.epochMilliseconds; }
  get epochNanoseconds() { return BigInt(this._inner.epochNanoseconds); }

  add(durationArg) {
    const dur = toNapiDuration(durationArg);
    return wrapInstant(call(() => this._inner.add(dur)));
  }

  subtract(durationArg) {
    const dur = toNapiDuration(durationArg);
    return wrapInstant(call(() => this._inner.subtract(dur)));
  }

  until(other, options) {
    const otherInner = toNapiInstant(other);
    const settings = convertDifferenceSettings(options);
    return wrapDuration(call(() => this._inner.until(otherInner, settings)));
  }

  since(other, options) {
    const otherInner = toNapiInstant(other);
    const settings = convertDifferenceSettings(options);
    return wrapDuration(call(() => this._inner.since(otherInner, settings)));
  }

  round(options) {
    const opts = convertRoundingOptions(options);
    return wrapInstant(call(() => this._inner.round(opts)));
  }

  equals(other) {
    const otherInner = toNapiInstant(other);
    return this._inner.equals(otherInner);
  }

  toZonedDateTimeISO(timeZone) {
    requireBranding(this, NapiInstant, 'Temporal.Instant');
    const tz = toNapiTimeZone(timeZone);
    const zdt = call(() => NapiZonedDateTime.fromEpochMilliseconds(this.epochMilliseconds, tz));
    return wrapZonedDateTime(zdt);
  }

  toString(options) {
    if (options !== undefined) validateOptions(options);
    let str = call(() => this._inner.toString());
    if (options !== undefined) {
      // Validate options eagerly
      if (options.roundingMode !== undefined) mapRoundingMode(options.roundingMode);
      if (options.smallestUnit !== undefined) {
        const su = String(options.smallestUnit);
        const INSTANT_TOSTRING_UNITS = new Set(['minute', 'second', 'millisecond', 'microsecond', 'nanosecond']);
        if (!INSTANT_TOSTRING_UNITS.has(su)) {
          throw new RangeError(`Invalid smallestUnit for Instant.toString: ${su}`);
        }
      }
      const fsd = resolveFractionalSecondDigits(options.fractionalSecondDigits);
      // Handle timeZone option
      if (options.timeZone !== undefined) {
        const tz = toNapiTimeZone(options.timeZone);
        const zdt = call(() => NapiZonedDateTime.fromEpochMilliseconds(this.epochMilliseconds, tz));
        str = call(() => zdt.toString());
        // Remove the timezone annotation bracket for Instant.toString
        str = str.replace(/\[.*\]$/, '');
      }
      // Handle fractionalSecondDigits
      if (fsd !== undefined && fsd !== 'auto') {
        str = formatFractionalSeconds(str, fsd);
      }
      // Handle smallestUnit
      if (options.smallestUnit !== undefined) {
        if (options.smallestUnit === 'minute') {
          // Remove seconds portion
          const zIdx = str.indexOf('Z');
          const plusIdx = str.lastIndexOf('+');
          const minusIdx = str.lastIndexOf('-');
          let endIdx = str.length;
          if (zIdx !== -1) endIdx = zIdx;
          else if (plusIdx > 10) endIdx = plusIdx;
          else if (minusIdx > 10) endIdx = minusIdx;
          const timePart = str.substring(0, endIdx);
          const suffix = str.substring(endIdx);
          const parts = timePart.split(':');
          if (parts.length >= 3) {
            str = parts[0] + ':' + parts[1] + suffix;
          }
        }
      }
    }
    return str;
  }

  toJSON() { requireBranding(this, NapiInstant, 'Temporal.Instant'); return this.toString(); }
  toLocaleString(...args) { requireBranding(this, NapiInstant, 'Temporal.Instant'); return this.toString(); }

  valueOf() {
    throw new TypeError('Use Temporal.Instant.compare() to compare Temporal.Instant');
  }

  get [Symbol.toStringTag]() { return 'Temporal.Instant'; }

  static [Symbol.hasInstance](v) {
    return v !== null && v !== undefined && typeof v === 'object' && '_inner' in v && v._inner instanceof NapiInstant;
  }
}

// ═══════════════════════════════════════════════════════════════
//  PlainYearMonth
// ═══════════════════════════════════════════════════════════════

class PlainYearMonth {
  constructor(year, month, calendar, referenceDay) {
    if (year instanceof NapiPlainYearMonth) {
      this._inner = year;
    } else {
      const cal = toNapiCalendar(calendar);
      this._inner = call(() => new NapiPlainYearMonth(year, month, cal, referenceDay));
    }
    _wrapperSet.add(this);
  }

  static from(arg, options) {
    if (typeof arg === 'string') {
      rejectTooManyFractionalSeconds(arg);
      const inner = call(() => NapiPlainYearMonth.from(arg));
      if (options !== undefined) { validateOptions(options); extractOverflow(options); }
      return new PlainYearMonth(inner);
    }
    validateOptions(options);
    if (arg instanceof PlainYearMonth) {
      if (options !== undefined) extractOverflow(options);
      return new PlainYearMonth(arg._inner);
    }
    if (arg && arg._inner instanceof NapiPlainYearMonth) {
      if (options !== undefined) extractOverflow(options);
      return new PlainYearMonth(arg._inner);
    }
    if (typeof arg === 'object' && arg !== null) {
      const overflow = extractOverflow(options);
      const calId = getCalendarId(arg.calendar);
      const cal = toNapiCalendar(arg.calendar);
      const fields = { year: toInteger(arg.year), era: arg.era, eraYear: toInteger(arg.eraYear) };
      resolveEraYear(fields, calId);
      if (fields.year === undefined) throw new TypeError('Required property year is missing or undefined');
      const month = resolveMonth(arg, calId);
      if (month === undefined && arg.monthCode === undefined) throw new TypeError('Required property month or monthCode is missing');
      rejectPropertyBagInfinity({ year: fields.year, month }, 'year', 'month');
      const refDay = toInteger(arg.day) || 1;
      const iso = calendarDateToISO(fields.year, month, refDay, calId);
      return new PlainYearMonth(call(() => new NapiPlainYearMonth(iso.isoYear, iso.isoMonth, cal, iso.isoDay)));
    }
    throw new TypeError('Invalid argument for PlainYearMonth.from()');
  }

  static compare(one, two) {
    const a = toNapiPlainYearMonth(one);
    const b = toNapiPlainYearMonth(two);
    return NapiPlainYearMonth.compare(a, b);
  }

  get year() { return this._inner.year; }
  get month() { return this._inner.month; }
  get monthCode() { return this._inner.monthCode; }
  get era() { const v = this._inner.era; return v === null ? undefined : v; }
  get eraYear() { const v = this._inner.eraYear; return v === null ? undefined : v; }
  get daysInYear() { return this._inner.daysInYear; }
  get daysInMonth() { return this._inner.daysInMonth; }
  get monthsInYear() { return this._inner.monthsInYear; }
  get inLeapYear() { return this._inner.inLeapYear; }
  get calendarId() { return this._inner.calendar.id; }
  get calendar() { return this._inner.calendar.id; }

  with(fields, options) {
    requireBranding(this, NapiPlainYearMonth, 'Temporal.PlainYearMonth');
    validateWithFields(fields, PLAIN_YEARMONTH_FIELDS, 'PlainYearMonth');
    const overflow = extractOverflow(options);
    const calId = this.calendarId;
    const merged = {
      year: this.year,
      era: this.era,
      eraYear: this.eraYear,
      ...fields,
    };
    // Resolve month/monthCode override
    if (fields.monthCode !== undefined) {
      merged.month = monthCodeToMonth(fields.monthCode, calId);
    } else if (fields.month !== undefined) {
      merged.month = fields.month;
    } else {
      merged.month = this.month;
    }
    resolveEraYear(merged, calId);
    const cal = toNapiCalendar(calId);
    const iso = calendarDateToISO(merged.year, merged.month, 1, calId);
    return new PlainYearMonth(call(() => new NapiPlainYearMonth(
      iso.isoYear,
      iso.isoMonth,
      cal,
      iso.isoDay,
    )));
  }

  add(durationArg, options) {
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    return wrapPlainYearMonth(call(() => this._inner.add(dur, overflow)));
  }

  subtract(durationArg, options) {
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    return wrapPlainYearMonth(call(() => this._inner.subtract(dur, overflow)));
  }

  until(other, options) {
    const otherInner = toNapiPlainYearMonth(other);
    const settings = convertDifferenceSettings(options);
    return wrapDuration(call(() => this._inner.until(otherInner, settings)));
  }

  since(other, options) {
    const otherInner = toNapiPlainYearMonth(other);
    const settings = convertDifferenceSettings(options);
    return wrapDuration(call(() => this._inner.since(otherInner, settings)));
  }

  equals(other) {
    const otherInner = toNapiPlainYearMonth(other);
    return this._inner.equals(otherInner);
  }

  toPlainDate(fields) {
    requireBranding(this, NapiPlainYearMonth, 'Temporal.PlainYearMonth');
    if (typeof fields !== 'object' || fields === null || fields.day === undefined) {
      throw new TypeError('day is required');
    }
    const calId = this.calendarId;
    const cal = toNapiCalendar(calId);
    const iso = calendarDateToISO(this.year, this.month, fields.day, calId);
    return wrapPlainDate(call(() => new NapiPlainDate(iso.isoYear, iso.isoMonth, iso.isoDay, cal)));
  }

  toString(options) {
    if (options !== undefined) validateOptions(options);
    const dc = options ? mapDisplayCalendar(options.calendarName) : undefined;
    return this._inner.toString(dc);
  }

  toJSON() { requireBranding(this, NapiPlainYearMonth, 'Temporal.PlainYearMonth'); return this.toString(); }
  toLocaleString(...args) { requireBranding(this, NapiPlainYearMonth, 'Temporal.PlainYearMonth'); return this.toString(); }

  valueOf() {
    throw new TypeError('Use Temporal.PlainYearMonth.compare() to compare Temporal.PlainYearMonth');
  }

  get [Symbol.toStringTag]() { return 'Temporal.PlainYearMonth'; }

  static [Symbol.hasInstance](v) {
    return v !== null && v !== undefined && typeof v === 'object' && '_inner' in v && v._inner instanceof NapiPlainYearMonth;
  }
}

// ═══════════════════════════════════════════════════════════════
//  PlainMonthDay
// ═══════════════════════════════════════════════════════════════

class PlainMonthDay {
  constructor(month, day, calendar, referenceYear) {
    if (month instanceof NapiPlainMonthDay) {
      this._inner = month;
    } else {
      const cal = toNapiCalendar(calendar);
      this._inner = call(() => new NapiPlainMonthDay(month, day, cal, referenceYear));
    }
    _wrapperSet.add(this);
  }

  static from(arg, options) {
    if (typeof arg === 'string') {
      rejectTooManyFractionalSeconds(arg);
      const inner = call(() => NapiPlainMonthDay.from(arg));
      if (options !== undefined) { validateOptions(options); extractOverflow(options); }
      return new PlainMonthDay(inner);
    }
    validateOptions(options);
    if (arg instanceof PlainMonthDay) {
      if (options !== undefined) extractOverflow(options);
      return new PlainMonthDay(arg._inner);
    }
    if (arg && arg._inner instanceof NapiPlainMonthDay) {
      if (options !== undefined) extractOverflow(options);
      return new PlainMonthDay(arg._inner);
    }
    if (typeof arg === 'object' && arg !== null) {
      const overflow = extractOverflow(options);
      const mdFromCalId = getCalendarId(arg.calendar);
      const cal = toNapiCalendar(arg.calendar);
      if (arg.day === undefined) throw new TypeError('Required property day is missing or undefined');
      if (arg.month === undefined && arg.monthCode === undefined) throw new TypeError('Required property monthCode is missing');
      let month = arg.month;
      if (arg.monthCode !== undefined) {
        month = monthCodeToMonth(arg.monthCode, mdFromCalId);
      }
      let refYear = arg.year;
      if (refYear !== undefined) {
        const iso = calendarDateToISO(refYear, month, arg.day, mdFromCalId);
        refYear = iso.isoYear;
      }
      return new PlainMonthDay(call(() => new NapiPlainMonthDay(month, arg.day, cal, refYear)));
    }
    throw new TypeError('Invalid argument for PlainMonthDay.from()');
  }

  get monthCode() { return this._inner.monthCode; }
  get day() { return this._inner.day; }
  get calendarId() { return this._inner.calendar.id; }
  get calendar() { return this._inner.calendar.id; }

  with(fields, options) {
    requireBranding(this, NapiPlainMonthDay, 'Temporal.PlainMonthDay');
    const PLAIN_MONTHDAY_FIELDS = new Set(['month', 'monthCode', 'day', 'year']);
    validateWithFields(fields, PLAIN_MONTHDAY_FIELDS, 'PlainMonthDay');
    const overflow = extractOverflow(options);
    const calId = this.calendarId;
    const cal = toNapiCalendar(calId);
    // Get existing month from monthCode since PlainMonthDay doesn't expose month directly
    let month = fields.month;
    if (month === undefined && fields.monthCode !== undefined) {
      month = monthCodeToMonth(fields.monthCode, calId);
    }
    if (month === undefined) {
      const code = this.monthCode;
      const m = code.match(/^M(\d{2})L?$/);
      if (m) month = parseInt(m[1], 10);
    }
    return new PlainMonthDay(call(() => new NapiPlainMonthDay(
      month,
      fields.day !== undefined ? fields.day : this.day,
      cal,
    )));
  }

  equals(other) {
    const otherInner = toNapiPlainMonthDay(other);
    return this._inner.equals(otherInner);
  }

  toPlainDate(fields) {
    if (typeof fields !== 'object' || fields === null || fields.year === undefined) {
      throw new TypeError('year is required');
    }
    // Get month from monthCode
    const code = this.monthCode;
    const m = code.match(/^M(\d{2})L?$/);
    const month = m ? parseInt(m[1], 10) : 1;
    const calId = this.calendarId;
    const cal = toNapiCalendar(calId);
    const iso = calendarDateToISO(fields.year, month, this.day, calId);
    return wrapPlainDate(call(() => new NapiPlainDate(iso.isoYear, iso.isoMonth, iso.isoDay, cal)));
  }

  toString(options) {
    if (options !== undefined) validateOptions(options);
    const dc = options ? mapDisplayCalendar(options.calendarName) : undefined;
    return this._inner.toString(dc);
  }

  toJSON() { requireBranding(this, NapiPlainMonthDay, 'Temporal.PlainMonthDay'); return this.toString(); }
  toLocaleString(...args) { requireBranding(this, NapiPlainMonthDay, 'Temporal.PlainMonthDay'); return this.toString(); }

  valueOf() {
    throw new TypeError('Use Temporal.PlainMonthDay.compare() to compare Temporal.PlainMonthDay');
  }

  get [Symbol.toStringTag]() { return 'Temporal.PlainMonthDay'; }

  static [Symbol.hasInstance](v) {
    return v !== null && v !== undefined && typeof v === 'object' && '_inner' in v && v._inner instanceof NapiPlainMonthDay;
  }
}

// ─── Fix .length properties per spec ──────────────────────────
// The spec requires specific .length values that may differ from
// the JS formal parameter count due to internal constructor overloading.

function setLength(fn, len) {
  Object.defineProperty(fn, 'length', { value: len, writable: false, enumerable: false, configurable: true });
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

const Now = {
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
  [Symbol.toStringTag]: 'Temporal.Now',
};

// Now method lengths per spec (all 0)
setLength(Now.instant, 0);
setLength(Now.timeZoneId, 0);
setLength(Now.zonedDateTimeISO, 0);
setLength(Now.plainDateTimeISO, 0);
setLength(Now.plainDateISO, 0);
setLength(Now.plainTimeISO, 0);

// Per spec, Temporal.Now is extensible (not frozen)

// ═══════════════════════════════════════════════════════════════
//  Temporal namespace
// ═══════════════════════════════════════════════════════════════

export const Temporal = {
  Duration,
  PlainDate,
  PlainTime,
  PlainDateTime,
  ZonedDateTime,
  Instant,
  PlainYearMonth,
  PlainMonthDay,
  Now,
};

export {
  Duration,
  PlainDate,
  PlainTime,
  PlainDateTime,
  ZonedDateTime,
  Instant,
  PlainYearMonth,
  PlainMonthDay,
  Now,
};

export default Temporal;
