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
  if (typeof val === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
  const str = String(val);
  const mapped = UNIT_MAP[str];
  if (!mapped) throw new RangeError(`Invalid unit: ${val}`);
  return mapped;
}

function mapRoundingMode(val) {
  if (val === undefined) return undefined;
  if (typeof val === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
  const str = String(val);
  const mapped = ROUNDING_MODE_MAP[str];
  if (!mapped) throw new RangeError(`Invalid rounding mode: ${val}`);
  return mapped;
}

function mapOverflow(val) {
  if (val === undefined) return undefined;
  if (typeof val === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
  const str = String(val);
  const mapped = OVERFLOW_MAP[str];
  if (!mapped) throw new RangeError(`Invalid overflow: ${val}`);
  return mapped;
}

function mapDisplayCalendar(val) {
  if (val === undefined) return undefined;
  if (typeof val === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
  const str = String(val);
  const mapped = DISPLAY_CALENDAR_MAP[str];
  if (!mapped) throw new RangeError(`Invalid calendarName option: ${val}`);
  return mapped;
}

function mapDisplayTimeZone(val) {
  if (val === undefined) return undefined;
  if (typeof val === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
  const str = String(val);
  const mapped = DISPLAY_TIMEZONE_MAP[str];
  if (!mapped) throw new RangeError(`Invalid timeZoneName option: ${val}`);
  return mapped;
}

function mapDisplayOffset(val) {
  if (val === undefined) return undefined;
  if (typeof val === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
  const str = String(val);
  const mapped = DISPLAY_OFFSET_MAP[str];
  if (!mapped) throw new RangeError(`Invalid offset option: ${val}`);
  return mapped;
}

// ─── Helper: BigInt epoch nanoseconds to ISO 8601 UTC string ──

function bigintNsToISOString(epochNs) {
  const NS_PER_MS = 1000000n;
  // Floor division towards -Infinity
  let epochMs = epochNs / NS_PER_MS;
  let subMsNs = epochNs % NS_PER_MS;
  if (subMsNs < 0n) {
    subMsNs += NS_PER_MS;
    epochMs -= 1n;
  }
  const d = new Date(Number(epochMs));
  const micros = Number(subMsNs / 1000n);
  const nanos = Number(subMsNs % 1000n);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hour = String(d.getUTCHours()).padStart(2, '0');
  const minute = String(d.getUTCMinutes()).padStart(2, '0');
  const second = String(d.getUTCSeconds()).padStart(2, '0');
  const milli = String(d.getUTCMilliseconds()).padStart(3, '0');
  const micro = String(micros).padStart(3, '0');
  const nano = String(nanos).padStart(3, '0');
  let yearStr;
  if (year < 0 || year >= 10000) {
    const s = String(Math.abs(year)).padStart(6, '0');
    yearStr = (year < 0 ? '-' : '+') + s;
  } else {
    yearStr = String(year).padStart(4, '0');
  }
  let frac = milli + micro + nano;
  frac = frac.replace(/0+$/, '');
  const fracPart = frac ? '.' + frac : '';
  return yearStr + '-' + month + '-' + day + 'T' + hour + ':' + minute + ':' + second + fracPart + 'Z';
}

// ─── Helper: compute epoch nanoseconds BigInt from NAPI inner ──

function computeEpochNanoseconds(inner) {
  // The NAPI epochNanoseconds is a Number which loses precision for large values.
  // Compute precise BigInt from epochMilliseconds + sub-ms components from toString.
  const str = inner.toString();
  const epochMs = BigInt(inner.epochMilliseconds);
  // Extract fractional seconds from the string
  const dotMatch = str.match(/\.(\d+)/);
  if (!dotMatch) {
    return epochMs * 1000000n;
  }
  const fracStr = (dotMatch[1] + '000000000').substring(0, 9);
  const ms = parseInt(fracStr.substring(0, 3), 10);
  const us = parseInt(fracStr.substring(3, 6), 10);
  const ns = parseInt(fracStr.substring(6, 9), 10);
  return epochMs * 1000000n + BigInt(us) * 1000n + BigInt(ns);
}

// ─── Helper: compute local time in a timezone from epoch ms ────

function getLocalPartsFromEpoch(epochMs, tzId) {
  const d = new Date(epochMs);
  if (tzId === 'UTC') {
    // Use Date.getUTC* for UTC to correctly handle negative years
    return {
      year: String(Math.abs(d.getUTCFullYear())),
      month: String(d.getUTCMonth() + 1).padStart(2, '0'),
      day: String(d.getUTCDate()).padStart(2, '0'),
      hour: String(d.getUTCHours()).padStart(2, '0'),
      minute: String(d.getUTCMinutes()).padStart(2, '0'),
      second: String(d.getUTCSeconds()).padStart(2, '0'),
      fractionalSecond: String(d.getUTCMilliseconds()).padStart(3, '0'),
      _fullYear: d.getUTCFullYear(),
    };
  }
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tzId,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
    era: 'short',
    fractionalSecondDigits: 3,
  });
  const parts = {};
  for (const {type, value} of fmt.formatToParts(d)) {
    parts[type] = value;
  }
  // Convert era-based year to astronomical year
  const eraYear = parseInt(parts.year, 10);
  if (parts.era && (parts.era === 'BC' || parts.era === 'B')) {
    // BC year: 1 BC = year 0, 2 BC = year -1, etc.
    parts._fullYear = -(eraYear - 1);
  } else {
    parts._fullYear = eraYear;
  }
  return parts;
}

function getUtcOffsetString(epochMs, tzId) {
  if (tzId === 'UTC') return '+00:00';
  const parts = getLocalPartsFromEpoch(epochMs, tzId);
  const localYear = parts._fullYear;
  const localMonth = parseInt(parts.month, 10) - 1;
  const localDay = parseInt(parts.day, 10);
  let localHour = parseInt(parts.hour, 10);
  if (localHour === 24) localHour = 0;
  const localMinute = parseInt(parts.minute, 10);
  const localSecond = parseInt(parts.second, 10);
  // Date.UTC with year < 100 has special handling, use setUTCFullYear to avoid it
  const localAsUtcDate = new Date(0);
  localAsUtcDate.setUTCFullYear(localYear, localMonth, localDay);
  localAsUtcDate.setUTCHours(localHour, localMinute, localSecond, 0);
  const localAsUtc = localAsUtcDate.getTime();
  const offsetMs = localAsUtc - Math.floor(epochMs / 1000) * 1000;
  const offsetMin = Math.round(offsetMs / 60000);
  const sign = offsetMin >= 0 ? '+' : '-';
  const absMin = Math.abs(offsetMin);
  const offHr = String(Math.floor(absMin / 60)).padStart(2, '0');
  const offMn = String(absMin % 60).padStart(2, '0');
  return sign + offHr + ':' + offMn;
}

function bigintNsToZdtString(epochNs, tzId, calId) {
  const NS_PER_MS = 1000000n;
  let epochMs = epochNs / NS_PER_MS;
  let subMsNs = epochNs % NS_PER_MS;
  if (subMsNs < 0n) {
    subMsNs += NS_PER_MS;
    epochMs -= 1n;
  }
  const msNum = Number(epochMs);
  const parts = getLocalPartsFromEpoch(msNum, tzId);
  const micros = String(Number(subMsNs / 1000n)).padStart(3, '0');
  const nanos = String(Number(subMsNs % 1000n)).padStart(3, '0');
  const year = parts._fullYear;
  const month = parts.month;
  const day = parts.day;
  let hour = parseInt(parts.hour, 10);
  if (hour === 24) hour = 0;
  const minute = parts.minute;
  const second = parts.second;
  const ms = (parts.fractionalSecond || '000').padEnd(3, '0');
  let yearStr;
  if (year < 0 || year >= 10000) {
    const s = String(Math.abs(year)).padStart(6, '0');
    yearStr = (year < 0 ? '-' : '+') + s;
  } else {
    yearStr = String(year).padStart(4, '0');
  }
  let frac = ms + micros + nanos;
  frac = frac.replace(/0+$/, '');
  const fracPart = frac ? '.' + frac : '';
  const offset = getUtcOffsetString(msNum, tzId);
  const calPart = calId && calId !== 'iso8601' ? '[u-ca=' + calId + ']' : '';
  return yearStr + '-' + month + '-' + day + 'T' + String(hour).padStart(2, '0') + ':' + minute + ':' + second + fracPart + offset + '[' + tzId + ']' + calPart;
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
    // Reject calendar IDs only supported in Intl.DateTimeFormat
    if (REJECTED_CALENDAR_IDS.has(canonCal)) {
      throw new RangeError(`Calendar '${canonCal}' is not supported in Temporal`);
    }
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
    // Check if it looks like an ISO datetime/date/yearmonth/monthday string
    // Also match strings with timezone annotations (e.g. "2016-12-31T23:59:60+00:00[UTC]")
    if (/^\d{4}-\d{2}/.test(cal) || /^[+-]\d{6}/.test(cal) || /^\+\d{4}/.test(cal) || /^\d{2}-\d{2}/.test(cal)) {
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
  'dangi', 'ethiopian', 'ethioaa', 'ethiopic', 'hebrew', 'indian',
  'islamic-civil', 'islamic-tbla', 'islamic-umalqura',
  'persian', 'roc',
]);

// Calendar IDs that should throw in Temporal (only supported in Intl.DateTimeFormat)
const REJECTED_CALENDAR_IDS = new Set(['islamic', 'islamic-rgsa']);

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

function monthCodeToMonth(monthCode, calendarId, targetYear) {
  if (monthCode === undefined) return undefined;
  // Per spec, monthCode uses ToPrimitiveAndRequireString:
  // 1. If symbol or bigint, throw TypeError
  // 2. If string, use directly
  // 3. If object, call ToPrimitive(hint:string) then RequireString on result
  // 4. If other primitive (number, boolean, null), throw TypeError
  if (typeof monthCode === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
  if (typeof monthCode === 'bigint') throw new TypeError('Cannot convert a BigInt value to a string');
  let str;
  if (typeof monthCode === 'string') {
    str = monthCode;
  } else if (typeof monthCode === 'object' || typeof monthCode === 'function') {
    // ToPrimitive with string hint → calls toString()
    const prim = monthCode.toString !== undefined ? monthCode.toString() : String(monthCode);
    if (typeof prim !== 'string') throw new TypeError('monthCode must be a string');
    str = prim;
  } else {
    // number, boolean, null etc → TypeError
    throw new TypeError(`monthCode must be a string`);
  }
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
  } else if (calendarId === 'hebrew') {
    // Hebrew uses M01-M12 and M05L (leap month Adar I). M13 is never valid.
    if (monthNum > 12) throw new RangeError(`Invalid monthCode for hebrew calendar: ${str}`);
    if (isLeap && monthNum !== 5) throw new RangeError(`Invalid monthCode for hebrew calendar: ${str}`);
  } else if (calendarId === 'coptic' || calendarId === 'ethiopic' || calendarId === 'ethioaa' || calendarId === 'ethiopian') {
    // These calendars have M01-M13, no leap months
    if (monthNum > 13) throw new RangeError(`Invalid monthCode for ${calendarId} calendar: ${str}`);
    if (isLeap) throw new RangeError(`Invalid monthCode for ${calendarId} calendar: ${str}`);
  } else if (calendarId === 'chinese' || calendarId === 'dangi') {
    // Chinese/Dangi have M01-M12 plus one leap month (any month can be leap)
    if (monthNum > 12) throw new RangeError(`Invalid monthCode for ${calendarId} calendar: ${str}`);
  } else {
    // For other 13-month calendars
    if (monthNum > 13) throw new RangeError(`Invalid monthCode: ${str}`);
  }
  // For Hebrew calendar, month numbers shift in leap years due to Adar I (M05L)
  // In leap years: M05L=6, M06=7, ..., M12=13
  // In non-leap years: M06=6, ..., M12=12
  if (calendarId === 'hebrew' && targetYear !== undefined) {
    if (isLeap) {
      // M05L -> month 6 in a leap year
      return monthNum + 1;
    }
    // Check if the target year is a leap year by probing for monthsInYear
    try {
      const cal = toNapiCalendar('hebrew');
      const iso = calendarDateToISO(targetYear, 1, 1, 'hebrew');
      const probe = new NapiPlainDate(iso.isoYear, iso.isoMonth, iso.isoDay, cal);
      const isLeapYear = probe.monthsInYear === 13;
      if (isLeapYear && monthNum >= 6) {
        // In leap year, M06 is month 7, M07 is month 8, ..., M12 is month 13
        return monthNum + 1;
      }
    } catch { /* fallback to simple mapping */ }
  }
  // For Chinese/Dangi, leap months also need special handling
  if ((calendarId === 'chinese' || calendarId === 'dangi') && isLeap) {
    return monthNum + 1;
  }
  return monthNum;
}

// ─── Helper: resolve month from month/monthCode ───────────────

function resolveMonth(bag, calendarId) {
  let month = toInteger(bag.month);
  // Per spec: reject Infinity/-Infinity
  if (month !== undefined) rejectInfinity(month, 'month');
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

// ─── Helper: valid era names per calendar ──────────────────────
const VALID_ERAS = {
  'gregory': new Set(['ce', 'bce', 'ad', 'bc']),
  'iso8601': new Set([]),
  'buddhist': new Set(['be']),
  'japanese': new Set(['meiji', 'taisho', 'showa', 'heisei', 'reiwa', 'ce', 'bce', 'ad', 'bc']),
  'roc': new Set(['roc', 'broc', 'minguo', 'before-roc']),
  'coptic': new Set(['coptic', 'coptic-inverse', 'era1', 'era0', 'am']),
  'ethiopic': new Set(['ethiopic', 'ethioaa', 'am', 'aa']),
  'ethioaa': new Set(['aa', 'ethioaa']),
  'hebrew': new Set(['am']),
  'indian': new Set(['saka', 'shaka']),
  'persian': new Set(['ap']),
  'islamic': new Set(['ah', 'islamic', 'bh']),
  'islamic-civil': new Set(['ah', 'islamic', 'bh']),
  'islamic-tbla': new Set(['ah', 'islamic', 'bh']),
  'islamic-umalqura': new Set(['ah', 'islamic', 'bh']),
  'islamic-rgsa': new Set(['ah', 'islamic', 'bh']),
  'chinese': new Set([]),
  'dangi': new Set([]),
};

// ─── Helper: resolve era/eraYear to year ──────────────────────

function resolveEraYear(fields, calendarId) {
  const validEras = VALID_ERAS[calendarId];
  const calendarHasEras = validEras && validEras.size > 0;
  // For calendars without eras, silently ignore era/eraYear (per spec)
  if (!calendarHasEras) {
    fields.era = undefined;
    fields.eraYear = undefined;
    return fields;
  }
  // For calendars with eras, era and eraYear must come together
  if ((fields.era !== undefined) !== (fields.eraYear !== undefined)) {
    throw new TypeError('era and eraYear must be provided together');
  }
  if (fields.era !== undefined && fields.eraYear !== undefined) {
    // Validate era name for the calendar
    if (calendarHasEras && !validEras.has(fields.era)) {
      throw new RangeError(`Invalid era '${fields.era}' for calendar '${calendarId}'`);
    }
    if (fields.year === undefined) {
      if (calendarId === 'gregory' || calendarId === 'iso8601') {
        if (fields.era === 'ce' || fields.era === 'ad') {
          fields.year = fields.eraYear;
        } else if (fields.era === 'bce' || fields.era === 'bc') {
          fields.year = 1 - fields.eraYear;
        }
      } else if (calendarId === 'japanese') {
        // Japanese calendar eras start at specific years
        const japaneseEraStarts = {
          'reiwa': 2019,    // Reiwa 1 = 2019
          'heisei': 1989,   // Heisei 1 = 1989
          'showa': 1926,    // Showa 1 = 1926
          'taisho': 1912,   // Taisho 1 = 1912
          'meiji': 1868,    // Meiji 1 = 1868
          'ce': null, 'ad': null, // CE/AD: year = eraYear directly
          'bce': null, 'bc': null, // BCE/BC: year = 1 - eraYear
        };
        const start = japaneseEraStarts[fields.era];
        if (start !== undefined && start !== null) {
          fields.year = start + fields.eraYear - 1;
        } else if (fields.era === 'bce' || fields.era === 'bc') {
          fields.year = 1 - fields.eraYear;
        } else {
          fields.year = fields.eraYear;
        }
      } else if (calendarId === 'roc') {
        // ROC calendar: era "roc"/"minguo" -> year = eraYear, era "broc"/"before-roc" -> year = 1 - eraYear
        if (fields.era === 'roc' || fields.era === 'minguo') {
          fields.year = fields.eraYear;
        } else if (fields.era === 'broc' || fields.era === 'before-roc') {
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
      } else if (calendarId === 'buddhist') {
        if (fields.era === 'be') {
          fields.year = fields.eraYear;
        } else {
          fields.year = 1 - fields.eraYear;
        }
      } else if (calendarId === 'islamic' || calendarId === 'islamic-civil' ||
                 calendarId === 'islamic-tbla' || calendarId === 'islamic-umalqura' ||
                 calendarId === 'islamic-rgsa') {
        if (fields.era === 'ah' || fields.era === 'islamic') {
          fields.year = fields.eraYear;
        } else if (fields.era === 'bh') {
          // BH era counts backwards: eraYear 1 = year 0, eraYear 2 = year -1
          fields.year = 1 - fields.eraYear;
        } else {
          fields.year = fields.eraYear;
        }
      } else if (calendarId === 'persian') {
        if (fields.era === 'ap') {
          fields.year = fields.eraYear;
        } else {
          fields.year = fields.eraYear;
        }
      } else if (calendarId === 'indian') {
        if (fields.era === 'saka') {
          fields.year = fields.eraYear;
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
  if (typeof calArg === 'string') {
    const canonCal = canonicalizeCalendarId(calArg);
    if (VALID_CALENDAR_IDS.has(canonCal)) return canonCal;
    // Extract calendar from annotation in ISO-like strings
    const match = calArg.match(/\[u-ca=([^\]]+)\]/);
    if (match) return canonicalizeCalendarId(match[1]);
    // If it looks like an ISO string, return iso8601
    if (/^\d{4}-\d{2}/.test(calArg) || /^[+-]\d{6}/.test(calArg) || /^\+\d{4}/.test(calArg) || /^\d{2}-\d{2}/.test(calArg)) {
      return 'iso8601';
    }
    // Might be a bare calendar ID not in our set (pass through)
    return calArg;
  }
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
    // Probe more densely (every ~7 days) to catch short months like coptic month 13 (5-6 days)
    for (let yOff = -1; yOff <= 1; yOff++) {
      const tryIsoYear = isoYear + yOff;
      for (let m = 1; m <= 12; m++) {
        for (const tryDay of [1, 8, 15, 22, 28]) {
          try {
            const probe = new NapiPlainDate(tryIsoYear, m, tryDay, cal);
            if (probe.year === targetCalYear && probe.month === targetMonth) {
              // Found the right month. Now find the exact day.
              // Calculate day offset from probe
              const dayDiff = targetDay - probe.day;
              if (dayDiff === 0) {
                return { isoYear: tryIsoYear, isoMonth: m, isoDay: tryDay };
              }
              // Use epoch-based arithmetic to handle month boundaries
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
  // Use Date.UTC but handle years 0-99 correctly (Date.UTC treats them as 1900+)
  const ms = Date.UTC(year, month - 1, day);
  if (year >= 0 && year <= 99) {
    const d = new Date(ms);
    d.setUTCFullYear(year);
    return Math.floor(d.getTime() / 86400000);
  }
  return Math.floor(ms / 86400000);
}

// Helper: convert epoch days back to ISO date
function epochDaysToISO(epochDays) {
  const ms = epochDays * 86400000;
  const d = new Date(ms);
  // getUTCFullYear returns correct values for all years (no 2-digit year issue)
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
    // Per spec: validate calendar before checking timeZone
    const calId = getCalendarId(arg.calendar);
    const cal = toNapiCalendar(arg.calendar);
    // Property bag with timeZone required
    if (arg.timeZone === undefined) {
      throw new TypeError('Missing timeZone in ZonedDateTime property bag');
    }
    const fields = { year: toInteger(arg.year), era: arg.era, eraYear: toInteger(arg.eraYear) };
    resolveEraYear(fields, calId);
    const tz = toNapiTimeZone(arg.timeZone);
    // Validate required properties
    if (fields.year === undefined) throw new TypeError('Required property year is missing or undefined');
    const monthVal = resolveMonth(arg, calId);
    if (monthVal === undefined && arg.monthCode === undefined) throw new TypeError('Required property month or monthCode is missing');
    if (toInteger(arg.day) === undefined) throw new TypeError('Required property day is missing or undefined');
    const calYear = fields.year || 0;
    let month = monthVal || 1;
    let day = toInteger(arg.day) || 1;
    const hour = toInteger(arg.hour) || 0;
    const minute = toInteger(arg.minute) || 0;
    const second = toInteger(arg.second) || 0;
    // Reject Infinity values
    rejectPropertyBagInfinity({ year: calYear, month, day, hour, minute, second },
      'year', 'month', 'day', 'hour', 'minute', 'second');
    if (arg.millisecond !== undefined) rejectInfinity(toInteger(arg.millisecond), 'millisecond');
    if (arg.microsecond !== undefined) rejectInfinity(toInteger(arg.microsecond), 'microsecond');
    if (arg.nanosecond !== undefined) rejectInfinity(toInteger(arg.nanosecond), 'nanosecond');
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
    // Calendar already resolved above
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
    // Validate offset property if present
    if (arg.offset !== undefined) {
      if (typeof arg.offset === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
      if (typeof arg.offset === 'bigint') throw new TypeError('Cannot convert a BigInt value to a string');
      if (typeof arg.offset !== 'string') {
        // Per spec: offset must be a string (ToPrimitiveAndRequireString)
        const offsetStr = String(arg.offset);
        if (!isValidOffsetString(offsetStr)) {
          throw new TypeError(`offset must be a string, got ${typeof arg.offset}`);
        }
      } else if (!isValidOffsetString(arg.offset)) {
        throw new RangeError(`"${arg.offset}" is not a valid offset string`);
      }
      // Include offset in the string
      str += arg.offset;
    }
    // Use the resolved calendar ID (not raw input) for the annotation
    const resolvedCalId = cal ? cal.id : 'iso8601';
    const calStr = resolvedCalId && resolvedCalId !== 'iso8601' ? `[u-ca=${resolvedCalId}]` : '';
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
  // Per spec, Instant only accepts strings and ZonedDateTime
  if (arg !== null && arg !== undefined && (typeof arg === 'object' || typeof arg === 'function')) {
    // ZonedDateTime argument: extract instant
    if (typeof arg === 'object' && arg._inner instanceof NapiZonedDateTime) {
      return arg._inner.toInstant();
    }
    // Other objects/functions: call toString() and try to parse
    const str = String(arg);
    return call(() => NapiInstant.from(str));
  }
  // Non-object primitives (undefined, null, boolean, number, bigint, symbol)
  throw new TypeError(`Cannot convert ${arg === null ? 'null' : typeof arg} to Instant`);
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
    // Per spec: validate Infinity for all temporal properties even when creating PlainDate
    for (const prop of ['year', 'month', 'day', 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond']) {
      const val = rt[prop];
      if (val !== undefined) {
        const n = toInteger(val);
        if (n !== undefined) rejectInfinity(n, prop);
      }
    }
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

// ─── Helper: add/subtract with correct overflow handling ────
// The NAPI binding checks overflow at intermediate steps, but the spec
// says to add year/month components first, then constrain/reject the day.
// So we always use Constrain for the NAPI call, then post-validate for Reject.
function addWithOverflow(inner, dur, overflow, op, wrapFn) {
  if (overflow === 'Reject') {
    // First, do the operation with Constrain
    const result = call(() => inner[op](dur, 'Constrain'));
    // Check if the day was constrained: if the duration had year/month components
    // and the original day > result.daysInMonth, reject.
    const hasYearMonth = dur.years !== 0 || dur.months !== 0;
    if (hasYearMonth && inner.day > result.daysInMonth) {
      throw new RangeError(`Day ${inner.day} out of range for resulting month with ${result.daysInMonth} days`);
    }
    return wrapFn(result);
  }
  return wrapFn(call(() => inner[op](dur, overflow)));
}

// ─── Helper: validate options argument per spec ───────────────

function validateOptions(options) {
  if (options === undefined) return undefined;
  if (options === null || (typeof options !== 'object' && typeof options !== 'function')) {
    throw new TypeError('Options must be an object or undefined');
  }
  return options;
}

// Per spec GetOption: converts value to string, throwing TypeError for Symbol
function toStringOption(val) {
  if (typeof val === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
  return String(val);
}

// Validate UTC offset string per spec: +/-HH:MM or +/-HH:MM:SS or +/-HH:MM:SS.fffffffff
function isValidOffsetString(str) {
  if (typeof str !== 'string') return false;
  return /^[+-]\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?$/.test(str);
}

// Validate monthCode syntax only (not calendar-specific validity)
// Checks that the format is M01-M99 or M01L-M99L (L suffix for leap months)
function validateMonthCodeSyntax(monthCode) {
  if (typeof monthCode === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
  if (typeof monthCode === 'bigint') throw new TypeError('Cannot convert a BigInt value to a string');
  let str;
  if (typeof monthCode === 'string') {
    str = monthCode;
  } else if (typeof monthCode === 'object' || typeof monthCode === 'function') {
    const prim = monthCode.toString !== undefined ? monthCode.toString() : String(monthCode);
    if (typeof prim !== 'string') throw new TypeError('monthCode must be a string');
    str = prim;
  } else {
    throw new TypeError('monthCode must be a string');
  }
  if (!str) throw new RangeError('Invalid monthCode: empty string');
  const m = str.match(/^M(\d{2})(L?)$/);
  if (!m) throw new RangeError(`Invalid monthCode: ${str}`);
  const monthNum = parseInt(m[1], 10);
  if (monthNum < 1) throw new RangeError(`Invalid monthCode: ${str}`);
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
  if (!_isFinite(n)) throw new RangeError(`${n} is not a finite number`);
  if (n !== _trunc(n)) throw new RangeError(`${n} is not an integer`);
  return n;
}

// ToIntegerWithTruncation per spec: converts to number and truncates
function toIntegerWithTruncation(val) {
  if (val === undefined) return undefined;
  if (typeof val === 'bigint') throw new TypeError('Cannot convert a BigInt value to a number');
  if (typeof val === 'symbol') throw new TypeError('Cannot convert a Symbol value to a number');
  const n = +val;
  if (n !== n) throw new RangeError('NaN is not a valid integer');
  if (!_isFinite(n)) throw new RangeError(`${n} is not a finite number`);
  return _trunc(n);
}

// ToPositiveIntegerWithTruncation per spec
function toPositiveIntegerWithTruncation(val) {
  const n = toIntegerWithTruncation(val);
  if (n === undefined) return undefined;
  if (n <= 0) throw new RangeError('value must be a positive integer');
  return n;
}

// ─── Helper: validate fields for with() methods ──────────────

const PLAIN_DATE_FIELDS = new Set(['year', 'month', 'monthCode', 'day', 'era', 'eraYear']);
const PLAIN_TIME_FIELDS = new Set(['hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond']);
const PLAIN_DATETIME_FIELDS = new Set([...PLAIN_DATE_FIELDS, ...PLAIN_TIME_FIELDS]);
const PLAIN_YEARMONTH_FIELDS = new Set(['year', 'month', 'monthCode', 'era', 'eraYear']);
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

// ─── Helper: round duration sub-second components manually ────

function roundDurationSubSeconds(dur, precision, roundingMode) {
  // Get total nanoseconds in sub-second portion
  const ms = Math.abs(dur.milliseconds);
  const us = Math.abs(dur.microseconds);
  const ns = Math.abs(dur.nanoseconds);
  let totalNs = ms * 1000000 + us * 1000 + ns;
  const sign = dur.sign;

  // Compute the rounding increment in nanoseconds
  const INCREMENTS = [1000000000, 100000000, 10000000, 1000000, 100000, 10000, 1000, 100, 10];
  const increment = INCREMENTS[precision];

  // Apply rounding
  const remainder = totalNs % increment;
  if (remainder === 0) {
    return dur; // no rounding needed
  }

  const RM = {
    Trunc: () => totalNs - remainder,
    Floor: () => sign < 0 ? totalNs - remainder + increment : totalNs - remainder,
    Ceil: () => sign < 0 ? totalNs - remainder : totalNs - remainder + increment,
    Expand: () => totalNs - remainder + increment,
    HalfExpand: () => remainder * 2 >= increment ? totalNs - remainder + increment : totalNs - remainder,
    HalfTrunc: () => remainder * 2 > increment ? totalNs - remainder + increment : totalNs - remainder,
    HalfCeil: () => {
      if (sign > 0) return remainder * 2 >= increment ? totalNs - remainder + increment : totalNs - remainder;
      return remainder * 2 > increment ? totalNs - remainder + increment : totalNs - remainder;
    },
    HalfFloor: () => {
      if (sign < 0) return remainder * 2 >= increment ? totalNs - remainder + increment : totalNs - remainder;
      return remainder * 2 > increment ? totalNs - remainder + increment : totalNs - remainder;
    },
    HalfEven: () => {
      const lower = totalNs - remainder;
      const upper = lower + increment;
      if (remainder * 2 < increment) return lower;
      if (remainder * 2 > increment) return upper;
      // Tie: pick even
      return (lower / increment) % 2 === 0 ? lower : upper;
    },
  };

  totalNs = (RM[roundingMode] || RM.Trunc)();
  // Handle carry into seconds
  let extraSeconds = Math.floor(totalNs / 1000000000);
  totalNs = totalNs % 1000000000;

  // Build result with adjusted sub-second components
  const newMs = Math.floor(totalNs / 1000000);
  const newUs = Math.floor((totalNs % 1000000) / 1000);
  const newNs = totalNs % 1000;
  const newSec = Math.abs(dur.seconds) + extraSeconds;

  // Create new duration string and parse
  const s = sign < 0 ? '-' : '';
  const y = Math.abs(dur.years);
  const mo = Math.abs(dur.months);
  const w = Math.abs(dur.weeks);
  const d = Math.abs(dur.days);
  const h = Math.abs(dur.hours);
  const min = Math.abs(dur.minutes);
  let datePart = '';
  if (y) datePart += y + 'Y';
  if (mo) datePart += mo + 'M';
  if (w) datePart += w + 'W';
  if (d) datePart += d + 'D';
  let timePart = '';
  if (h) timePart += h + 'H';
  if (min) timePart += min + 'M';
  const fracNs = newMs * 1000000 + newUs * 1000 + newNs;
  if (newSec || fracNs || !datePart) {
    if (fracNs) {
      const fracStr = String(fracNs).padStart(9, '0').replace(/0+$/, '');
      timePart += newSec + '.' + fracStr + 'S';
    } else {
      timePart += newSec + 'S';
    }
  }
  const isoStr = s + 'P' + datePart + (timePart ? 'T' + timePart : '');
  try {
    return new Duration(call(() => NapiDuration.from(isoStr)));
  } catch {
    return dur;
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
    if (options === null || (typeof options !== 'object' && typeof options !== 'function')) {
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
    if (options === null || (typeof options !== 'object' && typeof options !== 'function')) {
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
      const su = toStringOption(options.smallestUnit);
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

    // If we need to round, round the sub-second components manually
    let dur = this;
    if (precision !== 'auto' && precision !== 9) {
      // Try NAPI round first (works for time-only durations)
      try {
        const roundUnit = precision === 0 ? 'second' : precision <= 3 ? 'millisecond' : precision <= 6 ? 'microsecond' : 'nanosecond';
        const DIGIT_ROUND = [
          { unit: 'Second', increment: 1 },
          { unit: 'Millisecond', increment: 100 },
          { unit: 'Millisecond', increment: 10 },
          { unit: 'Millisecond', increment: 1 },
          { unit: 'Microsecond', increment: 100 },
          { unit: 'Microsecond', increment: 10 },
          { unit: 'Microsecond', increment: 1 },
          { unit: 'Nanosecond', increment: 100 },
          { unit: 'Nanosecond', increment: 10 },
        ];
        const { unit, increment } = DIGIT_ROUND[precision];
        const napiOpts = Object.create(null);
        napiOpts.smallestUnit = unit;
        napiOpts.roundingMode = roundingMode;
        napiOpts.roundingIncrement = increment;
        const inner = this._inner.round(napiOpts, null, null);
        dur = new Duration(inner);
      } catch {
        // If NAPI round fails (date components present), round sub-second manually
        dur = roundDurationSubSeconds(this, precision, roundingMode);
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

  // Symbol.toStringTag defined as data property below

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
      const y = toIntegerWithTruncation(year);
      const m = toIntegerWithTruncation(month);
      const d = toIntegerWithTruncation(day);
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
      // Per spec: validate monthCode syntax before year type
      if (arg.monthCode !== undefined) validateMonthCodeSyntax(arg.monthCode);
      const fields = { year: toInteger(arg.year), day: toInteger(arg.day), era: arg.era, eraYear: toInteger(arg.eraYear) };
      resolveEraYear(fields, calId);
      const year = fields.year;
      const day = fields.day;
      const month = resolveMonth(arg, calId);
      if (year === undefined) throw new TypeError('Required property year is missing or undefined');
      if (month === undefined) throw new TypeError('Required property month or monthCode is missing');
      if (day === undefined) throw new TypeError('Required property day is missing or undefined');
      rejectPropertyBagInfinity({ year, month, day }, 'year', 'month', 'day');
      // Per spec: month ≤ 0 and day ≤ 0 always throw regardless of overflow
      const tm = _trunc(month);
      const td = _trunc(day);
      if (tm < 1) throw new RangeError(`month ${tm} out of range`);
      if (td < 1) throw new RangeError(`day ${td} out of range`);
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
    // Per spec: era and eraYear are mutually exclusive with year.
    const hasEra = fields.era !== undefined;
    const hasEraYear = fields.eraYear !== undefined;
    const hasYear = fields.year !== undefined;
    // For calendars without eras, reject era/eraYear in with()
    const calValidEras = VALID_ERAS[calId];
    if (calValidEras && calValidEras.size === 0 && (hasEra || hasEraYear)) {
      throw new TypeError(`Calendar '${calId}' does not support era/eraYear fields`);
    }
    if (hasEra !== hasEraYear) {
      throw new TypeError('era and eraYear must be provided together');
    }
    // Per spec NonIsoFieldKeysToIgnore: era+eraYear excludes year, year excludes era+eraYear
    let era, eraYear, year;
    if (hasEra && hasEraYear) {
      era = fields.era;
      eraYear = toInteger(fields.eraYear);
      year = undefined; // will be resolved by resolveEraYear
    } else if (hasYear) {
      year = toInteger(fields.year);
      era = undefined;
      eraYear = undefined;
    } else {
      year = this.year;
      era = this.era;
      eraYear = this.eraYear;
    }
    const day = fields.day !== undefined ? toInteger(fields.day) : this.day;
    rejectPropertyBagInfinity({ year: year || 0, day }, 'year', 'day');
    // Resolve era/eraYear to year first so we know the target year for monthCode resolution
    const merged = { year, era, eraYear };
    resolveEraYear(merged, calId);
    const targetYear = merged.year;
    let month;
    if (fields.month !== undefined && fields.monthCode !== undefined) {
      month = toInteger(fields.month);
      rejectInfinity(month, 'month');
      const fromCode = monthCodeToMonth(fields.monthCode, calId, targetYear);
      if (_trunc(month) !== fromCode) {
        throw new RangeError(`month ${month} and monthCode ${fields.monthCode} do not agree`);
      }
    } else if (fields.month !== undefined) {
      month = toInteger(fields.month);
      rejectInfinity(month, 'month');
    } else if (fields.monthCode !== undefined) {
      month = monthCodeToMonth(fields.monthCode, calId, targetYear);
    } else {
      // When year changes, resolve monthCode for the new year context
      month = monthCodeToMonth(this.monthCode, calId, targetYear);
    }
    merged.month = month;
    merged.day = day;
    const cal = toNapiCalendar(calId);
    const iso = calendarDateToISO(merged.year, merged.month, merged.day, calId);
    const result = call(() => new NapiPlainDate(iso.isoYear, iso.isoMonth, iso.isoDay, cal));
    // For reject mode, verify the resulting date matches the requested values
    if (overflow === 'Reject') {
      if (result.day !== day || result.month !== month) {
        throw new RangeError(`Date field values out of range: day ${day} is not valid for month ${month}`);
      }
    }
    return new PlainDate(result);
  }

  withCalendar(calendar) {
    if (calendar === undefined) throw new TypeError('calendar argument is required');
    const cal = toNapiCalendar(calendar);
    return new PlainDate(this._inner.withCalendar(cal));
  }

  add(durationArg, options) {
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    return addWithOverflow(this._inner, dur, overflow, 'add', wrapPlainDate);
  }

  subtract(durationArg, options) {
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    return addWithOverflow(this._inner, dur, overflow, 'subtract', wrapPlainDate);
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

  // Symbol.toStringTag defined as data property below

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
      const h = toIntegerWithTruncation(hour) || 0;
      const mi = toIntegerWithTruncation(minute) || 0;
      const s = toIntegerWithTruncation(second) || 0;
      const ms = toIntegerWithTruncation(millisecond) || 0;
      const us = toIntegerWithTruncation(microsecond) || 0;
      const ns = toIntegerWithTruncation(nanosecond) || 0;
      this._inner = call(() => new NapiPlainTime(h, mi, s, ms, us, ns));
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
    if (options === undefined) throw new TypeError('options parameter is required');
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

  // Symbol.toStringTag defined as data property below

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
      const y = toIntegerWithTruncation(year);
      const mo = toIntegerWithTruncation(month);
      const d = toIntegerWithTruncation(day);
      const h = toIntegerWithTruncation(hour) || 0;
      const mi = toIntegerWithTruncation(minute) || 0;
      const s = toIntegerWithTruncation(second) || 0;
      const ms = toIntegerWithTruncation(millisecond) || 0;
      const us = toIntegerWithTruncation(microsecond) || 0;
      const ns = toIntegerWithTruncation(nanosecond) || 0;
      // Validate ISO date range (constructor always rejects)
      rejectISODateRange(y, mo, d);
      const cal = toNapiCalendar(calendar);
      this._inner = call(() => new NapiPlainDateTime(
        y, mo, d,
        h, mi, s,
        ms, us, ns,
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
      // Per spec: validate monthCode syntax before year type
      if (arg.monthCode !== undefined) validateMonthCodeSyntax(arg.monthCode);
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
    // Per spec: era and eraYear are mutually exclusive with year.
    const hasEra = fields.era !== undefined;
    const hasEraYear = fields.eraYear !== undefined;
    const hasYear = fields.year !== undefined;
    const calValidEras = VALID_ERAS[calId];
    if (calValidEras && calValidEras.size === 0 && (hasEra || hasEraYear)) {
      throw new TypeError(`Calendar '${calId}' does not support era/eraYear fields`);
    }
    if (hasEra !== hasEraYear) {
      throw new TypeError('era and eraYear must be provided together');
    }
    let era, eraYear, year;
    if (hasEra && hasEraYear) {
      era = fields.era;
      eraYear = toInteger(fields.eraYear);
      year = undefined;
    } else if (hasYear) {
      year = toInteger(fields.year);
      era = undefined;
      eraYear = undefined;
    } else {
      year = this.year;
      era = this.era;
      eraYear = this.eraYear;
    }
    const day = fields.day !== undefined ? toInteger(fields.day) : this.day;
    const hour = fields.hour !== undefined ? toInteger(fields.hour) : this.hour;
    const minute = fields.minute !== undefined ? toInteger(fields.minute) : this.minute;
    const second = fields.second !== undefined ? toInteger(fields.second) : this.second;
    const millisecond = fields.millisecond !== undefined ? toInteger(fields.millisecond) : this.millisecond;
    const microsecond = fields.microsecond !== undefined ? toInteger(fields.microsecond) : this.microsecond;
    const nanosecond = fields.nanosecond !== undefined ? toInteger(fields.nanosecond) : this.nanosecond;
    // Resolve era/eraYear to year first
    const merged = { year, era, eraYear };
    resolveEraYear(merged, calId);
    const targetYear = merged.year;
    let month;
    if (fields.month !== undefined && fields.monthCode !== undefined) {
      month = toInteger(fields.month);
      const fromCode = monthCodeToMonth(fields.monthCode, calId, targetYear);
      if (_trunc(month) !== fromCode) {
        throw new RangeError(`month ${month} and monthCode ${fields.monthCode} do not agree`);
      }
    } else if (fields.month !== undefined) {
      month = toInteger(fields.month);
    } else if (fields.monthCode !== undefined) {
      month = monthCodeToMonth(fields.monthCode, calId, targetYear);
    } else {
      month = monthCodeToMonth(this.monthCode, calId, targetYear);
    }
    const cal = toNapiCalendar(calId);
    const iso = calendarDateToISO(targetYear, month, day, calId);
    const result = call(() => new NapiPlainDateTime(
      iso.isoYear, iso.isoMonth, iso.isoDay,
      hour, minute, second,
      millisecond, microsecond, nanosecond,
      cal,
    ));
    // For reject mode, verify the resulting date matches the requested values
    if (overflow === 'Reject') {
      if (result.day !== day || result.month !== month) {
        throw new RangeError(`Date field values out of range: day ${day} is not valid for month ${month}`);
      }
    }
    return new PlainDateTime(result);
  }

  withCalendar(calendar) {
    if (calendar === undefined) throw new TypeError('calendar argument is required');
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
    return addWithOverflow(this._inner, dur, overflow, 'add', wrapPlainDateTime);
  }

  subtract(durationArg, options) {
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    return addWithOverflow(this._inner, dur, overflow, 'subtract', wrapPlainDateTime);
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
    if (options === undefined) throw new TypeError('options parameter is required');
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
    if (options && options.disambiguation !== undefined) {
      disambiguation = options.disambiguation;
    }
    // Validate disambiguation option
    if (disambiguation !== undefined) {
      const ds = toStringOption(disambiguation);
      if (!DISAMBIGUATION_MAP[ds]) throw new RangeError(`Invalid disambiguation option: ${ds}`);
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

  // Symbol.toStringTag defined as data property below

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
      // Use string-based construction to preserve nanosecond precision
      const tzId = tz ? tz.id : 'UTC';
      const calId = cal ? cal.id : 'iso8601';
      const zdtStr = bigintNsToZdtString(epochNanoseconds, tzId, calId);
      this._inner = call(() => NapiZonedDateTime.from(zdtStr));
      this._epochNs = epochNanoseconds;
    }
    _wrapperSet.add(this);
  }

  static from(arg, options) {
    if (typeof arg === 'string') {
      rejectTooManyFractionalSeconds(arg);
      // Per spec: parse string first, then validate options
      // First, try to parse to detect invalid strings (RangeError takes precedence over TypeError)
      validateOptions(options);
      // Read option values with proper type conversion
      let offsetMode = 'reject';
      if (options && options.offset !== undefined) {
        offsetMode = toStringOption(options.offset);
        if (!['use', 'prefer', 'ignore', 'reject'].includes(offsetMode)) {
          throw new RangeError(`Invalid offset option: ${offsetMode}`);
        }
      }
      if (options && options.disambiguation !== undefined) {
        const ds = toStringOption(options.disambiguation);
        if (!DISAMBIGUATION_MAP[ds]) throw new RangeError(`Invalid disambiguation option: ${ds}`);
      }
      if (options && options.overflow !== undefined) {
        const os = toStringOption(options.overflow);
        if (!OVERFLOW_MAP[os]) throw new RangeError(`Invalid overflow option: ${os}`);
      }
      if (offsetMode === 'ignore') {
        // Remove the offset from the string, keep only the timezone annotation
        const stripped = arg.replace(/([T\d.]+)[+-]\d{2}(:\d{2})?(:\d{2}(\.\d+)?)?(\[)/, '$1$5')
                            .replace(/([T\d.]+)Z(\[)/, '$1$2');
        const inner = call(() => NapiZonedDateTime.from(stripped));
        return new ZonedDateTime(inner);
      }
      try {
        const inner = call(() => NapiZonedDateTime.from(arg));
        return new ZonedDateTime(inner);
      } catch (e) {
        if (offsetMode === 'prefer' && e instanceof RangeError && e.message.includes('Offsets could not')) {
          // Fall back to ignoring the offset
          const stripped = arg.replace(/([T\d.]+)[+-]\d{2}(:\d{2})?(:\d{2}(\.\d+)?)?(\[)/, '$1$5')
                              .replace(/([T\d.]+)Z(\[)/, '$1$2');
          const inner = call(() => NapiZonedDateTime.from(stripped));
          return new ZonedDateTime(inner);
        }
        throw e;
      }
    }
    validateOptions(options);
    if (arg instanceof ZonedDateTime || (arg && arg._inner instanceof NapiZonedDateTime)) {
      // Per spec: validate options even when arg is already a ZDT
      if (options) {
        if (options.disambiguation !== undefined) {
          const ds = toStringOption(options.disambiguation);
          if (!DISAMBIGUATION_MAP[ds]) throw new RangeError(`Invalid disambiguation option: ${ds}`);
        }
        if (options.offset !== undefined) {
          const os = toStringOption(options.offset);
          if (!OFFSET_DISAMBIGUATION_MAP[os]) throw new RangeError(`Invalid offset option: ${os}`);
        }
        if (options.overflow !== undefined) {
          const os = toStringOption(options.overflow);
          if (!OVERFLOW_MAP[os]) throw new RangeError(`Invalid overflow option: ${os}`);
        }
      }
      return new ZonedDateTime(arg._inner || arg);
    }
    if (typeof arg === 'object' && arg !== null) {
      // Per spec: validate calendar before checking timeZone
      const calId = getCalendarId(arg.calendar);
      const cal = toNapiCalendar(arg.calendar);
      // Property bag with timeZone required
      if (arg.timeZone === undefined) {
        throw new TypeError('Missing timeZone in ZonedDateTime property bag');
      }
      const overflow = options ? extractOverflow(options) : undefined;
      // Validate disambiguation option
      if (options && options.disambiguation !== undefined) {
        const ds = toStringOption(options.disambiguation);
        if (!DISAMBIGUATION_MAP[ds]) throw new RangeError(`Invalid disambiguation option: ${ds}`);
      }
      // Validate offset option for property bag (default: reject)
      let offsetMode = 'reject';
      if (options && options.offset !== undefined) {
        const os = toStringOption(options.offset);
        if (!OFFSET_DISAMBIGUATION_MAP[os]) throw new RangeError(`Invalid offset option: ${os}`);
        offsetMode = os;
      }
      // Per spec: validate monthCode syntax before year type
      if (arg.monthCode !== undefined) validateMonthCodeSyntax(arg.monthCode);
      const fields = { year: toIntegerIfIntegral(arg.year), era: arg.era, eraYear: toIntegerIfIntegral(arg.eraYear) };
      resolveEraYear(fields, calId);
      const tz = toNapiTimeZone(arg.timeZone);
      // Validate required fields
      if (fields.year === undefined) throw new TypeError('Required property year is missing or undefined');
      const monthVal = resolveMonth(arg, calId);
      if (monthVal === undefined && arg.monthCode === undefined) throw new TypeError('Required property month or monthCode is missing');
      if (toIntegerIfIntegral(arg.day) === undefined) throw new TypeError('Required property day is missing or undefined');
      const year = fields.year;
      let month = monthVal || 1;
      let day = toIntegerIfIntegral(arg.day) || 1;
      let hour = toIntegerIfIntegral(arg.hour) || 0;
      let minute = toIntegerIfIntegral(arg.minute) || 0;
      let second = toIntegerIfIntegral(arg.second) || 0;
      let millisecond = toIntegerIfIntegral(arg.millisecond) || 0;
      let microsecond = toIntegerIfIntegral(arg.microsecond) || 0;
      let nanosecond = toIntegerIfIntegral(arg.nanosecond) || 0;
      // Per spec: Infinity/-Infinity always rejected regardless of overflow
      rejectPropertyBagInfinity({ year, month, day, hour, minute, second, millisecond, microsecond, nanosecond },
        'year', 'month', 'day', 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond');
      // Reject negative values regardless of overflow mode (per spec)
      if (month < 1) throw new RangeError('month out of range');
      if (day < 1) throw new RangeError('day out of range');
      if (hour < 0) throw new RangeError('hour out of range');
      if (minute < 0) throw new RangeError('minute out of range');
      if (second < 0) throw new RangeError('second out of range');
      if (millisecond < 0) throw new RangeError('millisecond out of range');
      if (microsecond < 0) throw new RangeError('microsecond out of range');
      if (nanosecond < 0) throw new RangeError('nanosecond out of range');
      // Handle overflow
      const maxMonth = THIRTEEN_MONTH_CALENDARS.has(calId) ? 13 : 12;
      if (overflow === 'Reject') {
        // Reject out-of-range values
        if (month > maxMonth) throw new RangeError('month out of range');
        if (day > 31) throw new RangeError('day out of range');
        if (hour > 23) throw new RangeError('hour out of range');
        if (minute > 59) throw new RangeError('minute out of range');
        if (second > 59) throw new RangeError('second out of range');
        if (millisecond > 999) throw new RangeError('millisecond out of range');
        if (microsecond > 999) throw new RangeError('microsecond out of range');
        if (nanosecond > 999) throw new RangeError('nanosecond out of range');
      } else {
        // Constrain values to valid ranges
        month = Math.min(month, maxMonth);
        day = Math.min(day, 31);
        hour = Math.min(hour, 23);
        minute = Math.min(minute, 59);
        second = Math.min(second, 59);
        millisecond = Math.min(millisecond, 999);
        microsecond = Math.min(microsecond, 999);
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
      const iso = calendarDateToISO(year, month, day, calId);
      let isoYear = iso.isoYear;
      let isoMonth = iso.isoMonth;
      let isoDay = iso.isoDay;
      // Verify and constrain the ISO date by creating a NapiPlainDate
      try {
        const pd = call(() => new NapiPlainDate(isoYear, isoMonth, isoDay, cal));
        // The NAPI may constrain the day silently. Read back from toString.
        const pdStr = pd.toString();
        const isoMatch = pdStr.match(/^(-?\d+|\+\d+)-(\d{2})-(\d{2})/);
        if (isoMatch) {
          const actualIsoDay = parseInt(isoMatch[3], 10);
          if (actualIsoDay !== isoDay) {
            if (overflow === 'Reject') {
              throw new RangeError(`Day ${day} out of range for month ${month}`);
            }
            isoDay = actualIsoDay;
            isoMonth = parseInt(isoMatch[2], 10);
            isoYear = parseInt(isoMatch[1], 10);
          }
        }
      } catch (e) {
        if (e instanceof RangeError) throw e;
        if (overflow === 'Reject') throw wrapError(e);
        // If constrain mode and day is too large, find max valid day
        let maxDay = 28;
        try {
          for (let d = 29; d <= 31; d++) {
            try { call(() => new NapiPlainDate(isoYear, isoMonth, d, cal)); maxDay = d; } catch { break; }
          }
        } catch { /* use 28 */ }
        isoDay = Math.min(isoDay, maxDay);
      }
      let str = `${padYear(isoYear)}-${pad2(isoMonth)}-${pad2(isoDay)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
      if (millisecond || microsecond || nanosecond) {
        const pad3 = n => String(n || 0).padStart(3, '0');
        const frac = pad3(millisecond) + pad3(microsecond) + pad3(nanosecond);
        str += '.' + frac.replace(/0+$/, '');
      }
      // Handle offset property from bag (ToPrimitiveAndRequireString)
      let offsetProp;
      if (arg.offset !== undefined) {
        if (typeof arg.offset === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
        if (typeof arg.offset === 'bigint') throw new TypeError('Cannot convert a BigInt value to a string');
        if (typeof arg.offset !== 'string') {
          if (typeof arg.offset === 'object' || typeof arg.offset === 'function') {
            offsetProp = String(arg.offset);
            if (typeof offsetProp !== 'string') throw new TypeError('offset must be a string');
          } else {
            throw new TypeError(`offset must be a string, got ${typeof arg.offset}`);
          }
        } else {
          offsetProp = arg.offset;
        }
      }
      if (offsetProp !== undefined) {
        // Validate offset string format
        if (!isValidOffsetString(offsetProp)) {
          throw new RangeError(`"${offsetProp}" is not a valid offset string`);
        }
        if (offsetMode === 'reject' || offsetMode === 'prefer') {
          // Include offset in the string for validation
          str += offsetProp;
        } else if (offsetMode === 'use') {
          str += offsetProp;
        }
        // offsetMode === 'ignore' means we skip the offset
      }
      const calAnnotation = calId && calId !== 'iso8601' ? `[u-ca=${calId}]` : '';
      str += '[' + tz.id + ']' + calAnnotation;
      try {
        return new ZonedDateTime(call(() => NapiZonedDateTime.from(str)));
      } catch (e) {
        if (offsetMode === 'prefer' && e instanceof RangeError) {
          // Fall back: strip offset and retry
          const strNoOff = `${padYear(isoYear)}-${pad2(isoMonth)}-${pad2(isoDay)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
          let strRetry = strNoOff;
          if (millisecond || microsecond || nanosecond) {
            const pad3 = n => String(n || 0).padStart(3, '0');
            const frac = pad3(millisecond) + pad3(microsecond) + pad3(nanosecond);
            strRetry += '.' + frac.replace(/0+$/, '');
          }
          strRetry += '[' + tz.id + ']' + calAnnotation;
          return new ZonedDateTime(call(() => NapiZonedDateTime.from(strRetry)));
        }
        throw e;
      }
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
  get epochNanoseconds() {
    if (this._epochNs !== undefined) return this._epochNs;
    return computeEpochNanoseconds(this._inner);
  }
  get hoursInDay() { return this._inner.hoursInDay; }

  with(fields, options) {
    validateWithFields(fields, ZONED_DATETIME_FIELDS, 'ZonedDateTime');
    const calId = this.calendarId;
    // Per spec: era and eraYear are mutually exclusive with year.
    const hasEra = fields.era !== undefined;
    const hasEraYear = fields.eraYear !== undefined;
    const hasYear = fields.year !== undefined;
    const calValidEras = VALID_ERAS[calId];
    if (calValidEras && calValidEras.size === 0 && (hasEra || hasEraYear)) {
      throw new TypeError(`Calendar '${calId}' does not support era/eraYear fields`);
    }
    if (hasEra !== hasEraYear) {
      throw new TypeError('era and eraYear must be provided together');
    }
    const merged = {
      day: fields.day !== undefined ? fields.day : this.day,
      hour: fields.hour !== undefined ? fields.hour : this.hour,
      minute: fields.minute !== undefined ? fields.minute : this.minute,
      second: fields.second !== undefined ? fields.second : this.second,
      millisecond: fields.millisecond !== undefined ? fields.millisecond : this.millisecond,
      microsecond: fields.microsecond !== undefined ? fields.microsecond : this.microsecond,
      nanosecond: fields.nanosecond !== undefined ? fields.nanosecond : this.nanosecond,
      offset: fields.offset !== undefined ? fields.offset : this.offset,
    };
    if (hasEra && hasEraYear) {
      merged.era = fields.era;
      merged.eraYear = fields.eraYear;
    } else if (hasYear) {
      merged.year = fields.year;
    } else {
      merged.year = this.year;
      merged.era = this.era;
      merged.eraYear = this.eraYear;
    }
    // Resolve era/eraYear to get target year for monthCode resolution
    resolveEraYear(merged, calId);
    // Set month/monthCode from original only if not being overridden
    if (fields.month !== undefined && fields.monthCode !== undefined) {
      merged.month = toInteger(fields.month);
      const fromCode = monthCodeToMonth(fields.monthCode, calId, merged.year);
      if (_trunc(merged.month) !== fromCode) {
        throw new RangeError(`month ${merged.month} and monthCode ${fields.monthCode} do not agree`);
      }
    } else if (fields.month !== undefined) {
      merged.month = fields.month;
    } else if (fields.monthCode !== undefined) {
      merged.month = monthCodeToMonth(fields.monthCode, calId, merged.year);
    } else {
      merged.month = monthCodeToMonth(this.monthCode, calId, merged.year);
    }
    merged.timeZone = this.timeZoneId;
    merged.calendar = calId;
    return ZonedDateTime.from(merged, options);
  }

  withCalendar(calendar) {
    if (calendar === undefined) throw new TypeError('calendar argument is required');
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
    return addWithOverflow(this._inner, dur, overflow, 'add', wrapZonedDateTime);
  }

  subtract(durationArg, options) {
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    return addWithOverflow(this._inner, dur, overflow, 'subtract', wrapZonedDateTime);
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
    if (options === undefined) throw new TypeError('options parameter is required');
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
    if (options === undefined) {
      return call(() => this._inner.toString());
    }
    // Per spec, read options in alphabetical order:
    // calendarName, fractionalSecondDigits, offset, roundingMode, smallestUnit, timeZoneName
    const displayCalendar = options.calendarName !== undefined ? mapDisplayCalendar(options.calendarName) : undefined;
    const fsd = resolveFractionalSecondDigits(options.fractionalSecondDigits);
    const displayOffset = options.offset !== undefined ? mapDisplayOffset(options.offset) : undefined;
    const roundingMode = options.roundingMode !== undefined ? mapRoundingMode(options.roundingMode) : 'Trunc';
    let smallestUnit;
    if (options.smallestUnit !== undefined) {
      const su = String(options.smallestUnit);
      const UNIT_ALIAS = { minutes: 'minute', seconds: 'second', milliseconds: 'millisecond', microseconds: 'microsecond', nanoseconds: 'nanosecond' };
      const canonical = UNIT_ALIAS[su] || su;
      const VALID_UNITS = new Set(['minute', 'second', 'millisecond', 'microsecond', 'nanosecond']);
      if (!VALID_UNITS.has(canonical)) {
        throw new RangeError(`Invalid smallestUnit for ZonedDateTime.toString: ${su}`);
      }
      smallestUnit = canonical;
    }
    const displayTimeZone = options.timeZoneName !== undefined ? mapDisplayTimeZone(options.timeZoneName) : undefined;

    // Determine precision: smallestUnit overrides fractionalSecondDigits
    let precision = 'auto';
    if (smallestUnit !== undefined) {
      if (smallestUnit === 'minute') precision = 'minute';
      else if (smallestUnit === 'second') precision = 0;
      else if (smallestUnit === 'millisecond') precision = 3;
      else if (smallestUnit === 'microsecond') precision = 6;
      else if (smallestUnit === 'nanosecond') precision = 9;
    } else if (fsd !== undefined) {
      precision = fsd;
    }

    // Round the ZDT if needed
    let inner = this._inner;
    if (smallestUnit !== undefined && smallestUnit !== 'nanosecond') {
      const roundOpts = { smallestUnit: mapUnit(smallestUnit), roundingMode };
      inner = call(() => this._inner.round(roundOpts));
    } else if (typeof precision === 'number' && precision < 9) {
      const DIGIT_ROUND = [
        /* 0 */ { unit: 'Second', increment: 1 },
        /* 1 */ { unit: 'Millisecond', increment: 100 },
        /* 2 */ { unit: 'Millisecond', increment: 10 },
        /* 3 */ { unit: 'Millisecond', increment: 1 },
        /* 4 */ { unit: 'Microsecond', increment: 100 },
        /* 5 */ { unit: 'Microsecond', increment: 10 },
        /* 6 */ { unit: 'Microsecond', increment: 1 },
        /* 7 */ { unit: 'Nanosecond', increment: 100 },
        /* 8 */ { unit: 'Nanosecond', increment: 10 },
      ];
      const { unit, increment } = DIGIT_ROUND[precision];
      const roundOpts = { smallestUnit: unit, roundingMode, roundingIncrement: increment };
      inner = call(() => this._inner.round(roundOpts));
    }

    let str = call(() => inner.toString());

    // Format fractional seconds
    if (precision === 'minute') {
      const tIdx = str.indexOf('T');
      if (tIdx !== -1) {
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
    } else if (typeof precision === 'number') {
      str = formatFractionalSeconds(str, precision);
    }

    // Handle calendarName display
    if (displayCalendar === 'Never') {
      str = str.replace(/\[u-ca=[^\]]*\]/, '');
    } else if (displayCalendar === 'Always' || displayCalendar === 'Critical') {
      if (!/\[u-ca=/.test(str)) {
        // Add calendar annotation
        const calId = inner.calendar ? inner.calendar.id : 'iso8601';
        const prefix = displayCalendar === 'Critical' ? '!' : '';
        str += '[' + prefix + 'u-ca=' + calId + ']';
      } else if (displayCalendar === 'Critical') {
        str = str.replace(/\[u-ca=/, '[!u-ca=');
      }
    }
    // Handle timeZoneName display
    if (displayTimeZone === 'Never') {
      // Remove first [...] that is not [u-ca=...]
      str = str.replace(/\[(?!u-ca=)[^\]]*\]/, '');
    } else if (displayTimeZone === 'Critical') {
      // Add ! prefix to timezone annotation
      str = str.replace(/\[(?!u-ca=|!)/, '[!');
    }
    // Handle offset display
    if (displayOffset === 'Never') {
      str = str.replace(/([T\d.]+)[+-]\d{2}:\d{2}(\[)/, '$1$2');
      str = str.replace(/([T\d.]+)Z(\[)/, '$1$2');
    }
    return str;
  }

  toJSON() { requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime'); return this.toString(); }
  toLocaleString(...args) { requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime'); return this.toString(); }

  valueOf() {
    throw new TypeError('Use Temporal.ZonedDateTime.compare() to compare Temporal.ZonedDateTime');
  }

  // Symbol.toStringTag defined as data property below

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
      // Per spec: ToBigInt(epochNanoseconds) — accepts BigInt, string, boolean
      if (typeof epochNanoseconds === 'number') {
        throw new TypeError('Cannot convert a Number to a BigInt');
      }
      if (typeof epochNanoseconds === 'symbol') {
        throw new TypeError('Cannot convert a Symbol to a BigInt');
      }
      if (typeof epochNanoseconds === 'undefined') {
        throw new TypeError('Cannot convert undefined to a BigInt');
      }
      if (epochNanoseconds === null) {
        throw new TypeError('Cannot convert null to a BigInt');
      }
      epochNanoseconds = BigInt(epochNanoseconds);
      // Check range: |epochNanoseconds| <= 8.64e21
      const limit = 8640000000000000000000n;
      if (epochNanoseconds < -limit || epochNanoseconds > limit) {
        throw new RangeError('Instant out of representable range');
      }
      // Use string-based construction to preserve nanosecond precision
      // (Number(BigInt) loses precision beyond 53 bits)
      const isoStr = bigintNsToISOString(epochNanoseconds);
      this._inner = call(() => NapiInstant.from(isoStr));
      this._epochNs = epochNanoseconds;
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
    // Per spec: ZonedDateTime is accepted (extract instant)
    if (arg instanceof ZonedDateTime || (arg && arg._inner instanceof NapiZonedDateTime)) {
      const inner = arg._inner || arg;
      const zdt = inner instanceof NapiZonedDateTime ? inner : arg._inner;
      return new Instant(zdt.toInstant());
    }
    // Per spec: other objects - call toString() and try to parse
    if (arg !== null && arg !== undefined && (typeof arg === 'object' || typeof arg === 'function')) {
      const str = String(arg);
      return new Instant(call(() => NapiInstant.from(str)));
    }
    throw new TypeError(`Cannot convert ${arg === null ? 'null' : typeof arg} to Instant`);
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
    return new Instant(ns);
  }

  static compare(one, two) {
    const a = toNapiInstant(one);
    const b = toNapiInstant(two);
    return NapiInstant.compare(a, b);
  }

  get epochMilliseconds() { return this._inner.epochMilliseconds; }
  get epochNanoseconds() {
    if (this._epochNs !== undefined) return this._epochNs;
    return computeEpochNanoseconds(this._inner);
  }

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
    if (options === undefined) throw new TypeError('options parameter is required');
    const opts = convertRoundingOptions(options);
    return wrapInstant(call(() => this._inner.round(opts)));
  }

  equals(other) {
    const otherInner = toNapiInstant(other);
    return this._inner.equals(otherInner);
  }

  toZonedDateTimeISO(timeZone) {
    requireBranding(this, NapiInstant, 'Temporal.Instant');
    if (timeZone === undefined) throw new TypeError('timeZone argument is required');
    const tz = toNapiTimeZone(timeZone);
    const tzId = tz ? tz.id : 'UTC';
    // Use string-based construction via bigintNsToZdtString to preserve precision
    const epochNs = this.epochNanoseconds;
    const zdtStr = bigintNsToZdtString(epochNs, tzId, 'iso8601');
    return wrapZonedDateTime(call(() => NapiZonedDateTime.from(zdtStr)));
  }

  toString(options) {
    if (options !== undefined) validateOptions(options);
    if (options === undefined) {
      return call(() => this._inner.toString());
    }
    // Per spec, read options in alphabetical order:
    // fractionalSecondDigits, roundingMode, smallestUnit, timeZone
    const fsd = resolveFractionalSecondDigits(options.fractionalSecondDigits);
    const roundingMode = options.roundingMode !== undefined ? mapRoundingMode(options.roundingMode) : 'Trunc';
    let smallestUnit;
    if (options.smallestUnit !== undefined) {
      const su = toStringOption(options.smallestUnit);
      // Accept plural forms
      const UNIT_ALIAS = { minutes: 'minute', seconds: 'second', milliseconds: 'millisecond', microseconds: 'microsecond', nanoseconds: 'nanosecond' };
      const canonical = UNIT_ALIAS[su] || su;
      const INSTANT_TOSTRING_UNITS = new Set(['minute', 'second', 'millisecond', 'microsecond', 'nanosecond']);
      if (!INSTANT_TOSTRING_UNITS.has(canonical)) {
        throw new RangeError(`Invalid smallestUnit for Instant.toString: ${su}`);
      }
      smallestUnit = canonical;
    }
    const tzOpt = options.timeZone;

    // Determine precision: smallestUnit overrides fractionalSecondDigits
    let precision = 'auto'; // default
    if (smallestUnit !== undefined) {
      if (smallestUnit === 'minute') precision = 'minute';
      else if (smallestUnit === 'second') precision = 0;
      else if (smallestUnit === 'millisecond') precision = 3;
      else if (smallestUnit === 'microsecond') precision = 6;
      else if (smallestUnit === 'nanosecond') precision = 9;
    } else if (fsd !== undefined) {
      precision = fsd; // number 0-9 or 'auto'
    }

    // Round the instant if needed
    let inner = this._inner;
    if (smallestUnit !== undefined && smallestUnit !== 'nanosecond') {
      const roundOpts = { smallestUnit: mapUnit(smallestUnit), roundingMode };
      inner = call(() => this._inner.round(roundOpts));
    } else if (typeof precision === 'number' && precision < 9) {
      // Round to the given number of fractional second digits
      // Compute the correct unit and increment
      const DIGIT_ROUND = [
        /* 0 */ { unit: 'Second', increment: 1 },
        /* 1 */ { unit: 'Millisecond', increment: 100 },
        /* 2 */ { unit: 'Millisecond', increment: 10 },
        /* 3 */ { unit: 'Millisecond', increment: 1 },
        /* 4 */ { unit: 'Microsecond', increment: 100 },
        /* 5 */ { unit: 'Microsecond', increment: 10 },
        /* 6 */ { unit: 'Microsecond', increment: 1 },
        /* 7 */ { unit: 'Nanosecond', increment: 100 },
        /* 8 */ { unit: 'Nanosecond', increment: 10 },
      ];
      const { unit, increment } = DIGIT_ROUND[precision];
      const roundOpts = { smallestUnit: unit, roundingMode, roundingIncrement: increment };
      inner = call(() => this._inner.round(roundOpts));
    }

    let str = call(() => inner.toString());

    // Handle timeZone option: display in the given timezone instead of UTC
    if (tzOpt !== undefined) {
      const tz = toNapiTimeZone(tzOpt);
      const epochNs = computeEpochNanoseconds(inner);
      const zdtStr = bigintNsToZdtString(epochNs, tz.id, 'iso8601');
      const zdt = call(() => NapiZonedDateTime.from(zdtStr));
      str = call(() => zdt.toString());
      // Remove timezone annotation brackets for Instant.toString
      str = str.replace(/\[.*?\]/g, '');
    }

    // Format fractional seconds
    if (precision === 'minute') {
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
    } else if (typeof precision === 'number') {
      str = formatFractionalSeconds(str, precision);
    }
    // 'auto' precision: use the default string as-is
    return str;
  }

  toJSON() { requireBranding(this, NapiInstant, 'Temporal.Instant'); return this.toString(); }
  toLocaleString(...args) { requireBranding(this, NapiInstant, 'Temporal.Instant'); return this.toString(); }

  valueOf() {
    throw new TypeError('Use Temporal.Instant.compare() to compare Temporal.Instant');
  }

  // Symbol.toStringTag defined as data property below

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
      const y = toIntegerWithTruncation(year);
      const m = toIntegerWithTruncation(month);
      const rd = referenceDay !== undefined ? toIntegerWithTruncation(referenceDay) : referenceDay;
      const cal = toNapiCalendar(calendar);
      this._inner = call(() => new NapiPlainYearMonth(y, m, cal, rd));
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
      // Per spec: validate monthCode SYNTAX before checking year type
      if (arg.monthCode !== undefined) {
        validateMonthCodeSyntax(arg.monthCode);
      }
      const fields = { year: toInteger(arg.year), era: arg.era, eraYear: toInteger(arg.eraYear) };
      resolveEraYear(fields, calId);
      if (fields.year === undefined) throw new TypeError('Required property year is missing or undefined');
      const month = resolveMonth(arg, calId);
      if (month === undefined && arg.monthCode === undefined) throw new TypeError('Required property month or monthCode is missing');
      rejectPropertyBagInfinity({ year: fields.year, month }, 'year', 'month');
      // Validate month range (0 is always out of range regardless of overflow)
      if (month !== undefined) {
        const m = _trunc(month);
        if (m < 1) throw new RangeError(`month ${m} out of range`);
      }
      // Per spec: PlainYearMonth.from always sets day to 1 for ISO calendar
      if (calId === 'iso8601' || !calId) {
        let m = _trunc(month);
        if (overflow === 'Reject') {
          if (m > 12) throw new RangeError(`month ${m} out of range`);
        } else {
          // Constrain month to 1-12
          m = Math.max(1, Math.min(m, 12));
        }
        return new PlainYearMonth(call(() => new NapiPlainYearMonth(_trunc(fields.year), m, cal, 1)));
      }
      // For non-ISO calendars, use day from bag or 1
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
    // Per spec: era and eraYear are mutually exclusive with year.
    const hasEra = fields.era !== undefined;
    const hasEraYear = fields.eraYear !== undefined;
    const hasYear = fields.year !== undefined;
    const calValidEras = VALID_ERAS[calId];
    if (calValidEras && calValidEras.size === 0 && (hasEra || hasEraYear)) {
      throw new TypeError(`Calendar '${calId}' does not support era/eraYear fields`);
    }
    if (hasEra !== hasEraYear) {
      throw new TypeError('era and eraYear must be provided together');
    }
    let era, eraYear, year;
    if (hasEra && hasEraYear) {
      era = fields.era;
      eraYear = toInteger(fields.eraYear);
      year = undefined;
    } else if (hasYear) {
      year = toInteger(fields.year);
      era = undefined;
      eraYear = undefined;
    } else {
      year = this.year;
      era = this.era;
      eraYear = this.eraYear;
    }
    const merged = { year, era, eraYear };
    resolveEraYear(merged, calId);
    const targetYear = merged.year;
    let month;
    if (fields.month !== undefined && fields.monthCode !== undefined) {
      month = toInteger(fields.month);
      const fromCode = monthCodeToMonth(fields.monthCode, calId, targetYear);
      if (_trunc(month) !== fromCode) {
        throw new RangeError(`month ${month} and monthCode ${fields.monthCode} do not agree`);
      }
    } else if (fields.month !== undefined) {
      month = toInteger(fields.month);
    } else if (fields.monthCode !== undefined) {
      month = monthCodeToMonth(fields.monthCode, calId, targetYear);
    } else {
      month = monthCodeToMonth(this.monthCode, calId, targetYear);
    }
    const cal = toNapiCalendar(calId);
    const iso = calendarDateToISO(targetYear, month, 1, calId);
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

  // Symbol.toStringTag defined as data property below

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
      const m = toIntegerWithTruncation(month);
      const d = toIntegerWithTruncation(day);
      const ry = referenceYear !== undefined ? toIntegerWithTruncation(referenceYear) : referenceYear;
      const cal = toNapiCalendar(calendar);
      this._inner = call(() => new NapiPlainMonthDay(m, d, cal, ry));
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
      // Per spec: validate monthCode SYNTAX before checking year type
      const hasMonthCode = arg.monthCode !== undefined;
      if (hasMonthCode) {
        validateMonthCodeSyntax(arg.monthCode);
      }
      if (arg.day === undefined) throw new TypeError('Required property day is missing or undefined');
      if (arg.month === undefined && !hasMonthCode) throw new TypeError('Required property monthCode is missing');
      let month = toInteger(arg.month);
      if (month !== undefined) rejectInfinity(month, 'month');
      if (hasMonthCode) {
        const fromCode = monthCodeToMonth(arg.monthCode, mdFromCalId);
        if (month !== undefined && _trunc(month) !== fromCode) {
          throw new RangeError(`month ${month} and monthCode ${arg.monthCode} do not agree`);
        }
        month = fromCode;
      }
      const day = toInteger(arg.day);
      if (day !== undefined) rejectInfinity(day, 'day');
      const yearVal = toInteger(arg.year);
      if (yearVal !== undefined) rejectInfinity(yearVal, 'year');
      // Per spec: for ISO calendar, validate day range using the provided year (or 1972)
      // but always store referenceISOYear as 1972
      if (mdFromCalId === 'iso8601' || !mdFromCalId) {
        const checkYear = yearVal !== undefined ? _trunc(yearVal) : 1972;
        const checkMonth = _trunc(month);
        const checkDay = _trunc(day);
        if (overflow === 'Reject') {
          // Validate that the day is valid for the month
          rejectISODateRange(checkYear, checkMonth, checkDay);
        }
        // Always use 1972 as reference year for ISO calendar
        return new PlainMonthDay(call(() => new NapiPlainMonthDay(month, day, cal, 1972)));
      }
      // Non-ISO calendars: use year for reference if provided
      let refYear = yearVal;
      if (refYear !== undefined) {
        const iso = calendarDateToISO(_trunc(refYear), month, day, mdFromCalId);
        refYear = iso.isoYear;
      }
      return new PlainMonthDay(call(() => new NapiPlainMonthDay(month, day, cal, refYear)));
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
    // Resolve month from month/monthCode with agreement validation
    let month = fields.month !== undefined ? toInteger(fields.month) : undefined;
    if (fields.monthCode !== undefined) {
      const fromCode = monthCodeToMonth(fields.monthCode, calId);
      if (month !== undefined && _trunc(month) !== fromCode) {
        throw new RangeError(`month ${month} and monthCode ${fields.monthCode} do not agree`);
      }
      month = fromCode;
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

  // Symbol.toStringTag defined as data property below

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
]) {
  Object.defineProperty(cls.prototype, Symbol.toStringTag, {
    value: tag, writable: false, enumerable: false, configurable: true,
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

const Now = {};
Object.defineProperty(Now, Symbol.toStringTag, { value: 'Temporal.Now', writable: false, enumerable: false, configurable: true });

// Use a helper object to create method-definition functions (non-constructable)
function _defineNowMethod(name, fn) {
  setLength(fn, 0);
  Object.defineProperty(Now, name, { value: fn, writable: true, enumerable: false, configurable: true });
}

// Methods created via concise method syntax are non-constructable
const _nowMethods = {
  instant() { return wrapInstant(binding.nowInstant()); },
  timeZoneId() { return binding.nowTimeZone().id; },
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

// ═══════════════════════════════════════════════════════════════
//  Date.prototype.toTemporalInstant
// ═══════════════════════════════════════════════════════════════

if (!Date.prototype.toTemporalInstant) {
  const _toTemporalInstant = {
    toTemporalInstant() {
      // Per spec, throw if this is not a Date object
      if (!(this instanceof Date)) {
        throw new TypeError('Date.prototype.toTemporalInstant requires a Date object');
      }
      const ms = this.getTime();
      if (ms !== ms) { // NaN check (invalid date)
        throw new RangeError('Invalid Date');
      }
      return new Instant(BigInt(ms) * 1000000n);
    }
  };
  Object.defineProperty(Date.prototype, 'toTemporalInstant', {
    value: _toTemporalInstant.toTemporalInstant,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

// ═══════════════════════════════════════════════════════════════
//  Temporal namespace
// ═══════════════════════════════════════════════════════════════

export const Temporal = {};
for (const [name, value] of [
  ['Duration', Duration], ['Instant', Instant], ['Now', Now],
  ['PlainDate', PlainDate], ['PlainDateTime', PlainDateTime],
  ['PlainMonthDay', PlainMonthDay], ['PlainTime', PlainTime],
  ['PlainYearMonth', PlainYearMonth], ['ZonedDateTime', ZonedDateTime],
]) {
  Object.defineProperty(Temporal, name, { value, writable: true, enumerable: false, configurable: true });
}
Object.defineProperty(Temporal, Symbol.toStringTag, { value: 'Temporal', writable: false, enumerable: false, configurable: true });

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
