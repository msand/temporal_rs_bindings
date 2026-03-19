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
    // Try direct calendar ID first
    if (VALID_CALENDAR_IDS.has(cal)) return call(() => new NapiCalendar(cal));
    // Per spec, ToTemporalCalendar extracts the calendar from ISO/time strings
    // Try to extract calendar annotation from the string
    const match = cal.match(/\[u-ca=([^\]]+)\]/);
    if (match) return call(() => new NapiCalendar(match[1]));
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

function toNapiDuration(arg) {
  if (arg instanceof NapiDuration) return arg;
  if (arg && arg._inner instanceof NapiDuration) return arg._inner;
  if (typeof arg === 'string') return call(() => NapiDuration.from(arg));
  if (typeof arg === 'object' && arg !== null) {
    const { years, months, weeks, days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds } = arg;
    // Per spec, at least one duration-like property must be present
    if (years === undefined && months === undefined && weeks === undefined && days === undefined &&
        hours === undefined && minutes === undefined && seconds === undefined &&
        milliseconds === undefined && microseconds === undefined && nanoseconds === undefined) {
      throw new TypeError('Invalid duration-like argument: at least one property must be present');
    }
    // Convert to numbers and check for Infinity
    const vals = {
      years: years !== undefined ? Number(years) : undefined,
      months: months !== undefined ? Number(months) : undefined,
      weeks: weeks !== undefined ? Number(weeks) : undefined,
      days: days !== undefined ? Number(days) : undefined,
      hours: hours !== undefined ? Number(hours) : undefined,
      minutes: minutes !== undefined ? Number(minutes) : undefined,
      seconds: seconds !== undefined ? Number(seconds) : undefined,
      milliseconds: milliseconds !== undefined ? Number(milliseconds) : undefined,
      microseconds: microseconds !== undefined ? Number(microseconds) : undefined,
      nanoseconds: nanoseconds !== undefined ? Number(nanoseconds) : undefined,
    };
    rejectPropertyBagInfinity(vals, 'years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds', 'milliseconds', 'microseconds', 'nanoseconds');
    return call(() => new NapiDuration(
      vals.years, vals.months, vals.weeks, vals.days,
      vals.hours, vals.minutes, vals.seconds,
      vals.milliseconds, vals.microseconds, vals.nanoseconds,
    ));
  }
  throw new TypeError('Invalid duration-like argument');
}

// ─── Helper: parse monthCode to month number ─────────────────

function monthCodeToMonth(monthCode) {
  if (!monthCode || typeof monthCode !== 'string') return undefined;
  const m = monthCode.match(/^M(\d{2})L?$/);
  if (!m) throw new RangeError(`Invalid monthCode: ${monthCode}`);
  return parseInt(m[1], 10);
}

// ─── Helper: resolve month from month/monthCode ───────────────

function resolveMonth(bag) {
  const month = toInteger(bag.month);
  const { monthCode } = bag;
  if (month !== undefined && monthCode !== undefined) {
    const fromCode = monthCodeToMonth(monthCode);
    if (fromCode !== month) {
      throw new RangeError(`month ${month} and monthCode ${monthCode} do not agree`);
    }
    return month;
  }
  if (month !== undefined) return month;
  if (monthCode !== undefined) return monthCodeToMonth(monthCode);
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
  if (fields.era !== undefined && fields.eraYear === undefined) {
    throw new TypeError('eraYear is required when era is provided');
  }
  if (fields.eraYear !== undefined && fields.era === undefined) {
    throw new TypeError('era is required when eraYear is provided');
  }
  return fields;
}

// ─── Helper: get calendar ID from various sources ─────────────

