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

// Helper: get UTC offset in milliseconds for a timezone at a given epoch
function _getOffsetMs(epochMs, tzId) {
  if (tzId === 'UTC') return 0;
  const parts = getLocalPartsFromEpoch(epochMs, tzId);
  const localYear = parts._fullYear;
  const localMonth = parseInt(parts.month, 10) - 1;
  const localDay = parseInt(parts.day, 10);
  let localHour = parseInt(parts.hour, 10);
  if (localHour === 24) localHour = 0;
  const localMinute = parseInt(parts.minute, 10);
  const localSecond = parseInt(parts.second, 10);
  const localAsUtcDate = new Date(0);
  localAsUtcDate.setUTCFullYear(localYear, localMonth, localDay);
  localAsUtcDate.setUTCHours(localHour, localMinute, localSecond, 0);
  return localAsUtcDate.getTime() - Math.floor(epochMs / 1000) * 1000;
}

// Helper: find the next or previous timezone transition via binary search
function _findTimeZoneTransition(zdt, dir) {
  const tzId = zdt.timeZoneId;
  if (tzId === 'UTC') return null; // UTC has no transitions
  // Fixed-offset timezones have no transitions
  if (/^[+-]\d{2}:\d{2}(:\d{2})?$/.test(tzId) || /^Etc\/GMT[+-]\d+$/.test(tzId)) return null;

  const epochNs = zdt.epochNanoseconds;
  const epochMs = Number(epochNs / 1000000n);
  const currentOffset = _getOffsetMs(epochMs, tzId);

  if (dir === 'next') {
    // Search forward: probe at increasing intervals to find where offset changes
    // Max search range: ~200 years forward
    const maxMs = epochMs + 200 * 365.25 * 86400000;
    let lo = epochMs;
    let hi = -1;

    // First, probe at intervals to find the upper bound
    for (let step = 3600000; step <= 200 * 365.25 * 86400000; step *= 2) {
      const probeMs = epochMs + step;
      if (probeMs > maxMs) break;
      const probeOffset = _getOffsetMs(probeMs, tzId);
      if (probeOffset !== currentOffset) {
        hi = probeMs;
        break;
      }
      lo = probeMs;
    }
    if (hi === -1) return null; // No transition found

    // Binary search between lo and hi to find exact transition point
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      const midOffset = _getOffsetMs(mid, tzId);
      if (midOffset === _getOffsetMs(lo, tzId)) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    // hi is the first millisecond with the new offset
    const transitionNs = BigInt(hi) * 1000000n;
    const isoStr = bigintNsToZdtString(transitionNs, tzId, zdt.calendarId);
    return call(() => {
      const inner = NapiZonedDateTime.from(isoStr);
      return new ZonedDateTime(inner);
    });
  } else {
    // Search backward: find the most recent transition BEFORE the current instant
    // Handle nanosecond precision: check if the sub-ms nanoseconds place us past a
    // transition boundary that falls on this exact millisecond
    const subMsNs = epochNs - BigInt(epochMs) * 1000000n;
    let searchFromMs;
    let searchFromOffset;

    if (subMsNs > 0n) {
      // We're in the middle of a millisecond. Check if the offset at this ms
      // differs from the offset at the previous ms - if so, a transition falls
      // at this ms boundary and we're past it (ns > 0).
      const prevMsOffset = _getOffsetMs(epochMs - 1, tzId);
      if (prevMsOffset !== currentOffset) {
        // There IS a transition at this exact ms. Since we have ns > 0 past it,
        // this transition IS the "previous" one. Return it.
        const transitionNs = BigInt(epochMs) * 1000000n;
        const isoStr = bigintNsToZdtString(transitionNs, tzId, zdt.calendarId);
        return call(() => {
          const inner = NapiZonedDateTime.from(isoStr);
          return new ZonedDateTime(inner);
        });
      }
      searchFromMs = epochMs - 1;
      searchFromOffset = prevMsOffset;
    } else {
      searchFromMs = epochMs - 1;
      searchFromOffset = _getOffsetMs(searchFromMs, tzId);
    }
    const minMs = searchFromMs - 200 * 365.25 * 86400000;
    let hi = searchFromMs;
    let lo = -1;

    for (let step = 3600000; step <= 200 * 365.25 * 86400000; step *= 2) {
      const probeMs = searchFromMs - step;
      if (probeMs < minMs) break;
      const probeOffset = _getOffsetMs(probeMs, tzId);
      if (probeOffset !== searchFromOffset) {
        lo = probeMs;
        break;
      }
      hi = probeMs;
    }
    if (lo === -1) return null; // No transition found

    // Binary search between lo and hi
    // lo has different offset, hi has same offset as searchFromOffset
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      const midOffset = _getOffsetMs(mid, tzId);
      if (midOffset === searchFromOffset) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    // hi is the first ms with searchFromOffset; the transition is at hi
    const transitionNs = BigInt(hi) * 1000000n;
    const isoStr = bigintNsToZdtString(transitionNs, tzId, zdt.calendarId);
    return call(() => {
      const inner = NapiZonedDateTime.from(isoStr);
      return new ZonedDateTime(inner);
    });
  }
}

// Helper: parse a ZDT string and use the offset to compute the exact instant
function _zdtFromStringWithOffset(str, mode) {
  // Parse: dateT time offset [timezone] [u-ca=calendar]
  // Extract the offset and timezone
  const tzMatch = str.match(/\[([^\]=]+)\]/);
  if (!tzMatch) throw new RangeError('Missing timezone annotation');
  const tzId = tzMatch[1];
  const calMatch = str.match(/\[u-ca=([^\]]+)\]/);
  const calId = calMatch ? calMatch[1] : 'iso8601';

  // Extract the ISO datetime and offset parts
  // Split at the first bracket to get datetime+offset
  const bracketIdx = str.indexOf('[');
  const dtOffsetStr = str.substring(0, bracketIdx);

  // Parse offset from the datetime+offset string
  const offsetMatch = dtOffsetStr.match(/([+-])(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/);
  const isZ = dtOffsetStr.endsWith('Z') && !offsetMatch;

  if (!offsetMatch && !isZ) {
    // No offset found, try NAPI directly
    return new ZonedDateTime(call(() => NapiZonedDateTime.from(str)));
  }

  let offsetNs = 0n;
  if (isZ) {
    offsetNs = 0n;
  } else {
    const sign = offsetMatch[1] === '+' ? 1n : -1n;
    const oH = BigInt(offsetMatch[2]);
    const oM = BigInt(offsetMatch[3]);
    const oS = offsetMatch[4] ? BigInt(offsetMatch[4]) : 0n;
    let oSubS = 0n;
    if (offsetMatch[5]) {
      const frac = (offsetMatch[5] + '000000000').substring(0, 9);
      oSubS = BigInt(frac);
    }
    offsetNs = sign * (oH * 3600000000000n + oM * 60000000000n + oS * 1000000000n + oSubS);
  }

  // Parse the datetime portion (before the offset)
  let dtStr = isZ ? dtOffsetStr.slice(0, -1) : dtOffsetStr.substring(0, offsetMatch.index);

  // Parse as an Instant-like: compute epoch from datetime - offset
  const instant = call(() => NapiInstant.from(dtStr + 'Z'));
  // epochNs = instant_epochNs - offsetNs (because datetime + offset = UTC, so UTC = datetime - offset)
  const instantEpochNs = computeEpochNanoseconds(instant);
  const epochNs = instantEpochNs - offsetNs;

  // Create ZDT from epoch nanoseconds + timezone
  const tz = toNapiTimeZone(tzId);
  const cal = calId !== 'iso8601' ? toNapiCalendar(calId) : undefined;
  const zdtStr = bigintNsToZdtString(epochNs, tzId, calId);
  return new ZonedDateTime(call(() => NapiZonedDateTime.from(zdtStr)));
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
    // Per spec, ToTemporalCalendarIdentifier extracts the calendar from ISO/time strings
    // Try to extract calendar annotation from the string
    const match = cal.match(/\[u-ca=([^\]]+)\]/);
    if (match) return call(() => new NapiCalendar(canonicalizeCalendarId(match[1])));
    // Check if it looks like an ISO datetime/date/yearmonth/monthday string
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
  const lower = typeof id === 'string' ? id.toLowerCase() : id;
  return CALENDAR_ALIASES[lower] || lower;
}

// Per spec: reject strings that are ISO date/time strings when used as constructor calendar arg
function rejectISOStringAsCalendar(cal) {
  if (typeof cal === 'string' && cal.length > 0) {
    // Reject ISO-like strings: dates, compact dates, strings with brackets
    if (/\[/.test(cal) || /^\d{4}-\d{2}/.test(cal) || /^[+-]\d{6}/.test(cal) || /^\d{8}$/.test(cal) || /^\d{2}-\d{2}/.test(cal)) {
      throw new RangeError(`Invalid calendar: ${cal}`);
    }
  }
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

// Hebrew leap years follow a 19-year cycle: years 3, 6, 8, 11, 14, 17, 19
function isHebrewLeapYear(hebrewYear) {
  const mod = ((hebrewYear % 19) + 19) % 19; // ensure positive mod
  return mod === 0 || mod === 3 || mod === 6 || mod === 8 || mod === 11 || mod === 14 || mod === 17;
}

// For Chinese/Dangi: find which month code has the leap month in a given year.
// Returns the base month number N such that M{N}L exists, or 0 if no leap month.
const _chineseDangiLeapMonthCache = {};
function getChineseDangiLeapMonth(calYear, calId) {
  const cacheKey = calId + ':' + calYear;
  if (_chineseDangiLeapMonthCache[cacheKey] !== undefined) return _chineseDangiLeapMonthCache[cacheKey];
  try {
    const cal = toNapiCalendar(calId);
    // First find approximate ISO year
    let isoYear = calYear - (calId === 'chinese' ? 2637 : 2333);
    try {
      let d = new NapiPlainDate(isoYear, 6, 15, cal);
      let diff = calYear - d.year;
      for (let i = 0; i < 5 && diff !== 0; i++) {
        isoYear += diff;
        try { d = new NapiPlainDate(isoYear, 6, 15, cal); } catch { d = new NapiPlainDate(isoYear, 1, 1, cal); }
        diff = calYear - d.year;
      }
    } catch { /* use estimate */ }
    // Check if this year has 13 months
    let probe;
    try { probe = new NapiPlainDate(isoYear, 6, 15, cal); } catch { probe = new NapiPlainDate(isoYear, 1, 1, cal); }
    if (probe.year !== calYear) {
      // Try adjusting
      for (let off = -1; off <= 1; off++) {
        try {
          const p = new NapiPlainDate(isoYear + off, 6, 15, cal);
          if (p.year === calYear) { probe = p; isoYear = isoYear + off; break; }
        } catch {}
      }
    }
    if (probe.monthsInYear !== 13) {
      _chineseDangiLeapMonthCache[cacheKey] = 0;
      return 0;
    }
    // Scan through the year to find which month code has 'L'
    // Start from approximate beginning of the Chinese year
    const startMs = Date.UTC(isoYear, 0, 20);
    let lastMonth = 0;
    for (let day = 0; day < 400; day++) {
      const d = new Date(startMs + day * 86400000);
      try {
        const pd = new NapiPlainDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), cal);
        if (pd.year === calYear && pd.month !== lastMonth) {
          lastMonth = pd.month;
          if (pd.monthCode.endsWith('L')) {
            const base = parseInt(pd.monthCode.slice(1, 3), 10);
            _chineseDangiLeapMonthCache[cacheKey] = base;
            return base;
          }
        }
        if (pd.year > calYear && pd.month >= 2) break;
      } catch {}
    }
    _chineseDangiLeapMonthCache[cacheKey] = 0;
    return 0;
  } catch {
    _chineseDangiLeapMonthCache[cacheKey] = 0;
    return 0;
  }
}

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

  // ── Hebrew calendar: month numbers shift in leap years ──
  // In leap years: M01→1..M05→5, M05L→6, M06→7..M12→13
  // In non-leap years: M01→1..M12→12, M05L constrains to M06=6
  if (calendarId === 'hebrew') {
    const leapYear = targetYear !== undefined ? isHebrewLeapYear(targetYear) : false;
    if (isLeap) {
      if (!leapYear && targetYear !== undefined) {
        // M05L in non-leap year: constrain to M06 = month 6
        // Callers that need reject mode should check separately
        return monthNum + 1;
      }
      // M05L → month 6
      return monthNum + 1;
    }
    if (leapYear && monthNum >= 6) {
      // In a leap year, M06→7, M07→8, ..., M12→13
      return monthNum + 1;
    }
    return monthNum;
  }

  // ── Chinese/Dangi: leap month can be any month ──
  // If the year has a leap month after base month N (M{N}L), then:
  //   M{N}L → N+1, M{N+1} → N+2, ..., M12 → 13
  if (calendarId === 'chinese' || calendarId === 'dangi') {
    if (isLeap) {
      // The leap month M{N}L always maps to monthNum + 1
      if (targetYear !== undefined) {
        const leapBase = getChineseDangiLeapMonth(targetYear, calendarId);
        if (leapBase !== monthNum) {
          // Constrain: leap month doesn't exist in this year, map to next regular month
          return monthNum + 1;
        }
      }
      return monthNum + 1;
    }
    if (targetYear !== undefined) {
      const leapBase = getChineseDangiLeapMonth(targetYear, calendarId);
      if (leapBase > 0 && monthNum > leapBase) {
        // Months after the leap month shift by +1
        return monthNum + 1;
      }
    }
    return monthNum;
  }

  return monthNum;
}

// Helper: check if a monthCode is valid for a given calendar year (for reject mode)
function isMonthCodeValidForYear(monthCode, calendarId, targetYear) {
  if (!monthCode || targetYear === undefined) return true;
  const m = monthCode.match(/^M(\d{2})(L?)$/);
  if (!m) return false;
  const monthNum = parseInt(m[1], 10);
  const isLeap = m[2] === 'L';
  if (!isLeap) return true; // non-leap month codes are always valid
  if (calendarId === 'hebrew') {
    return isHebrewLeapYear(targetYear);
  }
  if (calendarId === 'chinese' || calendarId === 'dangi') {
    const leapBase = getChineseDangiLeapMonth(targetYear, calendarId);
    return leapBase === monthNum;
  }
  return true;
}

// ─── Helper: resolve month from month/monthCode ───────────────

function resolveMonth(bag, calendarId, targetYear) {
  let month = toInteger(bag.month);
  // Per spec: reject Infinity/-Infinity
  if (month !== undefined) rejectInfinity(month, 'month');
  // Per spec, month is truncated to integer (ToPositiveIntegerWithTruncation)
  if (month !== undefined) month = _trunc(month);
  const { monthCode } = bag;
  if (month !== undefined && monthCode !== undefined) {
    const fromCode = monthCodeToMonth(monthCode, calendarId, targetYear);
    if (fromCode !== month) {
      throw new RangeError(`month ${month} and monthCode ${monthCode} do not agree`);
    }
    return month;
  }
  if (month !== undefined) return month;
  if (monthCode !== undefined) return monthCodeToMonth(monthCode, calendarId, targetYear);
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
      } else if (calendarId === 'ethiopian' || calendarId === 'ethioaa' || calendarId === 'ethiopic') {
        // For ethiopic/ethioaa/ethiopian calendars:
        // era "ethiopic"/"am" → year = eraYear (Amete Mihret)
        // era "ethioaa"/"aa" → year = eraYear - 5500 for the ethiopic calendar year numbering
        if (fields.era === 'ethioaa' || fields.era === 'aa') {
          if (calendarId === 'ethioaa') {
            // For ethioaa calendar, year IS the AA eraYear
            fields.year = fields.eraYear;
          } else {
            // ethioaa era in ethiopic calendar: AM year = AA year - 5500
            fields.year = fields.eraYear - 5500;
          }
        } else {
          // era "ethiopic"/"am"
          if (calendarId === 'ethioaa') {
            // AM eraYear → AA year = eraYear + 5500
            fields.year = fields.eraYear + 5500;
          } else {
            fields.year = fields.eraYear;
          }
        }
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

  // For ethioaa, convert AA year to AM year (which is what the NAPI uses internally)
  if (calId === 'ethioaa') {
    targetCalYear = targetCalYear - 5500;
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
                // If targetDay exceeds daysInMonth, constrain to last day of month
                if (targetDay > probe.daysInMonth) {
                  // The day overflows the month. Find the last day of the target month.
                  const lastDayDiff = probe.daysInMonth - probe.day;
                  const lastEpoch = probeEpoch + lastDayDiff;
                  const lastResult = epochDaysToISO(lastEpoch);
                  return { isoYear: lastResult.year, isoMonth: lastResult.month, isoDay: lastResult.day };
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

// Helper: pick the default reference calendar year for PlainMonthDay.
// Per spec, the reference ISO year should be 1972 (or the latest ISO year ≤ 1972
// that has the month/day). We find the calendar year that contains mid-1972.
const _defaultRefYearCache = {};
function _defaultCalendarRefYear(calId, calMonth) {
  const cacheKey = calId;
  if (_defaultRefYearCache[cacheKey] !== undefined) return _defaultRefYearCache[cacheKey];
  try {
    const cal = toNapiCalendar(calId);
    // Probe ISO 1972-06-15 to find the calendar year active mid-1972
    const probe = new NapiPlainDate(1972, 6, 15, cal);
    _defaultRefYearCache[cacheKey] = probe.year;
    return probe.year;
  } catch { /* fallback */ }
  return 1;
}

// Helper: get daysInMonth for a given calendar (year, month)
// Returns daysInMonth, or undefined if the month cannot be found.
function calendarDaysInMonth(calYear, calMonth, calId) {
  if (calId === 'iso8601' || calId === 'gregory') {
    const isLeap = (calYear % 4 === 0 && (calYear % 100 !== 0 || calYear % 400 === 0));
    const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return daysInMonth[calMonth - 1];
  }
  // Navigate to the target month in the calendar using calendarDateToISO with day=1
  try {
    const iso = calendarDateToISO(calYear, calMonth, 1, calId);
    const cal = toNapiCalendar(calId);
    const probe = new NapiPlainDate(iso.isoYear, iso.isoMonth, iso.isoDay, cal);
    if (probe.year === calYear && probe.month === calMonth) {
      return probe.daysInMonth;
    }
  } catch { /* fallback */ }
  return undefined;
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
    const month = resolveMonth(arg, calId, year);
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
    const month = resolveMonth(arg, calId, fields.year);
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
    const monthVal = resolveMonth(arg, calId, fields.year);
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
      if (arg.offset === null) throw new TypeError('offset must be a string, got null');
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
    const month = resolveMonth(arg, calId, fields.year);
    if (month === undefined && arg.monthCode === undefined) throw new TypeError('Required property month or monthCode is missing');
    rejectPropertyBagInfinity({ year: fields.year, month }, 'year', 'month');
    // For ISO calendar, reference day is always 1; for non-ISO, use day hint
    const refDay = (!calId || calId === 'iso8601') ? 1 : (toInteger(arg.day) || 1);
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
    // Reject infinity in fields
    const yearVal = toInteger(arg.year);
    const monthVal = toInteger(arg.month);
    const dayVal = toInteger(arg.day);
    const eraYearVal = toInteger(arg.eraYear);
    if (yearVal !== undefined) rejectInfinity(yearVal, 'year');
    if (eraYearVal !== undefined) rejectInfinity(eraYearVal, 'eraYear');
    if (monthVal !== undefined) rejectInfinity(monthVal, 'month');
    rejectInfinity(dayVal, 'day');
    // If monthCode is provided, derive month from it; otherwise use the month directly
    let month = arg.month;
    if (arg.monthCode !== undefined) {
      month = monthCodeToMonth(arg.monthCode, mdCalId);
    }
    // For ISO calendar, always use 1972 as reference year (spec requirement)
    const refYear = (!mdCalId || mdCalId === 'iso8601') ? 1972 : arg.year;
    return call(() => new NapiPlainMonthDay(month, arg.day, cal, refYear));
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

// ─── Helper: calendar-aware date difference ─────────────────
// Implements CalendarDateUntil for non-ISO calendars.
// The NAPI until/since doesn't properly handle lunisolar calendar arithmetic,
// so we implement it here in JavaScript.
function calendarDateDifference(startInner, endInner, largestUnit, calId) {
  // For ISO-aligned calendars and calendars where NAPI handles arithmetic correctly,
  // fall back to NAPI
  if (ISO_MONTH_ALIGNED_CALENDARS.has(calId) && calId !== 'japanese') {
    return null; // signal to use NAPI
  }
  // Only use JS implementation for calendars known to have NAPI arithmetic issues
  const USE_JS_DIFF_CALENDARS = new Set(['chinese', 'dangi', 'hebrew', 'coptic', 'ethiopic', 'ethioaa', 'ethiopian',
    'islamic-civil', 'islamic-tbla', 'islamic-umalqura', 'indian', 'persian']);
  if (!USE_JS_DIFF_CALENDARS.has(calId)) {
    return null; // signal to use NAPI
  }

  const sign = NapiPlainDate.compare(endInner, startInner);
  if (sign === 0) return { years: 0, months: 0, weeks: 0, days: 0 };

  // Get calendar fields
  const startY = startInner.year, startM = startInner.month, startD = startInner.day;
  const startMC = startInner.monthCode;
  const endY = endInner.year, endM = endInner.month, endD = endInner.day;

  // Compute epoch days for start and end
  const startStr = startInner.toString();
  const endStr = endInner.toString();
  const startEpoch = isoDateToEpochDays(
    ...startStr.match(/^([+-]?\d+)-(\d{2})-(\d{2})/).slice(1).map(Number)
  );
  const endEpoch = isoDateToEpochDays(
    ...endStr.match(/^([+-]?\d+)-(\d{2})-(\d{2})/).slice(1).map(Number)
  );
  const totalDays = endEpoch - startEpoch;

  if (largestUnit === 'Day' || largestUnit === 'days') {
    return { years: 0, months: 0, weeks: 0, days: totalDays };
  }
  if (largestUnit === 'Week' || largestUnit === 'weeks') {
    const weeks = Math.trunc(totalDays / 7);
    const days = totalDays - weeks * 7;
    return { years: 0, months: 0, weeks, days };
  }

  const cal = startInner.calendar;

  // Helper: add months to a date by converting to calendar, adjusting month, converting back
  function addMonthsToDate(inner, months) {
    try {
      const dur = new NapiDuration(0, months, 0, 0, 0, 0, 0, 0, 0, 0);
      if (months >= 0) {
        return inner.add(dur, 'Constrain');
      } else {
        return inner.subtract(new NapiDuration(0, -months, 0, 0, 0, 0, 0, 0, 0, 0), 'Constrain');
      }
    } catch {
      return null;
    }
  }

  // Check if adding N months to start overshoots end.
  // This accounts for day-constraining: if start.day doesn't fit in the result month,
  // the addition "used up" a partial month, so we should consider it an overshoot.
  function monthAddOvershots(fromDate, addResult, endDate, forward) {
    if (!addResult) return true;
    if (forward) {
      // Forward: overshoot if result > end, OR result == end but day was constrained downward
      const cmp = dateCompare(addResult, endDate);
      if (cmp > 0) return true;
      if (cmp === 0 && fromDate.day > addResult.day && fromDate.day > addResult.daysInMonth) return true;
      return false;
    } else {
      // Backward: overshoot if result < end
      const cmp = dateCompare(addResult, endDate);
      if (cmp < 0) return true;
      if (cmp === 0 && fromDate.day > addResult.day && fromDate.day > addResult.daysInMonth) return true;
      return false;
    }
  }

  function addYearsToDate(inner, years) {
    try {
      const dur = new NapiDuration(years, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      if (years >= 0) {
        return inner.add(dur, 'Constrain');
      } else {
        return inner.subtract(new NapiDuration(-years, 0, 0, 0, 0, 0, 0, 0, 0, 0), 'Constrain');
      }
    } catch {
      return null;
    }
  }

  function epochDaysOf(inner) {
    const s = inner.toString();
    const m = s.match(/^([+-]?\d+)-(\d{2})-(\d{2})/);
    return isoDateToEpochDays(parseInt(m[1]), parseInt(m[2]), parseInt(m[3]));
  }

  function dateCompare(a, b) {
    return NapiPlainDate.compare(a, b);
  }

  if (largestUnit === 'Month' || largestUnit === 'months') {
    // Find the number of whole months using binary search then linear refinement
    let months = 0;
    const avgMonthsPerYear = THIRTEEN_MONTH_CALENDARS.has(calId) ? 12.37 : 12;
    if (sign > 0) {
      let estimate = Math.floor((endY - startY) * avgMonthsPerYear + (endM - startM));
      if (estimate < 0) estimate = 0;
      let mid = estimate > 0 ? addMonthsToDate(startInner, estimate) : startInner;
      if (monthAddOvershots(startInner, mid, endInner, true)) {
        while (estimate > 0) {
          estimate--;
          mid = addMonthsToDate(startInner, estimate);
          if (!monthAddOvershots(startInner, mid, endInner, true)) break;
        }
      }
      while (true) {
        const next = addMonthsToDate(startInner, estimate + 1);
        if (monthAddOvershots(startInner, next, endInner, true)) break;
        estimate++;
      }
      months = estimate;
    } else {
      let estimate = Math.ceil((endY - startY) * avgMonthsPerYear + (endM - startM));
      if (estimate > 0) estimate = 0;
      let mid = estimate < 0 ? addMonthsToDate(startInner, estimate) : startInner;
      if (monthAddOvershots(startInner, mid, endInner, false)) {
        while (estimate < 0) {
          estimate++;
          mid = addMonthsToDate(startInner, estimate);
          if (!monthAddOvershots(startInner, mid, endInner, false)) break;
        }
      }
      while (true) {
        const next = addMonthsToDate(startInner, estimate - 1);
        if (monthAddOvershots(startInner, next, endInner, false)) break;
        estimate--;
      }
      months = estimate;
    }
    const intermediate = months !== 0 ? addMonthsToDate(startInner, months) : startInner;
    const remainDays = intermediate ? (epochDaysOf(endInner) - epochDaysOf(intermediate)) : totalDays;
    return { years: 0, months, weeks: 0, days: remainDays };
  }

  // largestUnit === 'Year' or 'years'
  // Helper: check if year addition overshoots
  function yearOvershots(from, result, end, forward) {
    if (!result) return true;
    const cmp = dateCompare(result, end);
    if (forward) {
      if (cmp > 0) return true;
      if (cmp === 0 && from.day > result.day && from.day > result.daysInMonth) return true;
      // Leap month check: if start is in a leap month and the result lands on the
      // SAME base month (e.g., M04L→M04), it's not a full year.
      // But if it constrains to a DIFFERENT month (e.g., Hebrew M05L→M06), it IS a year.
      if (cmp === 0 && startMC.endsWith('L') && result.monthCode === startMC.slice(0, -1)) return true;
      return false;
    } else {
      if (cmp < 0) return true;
      if (cmp === 0 && from.day > result.day && from.day > result.daysInMonth) return true;
      return false;
    }
  }

  let years = 0;
  if (sign > 0) {
    let yearEstimate = endY - startY;
    if (yearEstimate > 0) {
      let mid = addYearsToDate(startInner, yearEstimate);
      if (yearOvershots(startInner, mid, endInner, true)) {
        yearEstimate--;
        while (yearEstimate > 0) {
          mid = addYearsToDate(startInner, yearEstimate);
          if (!yearOvershots(startInner, mid, endInner, true)) break;
          yearEstimate--;
        }
      } else {
        while (true) {
          const next = addYearsToDate(startInner, yearEstimate + 1);
          if (yearOvershots(startInner, next, endInner, true)) break;
          yearEstimate++;
        }
      }
      years = yearEstimate;
    }
  } else {
    let yearEstimate = endY - startY;
    if (yearEstimate < 0) {
      let mid = addYearsToDate(startInner, yearEstimate);
      if (yearOvershots(startInner, mid, endInner, false)) {
        yearEstimate++;
        while (yearEstimate < 0) {
          mid = addYearsToDate(startInner, yearEstimate);
          if (!yearOvershots(startInner, mid, endInner, false)) break;
          yearEstimate++;
        }
      } else {
        while (true) {
          const next = addYearsToDate(startInner, yearEstimate - 1);
          if (yearOvershots(startInner, next, endInner, false)) break;
          yearEstimate--;
        }
      }
      years = yearEstimate;
    }
  }

  // After years, find remaining months and days
  const afterYears = years !== 0 ? addYearsToDate(startInner, years) : startInner;
  if (!afterYears) return null; // fallback to NAPI

  // Now find months from afterYears to endInner
  let months = 0;
  const afterSign = dateCompare(endInner, afterYears);
  if (afterSign !== 0) {
    const ayY = afterYears.year, ayM = afterYears.month;
    const eY = endInner.year, eM = endInner.month;
    const avgMonthsPerYearInner = THIRTEEN_MONTH_CALENDARS.has(calId) ? 12.37 : 12;
    if (afterSign > 0) {
      let mEstimate = Math.floor((eY - ayY) * avgMonthsPerYearInner + (eM - ayM));
      if (mEstimate < 0) mEstimate = 0;
      let mid = mEstimate > 0 ? addMonthsToDate(afterYears, mEstimate) : afterYears;
      if (monthAddOvershots(afterYears, mid, endInner, true)) {
        while (mEstimate > 0) {
          mEstimate--;
          mid = addMonthsToDate(afterYears, mEstimate);
          if (!monthAddOvershots(afterYears, mid, endInner, true)) break;
        }
      }
      while (true) {
        const next = addMonthsToDate(afterYears, mEstimate + 1);
        if (monthAddOvershots(afterYears, next, endInner, true)) break;
        mEstimate++;
      }
      months = mEstimate;
    } else {
      let mEstimate = Math.ceil((eY - ayY) * avgMonthsPerYearInner + (eM - ayM));
      if (mEstimate > 0) mEstimate = 0;
      let mid = mEstimate < 0 ? addMonthsToDate(afterYears, mEstimate) : afterYears;
      if (monthAddOvershots(afterYears, mid, endInner, false)) {
        while (mEstimate < 0) {
          mEstimate++;
          mid = addMonthsToDate(afterYears, mEstimate);
          if (!monthAddOvershots(afterYears, mid, endInner, false)) break;
        }
      }
      while (true) {
        const next = addMonthsToDate(afterYears, mEstimate - 1);
        if (monthAddOvershots(afterYears, next, endInner, false)) break;
        mEstimate--;
      }
      months = mEstimate;
    }
  }

  const afterMonths = months !== 0 ? addMonthsToDate(afterYears, months) : afterYears;
  const remainDays = afterMonths ? (epochDaysOf(endInner) - epochDaysOf(afterMonths)) : 0;

  return { years, months, weeks: 0, days: remainDays };
}

// ─── Helper: branding check for prototype methods ─────────────

function requireBranding(thisObj, NapiClass, typeName) {
  if (!thisObj || typeof thisObj !== 'object' || !(thisObj._inner instanceof NapiClass)) {
    throw new TypeError(`${typeName} expected`);
  }
}

function wrapDuration(napi) { return napi ? new Duration(napi) : napi; }
function wrapPlainDate(napi, calId) { if (!napi) return napi; const r = new PlainDate(napi); if (calId) r._calId = calId; return r; }
function wrapPlainTime(napi) { return napi ? new PlainTime(napi) : napi; }
function wrapPlainDateTime(napi, calId) { if (!napi) return napi; const r = new PlainDateTime(napi); if (calId) r._calId = calId; return r; }
function wrapZonedDateTime(napi, calId) { if (!napi) return napi; const r = new ZonedDateTime(napi); if (calId) r._calId = calId; return r; }
function wrapInstant(napi) { return napi ? new Instant(napi) : napi; }
function wrapPlainYearMonth(napi, calId) { if (!napi) return napi; const r = new PlainYearMonth(napi); if (calId) r._calId = calId; return r; }
function wrapPlainMonthDay(napi, calId) { if (!napi) return napi; const r = new PlainMonthDay(napi); if (calId) r._calId = calId; return r; }

// ─── Helper: get the real calendar ID for a wrapper object ────
// NAPI normalizes ethioaa to ethiopic, so we track the original calendar ID
function getRealCalendarId(wrapper) {
  return wrapper._calId || wrapper._inner.calendar.id;
}

// ─── Helper: resolve era/eraYear for ethioaa calendar ────
// For ethioaa, era is always "aa" and eraYear = AM year + 5492
// For ethiopic, NAPI returns era "am" or "aa" but spec expects "ethiopic" or "ethioaa"
// The NAPI doesn't distinguish ethioaa from ethiopic, so we fix it here.
function resolveEraForCalendar(calId, napiYear, napiEra, napiEraYear) {
  if (calId === 'ethioaa') {
    // ethioaa always uses "aa" era; the NAPI year is the AM year, so AA year = AM year + 5500
    const aaYear = napiYear + 5500;
    return { era: 'aa', eraYear: aaYear };
  }
  // For ethiopic/ethiopian, the NAPI already returns correct era names ("am"/"aa")
  // and correct eraYear values, so just pass through
  return { era: napiEra, eraYear: napiEraYear };
}

// ─── Helper: add/subtract with correct overflow handling ────
// The NAPI binding checks overflow at intermediate steps, but the spec
// says to add year/month components first, then constrain/reject the day.
// So we always use Constrain for the NAPI call, then post-validate for Reject.
function addWithOverflow(inner, dur, overflow, op, wrapFn) {
  if (overflow === 'Reject') {
    // First, do the operation with Constrain
    const result = call(() => inner[op](dur, 'Constrain'));
    const hasYearMonth = dur.years !== 0 || dur.months !== 0;
    if (hasYearMonth) {
      // Check if the day was constrained
      if (inner.day > result.daysInMonth) {
        throw new RangeError(`Day ${inner.day} out of range for resulting month with ${result.daysInMonth} days`);
      }
      // Check if the monthCode was constrained (e.g., leap month M05L → M05 in non-leap year)
      const origMonthCode = inner.monthCode;
      const resultMonthCode = result.monthCode;
      if (origMonthCode && origMonthCode.endsWith('L')) {
        // Original was a leap month. Check if result still has that leap month.
        if (resultMonthCode !== origMonthCode) {
          throw new RangeError(`Leap monthCode ${origMonthCode} does not exist in the resulting year`);
        }
      }
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
      // Per spec: duration field values must be within safe integer range
      for (const v of [y, mo, w, d, h, min, s, ms, us, ns]) {
        if (v !== undefined && (v > Number.MAX_SAFE_INTEGER || v < -Number.MAX_SAFE_INTEGER)) {
          throw new RangeError('Duration field value is too large');
        }
      }
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
      rejectISOStringAsCalendar(calendar);
      const cal = toNapiCalendar(calendar);
      this._inner = call(() => new NapiPlainDate(y, m, d, cal));
      // Preserve the original calendar ID (NAPI may normalize e.g. ethioaa → ethiopic)
      if (typeof calendar === 'string') this._calId = canonicalizeCalendarId(calendar);
    }
    _wrapperSet.add(this);
  }

  static from(arg, options) {
    if (typeof arg === 'string') {
      rejectTooManyFractionalSeconds(arg);
      const inner = call(() => NapiPlainDate.from(arg));
      if (options !== undefined) { validateOptions(options); extractOverflow(options); }
      const r = new PlainDate(inner);
      // Extract calendar from string annotation to preserve ethioaa etc
      const calMatch = arg.match(/\[u-ca=([^\]]+)\]/);
      if (calMatch) r._calId = canonicalizeCalendarId(calMatch[1]);
      return r;
    }
    if (options !== undefined) validateOptions(options);
    if (arg instanceof PlainDate) {
      if (options !== undefined) extractOverflow(options);
      const r = new PlainDate(arg._inner);
      if (arg._calId) r._calId = arg._calId;
      return r;
    }
    if (arg && arg._inner instanceof NapiPlainDate) {
      return new PlainDate(arg._inner);
    }
    if (arg instanceof PlainDateTime || (arg && arg._inner instanceof NapiPlainDateTime)) {
      if (options !== undefined) extractOverflow(options);
      const inner = arg._inner || arg;
      const dt = inner instanceof NapiPlainDateTime ? inner : arg._inner;
      const r = new PlainDate(call(() => new NapiPlainDate(dt.year, dt.month, dt.day, dt.calendar)));
      if (arg._calId) r._calId = arg._calId;
      return r;
    }
    if (arg instanceof ZonedDateTime || (arg && arg._inner instanceof NapiZonedDateTime)) {
      if (options !== undefined) extractOverflow(options);
      const inner = arg._inner || arg;
      const zdt = inner instanceof NapiZonedDateTime ? inner : arg._inner;
      const r = new PlainDate(zdt.toPlainDate());
      if (arg._calId) r._calId = arg._calId;
      return r;
    }
    if (typeof arg === 'object' && arg !== null) {
      const overflow = extractOverflow(options);
      const calId = getCalendarId(arg.calendar);
      const cal = toNapiCalendar(arg.calendar);
      // Per spec: validate monthCode SYNTAX before year type conversion
      if (arg.monthCode !== undefined) validateMonthCodeSyntax(arg.monthCode);
      const fields = { year: toInteger(arg.year), day: toInteger(arg.day), era: arg.era, eraYear: toInteger(arg.eraYear) };
      resolveEraYear(fields, calId);
      const year = fields.year;
      const day = fields.day;
      // Per spec: validate required fields (TypeError) before monthCode semantics (RangeError)
      if (year === undefined) throw new TypeError('Required property year is missing or undefined');
      if (arg.month === undefined && arg.monthCode === undefined) throw new TypeError('Required property month or monthCode is missing');
      if (day === undefined) throw new TypeError('Required property day is missing or undefined');
      const month = resolveMonth(arg, calId, year);
      rejectPropertyBagInfinity({ year, month, day }, 'year', 'month', 'day');
      // Per spec: month ≤ 0 and day ≤ 0 always throw regardless of overflow
      const tm = _trunc(month);
      const td = _trunc(day);
      if (tm < 1) throw new RangeError(`month ${tm} out of range`);
      if (td < 1) throw new RangeError(`day ${td} out of range`);
      // In reject mode, validate that monthCode is valid for the target year
      if (overflow === 'Reject' && arg.monthCode !== undefined) {
        if (!isMonthCodeValidForYear(arg.monthCode, calId, year)) {
          throw new RangeError(`monthCode ${arg.monthCode} does not exist in year ${year} for ${calId} calendar`);
        }
      }
      validateOverflowReject({ year, month, day }, overflow, cal);
      const iso = calendarDateToISO(year, month, day, calId);
      const inner = call(() => new NapiPlainDate(iso.isoYear, iso.isoMonth, iso.isoDay, cal));
      const r = new PlainDate(inner);
      r._calId = calId;
      return r;
    }
    throw new TypeError('Invalid argument for PlainDate.from()');
  }

  static compare(one, two) {
    const a = toNapiPlainDate(one);
    const b = toNapiPlainDate(two);
    return NapiPlainDate.compare(a, b);
  }

  get year() {
    const calId = getRealCalendarId(this);
    if (calId === 'ethioaa') return this._inner.year + 5492;
    return this._inner.year;
  }
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
  get era() {
    const calId = getRealCalendarId(this);
    const v = this._inner.era;
    if (v === null) return undefined;
    return resolveEraForCalendar(calId, this._inner.year, v, this._inner.eraYear).era;
  }
  get eraYear() {
    const calId = getRealCalendarId(this);
    const v = this._inner.eraYear;
    if (v === null) return undefined;
    return resolveEraForCalendar(calId, this._inner.year, this._inner.era, v).eraYear;
  }
  get calendarId() { return getRealCalendarId(this); }
  get calendar() { return getRealCalendarId(this); }

  with(fields, options) {
    requireBranding(this, NapiPlainDate, 'Temporal.PlainDate');
    validateWithFields(fields, PLAIN_DATE_FIELDS, 'PlainDate');
    const calId = getRealCalendarId(this);
    // Per spec: era and eraYear handling depends on calendar
    const calValidEras = VALID_ERAS[calId];
    const calSupportsEras = calValidEras && calValidEras.size > 0;
    const hasEra = fields.era !== undefined;
    const hasEraYear = fields.eraYear !== undefined;
    const hasYear = fields.year !== undefined;
    // Per spec: era/eraYear are invalid for calendars without eras
    if (!calSupportsEras && (hasEra || hasEraYear)) {
      throw new TypeError(`era and eraYear are not valid for the ${calId} calendar`);
    }
    if (calSupportsEras && (hasEra !== hasEraYear)) {
      throw new TypeError('era and eraYear must be provided together');
    }
    // Per spec NonIsoFieldKeysToIgnore: era+eraYear excludes year, year excludes era+eraYear
    let era, eraYear, year;
    if (calSupportsEras && hasEra && hasEraYear) {
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
    // Determine which monthCode is in effect for leap-month validation
    const effectiveMonthCode = fields.monthCode !== undefined ? fields.monthCode : (fields.month === undefined ? this.monthCode : undefined);
    merged.month = month;
    merged.day = day;
    // Per spec: validate clearly invalid field values before processing options
    const td = _trunc(day);
    if (td < 1) throw new RangeError(`day ${td} out of range`);
    const tm = _trunc(month);
    if (tm < 1) throw new RangeError(`month ${tm} out of range`);
    const overflow = extractOverflow(options);
    // In reject mode, a leap monthCode in a non-leap year is an error
    if (overflow === 'Reject' && effectiveMonthCode && !isMonthCodeValidForYear(effectiveMonthCode, calId, targetYear)) {
      throw new RangeError(`monthCode ${effectiveMonthCode} is not valid for year ${targetYear} in ${calId} calendar`);
    }
    const cal = toNapiCalendar(calId);
    // For non-ISO calendars, constrain day to daysInMonth before converting
    let finalDay = _trunc(merged.day);
    if (!ISO_MONTH_ALIGNED_CALENDARS.has(calId) || calId === 'japanese') {
      const dim = calendarDaysInMonth(merged.year, _trunc(merged.month), calId);
      if (dim !== undefined) {
        if (overflow === 'Reject' && finalDay > dim) {
          throw new RangeError(`Date field values out of range: day ${finalDay} is not valid for month ${merged.month} (max ${dim})`);
        }
        finalDay = Math.min(finalDay, dim);
      }
    }
    const iso = calendarDateToISO(merged.year, _trunc(merged.month), finalDay, calId);
    const result = call(() => new NapiPlainDate(iso.isoYear, iso.isoMonth, iso.isoDay, cal));
    // For reject mode, verify the resulting date matches the requested values
    if (overflow === 'Reject') {
      if (result.day !== _trunc(day) || result.month !== _trunc(month)) {
        throw new RangeError(`Date field values out of range: day ${day} is not valid for month ${month}`);
      }
    }
    const r = new PlainDate(result);
    r._calId = calId;
    return r;
  }

  withCalendar(calendar) {
    if (calendar === undefined) throw new TypeError('calendar argument is required');
    const newCalId = getCalendarId(calendar);
    const cal = toNapiCalendar(calendar);
    const r = new PlainDate(this._inner.withCalendar(cal));
    r._calId = newCalId;
    return r;
  }

  add(durationArg, options) {
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    const calId = getRealCalendarId(this);
    return addWithOverflow(this._inner, dur, overflow, 'add', (n) => wrapPlainDate(n, calId));
  }

  subtract(durationArg, options) {
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    const calId = getRealCalendarId(this);
    return addWithOverflow(this._inner, dur, overflow, 'subtract', (n) => wrapPlainDate(n, calId));
  }

  until(other, options) {
    const otherInner = toNapiPlainDate(other);
    const settings = convertDifferenceSettings(options);
    const calId = getRealCalendarId(this);
    const lu = settings && settings.largestUnit ? settings.largestUnit : 'Day';
    const diff = calendarDateDifference(this._inner, otherInner, lu, calId);
    if (diff) {
      return wrapDuration(call(() => new NapiDuration(diff.years, diff.months, diff.weeks, diff.days, 0, 0, 0, 0, 0, 0)));
    }
    return wrapDuration(call(() => this._inner.until(otherInner, settings)));
  }

  since(other, options) {
    const otherInner = toNapiPlainDate(other);
    const settings = convertDifferenceSettings(options);
    const calId = getRealCalendarId(this);
    const lu = settings && settings.largestUnit ? settings.largestUnit : 'Day';
    // since(other) = negate(until(other))
    const diff = calendarDateDifference(this._inner, otherInner, lu, calId);
    if (diff) {
      return wrapDuration(call(() => new NapiDuration(-diff.years, -diff.months, -diff.weeks, -diff.days, 0, 0, 0, 0, 0, 0)));
    }
    return wrapDuration(call(() => this._inner.since(otherInner, settings)));
  }

  equals(other) {
    const otherInner = toNapiPlainDate(other);
    return this._inner.equals(otherInner);
  }

  toPlainDateTime(time) {
    requireBranding(this, NapiPlainDate, 'Temporal.PlainDate');
    const calId = getRealCalendarId(this);
    if (time === undefined) {
      // midnight
      const dt = call(() => new NapiPlainDateTime(this.year, this.month, this.day, 0, 0, 0, 0, 0, 0, toNapiCalendar(calId)));
      return wrapPlainDateTime(dt, calId);
    }
    const t = toNapiPlainTime(time);
    const dt = call(() => new NapiPlainDateTime(
      this.year, this.month, this.day,
      t.hour, t.minute, t.second,
      t.millisecond, t.microsecond, t.nanosecond,
      toNapiCalendar(calId),
    ));
    return wrapPlainDateTime(dt, calId);
  }

  toZonedDateTime(item) {
    requireBranding(this, NapiPlainDate, 'Temporal.PlainDate');
    const calId = getRealCalendarId(this);
    if (typeof item === 'string') {
      const tz = toNapiTimeZone(item);
      const dtStr = this.toString() + 'T00:00:00';
      const zdt = call(() => NapiZonedDateTime.from(dtStr + '[' + tz.id + ']'));
      return wrapZonedDateTime(zdt, calId);
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
      return wrapZonedDateTime(zdt, calId);
    }
    throw new TypeError('Invalid argument to toZonedDateTime');
  }

  toPlainYearMonth() {
    requireBranding(this, NapiPlainDate, 'Temporal.PlainDate');
    const calId = getRealCalendarId(this);
    const cal = toNapiCalendar(calId);
    return wrapPlainYearMonth(call(() => new NapiPlainYearMonth(this.year, this.month, cal)), calId);
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
  toLocaleString(locales, options) {
    requireBranding(this, NapiPlainDate, 'Temporal.PlainDate');
    // Per spec: timeStyle conflicts with PlainDate
    if (options !== undefined && options !== null && typeof options === 'object') {
      if (options.timeStyle !== undefined) {
        throw new TypeError('timeStyle option is not allowed for PlainDate.toLocaleString()');
      }
    }
    // Per spec: calendar mismatch check (ISO calendar is always OK for PlainDate)
    const calId = this.calendarId;
    if (calId !== 'iso8601') {
      const resolvedCal = new Intl.DateTimeFormat(locales, options && typeof options === 'object' ? { calendar: options.calendar } : undefined).resolvedOptions().calendar;
      if (calId !== resolvedCal) {
        throw new RangeError(`Calendar ${calId} does not match locale calendar ${resolvedCal}`);
      }
    }
    // Per spec: force timezone to UTC for PlainDate (wall-clock semantics)
    const str = this._inner.toString();
    const m = str.match(/^(-?\d+|\+\d+)-(\d{2})-(\d{2})/);
    if (m) {
      const d = new Date(0);
      d.setUTCFullYear(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
      d.setUTCHours(12, 0, 0, 0);
      let opts;
      if (options !== undefined && options !== null && typeof options === 'object') {
        opts = Object.assign({}, options);
      } else {
        opts = {};
      }
      opts.timeZone = 'UTC';
      // Per spec: if no date/time component options, add date-only defaults
      if (!_hasDateTimeOptions(opts)) {
        opts.year = 'numeric';
        opts.month = 'numeric';
        opts.day = 'numeric';
      }
      // Remove time-related options since this is date-only
      delete opts.hour; delete opts.minute; delete opts.second;
      delete opts.fractionalSecondDigits; delete opts.dayPeriod;
      const dtf = new Intl.DateTimeFormat(locales, opts);
      return _origFormatGetter.call(dtf)(d.getTime());
    }
    return this.toString();
  }

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
      // Per spec: constructor always rejects out-of-range values
      if (h < 0 || h > 23 || mi < 0 || mi > 59 || s < 0 || s > 59 ||
          ms < 0 || ms > 999 || us < 0 || us > 999 || ns < 0 || ns > 999) {
        throw new RangeError('Time value out of range');
      }
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
      let h = toIntegerWithTruncation(arg.hour) || 0;
      let mi = toIntegerWithTruncation(arg.minute) || 0;
      let s = toIntegerWithTruncation(arg.second) || 0;
      let ms = arg.millisecond !== undefined ? toIntegerWithTruncation(arg.millisecond) : 0;
      let us = arg.microsecond !== undefined ? toIntegerWithTruncation(arg.microsecond) : 0;
      let ns = arg.nanosecond !== undefined ? toIntegerWithTruncation(arg.nanosecond) : 0;
      if (overflow === 'Reject') {
        if (h < 0 || h > 23 || mi < 0 || mi > 59 || s < 0 || s > 59 ||
            ms < 0 || ms > 999 || us < 0 || us > 999 || ns < 0 || ns > 999) {
          throw new RangeError('Time field value out of range with overflow: reject');
        }
      } else {
        // Constrain: clamp second 60 to 59 (leap second)
        if (s === 60) s = 59;
      }
      return new PlainTime(call(() => new NapiPlainTime(h, mi, s, ms, us, ns)));
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
    const h = fields.hour !== undefined ? toIntegerWithTruncation(fields.hour) : this.hour;
    const mi = fields.minute !== undefined ? toIntegerWithTruncation(fields.minute) : this.minute;
    const s = fields.second !== undefined ? toIntegerWithTruncation(fields.second) : this.second;
    const ms = fields.millisecond !== undefined ? toIntegerWithTruncation(fields.millisecond) : this.millisecond;
    const us = fields.microsecond !== undefined ? toIntegerWithTruncation(fields.microsecond) : this.microsecond;
    const ns = fields.nanosecond !== undefined ? toIntegerWithTruncation(fields.nanosecond) : this.nanosecond;
    // Per spec: validate field values before processing options
    rejectPropertyBagInfinity({ hour: h, minute: mi, second: s, millisecond: ms, microsecond: us, nanosecond: ns },
      'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond');
    const overflow = extractOverflow(options);
    if (overflow === 'Reject') {
      if (h < 0 || h > 23 || mi < 0 || mi > 59 || s < 0 || s > 59 ||
          ms < 0 || ms > 999 || us < 0 || us > 999 || ns < 0 || ns > 999) {
        throw new RangeError('Time field value out of range with overflow: reject');
      }
    }
    return new PlainTime(call(() => new NapiPlainTime(h, mi, s, ms, us, ns)));
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
  toLocaleString(locales, options) {
    requireBranding(this, NapiPlainTime, 'Temporal.PlainTime');
    // Per spec: dateStyle conflicts with PlainTime
    if (options !== undefined && options !== null && typeof options === 'object') {
      if (options.dateStyle !== undefined) {
        throw new TypeError('dateStyle option is not allowed for PlainTime.toLocaleString()');
      }
    }
    const inner = this._inner;
    // Force UTC and use a fixed date to show only time
    const d = new Date(0);
    d.setUTCFullYear(1970, 0, 1);
    d.setUTCHours(inner.hour, inner.minute, inner.second, inner.millisecond);
    let opts;
    if (options !== undefined && options !== null && typeof options === 'object') {
      opts = Object.assign({}, options);
    } else {
      opts = {};
    }
    opts.timeZone = 'UTC';
    // Per spec: if no date/time component options, add time-only defaults for PlainTime
    if (!_hasDateTimeOptions(opts)) {
      opts.hour = 'numeric';
      opts.minute = 'numeric';
      opts.second = 'numeric';
    }
    // Remove date-related options since this is time-only
    delete opts.year; delete opts.month; delete opts.day; delete opts.weekday; delete opts.era;
    delete opts.timeZoneName;
    const dtf = new Intl.DateTimeFormat(locales, opts);
    return _origFormatGetter.call(dtf)(d.getTime());
  }

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
      // Validate ISO date and time range (constructor always rejects)
      rejectISODateRange(y, mo, d);
      if (h < 0 || h > 23 || mi < 0 || mi > 59 || s < 0 || s > 59 ||
          ms < 0 || ms > 999 || us < 0 || us > 999 || ns < 0 || ns > 999) {
        throw new RangeError('Time value out of range');
      }
      rejectISOStringAsCalendar(calendar);
      const cal = toNapiCalendar(calendar);
      this._inner = call(() => new NapiPlainDateTime(
        y, mo, d,
        h, mi, s,
        ms, us, ns,
        cal,
      ));
      if (typeof calendar === 'string') this._calId = canonicalizeCalendarId(calendar);
    }
    _wrapperSet.add(this);
  }

  static from(arg, options) {
    if (typeof arg === 'string') {
      rejectTooManyFractionalSeconds(arg);
      const inner = call(() => NapiPlainDateTime.from(arg));
      if (options !== undefined) { validateOptions(options); extractOverflow(options); }
      const r = new PlainDateTime(inner);
      const calMatch = arg.match(/\[u-ca=([^\]]+)\]/);
      if (calMatch) r._calId = canonicalizeCalendarId(calMatch[1]);
      return r;
    }
    validateOptions(options);
    if (arg instanceof PlainDateTime) {
      if (options !== undefined) extractOverflow(options);
      const r = new PlainDateTime(arg._inner);
      if (arg._calId) r._calId = arg._calId;
      return r;
    }
    if (arg && arg._inner instanceof NapiPlainDateTime) {
      if (options !== undefined) extractOverflow(options);
      return new PlainDateTime(arg._inner);
    }
    if (arg instanceof PlainDate || (arg && arg._inner instanceof NapiPlainDate)) {
      if (options !== undefined) extractOverflow(options);
      const inner = arg._inner || arg;
      const d = inner instanceof NapiPlainDate ? inner : arg._inner;
      const r = new PlainDateTime(call(() => new NapiPlainDateTime(d.year, d.month, d.day, 0, 0, 0, 0, 0, 0, d.calendar)));
      if (arg._calId) r._calId = arg._calId;
      return r;
    }
    if (arg instanceof ZonedDateTime || (arg && arg._inner instanceof NapiZonedDateTime)) {
      if (options !== undefined) extractOverflow(options);
      const inner = arg._inner || arg;
      const zdt = inner instanceof NapiZonedDateTime ? inner : arg._inner;
      const r = new PlainDateTime(zdt.toPlainDateTime());
      if (arg._calId) r._calId = arg._calId;
      return r;
    }
    if (typeof arg === 'object' && arg !== null) {
      const overflow = extractOverflow(options);
      const calId = getCalendarId(arg.calendar);
      const cal = toNapiCalendar(arg.calendar);
      // Per spec: validate monthCode SYNTAX before year type conversion
      if (arg.monthCode !== undefined) validateMonthCodeSyntax(arg.monthCode);
      const fields = { year: toInteger(arg.year), era: arg.era, eraYear: toInteger(arg.eraYear) };
      resolveEraYear(fields, calId);
      const day = toInteger(arg.day);
      const hour = toInteger(arg.hour);
      const minute = toInteger(arg.minute);
      const second = toInteger(arg.second);
      const millisecond = toInteger(arg.millisecond);
      const microsecond = toInteger(arg.microsecond);
      const nanosecond = toInteger(arg.nanosecond);
      // Per spec: validate required fields (TypeError) before monthCode semantics (RangeError)
      if (fields.year === undefined) throw new TypeError('Required property year is missing or undefined');
      if (arg.month === undefined && arg.monthCode === undefined) throw new TypeError('Required property month or monthCode is missing');
      if (day === undefined) throw new TypeError('Required property day is missing or undefined');
      const month = resolveMonth(arg, calId, fields.year);
      rejectPropertyBagInfinity({ year: fields.year, month, day, hour, minute, second, millisecond, microsecond, nanosecond }, 'year', 'month', 'day', 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond');
      // In reject mode, validate that monthCode is valid for the target year
      if (overflow === 'Reject' && arg.monthCode !== undefined) {
        if (!isMonthCodeValidForYear(arg.monthCode, calId, fields.year)) {
          throw new RangeError(`monthCode ${arg.monthCode} does not exist in year ${fields.year} for ${calId} calendar`);
        }
      }
      validateOverflowReject({ year: fields.year, month, day }, overflow, cal);
      // Handle leap second: second:60 should reject or constrain
      let s = second || 0, h = hour || 0, mi = minute || 0;
      let ms = millisecond || 0, us = microsecond || 0, ns = nanosecond || 0;
      if (overflow === 'Reject') {
        if (h < 0 || h > 23 || mi < 0 || mi > 59 || s < 0 || s > 59 ||
            ms < 0 || ms > 999 || us < 0 || us > 999 || ns < 0 || ns > 999) {
          throw new RangeError('Time field value out of range with overflow: reject');
        }
      } else {
        if (s === 60) s = 59;
      }
      const iso = calendarDateToISO(fields.year, month, day, calId);
      const r = new PlainDateTime(call(() => new NapiPlainDateTime(
        iso.isoYear, iso.isoMonth, iso.isoDay,
        h, mi, s,
        ms, us, ns,
        cal,
      )));
      r._calId = calId;
      return r;
    }
    throw new TypeError('Invalid argument for PlainDateTime.from()');
  }

  static compare(one, two) {
    const a = toNapiPlainDateTime(one);
    const b = toNapiPlainDateTime(two);
    return NapiPlainDateTime.compare(a, b);
  }

  get year() { const calId = getRealCalendarId(this); if (calId === 'ethioaa') return this._inner.year + 5500; return this._inner.year; }
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
  get era() {
    const calId = getRealCalendarId(this);
    const v = this._inner.era;
    if (v === null) return undefined;
    return resolveEraForCalendar(calId, this._inner.year, v, this._inner.eraYear).era;
  }
  get eraYear() {
    const calId = getRealCalendarId(this);
    const v = this._inner.eraYear;
    if (v === null) return undefined;
    return resolveEraForCalendar(calId, this._inner.year, this._inner.era, v).eraYear;
  }
  get hour() { return this._inner.hour; }
  get minute() { return this._inner.minute; }
  get second() { return this._inner.second; }
  get millisecond() { return this._inner.millisecond; }
  get microsecond() { return this._inner.microsecond; }
  get nanosecond() { return this._inner.nanosecond; }
  get calendarId() { return getRealCalendarId(this); }
  get calendar() { return getRealCalendarId(this); }

  with(fields, options) {
    requireBranding(this, NapiPlainDateTime, 'Temporal.PlainDateTime');
    validateWithFields(fields, PLAIN_DATETIME_FIELDS, 'PlainDateTime');
    const calId = this.calendarId;
    // Per spec: era and eraYear are mutually exclusive with year.
    const hasEra = fields.era !== undefined;
    const hasEraYear = fields.eraYear !== undefined;
    const hasYear = fields.year !== undefined;
    const calValidEras = VALID_ERAS[calId];
    const calSupportsEras = calValidEras && calValidEras.size > 0;
    if (!calSupportsEras && (hasEra || hasEraYear)) {
      throw new TypeError(`era and eraYear are not valid for the ${calId} calendar`);
    }
    if (calSupportsEras && (hasEra !== hasEraYear)) {
      throw new TypeError('era and eraYear must be provided together');
    }
    let era, eraYear, year;
    if (calSupportsEras && hasEra && hasEraYear) {
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
    // Per spec: validate field values before processing options
    rejectPropertyBagInfinity({ year: year || 0, day, hour, minute, second, millisecond, microsecond, nanosecond },
      'year', 'day', 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond');
    if (fields.month !== undefined) rejectInfinity(toInteger(fields.month), 'month');
    // Per spec: validate field values before processing options
    const td = _trunc(day);
    if (td < 1) throw new RangeError(`day ${td} out of range`);
    const overflow = extractOverflow(options);
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
    // Determine which monthCode is in effect for leap-month validation
    const effectiveMonthCodeDT = fields.monthCode !== undefined ? fields.monthCode : (fields.month === undefined ? this.monthCode : undefined);
    // In reject mode, a leap monthCode in a non-leap year is an error
    if (overflow === 'Reject' && effectiveMonthCodeDT && !isMonthCodeValidForYear(effectiveMonthCodeDT, calId, targetYear)) {
      throw new RangeError(`monthCode ${effectiveMonthCodeDT} is not valid for year ${targetYear} in ${calId} calendar`);
    }
    const cal = toNapiCalendar(calId);
    // For non-ISO calendars, constrain day to daysInMonth before converting
    let finalDay = _trunc(day);
    if (!ISO_MONTH_ALIGNED_CALENDARS.has(calId) || calId === 'japanese') {
      const dim = calendarDaysInMonth(targetYear, _trunc(month), calId);
      if (dim !== undefined) {
        if (overflow === 'Reject' && finalDay > dim) {
          throw new RangeError(`Date field values out of range: day ${finalDay} is not valid for month ${month} (max ${dim})`);
        }
        finalDay = Math.min(finalDay, dim);
      }
    }
    const iso = calendarDateToISO(targetYear, _trunc(month), finalDay, calId);
    const result = call(() => new NapiPlainDateTime(
      iso.isoYear, iso.isoMonth, iso.isoDay,
      hour, minute, second,
      millisecond, microsecond, nanosecond,
      cal,
    ));
    // For reject mode, verify the resulting date matches the requested values
    if (overflow === 'Reject') {
      if (result.day !== _trunc(day) || result.month !== _trunc(month)) {
        throw new RangeError(`Date field values out of range: day ${day} is not valid for month ${month}`);
      }
    }
    const dtR = new PlainDateTime(result);
    dtR._calId = calId;
    return dtR;
  }

  withCalendar(calendar) {
    if (calendar === undefined) throw new TypeError('calendar argument is required');
    const newCalId = getCalendarId(calendar);
    const cal = toNapiCalendar(calendar);
    const r = new PlainDateTime(this._inner.withCalendar(cal));
    r._calId = newCalId;
    return r;
  }

  withPlainTime(time) {
    requireBranding(this, NapiPlainDateTime, 'Temporal.PlainDateTime');
    const calId = getRealCalendarId(this);
    if (time === undefined) {
      const cal = toNapiCalendar(calId);
      const r = new PlainDateTime(call(() => new NapiPlainDateTime(
        this.year, this.month, this.day, 0, 0, 0, 0, 0, 0, cal,
      )));
      r._calId = calId;
      return r;
    }
    const t = toNapiPlainTime(time);
    const cal = toNapiCalendar(calId);
    return wrapPlainDateTime(call(() => new NapiPlainDateTime(
      this.year, this.month, this.day,
      t.hour, t.minute, t.second,
      t.millisecond, t.microsecond, t.nanosecond,
      cal,
    )), calId);
  }

  add(durationArg, options) {
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    const calId = getRealCalendarId(this);
    return addWithOverflow(this._inner, dur, overflow, 'add', (n) => wrapPlainDateTime(n, calId));
  }

  subtract(durationArg, options) {
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    const calId = getRealCalendarId(this);
    return addWithOverflow(this._inner, dur, overflow, 'subtract', (n) => wrapPlainDateTime(n, calId));
  }

  until(other, options) {
    const otherInner = toNapiPlainDateTime(other);
    const settings = convertDifferenceSettings(options);
    const calId = getRealCalendarId(this);
    const lu = settings && settings.largestUnit ? settings.largestUnit : 'Day';
    // For year/month largest units on non-ISO calendars, use JS implementation for date part
    if ((lu === 'Year' || lu === 'Month') && !ISO_MONTH_ALIGNED_CALENDARS.has(calId)) {
      // Get the date part difference using our calendar-aware algorithm
      const startDate = this._inner.toPlainDate ? this._inner.toPlainDate() : call(() => new NapiPlainDate(this._inner.year, this._inner.month, this._inner.day, this._inner.calendar));
      const endDate = otherInner.toPlainDate ? otherInner.toPlainDate() : call(() => new NapiPlainDate(otherInner.year, otherInner.month, otherInner.day, otherInner.calendar));
      const dateDiff = calendarDateDifference(startDate, endDate, lu, calId);
      if (dateDiff) {
        // Get time difference from NAPI for the remaining time component
        const napiDur = call(() => this._inner.until(otherInner, settings));
        // Use the calendar-correct date components but preserve time components from NAPI
        return wrapDuration(call(() => new NapiDuration(dateDiff.years, dateDiff.months, dateDiff.weeks, dateDiff.days,
          napiDur.hours, napiDur.minutes, napiDur.seconds,
          napiDur.milliseconds, napiDur.microseconds, napiDur.nanoseconds)));
      }
    }
    return wrapDuration(call(() => this._inner.until(otherInner, settings)));
  }

  since(other, options) {
    const otherInner = toNapiPlainDateTime(other);
    const settings = convertDifferenceSettings(options);
    const calId = getRealCalendarId(this);
    const lu = settings && settings.largestUnit ? settings.largestUnit : 'Day';
    if ((lu === 'Year' || lu === 'Month') && !ISO_MONTH_ALIGNED_CALENDARS.has(calId)) {
      const startDate = this._inner.toPlainDate ? this._inner.toPlainDate() : call(() => new NapiPlainDate(this._inner.year, this._inner.month, this._inner.day, this._inner.calendar));
      const endDate = otherInner.toPlainDate ? otherInner.toPlainDate() : call(() => new NapiPlainDate(otherInner.year, otherInner.month, otherInner.day, otherInner.calendar));
      const dateDiff = calendarDateDifference(startDate, endDate, lu, calId);
      if (dateDiff) {
        const napiDur = call(() => this._inner.since(otherInner, settings));
        return wrapDuration(call(() => new NapiDuration(-dateDiff.years, -dateDiff.months, -dateDiff.weeks, -dateDiff.days,
          napiDur.hours, napiDur.minutes, napiDur.seconds,
          napiDur.milliseconds, napiDur.microseconds, napiDur.nanoseconds)));
      }
    }
    return wrapDuration(call(() => this._inner.since(otherInner, settings)));
  }

  round(options) {
    if (options === undefined) throw new TypeError('options parameter is required');
    const opts = convertRoundingOptions(options);
    return wrapPlainDateTime(call(() => this._inner.round(opts)), getRealCalendarId(this));
  }

  equals(other) {
    const otherInner = toNapiPlainDateTime(other);
    return this._inner.equals(otherInner);
  }

  toPlainDate() {
    return wrapPlainDate(this._inner.toPlainDate(), getRealCalendarId(this));
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
  toLocaleString(locales, options) {
    requireBranding(this, NapiPlainDateTime, 'Temporal.PlainDateTime');
    // Per spec: calendar mismatch check (ISO calendar is always OK for PlainDateTime)
    const calId = this.calendarId;
    if (calId !== 'iso8601') {
      const resolvedCal = new Intl.DateTimeFormat(locales, options && typeof options === 'object' ? { calendar: options.calendar } : undefined).resolvedOptions().calendar;
      if (calId !== resolvedCal) {
        throw new RangeError(`Calendar ${calId} does not match locale calendar ${resolvedCal}`);
      }
    }
    // Per spec: force timezone to UTC for PlainDateTime (wall-clock semantics)
    const inner = this._inner;
    const d = new Date(0);
    d.setUTCFullYear(inner.isoYear || inner.year, (inner.isoMonth || inner.month) - 1, inner.isoDay || inner.day);
    d.setUTCHours(inner.hour, inner.minute, inner.second, inner.millisecond);
    let opts;
    if (options !== undefined && options !== null && typeof options === 'object') {
      opts = Object.assign({}, options);
    } else {
      opts = {};
    }
    opts.timeZone = 'UTC';
    // Per spec: if no date/time component options, add date + time defaults for PlainDateTime
    if (!_hasDateTimeOptions(opts)) {
      opts.year = 'numeric';
      opts.month = 'numeric';
      opts.day = 'numeric';
      opts.hour = 'numeric';
      opts.minute = 'numeric';
      opts.second = 'numeric';
    }
    const dtf = new Intl.DateTimeFormat(locales, opts);
    return _origFormatGetter.call(dtf)(d.getTime());
  }

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
      // Per spec: ToBigInt(epochNanoseconds) - booleans/strings/BigInt OK, number/null/undefined/symbol throw TypeError
      if (epochNanoseconds === null || epochNanoseconds === undefined ||
          typeof epochNanoseconds === 'number' || typeof epochNanoseconds === 'symbol') {
        throw new TypeError('Cannot convert to BigInt');
      }
      epochNanoseconds = BigInt(epochNanoseconds);
      const limit = 8640000000000000000000n;
      if (epochNanoseconds < -limit || epochNanoseconds > limit) {
        throw new RangeError('ZonedDateTime out of representable range');
      }
      const tz = toNapiTimeZone(timeZone);
      rejectISOStringAsCalendar(calendar);
      const cal = toNapiCalendar(calendar);
      // Use string-based construction to preserve nanosecond precision
      const tzId = tz ? tz.id : 'UTC';
      const calId = cal ? cal.id : 'iso8601';
      const zdtStr = bigintNsToZdtString(epochNanoseconds, tzId, calId);
      this._inner = call(() => NapiZonedDateTime.from(zdtStr));
      this._epochNs = epochNanoseconds;
      if (typeof calendar === 'string') this._calId = canonicalizeCalendarId(calendar);
    }
    _wrapperSet.add(this);
  }

  static from(arg, options) {
    if (typeof arg === 'string') {
      rejectTooManyFractionalSeconds(arg);
      // Per spec: parse string first, then validate options
      // Detect invalid ZonedDateTime strings (missing time zone annotation) before options validation
      if (!/\[/.test(arg)) {
        throw new RangeError('ZonedDateTime requires a time zone annotation in brackets');
      }
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
      // Per spec: reject unknown annotations with critical flag (!)
      // Also reject duplicate calendar annotations if any is critical
      const annotations = arg.match(/\[[^\]]*\]/g) || [];
      let calAnnotationCount = 0;
      let hasCriticalCal = false;
      for (const ann of annotations) {
        const isCritical = ann.startsWith('[!');
        const content = isCritical ? ann.slice(2, -1) : ann.slice(1, -1);
        if (content.startsWith('u-ca=')) {
          calAnnotationCount++;
          if (isCritical) hasCriticalCal = true;
        } else if (isCritical && content.includes('=')) {
          // Unknown critical annotation
          throw new RangeError(`Unknown critical annotation: ${ann}`);
        }
      }
      if (calAnnotationCount > 1 && hasCriticalCal) {
        throw new RangeError('Multiple calendar annotations with critical flag are not allowed');
      }
      // Strip the critical flag (!) from timezone annotation for NAPI
      const cleanArg = arg.replace(/\[!/, '[');
      // Extract calId from annotation for preservation
      const _zdtCalMatch = arg.match(/\[u-ca=([^\]]+)\]/);
      const _zdtCalId = _zdtCalMatch ? canonicalizeCalendarId(_zdtCalMatch[1]) : undefined;

      if (offsetMode === 'ignore') {
        // Remove the offset from the string, keep only the timezone annotation
        const stripped = cleanArg.replace(/([T\d.]+)[+-]\d{2}(:\d{2})?(:\d{2}(\.\d+)?)?(\[)/, '$1$5')
                            .replace(/([T\d.]+)Z(\[)/, '$1$2');
        const inner = call(() => NapiZonedDateTime.from(stripped));
        return wrapZonedDateTime(inner, _zdtCalId);
      }
      if (offsetMode === 'use') {
        // Parse the offset from the string and use it to compute the instant
        const r = _zdtFromStringWithOffset(cleanArg, 'use');
        if (_zdtCalId) r._calId = _zdtCalId;
        return r;
      }
      try {
        const inner = call(() => NapiZonedDateTime.from(cleanArg));
        return wrapZonedDateTime(inner, _zdtCalId);
      } catch (e) {
        if (offsetMode === 'prefer' && e instanceof RangeError && e.message.includes('Offsets could not')) {
          // Fall back to ignoring the offset
          const stripped = cleanArg.replace(/([T\d.]+)[+-]\d{2}(:\d{2})?(:\d{2}(\.\d+)?)?(\[)/, '$1$5')
                              .replace(/([T\d.]+)Z(\[)/, '$1$2');
          const inner = call(() => NapiZonedDateTime.from(stripped));
          return wrapZonedDateTime(inner, _zdtCalId);
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
      const zdtCopy = new ZonedDateTime(arg._inner || arg);
      if (arg._calId) zdtCopy._calId = arg._calId;
      return zdtCopy;
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
      // Per spec: validate offset SYNTAX and monthCode SYNTAX before year type conversion
      if (arg.offset !== undefined && arg.offset !== null) {
        if (typeof arg.offset === 'string') {
          if (!isValidOffsetString(arg.offset)) {
            throw new RangeError(`Invalid offset string: ${arg.offset}`);
          }
        }
        // objects/functions will be toString'd later; non-string primitives (number, bool, bigint, symbol) are TypeError
      }
      if (arg.monthCode !== undefined) validateMonthCodeSyntax(arg.monthCode);
      const fields = { year: toIntegerIfIntegral(arg.year), era: arg.era, eraYear: toIntegerIfIntegral(arg.eraYear) };
      resolveEraYear(fields, calId);
      const tz = toNapiTimeZone(arg.timeZone);
      // Per spec: validate required fields (TypeError) before monthCode semantics (RangeError)
      if (fields.year === undefined) throw new TypeError('Required property year is missing or undefined');
      if (arg.month === undefined && arg.monthCode === undefined) throw new TypeError('Required property month or monthCode is missing');
      if (toIntegerIfIntegral(arg.day) === undefined) throw new TypeError('Required property day is missing or undefined');
      const monthVal = resolveMonth(arg, calId, fields.year);
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
      // In reject mode, validate that monthCode is valid for the target year
      if (overflow === 'Reject' && arg.monthCode !== undefined) {
        if (!isMonthCodeValidForYear(arg.monthCode, calId, year)) {
          throw new RangeError(`monthCode ${arg.monthCode} does not exist in year ${year} for ${calId} calendar`);
        }
      }
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
        if (arg.offset === null) throw new TypeError('offset must be a string, got null');
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
        const zdtR = new ZonedDateTime(call(() => NapiZonedDateTime.from(str)));
        zdtR._calId = calId;
        return zdtR;
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
          const zdtR2 = new ZonedDateTime(call(() => NapiZonedDateTime.from(strRetry)));
          zdtR2._calId = calId;
          return zdtR2;
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

  get year() { const calId = getRealCalendarId(this); if (calId === 'ethioaa') return this._inner.year + 5500; return this._inner.year; }
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
  get era() {
    const calId = getRealCalendarId(this);
    const v = this._inner.era;
    if (v === null) return undefined;
    return resolveEraForCalendar(calId, this._inner.year, v, this._inner.eraYear).era;
  }
  get eraYear() {
    const calId = getRealCalendarId(this);
    const v = this._inner.eraYear;
    if (v === null) return undefined;
    return resolveEraForCalendar(calId, this._inner.year, this._inner.era, v).eraYear;
  }
  get hour() { return this._inner.hour; }
  get minute() { return this._inner.minute; }
  get second() { return this._inner.second; }
  get millisecond() { return this._inner.millisecond; }
  get microsecond() { return this._inner.microsecond; }
  get nanosecond() { return this._inner.nanosecond; }
  get calendarId() { return getRealCalendarId(this); }
  get calendar() { return getRealCalendarId(this); }
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
    const calSupportsEras = calValidEras && calValidEras.size > 0;
    if (!calSupportsEras && (hasEra || hasEraYear)) {
      throw new TypeError(`era and eraYear are not valid for the ${calId} calendar`);
    }
    if (calSupportsEras && (hasEra !== hasEraYear)) {
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
    if (calSupportsEras && hasEra && hasEraYear) {
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
    // Determine which monthCode is in effect for leap-month validation
    const effectiveMonthCodeZDT = fields.monthCode !== undefined ? fields.monthCode : (fields.month === undefined ? this.monthCode : undefined);
    merged.timeZone = this.timeZoneId;
    merged.calendar = calId;
    // Per spec: validate field values before processing options (day < 1 should RangeError before options TypeError)
    const td = _trunc(merged.day);
    if (td < 1) throw new RangeError(`day ${td} out of range`);
    const tm = _trunc(merged.month);
    if (tm < 1) throw new RangeError(`month ${tm} out of range`);
    // For non-ISO calendars, constrain day to daysInMonth before converting
    const overflow = extractOverflow(options);
    // In reject mode, a leap monthCode in a non-leap year is an error
    if (overflow === 'Reject' && effectiveMonthCodeZDT && !isMonthCodeValidForYear(effectiveMonthCodeZDT, calId, merged.year)) {
      throw new RangeError(`monthCode ${effectiveMonthCodeZDT} is not valid for year ${merged.year} in ${calId} calendar`);
    }
    if (!ISO_MONTH_ALIGNED_CALENDARS.has(calId) || calId === 'japanese') {
      const dim = calendarDaysInMonth(merged.year, tm, calId);
      if (dim !== undefined) {
        if (overflow === 'Reject' && td > dim) {
          throw new RangeError(`Date field values out of range: day ${td} is not valid for month ${merged.month} (max ${dim})`);
        }
        merged.day = Math.min(td, dim);
      }
    }
    return ZonedDateTime.from(merged, options);
  }

  withCalendar(calendar) {
    if (calendar === undefined) throw new TypeError('calendar argument is required');
    const newCalId = getCalendarId(calendar);
    const cal = toNapiCalendar(calendar);
    return wrapZonedDateTime(this._inner.withCalendar(cal), newCalId);
  }

  withTimeZone(timeZone) {
    const tz = toNapiTimeZone(timeZone);
    return wrapZonedDateTime(call(() => this._inner.withTimeZone(tz)), getRealCalendarId(this));
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
    const calId = getRealCalendarId(this);
    return addWithOverflow(this._inner, dur, overflow, 'add', (n) => wrapZonedDateTime(n, calId));
  }

  subtract(durationArg, options) {
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    const calId = getRealCalendarId(this);
    return addWithOverflow(this._inner, dur, overflow, 'subtract', (n) => wrapZonedDateTime(n, calId));
  }

  until(other, options) {
    const otherInner = toNapiZonedDateTime(other);
    const settings = convertDifferenceSettings(options);
    const calId = getRealCalendarId(this);
    const lu = settings && settings.largestUnit ? settings.largestUnit : 'Hour';
    if ((lu === 'Year' || lu === 'Month') && !ISO_MONTH_ALIGNED_CALENDARS.has(calId)) {
      const startDate = this._inner.toPlainDate();
      const endDate = otherInner.toPlainDate();
      const dateDiff = calendarDateDifference(startDate, endDate, lu, calId);
      if (dateDiff) {
        const napiDur = call(() => this._inner.until(otherInner, settings));
        return wrapDuration(call(() => new NapiDuration(dateDiff.years, dateDiff.months, dateDiff.weeks, dateDiff.days,
          napiDur.hours, napiDur.minutes, napiDur.seconds,
          napiDur.milliseconds, napiDur.microseconds, napiDur.nanoseconds)));
      }
    }
    return wrapDuration(call(() => this._inner.until(otherInner, settings)));
  }

  since(other, options) {
    const otherInner = toNapiZonedDateTime(other);
    const settings = convertDifferenceSettings(options);
    const calId = getRealCalendarId(this);
    const lu = settings && settings.largestUnit ? settings.largestUnit : 'Hour';
    if ((lu === 'Year' || lu === 'Month') && !ISO_MONTH_ALIGNED_CALENDARS.has(calId)) {
      const startDate = this._inner.toPlainDate();
      const endDate = otherInner.toPlainDate();
      const dateDiff = calendarDateDifference(startDate, endDate, lu, calId);
      if (dateDiff) {
        const napiDur = call(() => this._inner.since(otherInner, settings));
        return wrapDuration(call(() => new NapiDuration(-dateDiff.years, -dateDiff.months, -dateDiff.weeks, -dateDiff.days,
          napiDur.hours, napiDur.minutes, napiDur.seconds,
          napiDur.milliseconds, napiDur.microseconds, napiDur.nanoseconds)));
      }
    }
    return wrapDuration(call(() => this._inner.since(otherInner, settings)));
  }

  round(options) {
    if (options === undefined) throw new TypeError('options parameter is required');
    const opts = convertRoundingOptions(options);
    return wrapZonedDateTime(call(() => this._inner.round(opts)), getRealCalendarId(this));
  }

  equals(other) {
    const otherInner = toNapiZonedDateTime(other);
    return call(() => this._inner.equals(otherInner));
  }

  startOfDay() {
    return wrapZonedDateTime(call(() => this._inner.startOfDay()), getRealCalendarId(this));
  }

  toInstant() {
    return wrapInstant(this._inner.toInstant());
  }

  toPlainDate() {
    return wrapPlainDate(this._inner.toPlainDate(), getRealCalendarId(this));
  }

  toPlainTime() {
    return wrapPlainTime(this._inner.toPlainTime());
  }

  toPlainDateTime() {
    return wrapPlainDateTime(this._inner.toPlainDateTime(), getRealCalendarId(this));
  }

  getTimeZoneTransition(directionParam) {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    // Per spec: GetDirectionOption
    if (directionParam === undefined || directionParam === null) {
      throw new RangeError('direction is required');
    }
    let dir;
    if (typeof directionParam === 'string') {
      if (directionParam !== 'next' && directionParam !== 'previous') {
        throw new RangeError('direction must be "next" or "previous"');
      }
      dir = directionParam;
    } else if (typeof directionParam === 'symbol') {
      throw new TypeError('Cannot convert a Symbol value to a string');
    } else if (typeof directionParam === 'object' || typeof directionParam === 'function') {
      // Get direction property from options object
      const d = directionParam.direction;
      if (d === undefined) {
        throw new RangeError('direction is required');
      }
      if (typeof d === 'symbol') {
        throw new TypeError('Cannot convert a Symbol value to a string');
      }
      const ds = String(d);
      if (ds !== 'next' && ds !== 'previous') {
        throw new RangeError('direction must be "next" or "previous"');
      }
      dir = ds;
    } else {
      // boolean, number, bigint → convert to string via GetOption
      const ds = String(directionParam);
      if (ds !== 'next' && ds !== 'previous') {
        throw new RangeError('direction must be "next" or "previous"');
      }
      dir = ds;
    }
    return _findTimeZoneTransition(this, dir);
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
      if (typeof options.smallestUnit === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
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
  toLocaleString(locales, options) {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    // Per spec: timeZone option must throw TypeError
    if (options !== undefined && options !== null && typeof options === 'object') {
      if (options.timeZone !== undefined) {
        throw new TypeError('ZonedDateTime toLocaleString does not accept a timeZone option');
      }
    }
    const ms = _temporalToEpochMs(this);
    if (ms !== undefined) {
      const tzId = this.timeZoneId;
      // Per spec: calendar mismatch check (ISO calendar is always OK for ZonedDateTime)
      const calId = this.calendarId;
      if (calId !== 'iso8601') {
        const resolvedCal = new Intl.DateTimeFormat(locales, options && typeof options === 'object' ? { calendar: options.calendar } : undefined).resolvedOptions().calendar;
        if (calId !== resolvedCal) {
          throw new RangeError(`Calendar ${calId} does not match locale calendar ${resolvedCal}`);
        }
      }
      // Build options: force timeZone to ZDT's timezone
      let opts;
      if (options !== undefined && options !== null && typeof options === 'object') {
        opts = Object.assign({}, options);
      } else {
        opts = {};
      }
      // Convert offset timezone format for Intl: +HH:MM -> Etc/GMT notation or use directly
      // Intl.DateTimeFormat supports IANA names and UTC offset names
      opts.timeZone = tzId;
      // Per spec: if no date/time component options and no dateStyle/timeStyle,
      // add defaults for ZonedDateTime: date + time + timeZoneName
      // Preserve any options the user already specified (e.g. timeZoneName, era)
      if (!_hasDateTimeOptions(opts)) {
        opts.year = 'numeric';
        opts.month = 'numeric';
        opts.day = 'numeric';
        opts.hour = 'numeric';
        opts.minute = 'numeric';
        opts.second = 'numeric';
        if (opts.timeZoneName === undefined) opts.timeZoneName = 'short';
      }
      try {
        const dtf = new Intl.DateTimeFormat(locales, opts);
        return _origFormatGetter.call(dtf)(ms);
      } catch (e) {
        // Re-throw TypeErrors (e.g. dateStyle + component options conflict)
        if (e instanceof TypeError) throw e;
        // Fallback for unsupported offset timezones (RangeError from invalid timeZone)
        return this.toString();
      }
    }
    return this.toString();
  }

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
  toLocaleString(locales, options) {
    requireBranding(this, NapiInstant, 'Temporal.Instant');
    const ms = _temporalToEpochMs(this);
    if (ms !== undefined) {
      // Per spec: if no date/time component options and no dateStyle/timeStyle,
      // add defaults for Instant: date + time (but NOT timeZoneName)
      let opts;
      if (options !== undefined && options !== null && typeof options === 'object') {
        opts = Object.assign({}, options);
      } else {
        opts = {};
      }
      if (!_hasDateTimeOptions(opts)) {
        opts.year = 'numeric';
        opts.month = 'numeric';
        opts.day = 'numeric';
        opts.hour = 'numeric';
        opts.minute = 'numeric';
        opts.second = 'numeric';
      }
      const dtf = new Intl.DateTimeFormat(locales, opts);
      return _origFormatGetter.call(dtf)(ms);
    }
    return this.toString();
  }

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
      // Per spec: constructor always rejects out-of-range ISO values
      if (rd !== undefined) rejectISODateRange(y, m, rd);
      else if (m < 1 || m > 12) throw new RangeError('Month out of range');
      rejectISOStringAsCalendar(calendar);
      const cal = toNapiCalendar(calendar);
      this._inner = call(() => new NapiPlainYearMonth(y, m, cal, rd));
      if (typeof calendar === 'string') this._calId = canonicalizeCalendarId(calendar);
    }
    _wrapperSet.add(this);
  }

  static from(arg, options) {
    if (typeof arg === 'string') {
      rejectTooManyFractionalSeconds(arg);
      const inner = call(() => NapiPlainYearMonth.from(arg));
      if (options !== undefined) { validateOptions(options); extractOverflow(options); }
      const r = new PlainYearMonth(inner);
      const calMatch = arg.match(/\[u-ca=([^\]]+)\]/);
      if (calMatch) r._calId = canonicalizeCalendarId(calMatch[1]);
      return r;
    }
    validateOptions(options);
    if (arg instanceof PlainYearMonth) {
      if (options !== undefined) extractOverflow(options);
      const r = new PlainYearMonth(arg._inner);
      if (arg._calId) r._calId = arg._calId;
      return r;
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
      const month = resolveMonth(arg, calId, fields.year);
      if (month === undefined && arg.monthCode === undefined) throw new TypeError('Required property month or monthCode is missing');
      rejectPropertyBagInfinity({ year: fields.year, month }, 'year', 'month');
      // Validate month range (0 is always out of range regardless of overflow)
      if (month !== undefined) {
        const m = _trunc(month);
        if (m < 1) throw new RangeError(`month ${m} out of range`);
      }
      // In reject mode, validate that monthCode is valid for the target year
      if (overflow === 'Reject' && arg.monthCode !== undefined) {
        if (!isMonthCodeValidForYear(arg.monthCode, calId, fields.year)) {
          throw new RangeError(`monthCode ${arg.monthCode} does not exist in year ${fields.year} for ${calId} calendar`);
        }
        // Also reject month > monthsInYear for the target year
        if (calId === 'hebrew' && !isHebrewLeapYear(fields.year) && arg.month !== undefined && _trunc(arg.month) > 12) {
          throw new RangeError(`month ${arg.month} out of range for non-leap year ${fields.year}`);
        }
      }
      // In reject mode, reject month 13 in non-leap Hebrew year
      if (overflow === 'Reject' && calId === 'hebrew' && arg.month !== undefined && arg.monthCode === undefined) {
        if (!isHebrewLeapYear(fields.year) && _trunc(toInteger(arg.month)) > 12) {
          throw new RangeError(`month ${arg.month} out of range for non-leap Hebrew year ${fields.year}`);
        }
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
      // Per spec: day is NOT validated for PlainYearMonth - only year and month matter
      // Constrain month to the actual number of months in the target year
      let constrainedMonth = _trunc(month);
      if (overflow !== 'Reject') {
        // Determine max months for this calendar year
        if (calId === 'hebrew') {
          const maxM = isHebrewLeapYear(fields.year) ? 13 : 12;
          constrainedMonth = Math.max(1, Math.min(constrainedMonth, maxM));
        } else if (calId === 'chinese' || calId === 'dangi') {
          const leapBase = getChineseDangiLeapMonth(fields.year, calId);
          const maxM = leapBase > 0 ? 13 : 12;
          constrainedMonth = Math.max(1, Math.min(constrainedMonth, maxM));
        } else if (THIRTEEN_MONTH_CALENDARS.has(calId)) {
          constrainedMonth = Math.max(1, Math.min(constrainedMonth, 13));
        } else {
          constrainedMonth = Math.max(1, Math.min(constrainedMonth, 12));
        }
      }
      // Always use day 1 as the reference day
      const iso = calendarDateToISO(_trunc(fields.year), constrainedMonth, 1, calId);
      const ymR = new PlainYearMonth(call(() => new NapiPlainYearMonth(iso.isoYear, iso.isoMonth, cal, iso.isoDay)));
      ymR._calId = calId;
      return ymR;
    }
    throw new TypeError('Invalid argument for PlainYearMonth.from()');
  }

  static compare(one, two) {
    const a = toNapiPlainYearMonth(one);
    const b = toNapiPlainYearMonth(two);
    return NapiPlainYearMonth.compare(a, b);
  }

  get year() { const calId = getRealCalendarId(this); if (calId === 'ethioaa') return this._inner.year + 5500; return this._inner.year; }
  get month() { return this._inner.month; }
  get monthCode() { return this._inner.monthCode; }
  get era() {
    const calId = getRealCalendarId(this);
    const v = this._inner.era;
    if (v === null) return undefined;
    return resolveEraForCalendar(calId, this._inner.year, v, this._inner.eraYear).era;
  }
  get eraYear() {
    const calId = getRealCalendarId(this);
    const v = this._inner.eraYear;
    if (v === null) return undefined;
    return resolveEraForCalendar(calId, this._inner.year, this._inner.era, v).eraYear;
  }
  get daysInYear() { return this._inner.daysInYear; }
  get daysInMonth() { return this._inner.daysInMonth; }
  get monthsInYear() { return this._inner.monthsInYear; }
  get inLeapYear() { return this._inner.inLeapYear; }
  get calendarId() { return getRealCalendarId(this); }
  get calendar() { return getRealCalendarId(this); }

  with(fields, options) {
    requireBranding(this, NapiPlainYearMonth, 'Temporal.PlainYearMonth');
    validateWithFields(fields, PLAIN_YEARMONTH_FIELDS, 'PlainYearMonth');
    const calId = getRealCalendarId(this);
    const calValidEras = VALID_ERAS[calId];
    const calSupportsEras = calValidEras && calValidEras.size > 0;
    const hasEra = fields.era !== undefined;
    const hasEraYear = fields.eraYear !== undefined;
    const hasYear = fields.year !== undefined;
    if (!calSupportsEras && (hasEra || hasEraYear)) {
      throw new TypeError(`era and eraYear are not valid for the ${calId} calendar`);
    }
    if (calSupportsEras && (hasEra !== hasEraYear)) {
      throw new TypeError('era and eraYear must be provided together');
    }
    let era, eraYear, year;
    if (calSupportsEras && hasEra && hasEraYear) {
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
    // Reject Infinity in year/month fields
    if (year !== undefined) rejectInfinity(year, 'year');
    if (eraYear !== undefined) rejectInfinity(eraYear, 'eraYear');
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
      month = monthCodeToMonth(this.monthCode, calId, targetYear);
    }
    // Determine which monthCode is in effect for leap-month validation
    const effectiveMonthCodeYM = fields.monthCode !== undefined ? fields.monthCode : (fields.month === undefined ? this.monthCode : undefined);
    // Per spec: validate field values before processing options
    const tm = _trunc(month);
    if (tm < 1) throw new RangeError(`month ${tm} out of range`);
    const overflow = extractOverflow(options);
    // In reject mode, a leap monthCode in a non-leap year is an error
    if (overflow === 'Reject' && effectiveMonthCodeYM && !isMonthCodeValidForYear(effectiveMonthCodeYM, calId, targetYear)) {
      throw new RangeError(`monthCode ${effectiveMonthCodeYM} is not valid for year ${targetYear} in ${calId} calendar`);
    }
    // For reject mode, validate month is within monthsInYear
    if (overflow === 'Reject') {
      const maxMonth = THIRTEEN_MONTH_CALENDARS.has(calId) ? 13 : 12;
      if (tm > maxMonth) throw new RangeError(`month ${tm} out of range for ${calId} calendar (max ${maxMonth})`);
    } else {
      // Constrain month
      const maxMonth = THIRTEEN_MONTH_CALENDARS.has(calId) ? 13 : 12;
      if (tm > maxMonth) month = maxMonth;
    }
    const cal = toNapiCalendar(calId);
    const iso = calendarDateToISO(targetYear, _trunc(month), 1, calId);
    const ymW = new PlainYearMonth(call(() => new NapiPlainYearMonth(
      iso.isoYear,
      iso.isoMonth,
      cal,
      iso.isoDay,
    )));
    ymW._calId = calId;
    return ymW;
  }

  add(durationArg, options) {
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    const calId = getRealCalendarId(this);
    return wrapPlainYearMonth(call(() => this._inner.add(dur, overflow)), calId);
  }

  subtract(durationArg, options) {
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    const calId = getRealCalendarId(this);
    return wrapPlainYearMonth(call(() => this._inner.subtract(dur, overflow)), calId);
  }

  until(other, options) {
    const otherInner = toNapiPlainYearMonth(other);
    const settings = convertDifferenceSettings(options);
    const calId = getRealCalendarId(this);
    const lu = settings && settings.largestUnit ? settings.largestUnit : 'Month';
    // PlainYearMonth difference uses day 1 for both dates
    if ((lu === 'Year' || lu === 'Month') && !ISO_MONTH_ALIGNED_CALENDARS.has(calId)) {
      // Create PlainDate with day 1 for both
      try {
        const startDate = call(() => new NapiPlainDate(this._inner.year, this._inner.month, 1, this._inner.calendar));
        const endDate = call(() => new NapiPlainDate(otherInner.year, otherInner.month, 1, otherInner.calendar));
        const dateDiff = calendarDateDifference(startDate, endDate, lu, calId);
        if (dateDiff) {
          return wrapDuration(call(() => new NapiDuration(dateDiff.years, dateDiff.months, 0, 0, 0, 0, 0, 0, 0, 0)));
        }
      } catch { /* fallthrough to NAPI */ }
    }
    return wrapDuration(call(() => this._inner.until(otherInner, settings)));
  }

  since(other, options) {
    const otherInner = toNapiPlainYearMonth(other);
    const settings = convertDifferenceSettings(options);
    const calId = getRealCalendarId(this);
    const lu = settings && settings.largestUnit ? settings.largestUnit : 'Month';
    if ((lu === 'Year' || lu === 'Month') && !ISO_MONTH_ALIGNED_CALENDARS.has(calId)) {
      try {
        const startDate = call(() => new NapiPlainDate(this._inner.year, this._inner.month, 1, this._inner.calendar));
        const endDate = call(() => new NapiPlainDate(otherInner.year, otherInner.month, 1, otherInner.calendar));
        const dateDiff = calendarDateDifference(startDate, endDate, lu, calId);
        if (dateDiff) {
          return wrapDuration(call(() => new NapiDuration(-dateDiff.years, -dateDiff.months, 0, 0, 0, 0, 0, 0, 0, 0)));
        }
      } catch { /* fallthrough to NAPI */ }
    }
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
    const dayVal = toIntegerWithTruncation(fields.day);
    rejectInfinity(dayVal, 'day');
    const calId = getRealCalendarId(this);
    const cal = toNapiCalendar(calId);
    const iso = calendarDateToISO(this.year, this.month, dayVal, calId);
    return wrapPlainDate(call(() => new NapiPlainDate(iso.isoYear, iso.isoMonth, iso.isoDay, cal)), calId);
  }

  toString(options) {
    if (options !== undefined) validateOptions(options);
    const dc = options ? mapDisplayCalendar(options.calendarName) : undefined;
    return this._inner.toString(dc);
  }

  toJSON() { requireBranding(this, NapiPlainYearMonth, 'Temporal.PlainYearMonth'); return this.toString(); }
  toLocaleString(locales, options) {
    requireBranding(this, NapiPlainYearMonth, 'Temporal.PlainYearMonth');
    if (options !== undefined && options !== null && typeof options === 'object') {
      if (options.timeStyle !== undefined) {
        throw new TypeError('timeStyle option is not allowed for PlainYearMonth.toLocaleString()');
      }
    }
    // Per spec: calendar mismatch check (PlainYearMonth: ISO calendar also mismatches)
    const calId = this.calendarId;
    // Resolve the effective calendar from locale + options
    const resolvedCal = new Intl.DateTimeFormat(locales, options && typeof options === 'object' ? { calendar: options.calendar } : undefined).resolvedOptions().calendar;
    if (calId !== resolvedCal && calId !== 'iso8601') {
      throw new RangeError(`Calendar ${calId} does not match locale calendar ${resolvedCal}`);
    }
    if (calId === 'iso8601' && resolvedCal !== 'iso8601') {
      throw new RangeError(`ISO 8601 calendar does not match locale calendar ${resolvedCal}`);
    }
    const ms = _temporalToEpochMs(this);
    if (ms !== undefined) {
      let opts;
      if (options !== undefined && options !== null && typeof options === 'object') {
        opts = Object.assign({}, options);
      } else {
        opts = {};
      }
      opts.timeZone = 'UTC';
      // Per spec: if no date/time component options, add year+month defaults for PlainYearMonth
      if (!_hasDateTimeOptions(opts)) {
        opts.year = 'numeric';
        opts.month = 'numeric';
      }
      const dtf = new Intl.DateTimeFormat(locales, opts);
      return _origFormatGetter.call(dtf)(ms);
    }
    return this.toString();
  }

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
      // Per spec: constructor always rejects out-of-range ISO values
      if (ry !== undefined) rejectISODateRange(ry, m, d);
      else if (m < 1 || m > 12 || d < 1 || d > 31) throw new RangeError('Month/day out of range');
      rejectISOStringAsCalendar(calendar);
      const cal = toNapiCalendar(calendar);
      this._inner = call(() => new NapiPlainMonthDay(m, d, cal, ry));
      if (typeof calendar === 'string') this._calId = canonicalizeCalendarId(calendar);
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
      // Per spec: for non-ISO calendars, need either monthCode OR month+year
      if (mdFromCalId && mdFromCalId !== 'iso8601' && !hasMonthCode) {
        if (arg.month === undefined || arg.year === undefined) {
          throw new TypeError(`monthCode is required for PlainMonthDay with calendar '${mdFromCalId}' (or provide month and year)`);
        }
      }
      // Per spec: convert year type before monthCode semantics validation
      const yearVal = toInteger(arg.year);
      if (yearVal !== undefined) rejectInfinity(yearVal, 'year');
      let month = toInteger(arg.month);
      if (month !== undefined) rejectInfinity(month, 'month');
      const day = toInteger(arg.day);
      if (day !== undefined) rejectInfinity(day, 'day');
      if (hasMonthCode) {
        const fromCode = monthCodeToMonth(arg.monthCode, mdFromCalId);
        if (month !== undefined && _trunc(month) !== fromCode) {
          throw new RangeError(`month ${month} and monthCode ${arg.monthCode} do not agree`);
        }
        month = fromCode;
      }
      // Per spec: for ISO calendar, validate day range using the provided year (or 1972)
      // but always store referenceISOYear as 1972
      if (mdFromCalId === 'iso8601' || !mdFromCalId) {
        const checkYear = yearVal !== undefined ? _trunc(yearVal) : 1972;
        let checkMonth = _trunc(month);
        let checkDay = _trunc(day);
        // Per spec: month ≤ 0 and day ≤ 0 always reject regardless of overflow
        if (checkMonth < 1) throw new RangeError(`month ${checkMonth} out of range`);
        if (checkDay < 1) throw new RangeError(`day ${checkDay} out of range`);
        if (overflow === 'Reject') {
          // Validate that the day is valid for the month
          rejectISODateRange(checkYear, checkMonth, checkDay);
        } else {
          // Constrain: clamp month and day to valid range using the provided year
          if (checkMonth > 12) checkMonth = 12;
          const daysInMonth = [31, (checkYear % 4 === 0 && (checkYear % 100 !== 0 || checkYear % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
          if (checkDay > daysInMonth[checkMonth - 1]) checkDay = daysInMonth[checkMonth - 1];
        }
        // Always use 1972 as reference year for ISO calendar
        return new PlainMonthDay(call(() => new NapiPlainMonthDay(checkMonth, checkDay, cal, 1972)));
      }
      // Non-ISO calendars: convert calendar coords to ISO
      let calDay = _trunc(day);
      let calMonth = _trunc(month);
      if (calDay < 1) throw new RangeError(`day ${calDay} out of range`);
      if (calMonth < 1) throw new RangeError(`month ${calMonth} out of range`);
      // Use year for reference if provided
      let refCalYear = yearVal !== undefined ? _trunc(yearVal) : undefined;
      // Determine daysInMonth for overflow handling using the provided year
      if (refCalYear !== undefined) {
        const dim = calendarDaysInMonth(refCalYear, calMonth, mdFromCalId);
        if (dim !== undefined) {
          if (overflow === 'Reject' && calDay > dim) {
            throw new RangeError(`day ${calDay} out of range for month ${calMonth} (max ${dim})`);
          }
          calDay = Math.min(calDay, dim);
        }
        // Per spec: year is only used for validation; reference ISO year should still be ~1972
        // Fall through to the no-year path to pick the best reference year
      }
      // No year provided: use a default reference year for conversion and validation
      if (ISO_MONTH_ALIGNED_CALENDARS.has(mdFromCalId)) {
        // For month-aligned calendars, ISO month = calendar month, use 1972 as ref
        const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        const maxDay = calMonth >= 1 && calMonth <= 12 ? daysInMonth[calMonth - 1] : 31;
        if (overflow === 'Reject' && calDay > maxDay) {
          throw new RangeError(`day ${calDay} out of range for month ${calMonth} (max ${maxDay})`);
        }
        calDay = Math.min(calDay, maxDay);
        return new PlainMonthDay(call(() => new NapiPlainMonthDay(calMonth, calDay, cal, 1972)));
      }
      // For non-aligned calendars, we must convert through calendarDateToISO
      // Per spec: reference ISO year should be the latest ISO year ≤ 1972 where the date exists
      const baseRefYear = _defaultCalendarRefYear(mdFromCalId, calMonth);
      // Try multiple calendar years around the base to find the best match:
      // - ISO year ≤ 1972 (required by spec)
      // - Maximum daysInMonth (to accommodate leap month/day variations)
      // - Latest ISO year (closest to 1972)
      let bestIso = null;
      for (let yOff = -5; yOff <= 5; yOff++) {
        const tryCalYear = baseRefYear + yOff;
        const dim = calendarDaysInMonth(tryCalYear, calMonth, mdFromCalId);
        if (dim === undefined) continue;
        const tryDay = Math.min(calDay, dim);
        const tryIso = calendarDateToISO(tryCalYear, calMonth, tryDay, mdFromCalId);
        if (tryIso.isoYear <= 1972) {
          const isBetter = !bestIso ||
            // Prefer larger daysInMonth (to validate max days correctly)
            (dim > bestIso.dim) ||
            // Same daysInMonth: prefer latest ISO year
            (dim === bestIso.dim && tryIso.isoYear > bestIso.isoYear);
          if (isBetter) {
            bestIso = { ...tryIso, calYear: tryCalYear, dim, clampedDay: tryDay };
          }
        }
      }
      if (!bestIso) {
        // Fallback: just use base ref year
        const dim0 = calendarDaysInMonth(baseRefYear, calMonth, mdFromCalId) || 31;
        const clampedDay0 = Math.min(calDay, dim0);
        const fallback = calendarDateToISO(baseRefYear, calMonth, clampedDay0, mdFromCalId);
        bestIso = { ...fallback, calYear: baseRefYear, dim: dim0, clampedDay: clampedDay0 };
      }
      if (overflow === 'Reject' && calDay > bestIso.dim) {
        throw new RangeError(`day ${calDay} out of range for month ${calMonth} (max ${bestIso.dim})`);
      }
      // If calDay fits, recalculate with exact day
      if (calDay <= bestIso.dim && calDay !== bestIso.clampedDay) {
        const exact = calendarDateToISO(bestIso.calYear, calMonth, calDay, mdFromCalId);
        bestIso.isoYear = exact.isoYear;
        bestIso.isoMonth = exact.isoMonth;
        bestIso.isoDay = exact.isoDay;
      }
      return new PlainMonthDay(call(() => new NapiPlainMonthDay(bestIso.isoMonth, bestIso.isoDay, cal, bestIso.isoYear)));
    }
    throw new TypeError('Invalid argument for PlainMonthDay.from()');
  }

  get monthCode() { return this._inner.monthCode; }
  get day() { return this._inner.day; }
  get calendarId() { return getRealCalendarId(this); }
  get calendar() { return getRealCalendarId(this); }

  with(fields, options) {
    requireBranding(this, NapiPlainMonthDay, 'Temporal.PlainMonthDay');
    const PLAIN_MONTHDAY_FIELDS = new Set(['month', 'monthCode', 'day', 'year']);
    validateWithFields(fields, PLAIN_MONTHDAY_FIELDS, 'PlainMonthDay');
    const calId = getRealCalendarId(this);
    const cal = toNapiCalendar(calId);
    // Resolve month from month/monthCode with agreement validation
    let month = fields.month !== undefined ? toInteger(fields.month) : undefined;
    if (month !== undefined) rejectInfinity(month, 'month');
    const day = fields.day !== undefined ? toInteger(fields.day) : this.day;
    rejectInfinity(day, 'day');
    if (fields.year !== undefined) rejectInfinity(toInteger(fields.year), 'year');
    // Per spec: validate field values before processing options
    const td = _trunc(day);
    if (td < 1) throw new RangeError(`day ${td} out of range`);
    if (month !== undefined && _trunc(month) < 1) throw new RangeError(`month ${_trunc(month)} out of range`);
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
    const overflow = extractOverflow(options);
    // For ISO calendar, apply overflow using year (if provided) to constrain day
    if (calId === 'iso8601' || !calId) {
      const yearForOverflow = fields.year !== undefined ? _trunc(toInteger(fields.year)) : 1972;
      let constrainedMonth = _trunc(month);
      let constrainedDay = _trunc(day);
      if (overflow === 'Reject') {
        rejectISODateRange(yearForOverflow, constrainedMonth, constrainedDay);
      } else {
        if (constrainedMonth > 12) constrainedMonth = 12;
        const daysInMonth = [31, (yearForOverflow % 4 === 0 && (yearForOverflow % 100 !== 0 || yearForOverflow % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if (constrainedDay > daysInMonth[constrainedMonth - 1]) constrainedDay = daysInMonth[constrainedMonth - 1];
      }
      return new PlainMonthDay(call(() => new NapiPlainMonthDay(constrainedMonth, constrainedDay, cal, 1972)));
    }
    return new PlainMonthDay(call(() => new NapiPlainMonthDay(
      month,
      day,
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
    const yearVal = toIntegerWithTruncation(fields.year);
    rejectInfinity(yearVal, 'year');
    // Get month from monthCode, accounting for leap year shifts
    const code = this.monthCode;
    const calId = this.calendarId;
    const month = monthCodeToMonth(code, calId, yearVal);
    const cal = toNapiCalendar(calId);
    const iso = calendarDateToISO(yearVal, month, this.day, calId);
    return wrapPlainDate(call(() => new NapiPlainDate(iso.isoYear, iso.isoMonth, iso.isoDay, cal)));
  }

  toString(options) {
    if (options !== undefined) validateOptions(options);
    const dc = options ? mapDisplayCalendar(options.calendarName) : undefined;
    return this._inner.toString(dc);
  }

  toJSON() { requireBranding(this, NapiPlainMonthDay, 'Temporal.PlainMonthDay'); return this.toString(); }
  toLocaleString(locales, options) {
    requireBranding(this, NapiPlainMonthDay, 'Temporal.PlainMonthDay');
    if (options !== undefined && options !== null && typeof options === 'object') {
      if (options.timeStyle !== undefined) {
        throw new TypeError('timeStyle option is not allowed for PlainMonthDay.toLocaleString()');
      }
    }
    // Per spec: calendar mismatch check (PlainMonthDay: ISO calendar also mismatches)
    const calId = this.calendarId;
    const resolvedCal = new Intl.DateTimeFormat(locales, options && typeof options === 'object' ? { calendar: options.calendar } : undefined).resolvedOptions().calendar;
    if (calId !== resolvedCal && calId !== 'iso8601') {
      throw new RangeError(`Calendar ${calId} does not match locale calendar ${resolvedCal}`);
    }
    if (calId === 'iso8601' && resolvedCal !== 'iso8601') {
      throw new RangeError(`ISO 8601 calendar does not match locale calendar ${resolvedCal}`);
    }
    const ms = _temporalToEpochMs(this);
    if (ms !== undefined) {
      let opts;
      if (options !== undefined && options !== null && typeof options === 'object') {
        opts = Object.assign({}, options);
      } else {
        opts = {};
      }
      opts.timeZone = 'UTC';
      // Per spec: if no date/time component options, add month+day defaults for PlainMonthDay
      if (!_hasDateTimeOptions(opts)) {
        opts.month = 'numeric';
        opts.day = 'numeric';
      }
      const dtf = new Intl.DateTimeFormat(locales, opts);
      return _origFormatGetter.call(dtf)(ms);
    }
    return this.toString();
  }

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
//  Intl.DateTimeFormat patching for Temporal objects
// ═══════════════════════════════════════════════════════════════

// Helper: check if options contain date/time component options or dateStyle/timeStyle
// Per spec: era and timeZoneName are NOT date-time component options and don't suppress defaults
const _DATE_TIME_COMPONENT_OPTS = ['year', 'month', 'day', 'weekday', 'hour', 'minute', 'second',
  'fractionalSecondDigits', 'dayPeriod', 'dateStyle', 'timeStyle'];
function _hasDateTimeOptions(opts) {
  if (!opts || typeof opts !== 'object') return false;
  for (const key of _DATE_TIME_COMPONENT_OPTS) {
    if (opts[key] !== undefined) return true;
  }
  return false;
}

// Helper: convert a Temporal object to epoch milliseconds for Intl formatting
function _temporalToEpochMs(temporalObj) {
  if (!temporalObj || typeof temporalObj !== 'object') return undefined;
  const inner = temporalObj._inner;
  if (!inner) return undefined;
  if (inner instanceof NapiInstant) {
    return inner.epochMilliseconds;
  }
  if (inner instanceof NapiZonedDateTime) {
    return inner.epochMilliseconds;
  }
  if (inner instanceof NapiPlainDateTime) {
    // Interpret as UTC for formatting purposes (the DTF will apply its timezone)
    const d = new Date(0);
    d.setUTCFullYear(inner.isoYear || inner.year, (inner.isoMonth || inner.month) - 1, inner.isoDay || inner.day);
    d.setUTCHours(inner.hour, inner.minute, inner.second, inner.millisecond);
    return d.getTime();
  }
  if (inner instanceof NapiPlainDate) {
    const d = new Date(0);
    // Extract ISO fields from toString to get the actual ISO year/month/day
    const str = inner.toString();
    const m = str.match(/^(-?\d+|\+\d+)-(\d{2})-(\d{2})/);
    if (m) {
      d.setUTCFullYear(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    } else {
      d.setUTCFullYear(inner.year, inner.month - 1, inner.day);
    }
    // Use noon UTC to avoid timezone-induced date shifts
    d.setUTCHours(12, 0, 0, 0);
    return d.getTime();
  }
  if (inner instanceof NapiPlainTime) {
    // PlainTime has no date component; use epoch day as base
    const d = new Date(0);
    d.setUTCFullYear(1970, 0, 1);
    d.setUTCHours(inner.hour, inner.minute, inner.second, inner.millisecond);
    return d.getTime();
  }
  if (inner instanceof NapiPlainYearMonth) {
    const str = inner.toString();
    const m = str.match(/(-?\d+|\+\d+)-(\d{2})/);
    if (m) {
      const d = new Date(0);
      d.setUTCFullYear(parseInt(m[1], 10), parseInt(m[2], 10) - 1, 1);
      d.setUTCHours(12, 0, 0, 0);
      return d.getTime();
    }
    return undefined;
  }
  if (inner instanceof NapiPlainMonthDay) {
    const str = inner.toString();
    // Formats: "MM-DD", "YYYY-MM-DD[u-ca=...]", or "+YYYYYY-MM-DD[u-ca=...]"
    const m = str.match(/(-?\d+|\+\d+)-(\d{2})-(\d{2})/) || str.match(/^(\d{2})-(\d{2})$/);
    if (m) {
      const d = new Date(0);
      if (m.length === 4) {
        d.setUTCFullYear(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
      } else {
        d.setUTCFullYear(1972, parseInt(m[1], 10) - 1, parseInt(m[2], 10));
      }
      d.setUTCHours(12, 0, 0, 0);
      return d.getTime();
    }
    return undefined;
  }
  return undefined;
}

// Patch Intl.DateTimeFormat to handle Temporal objects
const _origFormatDesc = Object.getOwnPropertyDescriptor(Intl.DateTimeFormat.prototype, 'format');
const _origFormatGetter = _origFormatDesc && _origFormatDesc.get;
const _origFormatToParts = Intl.DateTimeFormat.prototype.formatToParts;

// Helper: check if resolved DTF options indicate user-specified component options
// When no component options are specified, DateTimeFormat defaults to {year: "numeric", month: "numeric", day: "numeric"}
// We detect this default pattern and treat it as "no user options"
function _resolvedHasUserComponents(resolvedOpts) {
  if (resolvedOpts.dateStyle || resolvedOpts.timeStyle) return true;
  if (resolvedOpts.hour || resolvedOpts.minute || resolvedOpts.second ||
      resolvedOpts.fractionalSecondDigits || resolvedOpts.dayPeriod || resolvedOpts.weekday) return true;
  // Check if it's not the default pattern (year+month+day only = defaults)
  // If year/month/day are present but nothing else, it's likely defaults
  if (resolvedOpts.year && resolvedOpts.month && resolvedOpts.day) return false;
  // If only some of year/month/day, user specified them
  if (resolvedOpts.year || resolvedOpts.month || resolvedOpts.day) return true;
  return false;
}

// Helper: create a UTC-forced DTF for "wall-clock" Temporal types (PlainDate, PlainDateTime, PlainTime)
// Also creates a DTF with defaults for Instant/wall-clock types when needed
function _getTemporalDtf(dtf, temporalObj) {
  const inner = temporalObj._inner;
  const isWallClock = inner instanceof NapiPlainDate || inner instanceof NapiPlainDateTime ||
    inner instanceof NapiPlainTime || inner instanceof NapiPlainYearMonth || inner instanceof NapiPlainMonthDay;
  if (isWallClock) {
    // Need a new DTF with UTC timezone to avoid timezone shifts
    const resolvedOpts = dtf.resolvedOptions();
    const opts = {};
    for (const key of ['locale', 'calendar', 'numberingSystem', 'year', 'month', 'day',
      'hour', 'minute', 'second', 'fractionalSecondDigits', 'weekday', 'era',
      'dayPeriod', 'dateStyle', 'timeStyle', 'hour12', 'hourCycle', 'timeZoneName']) {
      if (resolvedOpts[key] !== undefined) opts[key] = resolvedOpts[key];
    }
    opts.timeZone = 'UTC';
    // Always filter out incompatible options for the Temporal type
    // All wall-clock types should strip timeZoneName (they have no timezone)
    if (isWallClock) {
      delete opts.timeZoneName;
    }
    if (inner instanceof NapiPlainDate) {
      delete opts.hour; delete opts.minute; delete opts.second;
      delete opts.fractionalSecondDigits; delete opts.dayPeriod;
      if (opts.timeStyle) { delete opts.timeStyle; }
    } else if (inner instanceof NapiPlainTime) {
      delete opts.year; delete opts.month; delete opts.day; delete opts.weekday; delete opts.era;
      if (opts.dateStyle) { delete opts.dateStyle; }
    } else if (inner instanceof NapiPlainYearMonth) {
      delete opts.day; delete opts.weekday;
      delete opts.hour; delete opts.minute; delete opts.second;
      delete opts.fractionalSecondDigits; delete opts.dayPeriod;
      if (opts.timeStyle) { delete opts.timeStyle; }
    } else if (inner instanceof NapiPlainMonthDay) {
      delete opts.year; delete opts.era; delete opts.weekday;
      delete opts.hour; delete opts.minute; delete opts.second;
      delete opts.fractionalSecondDigits; delete opts.dayPeriod;
      if (opts.timeStyle) { delete opts.timeStyle; }
    }
    // Add defaults based on type if no component options were specified
    if (!_resolvedHasUserComponents(resolvedOpts)) {
      if (inner instanceof NapiPlainDateTime) {
        opts.year = 'numeric'; opts.month = 'numeric'; opts.day = 'numeric';
        opts.hour = 'numeric'; opts.minute = 'numeric'; opts.second = 'numeric';
      } else if (inner instanceof NapiPlainDate) {
        opts.year = 'numeric'; opts.month = 'numeric'; opts.day = 'numeric';
      } else if (inner instanceof NapiPlainTime) {
        opts.hour = 'numeric'; opts.minute = 'numeric'; opts.second = 'numeric';
      } else if (inner instanceof NapiPlainYearMonth) {
        opts.year = 'numeric'; opts.month = 'numeric';
      } else if (inner instanceof NapiPlainMonthDay) {
        opts.month = 'numeric'; opts.day = 'numeric';
      }
    }
    return new Intl.DateTimeFormat(resolvedOpts.locale, opts);
  }
  // For Instant: if no date/time component options were specified, add defaults (date + time, no timeZoneName)
  if (inner instanceof NapiInstant) {
    const resolvedOpts = dtf.resolvedOptions();
    if (!_resolvedHasUserComponents(resolvedOpts)) {
      const opts = {};
      for (const key of ['locale', 'calendar', 'numberingSystem', 'hour12', 'hourCycle', 'timeZone',
        'era', 'timeZoneName']) {
        if (resolvedOpts[key] !== undefined) opts[key] = resolvedOpts[key];
      }
      opts.year = 'numeric';
      opts.month = 'numeric';
      opts.day = 'numeric';
      opts.hour = 'numeric';
      opts.minute = 'numeric';
      opts.second = 'numeric';
      return new Intl.DateTimeFormat(resolvedOpts.locale, opts);
    }
  }
  return dtf;
}

if (_origFormatGetter) {
  Object.defineProperty(Intl.DateTimeFormat.prototype, 'format', {
    get() {
      const dtf = this;
      const origFn = _origFormatGetter.call(dtf);
      // Return a bound function that handles Temporal objects
      const fn = function(arg) {
        if (arg !== undefined && typeof arg === 'object' && arg !== null && '_inner' in arg) {
          _rejectUnsupportedTemporalDTF(arg, 'format', dtf);
          const ms = _temporalToEpochMs(arg);
          if (ms !== undefined) {
            const utcDtf = _getTemporalDtf(dtf, arg);
            if (utcDtf !== dtf) {
              return _origFormatGetter.call(utcDtf)(ms);
            }
            return origFn(ms);
          }
        }
        return origFn(arg);
      };
      return fn;
    },
    configurable: true,
    enumerable: false,
  });
}

if (_origFormatToParts) {
  Intl.DateTimeFormat.prototype.formatToParts = function formatToParts(arg) {
    if (arg !== undefined && typeof arg === 'object' && arg !== null && '_inner' in arg) {
      _rejectUnsupportedTemporalDTF(arg, 'formatToParts', this);
      const ms = _temporalToEpochMs(arg);
      if (ms !== undefined) {
        const utcDtf = _getTemporalDtf(this, arg);
        return _origFormatToParts.call(utcDtf, ms);
      }
    }
    return _origFormatToParts.call(this, arg);
  };
}

// Patch formatRange and formatRangeToParts
const _origFormatRange = Intl.DateTimeFormat.prototype.formatRange;
const _origFormatRangeToParts = Intl.DateTimeFormat.prototype.formatRangeToParts;

function _rejectUnsupportedTemporalDTF(arg, methodName, dtf) {
  if (arg !== undefined && typeof arg === 'object' && arg !== null && '_inner' in arg) {
    if (arg._inner instanceof NapiZonedDateTime) {
      throw new TypeError(`Intl.DateTimeFormat.${methodName}() does not support Temporal.ZonedDateTime`);
    }
    if (arg._inner instanceof NapiDuration) {
      throw new TypeError(`Intl.DateTimeFormat.${methodName}() does not support Temporal.Duration`);
    }
    // Per spec: check for overlapping options between DTF and Temporal type
    if (dtf) {
      const resolved = dtf.resolvedOptions();
      const hasDateStyle = resolved.dateStyle !== undefined;
      const hasTimeStyle = resolved.timeStyle !== undefined;
      const hasDateOpts = !!(resolved.year || resolved.month || resolved.day || resolved.weekday);
      const hasTimeOpts = !!(resolved.hour || resolved.minute || resolved.second ||
        resolved.fractionalSecondDigits || resolved.dayPeriod);
      const inner = arg._inner;
      // Per spec: reject Temporal types that have no overlap with DTF options
      // Only throw when explicit user-specified component options have no overlap with the type
      // When the DTF has only defaults (year+month+day from no user options), don't throw
      const hasUserOpts = _resolvedHasUserComponents(resolved);
      if (hasUserOpts) {
        // PlainTime: needs hour, minute, second, dayPeriod, fractionalSecondDigits, or timeStyle
        const _hasRelevantForTime = hasTimeOpts || hasTimeStyle;
        // PlainDate: needs year, month, day, weekday, era, or dateStyle
        const _hasRelevantForDate = hasDateOpts || hasDateStyle;
        // PlainYearMonth: needs year, month, or dateStyle
        const _hasRelevantForYearMonth = !!(resolved.year || resolved.month || hasDateStyle);
        // PlainMonthDay: needs month, day, or dateStyle
        const _hasRelevantForMonthDay = !!(resolved.month || resolved.day || hasDateStyle);

        if (inner instanceof NapiPlainTime && !_hasRelevantForTime) {
          throw new TypeError(`DateTimeFormat options are not compatible with Temporal.PlainTime`);
        }
        if (inner instanceof NapiPlainDate && !_hasRelevantForDate) {
          throw new TypeError(`DateTimeFormat options are not compatible with Temporal.PlainDate`);
        }
        if (inner instanceof NapiPlainYearMonth && !_hasRelevantForYearMonth) {
          throw new TypeError(`DateTimeFormat options are not compatible with Temporal.PlainYearMonth`);
        }
        if (inner instanceof NapiPlainMonthDay && !_hasRelevantForMonthDay) {
          throw new TypeError(`DateTimeFormat options are not compatible with Temporal.PlainMonthDay`);
        }
      }
    }
  }
}

function _getTemporalTypeKey(obj) {
  if (!obj || typeof obj !== 'object' || !('_inner' in obj)) return null;
  const inner = obj._inner;
  if (inner instanceof NapiPlainDate) return 'PlainDate';
  if (inner instanceof NapiPlainDateTime) return 'PlainDateTime';
  if (inner instanceof NapiPlainTime) return 'PlainTime';
  if (inner instanceof NapiPlainYearMonth) return 'PlainYearMonth';
  if (inner instanceof NapiPlainMonthDay) return 'PlainMonthDay';
  if (inner instanceof NapiInstant) return 'Instant';
  if (inner instanceof NapiZonedDateTime) return 'ZonedDateTime';
  if (inner instanceof NapiDuration) return 'Duration';
  return null;
}

if (_origFormatRange) {
  Intl.DateTimeFormat.prototype.formatRange = function formatRange(a, b) {
    _rejectUnsupportedTemporalDTF(a, 'formatRange', this);
    _rejectUnsupportedTemporalDTF(b, 'formatRange', this);
    // Per spec: both args must be the same type (both Temporal same type, or both Date)
    const typeA = _getTemporalTypeKey(a);
    const typeB = _getTemporalTypeKey(b);
    const aIsDate = a instanceof Date;
    const bIsDate = b instanceof Date;
    // Different Temporal types
    if (typeA && typeB && typeA !== typeB) {
      throw new TypeError(`formatRange requires both arguments to be the same type, got ${typeA} and ${typeB}`);
    }
    // One is Temporal, other is Date (or vice versa)
    if ((typeA && (bIsDate || (!typeB && b !== undefined))) || (typeB && (aIsDate || (!typeA && a !== undefined)))) {
      if (typeA && !typeB) throw new TypeError(`formatRange requires both arguments to be the same type`);
      if (typeB && !typeA) throw new TypeError(`formatRange requires both arguments to be the same type`);
    }
    // Per spec: both Temporal objects must have the same calendar
    if (typeA && typeB && a.calendarId !== undefined && b.calendarId !== undefined) {
      if (a.calendarId !== b.calendarId) {
        throw new RangeError(`formatRange requires both arguments to have the same calendar`);
      }
    }
    let dtf = this;
    let msA = a, msB = b;
    const aIsTemporal = a !== undefined && typeof a === 'object' && a !== null && '_inner' in a;
    const bIsTemporal = b !== undefined && typeof b === 'object' && b !== null && '_inner' in b;
    if (aIsTemporal) {
      msA = _temporalToEpochMs(a);
      if (msA === undefined) msA = a;
      else dtf = _getTemporalDtf(this, a);
    }
    if (bIsTemporal) {
      msB = _temporalToEpochMs(b);
      if (msB === undefined) msB = b;
    }
    return _origFormatRange.call(dtf, msA, msB);
  };
}

if (_origFormatRangeToParts) {
  Intl.DateTimeFormat.prototype.formatRangeToParts = function formatRangeToParts(a, b) {
    _rejectUnsupportedTemporalDTF(a, 'formatRangeToParts', this);
    _rejectUnsupportedTemporalDTF(b, 'formatRangeToParts', this);
    const typeA2 = _getTemporalTypeKey(a);
    const typeB2 = _getTemporalTypeKey(b);
    if (typeA2 && typeB2 && typeA2 !== typeB2) {
      throw new TypeError(`formatRangeToParts requires both arguments to be the same type, got ${typeA2} and ${typeB2}`);
    }
    // One is Temporal, other is Date/non-Temporal
    if ((typeA2 && !typeB2 && b !== undefined) || (typeB2 && !typeA2 && a !== undefined)) {
      throw new TypeError(`formatRangeToParts requires both arguments to be the same type`);
    }
    // Per spec: both Temporal objects must have the same calendar
    if (typeA2 && typeB2 && a.calendarId !== undefined && b.calendarId !== undefined) {
      if (a.calendarId !== b.calendarId) {
        throw new RangeError(`formatRangeToParts requires both arguments to have the same calendar`);
      }
    }
    let dtf = this;
    let msA = a, msB = b;
    const aIsTemporal = a !== undefined && typeof a === 'object' && a !== null && '_inner' in a;
    const bIsTemporal = b !== undefined && typeof b === 'object' && b !== null && '_inner' in b;
    if (aIsTemporal) {
      msA = _temporalToEpochMs(a);
      if (msA === undefined) msA = a;
      else dtf = _getTemporalDtf(this, a);
    }
    if (bIsTemporal) {
      msB = _temporalToEpochMs(b);
      if (msB === undefined) msB = b;
    }
    return _origFormatRangeToParts.call(dtf, msA, msB);
  };
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