function getCalendarId(calArg) {
  if (calArg === undefined || calArg === null) return 'iso8601';
  if (typeof calArg === 'string') return calArg;
  if (calArg && typeof calArg === 'object' && calArg.id) return calArg.id;
  return 'iso8601';
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
    const month = resolveMonth(arg);
    if (year !== undefined && month !== undefined && day !== undefined) {
      rejectPropertyBagInfinity({ year, month, day }, 'year', 'month', 'day');
      return call(() => new NapiPlainDate(year, month, day, cal));
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
    const month = resolveMonth(arg);
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
    return call(() => new NapiPlainDateTime(
      fields.year, month, day,
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
    const fields = { year: arg.year, era: arg.era, eraYear: arg.eraYear };
    resolveEraYear(fields, calId);
    const tz = toNapiTimeZone(arg.timeZone);
    const year = fields.year || 0;
    const monthVal = resolveMonth(arg);
    const month = monthVal || 1;
    const day = arg.day || 1;
    const hour = arg.hour || 0;
    const minute = arg.minute || 0;
    const second = arg.second || 0;
    const pad2 = n => String(n).padStart(2, '0');
    const pad4 = n => {
      const s = String(Math.abs(n)).padStart(4, '0');
      return n < 0 ? '-' + s : s;
    };
    let str = `${pad4(year)}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
    if (arg.millisecond || arg.microsecond || arg.nanosecond) {
      const pad3 = n => String(n || 0).padStart(3, '0');
      const frac = pad3(arg.millisecond) + pad3(arg.microsecond) + pad3(arg.nanosecond);
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
    const month = resolveMonth(arg);
    if (month === undefined && arg.monthCode === undefined) throw new TypeError('Required property month or monthCode is missing');
    rejectPropertyBagInfinity({ year: fields.year, month }, 'year', 'month');
    return call(() => new NapiPlainYearMonth(fields.year, month, cal, toInteger(arg.day)));
  }
  throw new TypeError('Invalid PlainYearMonth argument');
}

// ─── Helper: convert to NAPI PlainMonthDay ────────────────────

function toNapiPlainMonthDay(arg) {
  if (arg instanceof NapiPlainMonthDay) return arg;
  if (arg && arg._inner instanceof NapiPlainMonthDay) return arg._inner;
  if (typeof arg === 'string') { rejectTooManyFractionalSeconds(arg); return call(() => NapiPlainMonthDay.from(arg)); }
  if (typeof arg === 'object' && arg !== null) {
    const cal = toNapiCalendar(arg.calendar);
    if (arg.day === undefined) throw new TypeError('Required property day is missing or undefined');
    if (arg.month === undefined && arg.monthCode === undefined) throw new TypeError('Required property monthCode is missing');
    // If monthCode is provided, derive month from it; otherwise use the month directly
    let month = arg.month;
    if (arg.monthCode !== undefined) {
      month = monthCodeToMonth(arg.monthCode);
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

// ─── Helper: convert RoundingOptions ──────────────────────────

function convertRoundingOptions(options) {
  if (options === undefined) return { smallestUnit: undefined };
  if (typeof options === 'string') {
    // shorthand: just the smallestUnit
    return { smallestUnit: mapUnit(options) };
  }
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

function rejectPropertyBagInfinity(bag, ...fields) {
  for (const f of fields) {
    if (bag[f] !== undefined) rejectInfinity(bag[f], f);
  }
}

// ─── Helper: coerce property bag values to numbers ────────────

function toInteger(val) {
  if (val === undefined) return undefined;
  if (typeof val === 'number') return val;
  if (typeof val === 'bigint') throw new TypeError('Cannot convert a BigInt to a Number');
  if (typeof val === 'symbol') throw new TypeError('Cannot convert a Symbol to a Number');
  return Number(val);
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

function validateOverflowReject(arg, overflow) {
  if (overflow === 'Reject') {
    if (arg.month !== undefined && (arg.month < 1 || arg.month > 13)) {
      throw new RangeError('month out of range');
    }
    if (arg.day !== undefined && (arg.day < 1 || arg.day > 31)) {
      throw new RangeError('day out of range');
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
      this._inner = call(() => new NapiDuration(
        args[0] !== undefined ? Number(args[0]) : undefined,
        args[1] !== undefined ? Number(args[1]) : undefined,
        args[2] !== undefined ? Number(args[2]) : undefined,
        args[3] !== undefined ? Number(args[3]) : undefined,
        args[4] !== undefined ? Number(args[4]) : undefined,
        args[5] !== undefined ? Number(args[5]) : undefined,
        args[6] !== undefined ? Number(args[6]) : undefined,
        args[7] !== undefined ? Number(args[7]) : undefined,
        args[8] !== undefined ? Number(args[8]) : undefined,
        args[9] !== undefined ? Number(args[9]) : undefined,
      ));
    }
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
    if (options !== undefined) validateOptions(options);
    const a = toNapiDuration(one);
    const b = toNapiDuration(two);
    const aStr = a.toString();
    const bStr = b.toString();
    if (aStr === bStr) return 0;
    try {
      const diff = a.subtract(b);
      return diff.sign;
    } catch {
      return 0;
    }
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

  round(options) {
    throw new RangeError('Duration.prototype.round is not yet supported');
  }

  total(options) {
    throw new RangeError('Duration.prototype.total is not yet supported');
  }

  toString(options) {
    if (options !== undefined) validateOptions(options);
    return this._inner.toString();
  }
  toJSON() { return this.toString(); }
  toLocaleString(...args) { return this.toString(); }

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
      const cal = toNapiCalendar(calendar);
      this._inner = call(() => new NapiPlainDate(year, month, day, cal));
    }
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
      const inner = arg._inner || arg;
      const dt = inner instanceof NapiPlainDateTime ? inner : arg._inner;
      return new PlainDate(call(() => new NapiPlainDate(dt.year, dt.month, dt.day, dt.calendar)));
    }
    if (arg instanceof ZonedDateTime || (arg && arg._inner instanceof NapiZonedDateTime)) {
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
      const month = resolveMonth(arg);
      if (year === undefined) throw new TypeError('Required property year is missing or undefined');
      if (month === undefined) throw new TypeError('Required property month or monthCode is missing');
      if (day === undefined) throw new TypeError('Required property day is missing or undefined');
      rejectPropertyBagInfinity({ year, month, day }, 'year', 'month', 'day');
      validateOverflowReject(arg, overflow);
      const inner = call(() => new NapiPlainDate(year, month, day, cal));
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
    if (typeof fields !== 'object' || fields === null) {
      throw new TypeError('Invalid fields argument');
    }
    const overflow = extractOverflow(options);
    const calId = fields.calendar || this.calendarId;
    const merged = {
      year: this.year,
      month: this.month,
      day: this.day,
      era: this.era,
      eraYear: this.eraYear,
      ...fields,
    };
    resolveEraYear(merged, typeof calId === 'string' ? calId : calId.id || 'iso8601');
    const cal = toNapiCalendar(calId);
    return new PlainDate(call(() => new NapiPlainDate(merged.year, merged.month, merged.day, cal)));
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
    if (time === undefined || time === null) {
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
    if (typeof item === 'string') {
      const tz = toNapiTimeZone(item);
      const dtStr = this.toString() + 'T00:00:00';
      const zdt = call(() => NapiZonedDateTime.from(dtStr + '[' + tz.id + ']'));
      return wrapZonedDateTime(zdt);
    }
    if (typeof item === 'object' && item !== null) {
      const tz = toNapiTimeZone(item.timeZone);
      let timeStr = 'T00:00:00';
      if (item.plainTime) {
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
    const cal = toNapiCalendar(this.calendarId);
    return wrapPlainYearMonth(call(() => new NapiPlainYearMonth(this.year, this.month, cal)));
  }

  toPlainMonthDay() {
    const cal = toNapiCalendar(this.calendarId);
    return wrapPlainMonthDay(call(() => new NapiPlainMonthDay(this.month, this.day, cal)));
  }

  toString(options) {
    if (options !== undefined) validateOptions(options);
    const dc = options ? mapDisplayCalendar(options.calendarName) : undefined;
    return this._inner.toString(dc);
  }

  toJSON() { return this.toString(); }
  toLocaleString(...args) { return this.toString(); }

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
    if (typeof arg === 'object' && arg !== null) {
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
    if (typeof fields !== 'object' || fields === null) {
      throw new TypeError('Invalid fields argument');
    }
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

  toPlainDateTime(date) {
    const d = toNapiPlainDate(date);
    const dt = call(() => new NapiPlainDateTime(
      d.year, d.month, d.day,
      this.hour, this.minute, this.second,
      this.millisecond, this.microsecond, this.nanosecond,
      d.calendar ? d.calendar : undefined,
    ));
    return wrapPlainDateTime(dt);
  }

  toZonedDateTime(item) {
    if (typeof item !== 'object' || item === null) {
      throw new TypeError('Expected object with timeZone and plainDate');
    }
    const tz = toNapiTimeZone(item.timeZone);
    const d = toNapiPlainDate(item.plainDate);
    const pad2 = n => String(n).padStart(2, '0');
    const pad3 = n => String(n).padStart(3, '0');
    let dateStr = `${String(d.year).padStart(4, '0')}-${pad2(d.month)}-${pad2(d.day)}`;
    let timeStr = `T${pad2(this.hour)}:${pad2(this.minute)}:${pad2(this.second)}`;
    if (this.millisecond || this.microsecond || this.nanosecond) {
      const frac = pad3(this.millisecond) + pad3(this.microsecond) + pad3(this.nanosecond);
      timeStr += '.' + frac.replace(/0+$/, '');
    }
    const zdt = call(() => NapiZonedDateTime.from(dateStr + timeStr + '[' + tz.id + ']'));
    return wrapZonedDateTime(zdt);
  }

  toString(options) {
    const opts = convertToStringOptions(options);
    return call(() => this._inner.toString(opts.roundingOptions));
  }

  toJSON() { return this.toString(); }
  toLocaleString(...args) { return this.toString(); }

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
      const cal = toNapiCalendar(calendar);
      this._inner = call(() => new NapiPlainDateTime(
        year, month, day,
        hour, minute, second,
        millisecond, microsecond, nanosecond,
        cal,
      ));
    }
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
      const month = resolveMonth(arg);
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
      validateOverflowReject(arg, overflow);
      return new PlainDateTime(call(() => new NapiPlainDateTime(
        fields.year, month, day,
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
    if (typeof fields !== 'object' || fields === null) {
      throw new TypeError('Invalid fields argument');
    }
    const overflow = extractOverflow(options);
    const calId = fields.calendar || this.calendarId;
    const merged = {
      year: this.year,
      month: this.month,
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
    resolveEraYear(merged, typeof calId === 'string' ? calId : calId.id || 'iso8601');
    const cal = toNapiCalendar(calId);
    return new PlainDateTime(call(() => new NapiPlainDateTime(
      merged.year, merged.month, merged.day,
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
    if (time === undefined || time === null) {
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

  toPlainYearMonth() {
    const cal = toNapiCalendar(this.calendarId);
    return wrapPlainYearMonth(call(() => new NapiPlainYearMonth(this.year, this.month, cal)));
  }

  toPlainMonthDay() {
    const cal = toNapiCalendar(this.calendarId);
    return wrapPlainMonthDay(call(() => new NapiPlainMonthDay(this.month, this.day, cal)));
  }

  toString(options) {
    const opts = convertToStringOptions(options);
    return call(() => this._inner.toString(opts.roundingOptions, opts.displayCalendar));
  }

  toJSON() { return this.toString(); }
  toLocaleString(...args) { return this.toString(); }

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
      const tz = toNapiTimeZone(timeZone);
      const cal = toNapiCalendar(calendar);
      // epochNanoseconds can be BigInt or number
      const ns = typeof epochNanoseconds === 'bigint' ? Number(epochNanoseconds) : epochNanoseconds;
      this._inner = call(() => new NapiZonedDateTime(ns, tz, cal));
    }
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
      const calId = getCalendarId(arg.calendar);
      const fields = { year: arg.year, era: arg.era, eraYear: arg.eraYear };
      resolveEraYear(fields, calId);
      // Build an ISO string and parse it
      const tz = toNapiTimeZone(arg.timeZone);
      const year = fields.year || 0;
      const monthVal = resolveMonth(arg);
      const month = monthVal || 1;
      const day = arg.day || 1;
      const hour = arg.hour || 0;
      const minute = arg.minute || 0;
      const second = arg.second || 0;
      const pad2 = n => String(n).padStart(2, '0');
      const pad4 = n => {
        const s = String(Math.abs(n)).padStart(4, '0');
        return n < 0 ? '-' + s : s;
      };
      let str = `${pad4(year)}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
      if (arg.millisecond || arg.microsecond || arg.nanosecond) {
        const pad3 = n => String(n || 0).padStart(3, '0');
        const frac = pad3(arg.millisecond) + pad3(arg.microsecond) + pad3(arg.nanosecond);
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
    if (typeof fields !== 'object' || fields === null) {
      throw new TypeError('Invalid fields argument');
    }
    const calId = fields.calendar || this.calendarId;
    // Rebuild via property bag
    const merged = {
      year: this.year,
      month: this.month,
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
      timeZone: this.timeZoneId,
      calendar: calId,
    };
    resolveEraYear(merged, typeof calId === 'string' ? calId : calId.id || 'iso8601');
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
    if (time === undefined || time === null) {
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

  toPlainYearMonth() {
    const cal = toNapiCalendar(this.calendarId);
    return wrapPlainYearMonth(call(() => new NapiPlainYearMonth(this.year, this.month, cal)));
  }

  toPlainMonthDay() {
    const cal = toNapiCalendar(this.calendarId);
    return wrapPlainMonthDay(call(() => new NapiPlainMonthDay(this.month, this.day, cal)));
  }

  getTimeZoneTransition(direction) {
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

  toJSON() { return this.toString(); }
  toLocaleString(...args) { return this.toString(); }

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
      // epochNanoseconds should be BigInt per spec
      const ns = typeof epochNanoseconds === 'bigint' ? Number(epochNanoseconds) : epochNanoseconds;
      this._inner = call(() => new NapiInstant(ns));
    }
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
    return new Instant(call(() => NapiInstant.fromEpochMilliseconds(Number(ms))));
  }

  static fromEpochNanoseconds(ns) {
    const n = typeof ns === 'bigint' ? Number(ns) : ns;
    return new Instant(call(() => new NapiInstant(n)));
  }

  static fromEpochSeconds(s) {
    return Instant.fromEpochMilliseconds(Number(s) * 1000);
  }

  static fromEpochMicroseconds(us) {
    const n = typeof us === 'bigint' ? Number(us) * 1000 : us * 1000;
    return new Instant(call(() => new NapiInstant(n)));
  }

  static compare(one, two) {
    const a = toNapiInstant(one);
    const b = toNapiInstant(two);
    return NapiInstant.compare(a, b);
  }

  get epochMilliseconds() { return this._inner.epochMilliseconds; }
  get epochNanoseconds() { return BigInt(this._inner.epochNanoseconds); }
  get epochSeconds() { return Math.trunc(this._inner.epochMilliseconds / 1000); }
  get epochMicroseconds() { return BigInt(this._inner.epochNanoseconds) / 1000n; }

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
    const tz = toNapiTimeZone(timeZone);
    const zdt = call(() => NapiZonedDateTime.fromEpochMilliseconds(this.epochMilliseconds, tz));
    return wrapZonedDateTime(zdt);
  }

  toZonedDateTime(options) {
    if (typeof options !== 'object' || options === null) {
      throw new TypeError('Expected options object with timeZone and calendar');
    }
    const tz = toNapiTimeZone(options.timeZone);
    const cal = toNapiCalendar(options.calendar);
    const zdt = call(() => NapiZonedDateTime.fromEpochMilliseconds(this.epochMilliseconds, tz, cal));
    return wrapZonedDateTime(zdt);
  }

  toString(options) {
    if (options !== undefined) validateOptions(options);
    let str = call(() => this._inner.toString());
    if (options !== undefined) {
      // Validate options eagerly
      if (options.roundingMode !== undefined) mapRoundingMode(options.roundingMode);
      if (options.smallestUnit !== undefined) mapUnit(options.smallestUnit);
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

  toJSON() { return this.toString(); }
  toLocaleString(...args) { return this.toString(); }

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
      const month = resolveMonth(arg);
      if (month === undefined && arg.monthCode === undefined) throw new TypeError('Required property month or monthCode is missing');
      rejectPropertyBagInfinity({ year: fields.year, month }, 'year', 'month');
      return new PlainYearMonth(call(() => new NapiPlainYearMonth(fields.year, month, cal, toInteger(arg.day))));
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
    if (typeof fields !== 'object' || fields === null) {
      throw new TypeError('Invalid fields argument');
    }
    const overflow = extractOverflow(options);
    const calId = fields.calendar || this.calendarId;
    const merged = {
      year: this.year,
      month: this.month,
      era: this.era,
      eraYear: this.eraYear,
      ...fields,
    };
    resolveEraYear(merged, typeof calId === 'string' ? calId : calId.id || 'iso8601');
    const cal = toNapiCalendar(calId);
    return new PlainYearMonth(call(() => new NapiPlainYearMonth(
      merged.year,
      merged.month,
      cal,
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
    if (typeof fields !== 'object' || fields === null || fields.day === undefined) {
      throw new TypeError('day is required');
    }
    const cal = toNapiCalendar(this.calendarId);
    return wrapPlainDate(call(() => new NapiPlainDate(this.year, this.month, fields.day, cal)));
  }

  toString(options) {
    if (options !== undefined) validateOptions(options);
    const dc = options ? mapDisplayCalendar(options.calendarName) : undefined;
    return this._inner.toString(dc);
  }

  toJSON() { return this.toString(); }
  toLocaleString(...args) { return this.toString(); }

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
      const cal = toNapiCalendar(arg.calendar);
      if (arg.day === undefined) throw new TypeError('Required property day is missing or undefined');
      if (arg.month === undefined && arg.monthCode === undefined) throw new TypeError('Required property monthCode is missing');
      let month = arg.month;
      if (arg.monthCode !== undefined) {
        month = monthCodeToMonth(arg.monthCode);
      }
      return new PlainMonthDay(call(() => new NapiPlainMonthDay(month, arg.day, cal, arg.year)));
    }
    throw new TypeError('Invalid argument for PlainMonthDay.from()');
  }

  get monthCode() { return this._inner.monthCode; }
  get day() { return this._inner.day; }
  get calendarId() { return this._inner.calendar.id; }
  get calendar() { return this._inner.calendar.id; }

  with(fields, options) {
    if (typeof fields !== 'object' || fields === null) {
      throw new TypeError('Invalid fields argument');
    }
    const overflow = extractOverflow(options);
    const cal = toNapiCalendar(fields.calendar || this.calendarId);
    // Get existing month from monthCode since PlainMonthDay doesn't expose month directly
    let month = fields.month;
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
    const cal = toNapiCalendar(this.calendarId);
    return wrapPlainDate(call(() => new NapiPlainDate(fields.year, month, this.day, cal)));
  }

  toString(options) {
    if (options !== undefined) validateOptions(options);
    const dc = options ? mapDisplayCalendar(options.calendarName) : undefined;
    return this._inner.toString(dc);
  }

  toJSON() { return this.toString(); }
  toLocaleString(...args) { return this.toString(); }

  valueOf() {
    throw new TypeError('Use equals() to compare Temporal.PlainMonthDay');
  }

  get [Symbol.toStringTag]() { return 'Temporal.PlainMonthDay'; }

  static [Symbol.hasInstance](v) {
    return v !== null && v !== undefined && typeof v === 'object' && '_inner' in v && v._inner instanceof NapiPlainMonthDay;
  }
}

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

Object.freeze(Now);

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
