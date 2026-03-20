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

// Helper: parse a duration argument for Instant.add/subtract, preserving BigInt precision
// Returns { dur (for validation), totalNs (BigInt) }
function _parseDurationForInstant(arg) {
  // If it's a string, parse through NAPI and use the result
  if (typeof arg === 'string') {
    const dur = call(() => NapiDuration.from(arg));
    if (dur.years || dur.months || dur.weeks || dur.days) {
      throw new RangeError('Instant.add/subtract does not accept date components');
    }
    const totalNs = BigInt(dur.hours) * 3600000000000n +
                    BigInt(dur.minutes) * 60000000000n +
                    BigInt(dur.seconds) * 1000000000n +
                    BigInt(dur.milliseconds) * 1000000n +
                    BigInt(dur.microseconds) * 1000n +
                    BigInt(dur.nanoseconds);
    return { dur, totalNs };
  }
  // For Duration wrapper instances (check without triggering Proxy traps)
  if (_isTemporalDuration(arg)) {
    const dur = arg._inner;
    if (dur.years || dur.months || dur.weeks || dur.days) {
      throw new RangeError('Instant.add/subtract does not accept date components');
    }
    const totalNs = BigInt(dur.hours) * 3600000000000n +
                    BigInt(dur.minutes) * 60000000000n +
                    BigInt(dur.seconds) * 1000000000n +
                    BigInt(dur.milliseconds) * 1000000n +
                    BigInt(dur.microseconds) * 1000n +
                    BigInt(dur.nanoseconds);
    return { dur, totalNs };
  }
  // Property bag: read fields in ALPHABETICAL order per spec, coercing each immediately
  if (typeof arg === 'object' && arg !== null) {
    // Per spec (ToTemporalDurationRecord): read in alphabetical order
    const _days = arg.days;
    const dv = toIntegerIfIntegral(_days);
    const _hours = arg.hours;
    const hv = toIntegerIfIntegral(_hours);
    const _microseconds = arg.microseconds;
    const usv = toIntegerIfIntegral(_microseconds);
    const _milliseconds = arg.milliseconds;
    const msv = toIntegerIfIntegral(_milliseconds);
    const _minutes = arg.minutes;
    const mv = toIntegerIfIntegral(_minutes);
    const _months = arg.months;
    const mov = toIntegerIfIntegral(_months);
    const _nanoseconds = arg.nanoseconds;
    const nsv = toIntegerIfIntegral(_nanoseconds);
    const _seconds = arg.seconds;
    const sv = toIntegerIfIntegral(_seconds);
    const _weeks = arg.weeks;
    const wv = toIntegerIfIntegral(_weeks);
    const _years = arg.years;
    const yv = toIntegerIfIntegral(_years);
    // Check at least one defined
    if (_days === undefined && _hours === undefined && _microseconds === undefined &&
        _milliseconds === undefined && _minutes === undefined && _months === undefined &&
        _nanoseconds === undefined && _seconds === undefined && _weeks === undefined && _years === undefined) {
      throw new TypeError('Invalid duration-like argument: at least one property must be present');
    }
    if (yv || mov || wv || dv) {
      throw new RangeError('Instant.add/subtract does not accept date components');
    }
    const hVal = hv || 0;
    const mVal = mv || 0;
    const sVal = sv || 0;
    const msVal = msv || 0;
    const usVal = usv || 0;
    const nsVal = nsv || 0;
    // Convert to BigInt for precision
    const totalNs = BigInt(hVal) * 3600000000000n +
                    BigInt(mVal) * 60000000000n +
                    BigInt(sVal) * 1000000000n +
                    BigInt(msVal) * 1000000n +
                    BigInt(usVal) * 1000n +
                    BigInt(nsVal);
    // Also create a NAPI duration for validation (with clamped values for NAPI compatibility)
    const dur = call(() => new NapiDuration(0, 0, 0, 0, hVal, mVal, sVal, msVal, usVal, nsVal));
    return { dur, totalNs };
  }
  throw new TypeError('Invalid duration-like argument');
}

// Helper: compute local date/time parts from BigInt nanoseconds (for extreme values)
function _computeLocalPartsFromBigInt(epochNs, offsetNs) {
  const localNs = epochNs + offsetNs;
  const NS_PER_MS = 1000000n;
  const NS_PER_S = 1000000000n;
  const NS_PER_MIN = 60000000000n;
  const NS_PER_HOUR = 3600000000000n;
  const NS_PER_DAY = 86400000000000n;

  // Convert to ms for Date (clamping to Date range for just date computation)
  let localMs = localNs / NS_PER_MS;
  let subMs = localNs % NS_PER_MS;
  if (subMs < 0n) { subMs += NS_PER_MS; localMs -= 1n; }

  // For the date part, use a reference: we know the exact day count from epoch
  // Total days from Unix epoch (day 0 = 1970-01-01)
  // Use floored division for BigInt: totalDays = floor(localNs / NS_PER_DAY)
  let totalDaysBig;
  if (localNs >= 0n) {
    totalDaysBig = localNs / NS_PER_DAY;
  } else {
    totalDaysBig = (localNs - NS_PER_DAY + 1n) / NS_PER_DAY;
  }
  const totalDays = Number(totalDaysBig);
  const dayOfDayNs = localNs - BigInt(totalDays) * NS_PER_DAY;

  // Convert totalDays to a date using a civil calendar algorithm
  // Algorithm from https://howardhinnant.github.io/date_algorithms.html
  // Note: uses C++ truncation-towards-zero division, NOT Math.floor
  const z = totalDays + 719468;
  const era = Math.trunc((z >= 0 ? z : z - 146096) / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const year = m <= 2 ? y + 1 : y;

  // Time of day from remaining nanoseconds
  const todNs = Number(dayOfDayNs);
  const hour = Math.floor(todNs / 3600000000000);
  const minute = Math.floor((todNs % 3600000000000) / 60000000000);
  const second = Math.floor((todNs % 60000000000) / 1000000000);
  const ms = Math.floor((todNs % 1000000000) / 1000000);

  return {
    year: String(Math.abs(year)),
    month: String(m).padStart(2, '0'),
    day: String(d).padStart(2, '0'),
    hour: String(hour).padStart(2, '0'),
    minute: String(minute).padStart(2, '0'),
    second: String(second).padStart(2, '0'),
    fractionalSecond: String(ms).padStart(3, '0'),
    _fullYear: year,
  };
}

// ─── Helper: compute local time in a timezone from epoch ms ────

const _dtfCache = new Map();
const _napiZdtCache = new Map();
const _canonicalTzCache = new Map();
function _canonicalTzId(tzId) {
  let canon = _canonicalTzCache.get(tzId);
  if (canon !== undefined) return canon;
  try {
    canon = new Intl.DateTimeFormat(undefined, { timeZone: tzId }).resolvedOptions().timeZone;
  } catch { canon = tzId; }
  _canonicalTzCache.set(tzId, canon);
  return canon;
}

function getLocalPartsFromEpoch(epochMs, tzId) {
  if (tzId === 'UTC') {
    const d = new Date(epochMs);
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
  // For fixed-offset timezones, compute local time using BigInt arithmetic
  // to handle cases where local ms is outside Date's valid range
  if (/^[+-]\d{2}:\d{2}(:\d{2})?$/.test(tzId)) {
    const sign = tzId[0] === '+' ? 1 : -1;
    const h = parseInt(tzId.substring(1, 3), 10);
    const m = parseInt(tzId.substring(4, 6), 10);
    const s = tzId.length > 6 ? parseInt(tzId.substring(7, 9), 10) : 0;
    const offsetMs = sign * (h * 3600000 + m * 60000 + s * 1000);
    const localMs = epochMs + offsetMs;
    // If localMs is within Date range, use Date for formatting
    if (localMs >= -8640000000000000 && localMs <= 8640000000000000) {
      const d = new Date(localMs);
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
    // Out of Date range: compute using BigInt arithmetic
    // First get the UTC date parts at the epochMs, then add the offset
    return _computeLocalPartsFromBigInt(BigInt(Math.trunc(epochMs)) * 1000000n, BigInt(offsetMs) * 1000000n);
  }
  const d = new Date(epochMs);
  let fmt = _dtfCache.get(tzId);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tzId,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
      era: 'short',
      fractionalSecondDigits: 3,
    });
    _dtfCache.set(tzId, fmt);
  }
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
  const totalSeconds = Math.round(offsetMs / 1000);
  const sign = totalSeconds >= 0 ? '+' : '-';
  const absSeconds = Math.abs(totalSeconds);
  const offHr = String(Math.floor(absSeconds / 3600)).padStart(2, '0');
  const offMn = String(Math.floor((absSeconds % 3600) / 60)).padStart(2, '0');
  const offSc = absSeconds % 60;
  if (offSc !== 0) {
    return sign + offHr + ':' + offMn + ':' + String(offSc).padStart(2, '0');
  }
  return sign + offHr + ':' + offMn;
}

// Helper: resolve a local datetime to an epoch ms in a given timezone with disambiguation
// Returns { epochMs, offsetStr } or throws for 'reject' mode
function _resolveLocalToEpochMs(isoYear, isoMonth, isoDay, hour, minute, second, ms, tzId, disambiguation) {
  if (tzId === 'UTC' || /^[+-]\d{2}:\d{2}$/.test(tzId)) {
    const d = new Date(0);
    d.setUTCFullYear(isoYear, isoMonth - 1, isoDay);
    d.setUTCHours(hour, minute, second, ms);
    let localAsUtcMs = d.getTime();
    // For extreme dates beyond JS Date range, use pure arithmetic
    if (isNaN(localAsUtcMs)) {
      const epochDays = isoDateToEpochDays(isoYear, isoMonth, isoDay);
      localAsUtcMs = epochDays * 86400000 + hour * 3600000 + minute * 60000 + second * 1000 + (ms || 0);
    }
    if (tzId === 'UTC') {
      return { epochMs: localAsUtcMs, offsetStr: '+00:00' };
    }
    // Fixed-offset timezone
    const sign = tzId[0] === '+' ? 1 : -1;
    const tzH = parseInt(tzId.substring(1, 3), 10);
    const tzM = parseInt(tzId.substring(4, 6), 10);
    const offsetMs = sign * (tzH * 3600000 + tzM * 60000);
    return { epochMs: localAsUtcMs - offsetMs, offsetStr: tzId };
  }

  // localTimeAsUtcMs: interpret the local time as if it were UTC
  const guess = new Date(0);
  guess.setUTCFullYear(isoYear, isoMonth - 1, isoDay);
  guess.setUTCHours(hour, minute, second, ms);
  const localAsUtcMs = guess.getTime();

  // Candidate 1: use the offset at (localAsUtcMs - estimated_offset)
  const estOffset = _getOffsetMs(localAsUtcMs, tzId);
  const candidate1 = localAsUtcMs - estOffset;
  const offset1 = _getOffsetMs(candidate1, tzId);
  const local1 = candidate1 + offset1;

  // Candidate 2: try with the offset at candidate1
  const candidate2 = localAsUtcMs - offset1;
  const offset2 = _getOffsetMs(candidate2, tzId);
  const local2 = candidate2 + offset2;

  // Collect valid candidates (those whose local time matches)
  const candidates = [];
  if (local1 === localAsUtcMs) candidates.push({ epochMs: candidate1, offset: offset1 });
  if (local2 === localAsUtcMs && candidate2 !== candidate1) candidates.push({ epochMs: candidate2, offset: offset2 });

  // Also check with offsets +-1h to handle DST overlaps
  for (const delta of [-3600000, 3600000]) {
    const probeEpoch = candidate1 + delta;
    const probeOffset = _getOffsetMs(probeEpoch, tzId);
    const probeLocal = probeEpoch + probeOffset;
    if (probeLocal === localAsUtcMs && !candidates.some(c => c.epochMs === probeEpoch)) {
      candidates.push({ epochMs: probeEpoch, offset: probeOffset });
    }
  }

  if (candidates.length === 0) {
    // DST gap: local time doesn't exist
    if (disambiguation === 'reject') {
      throw new RangeError('Invalid local time (falls in DST gap); use disambiguation option');
    }
    // For gap: find the transition boundary
    // The gap is between two offsets.
    // "earlier" -> use pre-gap offset (local time maps before the gap, i.e. earlier UTC time)
    // "compatible"/"later" -> use post-gap offset (local time maps after the gap, i.e. later UTC time)
    // Actually spec says: earlier = clamp to pre-transition wall-clock, compatible/later = clamp to post-transition
    // With the pre-gap offset, epochMs = localAsUtcMs - preGapOffset
    // With the post-gap offset, epochMs = localAsUtcMs - postGapOffset
    // The pre-gap offset is larger (more positive / less negative), so the epoch is smaller (earlier in UTC)
    // The post-gap offset is smaller, so the epoch is larger
    // "earlier" wants the pre-transition instant, "later"/"compatible" wants the post-transition instant

    // Find pre-gap and post-gap offsets more robustly
    // Look at a range around the target time
    const before = _getOffsetMs(localAsUtcMs - estOffset - 86400000, tzId); // 1 day before
    const after = _getOffsetMs(localAsUtcMs - estOffset + 86400000, tzId);  // 1 day after

    let preGapOffset, postGapOffset;
    if (before > after || (before === after && estOffset > offset1)) {
      // Clock sprang forward: before offset is "bigger" (more ahead of UTC or less behind)
      // Wait, this is confusing. Let's think differently.
      // In a spring-forward gap at America/Vancouver:
      // Before gap: offset -08:00 (PST), After gap: offset -07:00 (PDT)
      // -07:00 > -08:00 in terms of milliseconds (-7*3600000 > -8*3600000)
      // So after > before
      preGapOffset = before; // -08:00 = -28800000
      postGapOffset = after; // -07:00 = -25200000
    } else {
      preGapOffset = after;
      postGapOffset = before;
    }

    if (disambiguation === 'earlier') {
      // Use pre-gap offset: the latest instant before the gap
      const epochMs = localAsUtcMs - preGapOffset;
      return { epochMs, offsetStr: _formatOffsetMs(preGapOffset) };
    }
    // compatible/later: use post-gap offset: the earliest instant after the gap
    const epochMs = localAsUtcMs - postGapOffset;
    return { epochMs, offsetStr: _formatOffsetMs(postGapOffset) };
  }

  if (candidates.length === 1) {
    // Unambiguous
    const c = candidates[0];
    return { epochMs: c.epochMs, offsetStr: _formatOffsetMs(c.offset) };
  }

  // DST overlap: ambiguous time (multiple valid instants)
  if (disambiguation === 'reject') {
    throw new RangeError('Ambiguous local time; use disambiguation option');
  }

  // Sort by epoch time (earlier first)
  candidates.sort((a, b) => a.epochMs - b.epochMs);

  if (disambiguation === 'later') {
    const c = candidates[candidates.length - 1];
    return { epochMs: c.epochMs, offsetStr: _formatOffsetMs(c.offset) };
  }
  // compatible/earlier: use the earlier instant
  const c = candidates[0];
  return { epochMs: c.epochMs, offsetStr: _formatOffsetMs(c.offset) };
}

function _formatOffsetMs(offsetMs) {
  const totalSeconds = Math.round(offsetMs / 1000);
  const sign = totalSeconds >= 0 ? '+' : '-';
  const absSeconds = Math.abs(totalSeconds);
  const offHr = String(Math.floor(absSeconds / 3600)).padStart(2, '0');
  const offMn = String(Math.floor((absSeconds % 3600) / 60)).padStart(2, '0');
  const offSc = absSeconds % 60;
  if (offSc !== 0) {
    return sign + offHr + ':' + offMn + ':' + String(offSc).padStart(2, '0');
  }
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
  const localMs = localAsUtcDate.getTime();
  // If the local time exceeds JS Date range (extreme boundaries), compute offset
  // using pure arithmetic via epoch days
  if (isNaN(localMs)) {
    const localEpochDays = isoDateToEpochDays(localYear, localMonth + 1, localDay);
    const localTotalMs = localEpochDays * 86400000 + localHour * 3600000 + localMinute * 60000 + localSecond * 1000;
    return localTotalMs - Math.floor(epochMs / 1000) * 1000;
  }
  return localMs - Math.floor(epochMs / 1000) * 1000;
}

// Helper: find the next or previous timezone transition via binary search
function _findTimeZoneTransition(zdt, dir) {
  const tzId = zdt.timeZoneId;
  if (tzId === 'UTC') return null; // UTC has no transitions
  // Fixed-offset timezones have no transitions
  if (/^[+-]\d{2}:\d{2}(:\d{2})?$/.test(tzId) || /^Etc\/GMT[+-]\d+$/.test(tzId)) return null;

  const epochNs = zdt.epochNanoseconds;
  const epochMs = Number(epochNs / 1000000n);

  // Max representable range in epoch ms
  const MIN_EPOCH_MS = -8640000000000000;
  const MAX_EPOCH_MS = 8640000000000000;

  if (dir === 'next') {
    // Search forward for the NEAREST transition after the current instant.
    // Handle sub-ms nanosecond precision: if we have fractional ns within the ms,
    // check if the ms boundary itself is a transition point. If the offset at
    // (epochMs - 1) differs from the offset at epochMs, the transition IS at epochMs,
    // and since our actual position is epochMs + subMsNs (past the ms boundary by < 1ms
    // but at the same ms in integer terms), the transition at epochMs is the "next" one
    // only if subMsNs < 0 (i.e., we're actually before the ms boundary).
    const subMsNs = epochNs - BigInt(epochMs) * 1000000n;
    const clampedStart = Math.min(Math.max(epochMs, MIN_EPOCH_MS), MAX_EPOCH_MS);
    if (clampedStart >= MAX_EPOCH_MS) return null;

    // For negative sub-ms nanoseconds (or exact 0), check if we're right before a transition
    if (subMsNs < 0n && clampedStart > MIN_EPOCH_MS) {
      // subMsNs < 0 means epochNs / 1000000n truncated away from zero, so epochMs is 1 past
      // the actual ms. Check epochMs-1 vs epochMs.
      const beforeOffset = _getOffsetMs(clampedStart - 1, tzId);
      const atOffset = _getOffsetMs(clampedStart, tzId);
      if (beforeOffset !== atOffset) {
        // Transition at clampedStart ms - return it
        const transitionNs = BigInt(clampedStart) * 1000000n;
        const isoStr = bigintNsToZdtString(transitionNs, tzId, zdt.calendarId);
        return call(() => {
          const inner = NapiZonedDateTime.from(isoStr);
          return new ZonedDateTime(inner);
        });
      }
    }

    let prevMs = clampedStart;
    let prevOffset = _getOffsetMs(clampedStart, tzId);

    // Max search range: ~200 years
    const maxMs = Math.min(clampedStart + 200 * 365.25 * 86400000, MAX_EPOCH_MS);
    const tier1End = Math.min(clampedStart + 2 * 365.25 * 86400000, maxMs);

    let lo = -1, hi = -1;
    // Tier 1: 7-day steps for first 2 years
    let probeMs = clampedStart + 6 * 86400000;
    while (probeMs <= tier1End) {
      const probeOffset = _getOffsetMs(probeMs, tzId);
      if (probeOffset !== prevOffset) {
        lo = prevMs;
        hi = probeMs;
        break;
      }
      prevMs = probeMs;
      prevOffset = probeOffset;
      probeMs += 6 * 86400000;
    }
    // Tier 2: 90-day steps for remaining range
    if (lo === -1) {
      if (probeMs > tier1End) probeMs = tier1End;
      prevMs = probeMs - 6 * 86400000;
      prevOffset = _getOffsetMs(prevMs, tzId);
      probeMs = prevMs + 90 * 86400000;
      while (probeMs <= maxMs) {
        const probeOffset = _getOffsetMs(probeMs, tzId);
        if (probeOffset !== prevOffset) {
          lo = prevMs;
          hi = probeMs;
          break;
        }
        prevMs = probeMs;
        prevOffset = probeOffset;
        probeMs += 90 * 86400000;
      }
    }
    // Check the very end of the range
    if (lo === -1 && maxMs > prevMs) {
      const endOffset = _getOffsetMs(Math.floor(maxMs), tzId);
      if (endOffset !== prevOffset) {
        lo = prevMs;
        hi = Math.floor(maxMs);
      }
    }
    if (lo === -1) return null; // No transition found

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
    // Clamp to representable range
    if (transitionNs > 8640000000000000000000n || transitionNs < -8640000000000000000000n) return null;
    const isoStr = bigintNsToZdtString(transitionNs, tzId, zdt.calendarId);
    return call(() => {
      const inner = NapiZonedDateTime.from(isoStr);
      return new ZonedDateTime(inner);
    });
  } else {
    // Search backward: find the most recent transition BEFORE the current instant
    // Handle nanosecond precision
    const subMsNs = epochNs - BigInt(epochMs) * 1000000n;
    let searchFromMs;
    let searchFromOffset;

    // Clamp epochMs to valid Date range for offset computation
    const clampedEpochMs = Math.max(epochMs, MIN_EPOCH_MS);
    const currentOffset = _getOffsetMs(clampedEpochMs, tzId);
    if (clampedEpochMs <= MIN_EPOCH_MS) {
      // At or below minimum epoch: no previous transitions possible
      return null;
    }
    if (subMsNs > 0n) {
      const prevMsOffset = _getOffsetMs(clampedEpochMs - 1, tzId);
      if (prevMsOffset !== currentOffset) {
        // Transition at this exact ms boundary
        const transitionNs = BigInt(clampedEpochMs) * 1000000n;
        const isoStr = bigintNsToZdtString(transitionNs, tzId, zdt.calendarId);
        return call(() => {
          const inner = NapiZonedDateTime.from(isoStr);
          return new ZonedDateTime(inner);
        });
      }
      searchFromMs = clampedEpochMs - 1;
      searchFromOffset = prevMsOffset;
    } else {
      searchFromMs = clampedEpochMs - 1;
      searchFromOffset = _getOffsetMs(searchFromMs, tzId);
    }

    // Sweep backward: tiered 7-day then 90-day steps
    const minMs = Math.max(searchFromMs - 200 * 365.25 * 86400000, MIN_EPOCH_MS);
    const tier1End = Math.max(searchFromMs - 2 * 365.25 * 86400000, minMs);
    let prevMs = searchFromMs;
    let prevOffset = searchFromOffset;
    let lo = -1, hi = -1;
    // Tier 1: 7-day steps for first 2 years back
    let probeMs = searchFromMs - 6 * 86400000;
    while (probeMs >= tier1End) {
      const probeOffset = _getOffsetMs(probeMs, tzId);
      if (probeOffset !== prevOffset) {
        lo = probeMs;
        hi = prevMs;
        break;
      }
      prevMs = probeMs;
      prevOffset = probeOffset;
      probeMs -= 6 * 86400000;
    }
    // Tier 2: 90-day steps for remaining range
    if (lo === -1) {
      probeMs = prevMs - 90 * 86400000;
      while (probeMs >= minMs) {
        const probeOffset = _getOffsetMs(probeMs, tzId);
        if (probeOffset !== prevOffset) {
          lo = probeMs;
          hi = prevMs;
          break;
        }
        prevMs = probeMs;
        prevOffset = probeOffset;
        probeMs -= 90 * 86400000;
      }
    }
    // Check the very start of the range
    if (lo === -1 && prevMs > minMs) {
      const startOffset = _getOffsetMs(Math.ceil(minMs), tzId);
      if (startOffset !== prevOffset) {
        lo = Math.ceil(minMs);
        hi = prevMs;
      }
    }
    if (lo === -1) return null; // No transition found

    // Binary search: lo has different offset from hi
    // We want to find the boundary: the earliest ms with same offset as searchFromOffset
    // (which equals the offset at hi)
    const hiOffset = _getOffsetMs(hi, tzId);
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      const midOffset = _getOffsetMs(mid, tzId);
      if (midOffset === hiOffset) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    // hi is the first ms with the current period's offset; the transition is at hi
    const transitionNs = BigInt(hi) * 1000000n;
    if (transitionNs > 8640000000000000000000n || transitionNs < -8640000000000000000000n) return null;
    const isoStr = bigintNsToZdtString(transitionNs, tzId, zdt.calendarId);
    return call(() => {
      const inner = NapiZonedDateTime.from(isoStr);
      return new ZonedDateTime(inner);
    });
  }
}

// Helper: validate a ZonedDateTime string for sub-minute offset and timezone validity
function _validateZdtString(str) {
  const tzMatch = str.match(/\[([^\]=]+)\]/);
  if (!tzMatch) return;
  const tzId = tzMatch[1];
  // Reject sub-minute timezone identifiers (e.g. -00:44:59)
  if (/^[+-]\d{2}:\d{2}:\d{2}/.test(tzId)) {
    throw new RangeError(`"${tzId}" is not a valid time zone identifier (sub-minute offsets not allowed)`);
  }
  // Extract the offset from the string
  const bracketIdx = str.indexOf('[');
  const dtOffsetStr = str.substring(0, bracketIdx);
  const offsetMatch = dtOffsetStr.match(/([+-])(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/);
  if (offsetMatch && /^[+-]\d{2}:\d{2}$/.test(tzId)) {
    // Fixed-offset timezone: the string offset must match exactly
    // The timezone is HH:MM, so the string offset must also have zero seconds
    const oS = offsetMatch[4] ? parseInt(offsetMatch[4], 10) : 0;
    const oFrac = offsetMatch[5] ? parseInt(offsetMatch[5], 10) : 0;
    if (oS !== 0 || oFrac !== 0) {
      // Check if the offset rounds to the timezone
      const sign = offsetMatch[1] === '+' ? 1 : -1;
      const oH = parseInt(offsetMatch[2], 10);
      const oM = parseInt(offsetMatch[3], 10);
      const totalOffsetSeconds = sign * (oH * 3600 + oM * 60 + oS);
      const tzSign = tzId[0] === '+' ? 1 : -1;
      const tzH = parseInt(tzId.substring(1, 3), 10);
      const tzM = parseInt(tzId.substring(4, 6), 10);
      const tzTotalSeconds = tzSign * (tzH * 3600 + tzM * 60);
      if (totalOffsetSeconds !== tzTotalSeconds) {
        throw new RangeError(`Offset ${offsetMatch[0]} does not match time zone ${tzId}`);
      }
    }
  }
  // Check for IANA timezones with sub-minute offsets
  if (offsetMatch && !/^[+-]/.test(tzId)) {
    // Named timezone: the string has an explicit offset with seconds component
    // Per spec: for named timezones, the offset in the string must be within
    // the range that rounds to a valid offset for the timezone at that instant.
    // The NAPI handles this validation, but we need to check if the seconds
    // component of the offset is valid for this timezone.
    const oS = offsetMatch[4] ? parseInt(offsetMatch[4], 10) : 0;
    const oFrac = offsetMatch[5] ? parseInt(offsetMatch[5], 10) : 0;
    if (oFrac !== 0) {
      // Sub-second offsets with non-zero fractional parts need exact match
      // The NAPI will handle this, but let's not interfere
    }
  }
}

// Helper: validate that a ZDT string's date/time components are within representable range
function _validateZdtStringLimits(str) {
  const bracketIdx = str.indexOf('[');
  if (bracketIdx === -1) return;
  const dtOffsetStr = str.substring(0, bracketIdx);
  // Extract year
  const yearMatch = dtOffsetStr.match(/^([+-]?\d{4,6})/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    if (year === -271821) {
      // Check if this might be out of range
      const monthMatch = dtOffsetStr.match(/^[+-]?\d{4,6}-(\d{2})-(\d{2})/);
      if (monthMatch) {
        const month = parseInt(monthMatch[1], 10);
        const day = parseInt(monthMatch[2], 10);
        if (month < 4 || (month === 4 && day < 20)) {
          throw new RangeError(`"${str}" is outside the representable range for a relativeTo parameter`);
        }
      }
    } else if (year === 275760) {
      const monthMatch = dtOffsetStr.match(/^[+-]?\d{4,6}-(\d{2})-(\d{2})/);
      if (monthMatch) {
        const month = parseInt(monthMatch[1], 10);
        const day = parseInt(monthMatch[2], 10);
        if (month > 9 || (month === 9 && day > 13)) {
          throw new RangeError(`"${str}" is outside the representable range for a relativeTo parameter`);
        }
      }
    } else if (year < -271821 || year > 275760) {
      throw new RangeError(`"${str}" is outside the representable range for a relativeTo parameter`);
    }
  }
}

// Helper: extract ISO date components from a NAPI PlainDateTime/PlainDate toString()
function _extractISOFromNapiDT(inner) {
  const str = inner.toString();
  const m = str.match(/^(-?\d+|\+\d+)-(\d{2})-(\d{2})/);
  if (!m) return { year: inner.year, month: inner.month, day: inner.day };
  return { year: parseInt(m[1], 10), month: parseInt(m[2], 10), day: parseInt(m[3], 10) };
}

// Helper: parse a ZDT string into its component parts
function _parseZdtStringParts(str) {
  const tzMatch = str.match(/\[([^\]=]+)\]/);
  if (!tzMatch) return null;
  const tzId = tzMatch[1];
  const bracketIdx = str.indexOf('[');
  let dtStr = str.substring(0, bracketIdx);
  // Strip offset if present
  const offsetMatch = dtStr.match(/([+-])(\d{2}):?(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/);
  if (offsetMatch) dtStr = dtStr.substring(0, offsetMatch.index);
  else if (dtStr.endsWith('Z')) dtStr = dtStr.slice(0, -1);
  // Parse ISO date-time
  const m = dtStr.match(/^([+-]?\d{4,6})-(\d{2})-(\d{2})(?:T(\d{2}):?(\d{2}):?(\d{2})?(?:\.(\d+))?)?$/);
  if (!m) {
    // Try compact form
    const m2 = dtStr.match(/^([+-]?\d{4,6})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(?:\.(\d+))?)?$/);
    if (!m2) return null;
    const frac = m2[7] || '';
    const fracPad = (frac + '000000000').substring(0, 9);
    return {
      isoYear: parseInt(m2[1], 10), isoMonth: parseInt(m2[2], 10), isoDay: parseInt(m2[3], 10),
      hour: parseInt(m2[4] || '0', 10), minute: parseInt(m2[5] || '0', 10), second: parseInt(m2[6] || '0', 10),
      millisecond: parseInt(fracPad.substring(0, 3), 10),
      microsecond: parseInt(fracPad.substring(3, 6), 10),
      nanosecond: parseInt(fracPad.substring(6, 9), 10),
      tzId
    };
  }
  const frac = m[7] || '';
  const fracPad = (frac + '000000000').substring(0, 9);
  return {
    isoYear: parseInt(m[1], 10), isoMonth: parseInt(m[2], 10), isoDay: parseInt(m[3], 10),
    hour: parseInt(m[4] || '0', 10), minute: parseInt(m[5] || '0', 10), second: parseInt(m[6] || '0', 10),
    millisecond: parseInt(fracPad.substring(0, 3), 10),
    microsecond: parseInt(fracPad.substring(3, 6), 10),
    nanosecond: parseInt(fracPad.substring(6, 9), 10),
    tzId
  };
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

  // Compute epoch nanoseconds from the local datetime string using pure arithmetic
  // to handle dates at the edges of the representable range (NapiInstant can't handle
  // local times beyond the instant range even if the result after offset would be in range)
  let instantEpochNs;
  const dtMatch = dtStr.match(/^([+-]?\d{4,6})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?$/);
  if (dtMatch) {
    const [, yr, mo, dy, hr, mi, se, frac] = dtMatch;
    const epochDays = BigInt(isoDateToEpochDays(parseInt(yr, 10), parseInt(mo, 10), parseInt(dy, 10)));
    const dayNs = BigInt(parseInt(hr, 10)) * 3600000000000n + BigInt(parseInt(mi, 10)) * 60000000000n + BigInt(parseInt(se || '0', 10)) * 1000000000n;
    let fracNs = 0n;
    if (frac) { fracNs = BigInt((frac + '000000000').substring(0, 9)); }
    instantEpochNs = epochDays * 86400000000000n + dayNs + fracNs;
  } else {
    // Fallback: try NapiInstant
    const instant = call(() => NapiInstant.from(dtStr + 'Z'));
    instantEpochNs = computeEpochNanoseconds(instant);
  }
  // epochNs = datetime_as_utc - offsetNs (because datetime = UTC + offset, so UTC = datetime - offset)
  const epochNs = instantEpochNs - offsetNs;

  // Validate epoch nanoseconds range
  const limit = 8640000000000000000000n;
  if (epochNs < -limit || epochNs > limit) {
    throw new RangeError('Instant nanoseconds are not within a valid epoch range.');
  }

  // Create ZDT from epoch nanoseconds + timezone using the ZonedDateTime constructor
  // which handles extreme values with proper fallbacks
  return new ZonedDateTime(epochNs, tzId, calId !== 'iso8601' ? calId : undefined);
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
  // Compute offset inline to avoid redundant getLocalPartsFromEpoch call
  let offset;
  if (tzId === 'UTC') {
    offset = '+00:00';
  } else if (/^[+-]\d{2}:\d{2}(:\d{2})?$/.test(tzId)) {
    offset = tzId;
  } else {
    // Compute offset from local parts (already computed above)
    const localAsUtcDate = new Date(0);
    localAsUtcDate.setUTCFullYear(year, parseInt(month, 10) - 1, parseInt(day, 10));
    localAsUtcDate.setUTCHours(hour, parseInt(minute, 10), parseInt(second, 10), 0);
    const localAsUtc = localAsUtcDate.getTime();
    const offsetMs = localAsUtc - Math.floor(msNum / 1000) * 1000;
    const totalSeconds = Math.round(offsetMs / 1000);
    const sign = totalSeconds >= 0 ? '+' : '-';
    const absSeconds = Math.abs(totalSeconds);
    const offHr = String(Math.floor(absSeconds / 3600)).padStart(2, '0');
    const offMn = String(Math.floor((absSeconds % 3600) / 60)).padStart(2, '0');
    const offSc = absSeconds % 60;
    offset = offSc !== 0 ? sign + offHr + ':' + offMn + ':' + String(offSc).padStart(2, '0') : sign + offHr + ':' + offMn;
  }
  const calPart = calId && calId !== 'iso8601' ? '[u-ca=' + calId + ']' : '';
  return yearStr + '-' + month + '-' + day + 'T' + String(hour).padStart(2, '0') + ':' + minute + ':' + second + fracPart + offset + '[' + tzId + ']' + calPart;
}

// ─── Helper: round a value to a given increment with rounding mode ──

function _roundToIncrement(value, increment, mode) {
  const quotient = value / increment;
  let rounded;
  switch (mode) {
    case 'ceil': rounded = Math.ceil(quotient); break;
    case 'floor': rounded = Math.floor(quotient); break;
    case 'trunc': rounded = Math.trunc(quotient); break;
    case 'expand': rounded = quotient >= 0 ? Math.ceil(quotient) : Math.floor(quotient); break;
    case 'halfExpand': rounded = Math.round(quotient); break;
    case 'halfTrunc':
      rounded = quotient >= 0
        ? (quotient % 1 > 0.5 ? Math.ceil(quotient) : Math.floor(quotient))
        : (quotient % 1 < -0.5 ? Math.floor(quotient) : Math.ceil(quotient));
      break;
    case 'halfCeil':
      rounded = quotient % 1 >= 0.5 || quotient % 1 <= -0.5 ? Math.ceil(quotient) : Math.floor(quotient);
      break;
    case 'halfFloor':
      rounded = quotient % 1 > 0.5 || quotient % 1 < -0.5 ? Math.ceil(quotient) : Math.floor(quotient);
      break;
    case 'halfEven': {
      const lo = Math.floor(quotient);
      const hi = Math.ceil(quotient);
      const diff = quotient - lo;
      if (diff < 0.5) rounded = lo;
      else if (diff > 0.5) rounded = hi;
      else rounded = lo % 2 === 0 ? lo : hi;
      break;
    }
    default: rounded = Math.round(quotient); break;
  }
  return rounded * increment;
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

// ─── Helpers: type-check Temporal wrapper objects WITHOUT triggering Proxy traps ───
// These use _wrapperSet (a WeakSet populated in constructors) so that property bag
// Proxies (like test262's TemporalHelpers.propertyBagObserver) don't get spurious
// "has _inner" / "get _inner" trap calls.
function _isTemporalDuration(arg) {
  return arg != null && typeof arg === 'object' && _wrapperSet.has(arg) && arg._inner instanceof NapiDuration;
}
function _isTemporalPlainDate(arg) {
  return arg != null && typeof arg === 'object' && _wrapperSet.has(arg) && arg._inner instanceof NapiPlainDate;
}
function _isTemporalPlainTime(arg) {
  return arg != null && typeof arg === 'object' && _wrapperSet.has(arg) && arg._inner instanceof NapiPlainTime;
}
function _isTemporalPlainDateTime(arg) {
  return arg != null && typeof arg === 'object' && _wrapperSet.has(arg) && arg._inner instanceof NapiPlainDateTime;
}
function _isTemporalZonedDateTime(arg) {
  return arg != null && typeof arg === 'object' && _wrapperSet.has(arg) && arg._inner instanceof NapiZonedDateTime;
}
function _isTemporalInstant(arg) {
  return arg != null && typeof arg === 'object' && _wrapperSet.has(arg) && arg._inner instanceof NapiInstant;
}
function _isTemporalPlainYearMonth(arg) {
  return arg != null && typeof arg === 'object' && _wrapperSet.has(arg) && arg._inner instanceof NapiPlainYearMonth;
}
function _isTemporalPlainMonthDay(arg) {
  return arg != null && typeof arg === 'object' && _wrapperSet.has(arg) && arg._inner instanceof NapiPlainMonthDay;
}

function toNapiDuration(arg) {
  if (arg instanceof NapiDuration) return arg;
  if (_isTemporalDuration(arg)) return arg._inner;
  if (typeof arg === 'string') return call(() => NapiDuration.from(arg));
  if (typeof arg === 'object' && arg !== null) {
    // Per spec (ToTemporalDurationRecord): read properties in ALPHABETICAL order,
    // coercing each immediately after reading
    const _days = arg.days;
    const daysVal = toIntegerIfIntegral(_days);
    const _hours = arg.hours;
    const hoursVal = toIntegerIfIntegral(_hours);
    const _microseconds = arg.microseconds;
    const microsecondsVal = toIntegerIfIntegral(_microseconds);
    const _milliseconds = arg.milliseconds;
    const millisecondsVal = toIntegerIfIntegral(_milliseconds);
    const _minutes = arg.minutes;
    const minutesVal = toIntegerIfIntegral(_minutes);
    const _months = arg.months;
    const monthsVal = toIntegerIfIntegral(_months);
    const _nanoseconds = arg.nanoseconds;
    const nanosecondsVal = toIntegerIfIntegral(_nanoseconds);
    const _seconds = arg.seconds;
    const secondsVal = toIntegerIfIntegral(_seconds);
    const _weeks = arg.weeks;
    const weeksVal = toIntegerIfIntegral(_weeks);
    const _years = arg.years;
    const yearsVal = toIntegerIfIntegral(_years);
    // Per spec, at least one duration-like property must be present
    if (_days === undefined && _hours === undefined && _microseconds === undefined &&
        _milliseconds === undefined && _minutes === undefined && _months === undefined &&
        _nanoseconds === undefined && _seconds === undefined && _weeks === undefined && _years === undefined) {
      throw new TypeError('Invalid duration-like argument: at least one property must be present');
    }
    return call(() => new NapiDuration(
      yearsVal, monthsVal, weeksVal, daysVal,
      hoursVal, minutesVal, secondsVal,
      millisecondsVal, microsecondsVal, nanosecondsVal,
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
      if (targetYear !== undefined) {
        const leapBase = getChineseDangiLeapMonth(targetYear, calendarId);
        if (leapBase === monthNum) {
          // The leap month exists in this year, M{N}L → N+1
          return monthNum + 1;
        }
        // Constrain: leap month doesn't exist in this year
        // Map to the base month M{N} → use the month number for M{N} in the target year
        if (leapBase > 0 && monthNum > leapBase) {
          // Target year has a different leap month before this month
          return monthNum + 1;
        }
        return monthNum;
      }
      // No target year: M{N}L → N+1
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
    // Check if it looks like a time string (e.g. "15:23", "152330", "T15:23:30", "15")
    const timeStr = calArg.startsWith('T') || calArg.startsWith('t') ? calArg.substring(1) : calArg;
    if (/^\d{2}(:\d{2}(:\d{2})?)?/.test(timeStr) || /^\d{6}/.test(timeStr) || /^\d{4}$/.test(timeStr) || /^\d{2}$/.test(timeStr)) {
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

  // The NAPI handles ethioaa years directly (no conversion needed)

  const cal = toNapiCalendar(calId);

  // For month-aligned calendars (buddhist, roc, japanese), only the year differs
  if (ISO_MONTH_ALIGNED_CALENDARS.has(calId)) {
    let isoYear = targetCalYear;
    // For calendars with known fixed offsets, compute directly to avoid NAPI range issues
    if (calId === 'buddhist') {
      isoYear = targetCalYear - 543;
    } else if (calId === 'roc') {
      isoYear = targetCalYear + 1911;
    } else {
      try {
        let d = new NapiPlainDate(isoYear, calMonth || 6, calDay || 15, cal);
        let diff = targetCalYear - d.year;
        for (let i = 0; i < 10 && diff !== 0; i++) {
          isoYear += diff;
          try {
            d = new NapiPlainDate(isoYear, calMonth || 6, calDay || 15, cal);
          } catch {
            try {
              d = new NapiPlainDate(isoYear, 1, 1, cal);
            } catch { break; }
          }
          diff = targetCalYear - d.year;
        }
      } catch {
        // Fallback: return as-is
      }
    }
    return { isoYear, isoMonth: calMonth, isoDay: calDay };
  }

  // For all other calendars (indian, persian, coptic, ethiopic, ethioaa, hebrew,
  // islamic-*, chinese, dangi), months don't align with ISO months.
  // Strategy: find the ISO date that corresponds to (calYear, calMonth, calDay).
  // 1. Find approximate ISO year via mid-year probe
  // 2. Then scan for the exact date by iterating ISO dates and checking calendar fields

  // Estimate the initial ISO year based on known calendar offsets to avoid NAPI range errors
  let isoYear = targetCalYear;
  if (calId === 'coptic') {
    isoYear = targetCalYear + 284; // Coptic year 1 ≈ 284 CE
  } else if (calId === 'ethiopic' || calId === 'ethioaa' || calId === 'ethiopian') {
    isoYear = targetCalYear + 8; // Ethiopian year 1 ≈ 8 CE (ethioaa: year 1 ≈ 5493 BCE)
    if (calId === 'ethioaa') {
      isoYear = targetCalYear - 5492; // ethioaa epoch is ~5493 BCE
    }
  } else if (calId === 'indian') {
    isoYear = targetCalYear + 78; // Indian national calendar epoch
  } else if (calId === 'persian') {
    isoYear = targetCalYear + 621; // Persian calendar epoch
  } else if (calId === 'hebrew') {
    isoYear = targetCalYear - 3760; // Hebrew calendar epoch
  } else if (calId === 'islamic-civil' || calId === 'islamic-tbla' || calId === 'islamic-umalqura' || calId === 'islamic-rgsa') {
    // Islamic year ~354 days, so: ISO ≈ 622 + calYear * 354/365
    isoYear = Math.round(622 + targetCalYear * 354 / 365);
  }
  try {
    // Step 1: Refine ISO year estimate via mid-year probe
    // Clamp to valid ISO range to avoid NAPI errors at boundaries
    isoYear = Math.max(-271821, Math.min(275760, isoYear));
    let d = new NapiPlainDate(isoYear, 6, 15, cal);
    let diff = targetCalYear - d.year;
    for (let i = 0; i < 15 && diff !== 0; i++) {
      isoYear = Math.max(-271821, Math.min(275760, isoYear + diff));
      try {
        d = new NapiPlainDate(isoYear, 6, 15, cal);
      } catch {
        try { d = new NapiPlainDate(isoYear, 1, 1, cal); } catch { break; }
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
    // Also include boundary probe points for extreme ISO years (-271821-04-19 and 275760-09-13)
    for (let yOff = -1; yOff <= 1; yOff++) {
      const tryIsoYear = isoYear + yOff;
      for (let m = 1; m <= 12; m++) {
        const probeDays = [1, 8, 15, 22, 28];
        // At ISO boundaries, add the exact boundary date as a probe point
        if (tryIsoYear === -271821 && m === 4) probeDays.push(19, 20);
        if (tryIsoYear === 275760 && m === 9) probeDays.push(13);
        for (const tryDay of probeDays) {
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
// Howard Hinnant's days_from_civil algorithm for extreme values
// Reference: https://howardhinnant.github.io/date_algorithms.html#days_from_civil
function isoDateToEpochDays(year, month, day) {
  // For values within JS Date range, use Date.UTC for speed
  if (year > -271000 && year < 275000) {
    const ms = Date.UTC(year, month - 1, day);
    if (year >= 0 && year <= 99) {
      const d = new Date(ms);
      d.setUTCFullYear(year);
      return Math.floor(d.getTime() / 86400000);
    }
    if (!isNaN(ms)) return Math.floor(ms / 86400000);
  }
  // Pure arithmetic for extreme values
  const y = month <= 2 ? year - 1 : year;
  const m = month <= 2 ? month + 9 : month - 3;
  const era = _trunc((y >= 0 ? y : y - 399) / 400);
  const yoe = y - era * 400;
  const doy = _trunc((153 * m + 2) / 5) + day - 1;
  const doe = yoe * 365 + _trunc(yoe / 4) - _trunc(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

// Helper: convert epoch days back to ISO date
// Uses pure arithmetic to handle values beyond JavaScript Date range
function epochDaysToISO(epochDays) {
  // For values within JS Date range, use Date for speed
  if (epochDays > -100000000 && epochDays < 100000000) {
    const ms = epochDays * 86400000;
    const d = new Date(ms);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }
  // Pure arithmetic for extreme values (Howard Hinnant's civil_from_days algorithm)
  // Reference: https://howardhinnant.github.io/date_algorithms.html#civil_from_days
  let z = epochDays + 719468; // days from year 0 (March 1 epoch)
  const era = _trunc((z >= 0 ? z : z - 146096) / 146097);
  const doe = z - era * 146097; // day of era [0, 146096]
  const yoe = _trunc((doe - _trunc(doe / 1460) + _trunc(doe / 36524) - _trunc(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + _trunc(yoe / 4) - _trunc(yoe / 100));
  const mp = _trunc((5 * doy + 2) / 153);
  const day = doy - _trunc((153 * mp + 2) / 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  const year = y + (month <= 2 ? 1 : 0);
  return { year, month, day };
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
function _isoDaysInMonth(year, month) {
  const isLeap = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0));
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return daysInMonth[month - 1] || 31;
}

// Helper: get the maximum month number for a calendar year
function _getMaxMonthForCalendarYear(calId, calYear) {
  if (THIRTEEN_MONTH_CALENDARS.has(calId)) {
    if (calId === 'chinese' || calId === 'dangi') {
      const leapBase = getChineseDangiLeapMonth(calYear, calId);
      return leapBase > 0 ? 13 : 12;
    }
    if (calId === 'hebrew') {
      return isHebrewLeapYear(calYear) ? 13 : 12;
    }
    // Coptic, ethiopic, ethioaa always have 13 months
    return 13;
  }
  return 12;
}

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


// Helper: get the monthCode for a given ordinal month in a calendar year
function _getMonthCodeForOrdinal(calYear, ordinalMonth, calId) {
  if (calId === 'iso8601' || calId === 'gregory' || ISO_MONTH_ALIGNED_CALENDARS.has(calId)) {
    return 'M' + String(ordinalMonth).padStart(2, '0');
  }
  try {
    const iso = calendarDateToISO(calYear, ordinalMonth, 1, calId);
    const cal = toNapiCalendar(calId);
    const probe = new NapiPlainDate(iso.isoYear, iso.isoMonth, iso.isoDay, cal);
    if (probe.year === calYear && probe.month === ordinalMonth) {
      return probe.monthCode;
    }
  } catch { /* fallback */ }
  // Fallback: simple mapping
  if (calId === 'hebrew') {
    if (isHebrewLeapYear(calYear)) {
      if (ordinalMonth === 6) return 'M05L';
      if (ordinalMonth > 6) return 'M' + String(ordinalMonth - 1).padStart(2, '0');
    }
    return 'M' + String(ordinalMonth).padStart(2, '0');
  }
  if (calId === 'chinese' || calId === 'dangi') {
    const leapBase = getChineseDangiLeapMonth(calYear, calId);
    if (leapBase > 0 && ordinalMonth === leapBase + 1) {
      return 'M' + String(leapBase).padStart(2, '0') + 'L';
    }
    if (leapBase > 0 && ordinalMonth > leapBase + 1) {
      return 'M' + String(ordinalMonth - 1).padStart(2, '0');
    }
  }
  return 'M' + String(ordinalMonth).padStart(2, '0');
}

// ─── Helper: convert to NAPI PlainDate ────────────────────────

function toNapiPlainDate(arg) {
  if (arg instanceof NapiPlainDate) return arg;
  if (_isTemporalPlainDate(arg)) return arg._inner;
  if (typeof arg === 'string') { rejectTooManyFractionalSeconds(arg); return call(() => NapiPlainDate.from(arg)); }
  if (typeof arg === 'object' && arg !== null) {
    // Accept PlainDateTime-like objects too (they have year/month/day)
    if (_isTemporalPlainDateTime(arg)) {
      const dt = arg._inner;
      return call(() => new NapiPlainDate(dt.year, dt.month, dt.day, dt.calendar));
    }
    if (_isTemporalZonedDateTime(arg)) {
      return arg._inner.toPlainDate();
    }
    // Per spec: read fields in ALPHABETICAL order, coercing each immediately
    const _calendar = arg.calendar;
    const calId = getCalendarId(_calendar);
    const cal = toNapiCalendar(_calendar);
    const _day = arg.day;
    const dayVal = toInteger(_day);
    const _month = arg.month;
    const monthRaw = toInteger(_month);
    const _monthCode = arg.monthCode;
    const monthCodeStr = _monthCode !== undefined ? toStringOption(_monthCode) : undefined;
    const _year = arg.year;
    const yearVal = toInteger(_year);
    // Resolve era/eraYear for calendars that support them (don't read for ISO)
    let resolvedYear = yearVal;
    const _calValidEras = VALID_ERAS[calId];
    if (_calValidEras && _calValidEras.size > 0) {
      const eraFields = { year: yearVal, era: arg.era, eraYear: toInteger(arg.eraYear) };
      resolveEraYear(eraFields, calId);
      resolvedYear = eraFields.year;
    }
    // Resolve month from pre-read values
    const monthBag = { month: monthRaw, monthCode: monthCodeStr };
    const month = resolveMonth(monthBag, calId, resolvedYear);
    if (resolvedYear !== undefined && month !== undefined && dayVal !== undefined) {
      rejectPropertyBagInfinity({ year: resolvedYear, month, day: dayVal }, 'year', 'month', 'day');
      const iso = calendarDateToISO(resolvedYear, month, dayVal, calId);
      return call(() => new NapiPlainDate(iso.isoYear, iso.isoMonth, iso.isoDay, cal));
    }
    if (resolvedYear === undefined) throw new TypeError('Required property year is missing');
    if (month === undefined && _monthCode === undefined) throw new TypeError('Required property month or monthCode is missing');
    if (dayVal === undefined) throw new TypeError('Required property day is missing');
    throw new TypeError('Missing required date fields');
  }
  throw new TypeError('Invalid PlainDate argument');
}

// ─── Helper: convert to NAPI PlainTime ────────────────────────

function toNapiPlainTime(arg) {
  if (arg instanceof NapiPlainTime) return arg;
  if (_isTemporalPlainTime(arg)) return arg._inner;
  if (typeof arg === 'string') { rejectTooManyFractionalSeconds(arg); return call(() => NapiPlainTime.from(arg)); }
  if (typeof arg === 'object' && arg !== null) {
    if (_isTemporalPlainDateTime(arg)) {
      const dt = arg._inner;
      return call(() => new NapiPlainTime(dt.hour, dt.minute, dt.second, dt.millisecond, dt.microsecond, dt.nanosecond));
    }
    if (_isTemporalZonedDateTime(arg)) {
      return arg._inner.toPlainTime();
    }
    // Per spec: read time fields in ALPHABETICAL order, coercing each immediately
    const _hour = arg.hour;
    const hourVal = _hour !== undefined ? toIntegerWithTruncation(_hour) : undefined;
    const _microsecond = arg.microsecond;
    const microsecondVal = _microsecond !== undefined ? toIntegerWithTruncation(_microsecond) : undefined;
    const _millisecond = arg.millisecond;
    const millisecondVal = _millisecond !== undefined ? toIntegerWithTruncation(_millisecond) : undefined;
    const _minute = arg.minute;
    const minuteVal = _minute !== undefined ? toIntegerWithTruncation(_minute) : undefined;
    const _nanosecond = arg.nanosecond;
    const nanosecondVal = _nanosecond !== undefined ? toIntegerWithTruncation(_nanosecond) : undefined;
    const _second = arg.second;
    const secondVal = _second !== undefined ? toIntegerWithTruncation(_second) : undefined;
    // Per spec, at least one time-like property must be present
    if (_hour === undefined && _microsecond === undefined && _millisecond === undefined &&
        _minute === undefined && _nanosecond === undefined && _second === undefined) {
      throw new TypeError('Invalid PlainTime argument: at least one time property must be present');
    }
    return call(() => new NapiPlainTime(
      hourVal || 0,
      minuteVal || 0,
      secondVal || 0,
      millisecondVal,
      microsecondVal,
      nanosecondVal,
    ));
  }
  throw new TypeError('Invalid PlainTime argument');
}

// ─── Helper: convert to NAPI PlainDateTime ────────────────────

function toNapiPlainDateTime(arg) {
  if (arg instanceof NapiPlainDateTime) return arg;
  if (_isTemporalPlainDateTime(arg)) return arg._inner;
  if (typeof arg === 'string') { rejectTooManyFractionalSeconds(arg); return call(() => NapiPlainDateTime.from(arg)); }
  if (typeof arg === 'object' && arg !== null) {
    if (_isTemporalPlainDate(arg)) {
      const d = arg._inner;
      return call(() => new NapiPlainDateTime(d.year, d.month, d.day, 0, 0, 0, 0, 0, 0, d.calendar));
    }
    if (_isTemporalZonedDateTime(arg)) {
      return arg._inner.toPlainDateTime();
    }
    // Per spec: read fields in ALPHABETICAL order, coercing each immediately
    const _calendar = arg.calendar;
    const calId = getCalendarId(_calendar);
    const cal = toNapiCalendar(_calendar);
    const _day = arg.day;
    const day = toInteger(_day);
    const _hour = arg.hour;
    const hour = toInteger(_hour);
    const _microsecond = arg.microsecond;
    const microsecond = toInteger(_microsecond);
    const _millisecond = arg.millisecond;
    const millisecond = toInteger(_millisecond);
    const _minute = arg.minute;
    const minute = toInteger(_minute);
    const _month = arg.month;
    const monthRaw = toInteger(_month);
    const _monthCode = arg.monthCode;
    const monthCodeStr = _monthCode !== undefined ? toStringOption(_monthCode) : undefined;
    const _nanosecond = arg.nanosecond;
    const nanosecond = toInteger(_nanosecond);
    const _second = arg.second;
    const second = toInteger(_second);
    const _year = arg.year;
    const yearVal = toInteger(_year);
    // Resolve era/eraYear for calendars that support them
    let resolvedYear = yearVal;
    const _calValidErasDT = VALID_ERAS[calId];
    if (_calValidErasDT && _calValidErasDT.size > 0) {
      const eraFields = { year: yearVal, era: arg.era, eraYear: toInteger(arg.eraYear) };
      resolveEraYear(eraFields, calId);
      resolvedYear = eraFields.year;
    }
    if (resolvedYear === undefined) throw new TypeError('Required property year is missing or undefined');
    const monthBag = { month: monthRaw, monthCode: monthCodeStr };
    const month = resolveMonth(monthBag, calId, resolvedYear);
    if (month === undefined && _monthCode === undefined) throw new TypeError('Required property month or monthCode is missing');
    if (day === undefined) throw new TypeError('Required property day is missing or undefined');
    rejectPropertyBagInfinity({ year: resolvedYear, month, day, hour, minute, second, millisecond, microsecond, nanosecond }, 'year', 'month', 'day', 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond');
    const iso = calendarDateToISO(resolvedYear, month, day, calId);
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
  if (_isTemporalZonedDateTime(arg)) return arg._inner;
  if (typeof arg === 'string') {
    rejectTooManyFractionalSeconds(arg);
    try {
      return call(() => NapiZonedDateTime.from(arg));
    } catch (e) {
      // If parsing fails due to offset mismatch (e.g. historical timezone data differences),
      // extract the instant from the offset+local time and create ZDT from epochNs + timezone.
      // Per IXDTF spec, when both offset and timezone annotation are present, the offset
      // determines the instant.
      if (e instanceof RangeError && arg.includes('[')) {
        const ixdtfMatch = arg.match(/^([+-]?\d{4,6})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?([+-]\d{2}:?\d{2})\[([^\]]+)\](?:\[u-ca=([^\]]+)\])?$/);
        if (ixdtfMatch) {
          const [, yr, mo, dy, hr, mi, se, frac, offset, tzId, calAnnot] = ixdtfMatch;
          const isoYear = parseInt(yr, 10);
          const isoMonth = parseInt(mo, 10);
          const isoDay = parseInt(dy, 10);
          const isoHour = parseInt(hr, 10);
          const isoMinute = parseInt(mi, 10);
          const isoSecond = parseInt(se, 10);
          let fracNs = 0n;
          if (frac) {
            const padded = frac.padEnd(9, '0').slice(0, 9);
            fracNs = BigInt(padded);
          }
          const offsetNs = BigInt(parseOffsetStringToNs(offset) || 0);
          // Compute epoch nanoseconds from local ISO date/time using pure arithmetic
          // (Date.UTC fails for dates beyond JS Date range)
          const epochDays = BigInt(isoDateToEpochDays(isoYear, isoMonth, isoDay));
          const dayNs = BigInt(isoHour) * 3600000000000n + BigInt(isoMinute) * 60000000000n + BigInt(isoSecond) * 1000000000n;
          const localNs = epochDays * 86400000000000n + dayNs + fracNs;
          const epochNs = localNs - offsetNs;
          // Validate epoch nanoseconds are within the representable range
          const epochLimit = 8640000000000000000000n;
          if (epochNs < -epochLimit || epochNs > epochLimit) {
            throw e; // Re-throw the original RangeError
          }
          try {
            const tz = toNapiTimeZone(tzId);
            const cal = calAnnot ? toNapiCalendar(calAnnot) : undefined;
            const result = new NapiZonedDateTime(Number(epochNs / 1000000n), tz, cal);
            return result;
          } catch { /* fall through to original error */ }
        }
      }
      throw e;
    }
  }
  if (typeof arg === 'object' && arg !== null) {
    // Per spec: validate calendar before checking timeZone
    // Per spec: read fields in ALPHABETICAL order, coercing each immediately
    const _calendar = arg.calendar;
    const calId = getCalendarId(_calendar);
    const cal = toNapiCalendar(_calendar);
    const _day = arg.day;
    const dayVal = toIntegerIfIntegral(_day);
    const _hour = arg.hour;
    const hourVal = toIntegerIfIntegral(_hour);
    const _microsecond = arg.microsecond;
    const microsecondVal = toIntegerIfIntegral(_microsecond);
    const _millisecond = arg.millisecond;
    const millisecondVal = toIntegerIfIntegral(_millisecond);
    const _minute = arg.minute;
    const minuteVal = toIntegerIfIntegral(_minute);
    const _month = arg.month;
    const monthRaw = toIntegerIfIntegral(_month);
    const _monthCode = arg.monthCode;
    const monthCodeStr = _monthCode !== undefined ? toStringOption(_monthCode) : undefined;
    const _nanosecond = arg.nanosecond;
    const nanosecondVal = toIntegerIfIntegral(_nanosecond);
    const _offset = arg.offset;
    // Coerce offset to string immediately
    let offsetProp;
    if (_offset !== undefined) {
      if (typeof _offset === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
      if (typeof _offset === 'bigint') throw new TypeError('Cannot convert a BigInt value to a string');
      if (_offset === null) throw new TypeError('offset must be a string, got null');
      offsetProp = String(_offset);
    }
    const _second = arg.second;
    const secondVal = toIntegerIfIntegral(_second);
    const _timeZone = arg.timeZone;
    const _year = arg.year;
    const yearVal = toIntegerIfIntegral(_year);
    // Property bag with timeZone required
    if (_timeZone === undefined) {
      throw new TypeError('Missing timeZone in ZonedDateTime property bag');
    }
    const tz = toNapiTimeZone(_timeZone);
    // Resolve era/eraYear for calendars that support them
    let resolvedYear = yearVal;
    const _calValidErasZDT = VALID_ERAS[calId];
    if (_calValidErasZDT && _calValidErasZDT.size > 0) {
      const eraFields = { year: yearVal, era: arg.era, eraYear: toIntegerIfIntegral(arg.eraYear) };
      resolveEraYear(eraFields, calId);
      resolvedYear = eraFields.year;
    }
    // Validate required properties
    if (resolvedYear === undefined) throw new TypeError('Required property year is missing or undefined');
    const monthBag = { month: monthRaw, monthCode: monthCodeStr };
    const monthVal = resolveMonth(monthBag, calId, resolvedYear);
    if (monthVal === undefined && _monthCode === undefined) throw new TypeError('Required property month or monthCode is missing');
    if (dayVal === undefined) throw new TypeError('Required property day is missing or undefined');
    const calYear = resolvedYear || 0;
    let month = monthVal || 1;
    let day = dayVal || 1;
    const hour = hourVal || 0;
    const minute = minuteVal || 0;
    const second = secondVal || 0;
    // Reject Infinity values
    rejectPropertyBagInfinity({ year: calYear, month, day, hour, minute, second },
      'year', 'month', 'day', 'hour', 'minute', 'second');
    if (millisecondVal !== undefined) rejectInfinity(millisecondVal, 'millisecond');
    if (microsecondVal !== undefined) rejectInfinity(microsecondVal, 'microsecond');
    if (nanosecondVal !== undefined) rejectInfinity(nanosecondVal, 'nanosecond');
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
      // Read back ISO values from toString(), not calendar values from pd.day/pd.month
      const pdIso = _extractISOFromNapiDT(pd);
      isoDay = pdIso.day;
      isoMonth = pdIso.month;
    } catch {
      // Try max valid day
      for (let d = 28; d <= 31; d++) {
        try { call(() => new NapiPlainDate(year, isoMonth, d, cal)); isoDay = d; } catch { break; }
      }
    }
    let str = `${padYear(year)}-${pad2(isoMonth)}-${pad2(isoDay)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
    if (millisecondVal || microsecondVal || nanosecondVal) {
      const pad3 = n => String(n || 0).padStart(3, '0');
      const frac = pad3(millisecondVal || 0) + pad3(microsecondVal || 0) + pad3(nanosecondVal || 0);
      str += '.' + frac.replace(/0+$/, '');
    }
    // Validate offset property if present (already coerced to string as offsetProp)
    if (offsetProp !== undefined) {
      if (!isValidOffsetString(offsetProp)) {
        throw new RangeError(`"${offsetProp}" is not a valid offset string`);
      }
      // Include offset in the string
      str += offsetProp;
    }
    // Per spec: for property bags, offset must match exactly (no fuzzy minute-rounding)
    // But during DST overlaps, both offsets are valid
    if (offsetProp !== undefined && isValidOffsetString(offsetProp)) {
      const providedOffsetNs = parseOffsetStringToNs(offsetProp);
      if (providedOffsetNs !== undefined) {
        let offsetMatches = false;
        for (const disamb of ['compatible', 'earlier', 'later']) {
          try {
            const resolved = _resolveLocalToEpochMs(year, isoMonth, isoDay, hour, minute, second, 0, tz.id, disamb);
            const actualOffsetNs = _getOffsetNsAtEpoch(resolved.epochMs, tz.id);
            if (providedOffsetNs === actualOffsetNs) { offsetMatches = true; break; }
          } catch { /* gap/reject - skip */ }
        }
        if (!offsetMatches) {
          throw new RangeError(`Offset ${offsetProp} does not match the time zone offset for ${tz.id}`);
        }
      }
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
  if (_isTemporalInstant(arg)) return arg._inner;
  if (typeof arg === 'string') return call(() => NapiInstant.from(arg));
  // Per spec, Instant only accepts strings and ZonedDateTime
  if (arg !== null && arg !== undefined && (typeof arg === 'object' || typeof arg === 'function')) {
    // ZonedDateTime argument: extract instant
    if (_isTemporalZonedDateTime(arg)) {
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
  if (_isTemporalPlainYearMonth(arg)) return arg._inner;
  if (typeof arg === 'string') { rejectTooManyFractionalSeconds(arg); return call(() => NapiPlainYearMonth.from(arg)); }
  if (typeof arg === 'object' && arg !== null) {
    // Per spec: read fields in ALPHABETICAL order, coercing each immediately
    const _calendar = arg.calendar;
    const calId = getCalendarId(_calendar);
    const cal = toNapiCalendar(_calendar);
    const _month = arg.month;
    const monthRaw = toInteger(_month);
    const _monthCode = arg.monthCode;
    const monthCodeStr = _monthCode !== undefined ? toStringOption(_monthCode) : undefined;
    const _year = arg.year;
    const yearVal = toInteger(_year);
    // Resolve era/eraYear for calendars that support them
    let resolvedYear = yearVal;
    const _calValidErasYM = VALID_ERAS[calId];
    if (_calValidErasYM && _calValidErasYM.size > 0) {
      const eraFields = { year: yearVal, era: arg.era, eraYear: toInteger(arg.eraYear) };
      resolveEraYear(eraFields, calId);
      resolvedYear = eraFields.year;
    }
    if (resolvedYear === undefined) throw new TypeError('Required property year is missing or undefined');
    const monthBag = { month: monthRaw, monthCode: monthCodeStr };
    const month = resolveMonth(monthBag, calId, resolvedYear);
    if (month === undefined && _monthCode === undefined) throw new TypeError('Required property month or monthCode is missing');
    rejectPropertyBagInfinity({ year: resolvedYear, month }, 'year', 'month');
    // For ISO calendar, reference day is always 1; for non-ISO, use day hint
    const refDay = (!calId || calId === 'iso8601') ? 1 : (toInteger(arg.day) || 1);
    const iso = calendarDateToISO(resolvedYear, month, refDay, calId);
    return call(() => new NapiPlainYearMonth(iso.isoYear, iso.isoMonth, cal, iso.isoDay));
  }
  throw new TypeError('Invalid PlainYearMonth argument');
}

// ─── Helper: convert to NAPI PlainMonthDay ────────────────────

function toNapiPlainMonthDay(arg) {
  if (arg instanceof NapiPlainMonthDay) return arg;
  if (_isTemporalPlainMonthDay(arg)) return arg._inner;
  if (typeof arg === 'string') { rejectTooManyFractionalSeconds(arg); return call(() => NapiPlainMonthDay.from(arg)); }
  if (typeof arg === 'object' && arg !== null) {
    // Delegate to PlainMonthDay.from which properly handles calendar conversion
    const result = PlainMonthDay.from(arg);
    return result._inner;
  }
  throw new TypeError('Invalid PlainMonthDay argument');
}

// ─── Helper: convert DifferenceSettings ───────────────────────

function convertDifferenceSettings(options) {
  if (options === undefined) return undefined;
  validateOptions(options);
  // Per spec: read options in ALPHABETICAL order, coercing each immediately
  const result = {};
  const _lu = options.largestUnit;
  if (_lu !== undefined) result.largestUnit = mapUnit(_lu);
  const _ri = options.roundingIncrement;
  if (_ri !== undefined) result.roundingIncrement = coerceRoundingIncrement(_ri);
  const _rm = options.roundingMode;
  if (_rm !== undefined) result.roundingMode = mapRoundingMode(_rm);
  const _su = options.smallestUnit;
  if (_su !== undefined) result.smallestUnit = mapUnit(_su);
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
  // Use _isTemporalX helpers to avoid triggering Proxy traps on property bags
  if (_isTemporalZonedDateTime(rt)) {
    relativeToZdt = rt._inner;
    return { relativeToDate, relativeToZdt };
  }
  if (rt instanceof NapiZonedDateTime) {
    relativeToZdt = rt;
    return { relativeToDate, relativeToZdt };
  }
  if (_isTemporalPlainDate(rt)) {
    relativeToDate = rt._inner;
    return { relativeToDate, relativeToZdt };
  }
  if (rt instanceof NapiPlainDate) {
    relativeToDate = rt;
    return { relativeToDate, relativeToZdt };
  }
  if (_isTemporalPlainDateTime(rt)) {
    const dt = rt._inner;
    relativeToDate = call(() => new NapiPlainDate(dt.year, dt.month, dt.day, dt.calendar));
    return { relativeToDate, relativeToZdt };
  }
  if (rt instanceof NapiPlainDateTime) {
    relativeToDate = call(() => new NapiPlainDate(rt.year, rt.month, rt.day, rt.calendar));
    return { relativeToDate, relativeToZdt };
  }
  if (typeof rt === 'string') {
    // If the string has a timezone annotation, it MUST be parsed as ZonedDateTime
    if (rt.includes('[') && !rt.startsWith('[')) {
      // Validate sub-minute offset: reject sub-minute offsets as timezone IDs
      _validateZdtString(rt);
      _validateZdtStringLimits(rt);
      const zdt = call(() => NapiZonedDateTime.from(rt));
      relativeToZdt = zdt;
      return { relativeToDate, relativeToZdt };
    }
    try {
      const pd = call(() => NapiPlainDate.from(rt));
      relativeToDate = pd;
      return { relativeToDate, relativeToZdt };
    } catch (e) { throw wrapError(e); }
  }
  if (typeof rt === 'object' && rt !== null) {
    // Per spec: read all temporal properties in ALPHABETICAL order, coercing each immediately
    const _calendar = rt.calendar;
    const _day = rt.day;
    const _dayVal = _day !== undefined ? toInteger(_day) : undefined;
    if (_dayVal !== undefined) rejectInfinity(_dayVal, 'day');
    const _hour = rt.hour;
    const _hourVal = _hour !== undefined ? toInteger(_hour) : undefined;
    if (_hourVal !== undefined) rejectInfinity(_hourVal, 'hour');
    const _microsecond = rt.microsecond;
    const _microsecondVal = _microsecond !== undefined ? toInteger(_microsecond) : undefined;
    if (_microsecondVal !== undefined) rejectInfinity(_microsecondVal, 'microsecond');
    const _millisecond = rt.millisecond;
    const _millisecondVal = _millisecond !== undefined ? toInteger(_millisecond) : undefined;
    if (_millisecondVal !== undefined) rejectInfinity(_millisecondVal, 'millisecond');
    const _minute = rt.minute;
    const _minuteVal = _minute !== undefined ? toInteger(_minute) : undefined;
    if (_minuteVal !== undefined) rejectInfinity(_minuteVal, 'minute');
    const _month = rt.month;
    const _monthVal = _month !== undefined ? toInteger(_month) : undefined;
    if (_monthVal !== undefined) rejectInfinity(_monthVal, 'month');
    const _monthCode = rt.monthCode;
    const _monthCodeStr = _monthCode !== undefined ? toStringOption(_monthCode) : undefined;
    const _nanosecond = rt.nanosecond;
    const _nanosecondVal = _nanosecond !== undefined ? toInteger(_nanosecond) : undefined;
    if (_nanosecondVal !== undefined) rejectInfinity(_nanosecondVal, 'nanosecond');
    const _offset = rt.offset;
    // Per spec: coerce offset to string immediately after reading (ToPrimitiveAndRequireString)
    let _offsetStr;
    if (_offset !== undefined) {
      if (typeof _offset === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
      if (typeof _offset === 'bigint') throw new TypeError('Cannot convert a BigInt value to a string');
      if (_offset === null) throw new TypeError('offset must be a string, got null');
      _offsetStr = String(_offset);
    }
    const _second = rt.second;
    const _secondVal = _second !== undefined ? toInteger(_second) : undefined;
    if (_secondVal !== undefined) rejectInfinity(_secondVal, 'second');
    const _timeZone = rt.timeZone;
    const _year = rt.year;
    const _yearVal = _year !== undefined ? toInteger(_year) : undefined;
    if (_yearVal !== undefined) rejectInfinity(_yearVal, 'year');

    if (_timeZone !== undefined) {
      // Build a ZonedDateTime from the pre-read fields
      const bag = Object.create(null);
      bag.calendar = _calendar;
      bag.day = _dayVal;
      bag.hour = _hourVal;
      bag.microsecond = _microsecondVal;
      bag.millisecond = _millisecondVal;
      bag.minute = _minuteVal;
      bag.month = _monthVal;
      bag.monthCode = _monthCodeStr;
      bag.nanosecond = _nanosecondVal;
      bag.offset = _offsetStr;
      bag.second = _secondVal;
      bag.timeZone = _timeZone;
      bag.year = _yearVal;
      const zdt = toNapiZonedDateTime(bag);
      relativeToZdt = zdt;
      return { relativeToDate, relativeToZdt };
    }
    // Build a PlainDate from the pre-read fields
    const bag = Object.create(null);
    bag.calendar = _calendar;
    bag.day = _dayVal;
    bag.month = _monthVal;
    bag.monthCode = _monthCodeStr;
    bag.year = _yearVal;
    const pd = toNapiPlainDate(bag);
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
  // Per spec: read options in ALPHABETICAL order, coercing each immediately
  const result = Object.create(null);
  const _lu = options.largestUnit;
  if (_lu !== undefined) result.largestUnit = mapUnit(_lu);
  const _ri = options.roundingIncrement;
  if (_ri !== undefined) result.roundingIncrement = coerceRoundingIncrement(_ri);
  const _rm = options.roundingMode;
  if (_rm !== undefined) result.roundingMode = mapRoundingMode(_rm);
  const _su = options.smallestUnit;
  if (_su !== undefined) result.smallestUnit = mapUnit(_su);
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
  // Per spec: read options in ALPHABETICAL order, coercing each immediately
  // calendarName (c) comes first
  const _cn = options.calendarName;
  const displayCalendar = mapDisplayCalendar(_cn);
  const roundingOptions = {};
  // fractionalSecondDigits (f)
  const _fsd = options.fractionalSecondDigits;
  const fsd = resolveFractionalSecondDigits(_fsd);
  if (fsd !== undefined && fsd !== 'auto') {
    roundingOptions.precision = fsd;
  }
  // roundingMode (r)
  const _rm = options.roundingMode;
  if (_rm !== undefined) {
    roundingOptions.roundingMode = mapRoundingMode(_rm);
  }
  // smallestUnit (s)
  const _su = options.smallestUnit;
  if (_su !== undefined) {
    const mapped = mapUnit(_su);
    roundingOptions.smallestUnit = mapped;
    if (mapped === 'Minute') {
      roundingOptions.isMinute = true;
    }
  }
  return {
    roundingOptions: Object.keys(roundingOptions).length > 0 ? roundingOptions : undefined,
    displayCalendar,
  };
}

// ─── Helper: convert ZonedDateTime/Instant toString options ───

function convertZdtToStringOptions(options) {
  if (options === undefined) return {};
  validateOptions(options);
  // Per spec: read options in ALPHABETICAL order, each once, coercing immediately
  const result = {};
  // calendarName (c)
  const _cn = options.calendarName;
  if (_cn !== undefined) result.displayCalendar = mapDisplayCalendar(_cn);
  // fractionalSecondDigits (f)
  const _fsd = options.fractionalSecondDigits;
  const fsd = resolveFractionalSecondDigits(_fsd);
  if (fsd !== undefined && fsd !== 'auto') result.precision = fsd;
  // offset (o)
  const _offset = options.offset;
  if (_offset !== undefined) result.displayOffset = mapDisplayOffset(_offset);
  // roundingMode (r)
  const _rm = options.roundingMode;
  if (_rm !== undefined) result.roundingMode = mapRoundingMode(_rm);
  // smallestUnit (s)
  const _su = options.smallestUnit;
  if (_su !== undefined) result.smallestUnit = mapUnit(_su);
  // timeZoneName (t)
  const _tzn = options.timeZoneName;
  if (_tzn !== undefined) result.displayTimeZone = mapDisplayTimeZone(_tzn);
  return result;
}

// ─── Helper: wrap NAPI result back into wrapper ───────────────

// ─── Helper: calendar-aware date difference ─────────────────
// Implements CalendarDateUntil for non-ISO calendars.
// The NAPI until/since doesn't properly handle lunisolar calendar arithmetic,
// so we implement it here in JavaScript.
// Helper: convert a PlainYearMonth inner to a PlainDate at day 1
// by extracting ISO values from its toString() output
function _ymInnerToPlainDate(ymInner) {
  const s = ymInner.toString();
  const m = s.match(/^([+-]?\d+)-(\d{2})-(\d{2})/);
  if (!m) throw new RangeError('Failed to extract ISO date from PlainYearMonth');
  return new NapiPlainDate(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10), ymInner.calendar);
}

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
      // In the backward direction, if we've reached exactly the end date, it's not an overshoot
      // even if the day was constrained (the constraining just means we covered a full period)
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

  // Helper: add combined years+months using a single duration to match spec behavior
  // This differs from addYearsToDate then addMonthsToDate because constraining
  // happens after the combined year+month addition, not after each step
  function addYearsMonthsToDate(inner, years, months) {
    try {
      const absY = Math.abs(years);
      const absM = Math.abs(months);
      if (years >= 0 && months >= 0) {
        return inner.add(new NapiDuration(absY, absM, 0, 0, 0, 0, 0, 0, 0, 0), 'Constrain');
      } else if (years <= 0 && months <= 0) {
        return inner.subtract(new NapiDuration(absY, absM, 0, 0, 0, 0, 0, 0, 0, 0), 'Constrain');
      } else {
        // Mixed signs: add years first, then months
        const afterY = addYearsToDate(inner, years);
        if (!afterY) return null;
        return addMonthsToDate(afterY, months);
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
      // In the backward direction, if we've reached exactly the end date, it's not an overshoot
      // even if the day was constrained
      // Leap month check: if start is in a leap month and the result monthCode is NOT
      // the base version of the start monthCode (e.g., Hebrew M05L→M06), it's an overshoot.
      // But if result IS the base version (e.g., Chinese M04L→M04), it's NOT an overshoot.
      if (cmp === 0 && startMC.endsWith('L') && result.monthCode !== startMC.slice(0, -1)) return true;
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
  // Use addYearsMonthsToDate from start to match spec behavior (combined year+month addition)
  const afterYears = years !== 0 ? addYearsMonthsToDate(startInner, years, 0) : startInner;
  if (!afterYears) return null; // fallback to NAPI

  // Helper: check months using combined year+month addition from start
  // Per spec: if the result's day was constrained (start.day > daysInMonth), it's an overshoot
  function ymOvershots(testMonths, forward) {
    const result = addYearsMonthsToDate(startInner, years, testMonths);
    if (!result) return true;
    const cmp = dateCompare(result, endInner);
    if (forward) {
      if (cmp > 0) return true;
      // Day constraining check: if result day was constrained, treat as overshoot
      if (cmp === 0 && startD > result.day && startD > result.daysInMonth) return true;
      return false;
    } else {
      if (cmp < 0) return true;
      return false;
    }
  }

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
      if (ymOvershots(mEstimate, true)) {
        while (mEstimate > 0) {
          mEstimate--;
          if (!ymOvershots(mEstimate, true)) break;
        }
      }
      while (true) {
        if (ymOvershots(mEstimate + 1, true)) break;
        mEstimate++;
      }
      months = mEstimate;
    } else {
      let mEstimate = Math.ceil((eY - ayY) * avgMonthsPerYearInner + (eM - ayM));
      if (mEstimate > 0) mEstimate = 0;
      if (ymOvershots(mEstimate, false)) {
        while (mEstimate < 0) {
          mEstimate++;
          if (!ymOvershots(mEstimate, false)) break;
        }
      }
      while (true) {
        if (ymOvershots(mEstimate - 1, false)) break;
        mEstimate--;
      }
      months = mEstimate;
    }
  }

  const afterMonths = months !== 0 ? addYearsMonthsToDate(startInner, years, months) : afterYears;
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
// For ethioaa, era is always "aa" and the NAPI already returns correct AA year values.
// For ethiopic, NAPI returns correct era names and eraYear values.
// Japanese era boundaries: [isoYearStart, isoYearEnd (exclusive), eraName, baseYear]
// The spec uses only reiwa/heisei/showa/taisho + ce/bce for japanese calendar output.
// Meiji and earlier are returned as "ce".
const JAPANESE_ERA_RANGES = [
  { era: 'reiwa',  startYear: 2019 },   // 2019+
  { era: 'heisei', startYear: 1989 },   // 1989-2018
  { era: 'showa',  startYear: 1926 },   // 1926-1988
  { era: 'taisho', startYear: 1912 },   // 1912-1925
  // Everything before taisho is "ce" (meiji is input-only)
];

function resolveEraForCalendar(calId, napiYear, napiEra, napiEraYear, isoMonth, isoDay) {
  if (calId === 'ethioaa') {
    return { era: 'aa', eraYear: napiEraYear };
  }
  if (calId === 'japanese') {
    const isoYear = napiYear;
    if (isoYear <= 0) {
      return { era: 'bce', eraYear: 1 - isoYear };
    }
    // Japanese era boundaries with exact start dates [year, month, day]
    // Meiji starts at 1873-01-01 (Gregorian adoption), not 1868
    const ERAS = [
      { era: 'reiwa',  start: [2019, 5, 1],  base: 2019 },
      { era: 'heisei', start: [1989, 1, 8],  base: 1989 },
      { era: 'showa',  start: [1926, 12, 25], base: 1926 },
      { era: 'taisho', start: [1912, 7, 30],  base: 1912 },
      { era: 'meiji',  start: [1873, 1, 1],   base: 1868 },
    ];
    const m = isoMonth || 1;
    const d = isoDay || 1;
    for (const { era, start, base } of ERAS) {
      const [sy, sm, sd] = start;
      if (isoYear > sy || (isoYear === sy && (m > sm || (m === sm && d >= sd)))) {
        return { era, eraYear: isoYear - base + 1 };
      }
    }
    return { era: 'ce', eraYear: isoYear };
  }
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

// Parse offset string to total nanoseconds (for sub-minute offset comparison)
function parseOffsetStringToNs(str) {
  const m = str.match(/^([+-])(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?$/);
  if (!m) return undefined;
  const sign = m[1] === '+' ? 1n : -1n;
  const h = BigInt(m[2]);
  const min = BigInt(m[3]);
  const sec = m[4] ? BigInt(m[4]) : 0n;
  let frac = 0n;
  if (m[5]) {
    const fracStr = (m[5] + '000000000').substring(0, 9);
    frac = BigInt(fracStr);
  }
  return sign * (h * 3600000000000n + min * 60000000000n + sec * 1000000000n + frac);
}

// Get the actual UTC offset in nanoseconds for a timezone at a given epoch ms
function _getOffsetNsAtEpoch(epochMs, tzId) {
  if (tzId === 'UTC') return 0n;
  if (/^[+-]\d{2}:\d{2}(:\d{2})?$/.test(tzId)) {
    return parseOffsetStringToNs(tzId.length <= 6 ? tzId + ':00' : tzId) || 0n;
  }
  const offsetStr = getUtcOffsetString(epochMs, tzId);
  return parseOffsetStringToNs(offsetStr) || 0n;
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
  // Use _isTemporalX helpers to avoid triggering Proxy traps
  if (_isTemporalPlainDate(fields) || _isTemporalPlainDateTime(fields) ||
      _isTemporalPlainMonthDay(fields) || _isTemporalPlainYearMonth(fields) ||
      _isTemporalPlainTime(fields) || _isTemporalZonedDateTime(fields)) {
    throw new TypeError('A Temporal object is not allowed as a with() argument');
  }
  // Per spec: read calendar and timeZone in alphabetical order
  const _calendar = fields.calendar;
  const _timeZone = fields.timeZone;
  if (_calendar !== undefined) {
    throw new TypeError(`${typeName}.with does not accept a calendar property`);
  }
  if (_timeZone !== undefined) {
    throw new TypeError(`${typeName}.with does not accept a timeZone property`);
  }
  // At least one recognized property must be present
  // (callers that pass null for recognizedFields do their own check after reading fields)
  if (recognizedFields) {
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
    const calId = cal ? (cal.id || 'iso8601') : 'iso8601';
    if (calId === 'iso8601' && bag.year !== undefined && month !== undefined && bag.day !== undefined) {
      // For ISO calendar, verify date is actually valid
      try {
        const pd = new NapiPlainDate(bag.year, month, bag.day, cal);
        if (pd.day !== bag.day || pd.month !== month) {
          throw new RangeError(`date component out of range: ${bag.year}-${month}-${bag.day}`);
        }
      } catch (e) {
        if (e instanceof RangeError) throw e;
        throw new RangeError(`date out of range: ${e.message || e}`);
      }
    } else if (calId !== 'iso8601' && bag.year !== undefined && month !== undefined && bag.day !== undefined) {
      // For non-ISO calendars, check day against actual days in month
      const dim = calendarDaysInMonth(bag.year, _trunc(month), calId);
      if (dim !== undefined && _trunc(bag.day) > dim) {
        throw new RangeError(`day ${bag.day} out of range for month ${month} in ${calId} calendar (max ${dim} days)`);
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
  // Cascade carry through seconds -> minutes -> hours -> days
  let newSec = Math.abs(dur.seconds) + extraSeconds;
  let min = Math.abs(dur.minutes);
  let h = Math.abs(dur.hours);
  let d = Math.abs(dur.days);
  if (newSec >= 60) {
    min += Math.floor(newSec / 60);
    newSec = newSec % 60;
  }
  if (min >= 60) {
    h += Math.floor(min / 60);
    min = min % 60;
  }
  if (h >= 24) {
    d += Math.floor(h / 24);
    h = h % 24;
  }

  // Create new duration string and parse
  const s = sign < 0 ? '-' : '';
  const y = Math.abs(dur.years);
  const mo = Math.abs(dur.months);
  const w = Math.abs(dur.weeks);
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
    if (_isTemporalDuration(arg)) return new Duration(arg._inner);
    if (arg instanceof NapiDuration) return new Duration(arg);
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
      // Per spec: read relativeTo
      const _rtRaw = options.relativeTo;
      const rt = extractRelativeTo(_rtRaw);
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
    // Per spec: read fields in ALPHABETICAL order, coercing each immediately
    const _days = temporalDurationLike.days;
    const days = _days !== undefined ? toIntegerIfIntegral(_days) : this.days;
    const _hours = temporalDurationLike.hours;
    const hours = _hours !== undefined ? toIntegerIfIntegral(_hours) : this.hours;
    const _microseconds = temporalDurationLike.microseconds;
    const microseconds = _microseconds !== undefined ? toIntegerIfIntegral(_microseconds) : this.microseconds;
    const _milliseconds = temporalDurationLike.milliseconds;
    const milliseconds = _milliseconds !== undefined ? toIntegerIfIntegral(_milliseconds) : this.milliseconds;
    const _minutes = temporalDurationLike.minutes;
    const minutes = _minutes !== undefined ? toIntegerIfIntegral(_minutes) : this.minutes;
    const _months = temporalDurationLike.months;
    const months = _months !== undefined ? toIntegerIfIntegral(_months) : this.months;
    const _nanoseconds = temporalDurationLike.nanoseconds;
    const nanoseconds = _nanoseconds !== undefined ? toIntegerIfIntegral(_nanoseconds) : this.nanoseconds;
    const _seconds = temporalDurationLike.seconds;
    const seconds = _seconds !== undefined ? toIntegerIfIntegral(_seconds) : this.seconds;
    const _weeks = temporalDurationLike.weeks;
    const weeks = _weeks !== undefined ? toIntegerIfIntegral(_weeks) : this.weeks;
    const _years = temporalDurationLike.years;
    const years = _years !== undefined ? toIntegerIfIntegral(_years) : this.years;
    // Check that at least one recognized duration field is present
    if (_days === undefined && _hours === undefined && _microseconds === undefined &&
        _milliseconds === undefined && _minutes === undefined && _months === undefined &&
        _nanoseconds === undefined && _seconds === undefined && _weeks === undefined && _years === undefined) {
      throw new TypeError('At least one recognized duration property must be provided');
    }
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
    // Per spec: read options in ALPHABETICAL order, coercing each immediately
    // largestUnit, relativeTo, roundingIncrement, roundingMode, smallestUnit
    const _luRaw = options.largestUnit;
    const _luMapped = _luRaw !== undefined ? mapUnit(_luRaw) : undefined;
    const _rtRaw = options.relativeTo;
    const { relativeToDate, relativeToZdt } = extractRelativeTo(_rtRaw);
    const _riRaw = options.roundingIncrement;
    const _riVal = _riRaw !== undefined ? coerceRoundingIncrement(_riRaw) : undefined;
    const _rmRaw = options.roundingMode;
    const _rmMapped = _rmRaw !== undefined ? mapRoundingMode(_rmRaw) : undefined;
    const _suRaw = options.smallestUnit;
    const _suMapped = _suRaw !== undefined ? mapUnit(_suRaw) : undefined;
    // Per spec, must have at least smallestUnit or largestUnit
    if (_suMapped === undefined && _luMapped === undefined) {
      throw new RangeError('at least one of smallestUnit or largestUnit is required');
    }
    // Build napiOptions from the already-coerced values
    const napiOptions = Object.create(null);
    if (_luMapped !== undefined) napiOptions.largestUnit = _luMapped;
    if (_riVal !== undefined) napiOptions.roundingIncrement = _riVal;
    if (_rmMapped !== undefined) napiOptions.roundingMode = _rmMapped;
    if (_suMapped !== undefined) napiOptions.smallestUnit = _suMapped;
    // Per spec: if total duration nanoseconds exceed the representable range, throw RangeError.
    // Detect overflow: NAPI stores ns as i64, so values beyond safe integer range may wrap.
    // Check for field-sign inconsistency or individual fields exceeding i64 range.
    const _sign = this._inner.sign;
    if (_sign !== 0) {
      const _timeFields = [this.hours, this.minutes, this.seconds, this.milliseconds, this.microseconds, this.nanoseconds];
      for (const f of _timeFields) {
        // Sign mismatch: field has opposite sign from duration
        if (f !== 0 && ((_sign > 0 && f < 0) || (_sign < 0 && f > 0))) {
          throw new RangeError('Duration nanoseconds are out of representable range');
        }
        // Absolute value exceeds i64 range - indicates NAPI overflow from unsafe integer input
        if (Math.abs(f) > 9223372036854775000) {
          throw new RangeError('Duration nanoseconds are out of representable range');
        }
      }
    }
    // Cache converted values for workaround (avoid re-reading from options object)
    const _napiSmallestUnit = napiOptions.smallestUnit; // already mapped: 'Day', 'Week', 'Month', 'Year'
    const _napiIncrement = napiOptions.roundingIncrement || 1;
    const _napiRoundingMode = napiOptions.roundingMode || 'HalfExpand';
    try {
      const inner = this._inner.round(napiOptions, relativeToDate, relativeToZdt);
      const result = new Duration(inner);
      // Workaround: NAPI has a bug with roundingIncrement > 1 for calendar/day units.
      // Verify by re-rounding with increment=1 and manually applying the increment.
      const NAPI_CALENDAR_UNITS_MAP = { Day: 'days', Week: 'weeks', Month: 'months', Year: 'years' };
      if (_napiIncrement > 1 && _napiSmallestUnit && NAPI_CALENDAR_UNITS_MAP[_napiSmallestUnit]) {
        const fieldName = NAPI_CALENDAR_UNITS_MAP[_napiSmallestUnit];
        const napiVal = result[fieldName];
        // Re-round with increment=1 and compute expected result
        const napiOpts1 = Object.assign({}, napiOptions);
        napiOpts1.roundingIncrement = 1;
        const inner1 = this._inner.round(napiOpts1, relativeToDate, relativeToZdt);
        const dur1 = new Duration(inner1);
        const val = dur1[fieldName];
        // Map NAPI rounding mode back to JS mode name for _roundToIncrement
        const MODE_MAP_REVERSE = { Ceil: 'ceil', Floor: 'floor', Expand: 'expand', Trunc: 'trunc', HalfCeil: 'halfCeil', HalfFloor: 'halfFloor', HalfExpand: 'halfExpand', HalfTrunc: 'halfTrunc', HalfEven: 'halfEven' };
        const mode = MODE_MAP_REVERSE[_napiRoundingMode] || 'halfExpand';
        const expected = _roundToIncrement(val, _napiIncrement, mode);
        // If NAPI gave a different result, use our computed one
        if (napiVal !== expected) {
          const resultFields = { years: 0, months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0, milliseconds: 0, microseconds: 0, nanoseconds: 0 };
          if (_napiSmallestUnit === 'Day') { resultFields.years = dur1.years; resultFields.months = dur1.months; resultFields.weeks = dur1.weeks; }
          if (_napiSmallestUnit === 'Week') { resultFields.years = dur1.years; resultFields.months = dur1.months; }
          if (_napiSmallestUnit === 'Month') { resultFields.years = dur1.years; }
          resultFields[fieldName] = expected;
          return Duration.from(resultFields);
        }
      }
      return result;
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
    // Per spec: read options in alphabetical order: relativeTo, unit
    const _rtRaw = options.relativeTo;
    const { relativeToDate, relativeToZdt } = extractRelativeTo(_rtRaw);
    const _unitRaw = options.unit;
    if (_unitRaw === undefined) throw new RangeError('unit is required');
    const napiUnit = mapUnit(_unitRaw);
    try {
      return this._inner.total(napiUnit, relativeToDate, relativeToZdt);
    } catch (e) { throw wrapError(e); }
  }

  toString(options) {
    if (options === undefined) return this._inner.toString();
    validateOptions(options);
    // Per spec: read options in alphabetical order, each exactly once
    // fractionalSecondDigits, roundingMode, smallestUnit
    const _fsdRaw = options.fractionalSecondDigits;
    const fsd = resolveFractionalSecondDigits(_fsdRaw);
    const _rmRaw = options.roundingMode;
    const roundingMode = _rmRaw !== undefined ? mapRoundingMode(_rmRaw) : 'Trunc';
    let smallestUnit;
    const _suRaw = options.smallestUnit;
    if (_suRaw !== undefined) {
      const su = toStringOption(_suRaw);
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
      } catch (roundErr) {
        // If NAPI round fails with time duration overflow, re-throw (don't fall through to manual rounding)
        const errMsg = roundErr && roundErr.message ? roundErr.message : '';
        if (errMsg.includes('maxTimeDuration') || errMsg.includes('TimeDuration exceeds')) {
          throw wrapError(roundErr);
        }
        // If NAPI round fails (date components present or other reasons), round sub-second manually
        dur = roundDurationSubSeconds(this, precision, roundingMode);
      }
    }

    // Per spec: if the rounded duration has any field exceeding MAX_SAFE_INTEGER, throw RangeError
    const DURATION_FIELDS_CHECK = ['years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds', 'milliseconds', 'microseconds', 'nanoseconds'];
    for (const field of DURATION_FIELDS_CHECK) {
      const v = dur[field];
      if (v > Number.MAX_SAFE_INTEGER || v < -Number.MAX_SAFE_INTEGER) {
        throw new RangeError('Rounded duration field exceeds safe integer range');
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
    if (_isTemporalPlainDate(arg)) {
      if (options !== undefined) extractOverflow(options);
      const r = new PlainDate(arg._inner);
      if (arg._calId) r._calId = arg._calId;
      return r;
    }
    if (arg instanceof NapiPlainDate) {
      if (options !== undefined) extractOverflow(options);
      return new PlainDate(arg);
    }
    if (_isTemporalPlainDateTime(arg)) {
      if (options !== undefined) extractOverflow(options);
      const dt = arg._inner;
      const r = new PlainDate(call(() => new NapiPlainDate(dt.year, dt.month, dt.day, dt.calendar)));
      if (arg._calId) r._calId = arg._calId;
      return r;
    }
    if (_isTemporalZonedDateTime(arg)) {
      if (options !== undefined) extractOverflow(options);
      const r = new PlainDate(arg._inner.toPlainDate());
      if (arg._calId) r._calId = arg._calId;
      return r;
    }
    if (typeof arg === 'object' && arg !== null) {
      // Per spec: read fields in ALPHABETICAL order, coercing each immediately
      const _calendar = arg.calendar;
      const calId = getCalendarId(_calendar);
      const cal = toNapiCalendar(_calendar);
      const _day = arg.day;
      const dayVal = toInteger(_day);
      const _month = arg.month;
      const monthRaw = toInteger(_month);
      const _monthCode = arg.monthCode;
      const monthCodeStr = _monthCode !== undefined ? toStringOption(_monthCode) : undefined;
      const _year = arg.year;
      const yearVal = toInteger(_year);
      // Read overflow AFTER fields per spec
      const overflow = extractOverflow(options);
      // Now use the pre-read values for validation/construction
      if (monthCodeStr !== undefined) validateMonthCodeSyntax(monthCodeStr);
      // Resolve era/eraYear for calendars that support them (don't read for ISO)
      let resolvedYear = yearVal;
      const calValidErasFrom = VALID_ERAS[calId];
      if (calValidErasFrom && calValidErasFrom.size > 0) {
        const eraFields = { year: yearVal, era: arg.era, eraYear: toInteger(arg.eraYear) };
        resolveEraYear(eraFields, calId);
        resolvedYear = eraFields.year;
      }
      // Per spec: validate required fields (TypeError) before monthCode semantics (RangeError)
      if (resolvedYear === undefined) throw new TypeError('Required property year is missing or undefined');
      if (_month === undefined && _monthCode === undefined) throw new TypeError('Required property month or monthCode is missing');
      if (dayVal === undefined) throw new TypeError('Required property day is missing or undefined');
      // Use pre-read values to resolve month (avoid re-reading from arg)
      const year = resolvedYear;
      const day = dayVal;
      const monthBag = { month: monthRaw, monthCode: monthCodeStr };
      const month = resolveMonth(monthBag, calId, year);
      rejectPropertyBagInfinity({ year, month, day }, 'year', 'month', 'day');
      // Per spec: month ≤ 0 and day ≤ 0 always throw regardless of overflow
      const tm = _trunc(month);
      const td = _trunc(day);
      if (tm < 1) throw new RangeError(`month ${tm} out of range`);
      if (td < 1) throw new RangeError(`day ${td} out of range`);
      // In reject mode, validate that monthCode is valid for the target year
      if (overflow === 'Reject' && monthCodeStr !== undefined) {
        if (!isMonthCodeValidForYear(monthCodeStr, calId, year)) {
          throw new RangeError(`monthCode ${monthCodeStr} does not exist in year ${year} for ${calId} calendar`);
        }
      }
      validateOverflowReject({ year, month, day }, overflow, cal);
      // Constrain month/day before passing to calendarDateToISO (for constrain mode)
      let constrainedMonth = _trunc(month);
      let constrainedDay = _trunc(day);
      if (overflow !== 'Reject') {
        if (calId === 'iso8601' || calId === 'gregory') {
          constrainedMonth = Math.max(1, Math.min(constrainedMonth, 12));
          const maxDay = _isoDaysInMonth(year, constrainedMonth);
          constrainedDay = Math.max(1, Math.min(constrainedDay, maxDay));
        } else if (THIRTEEN_MONTH_CALENDARS.has(calId)) {
          constrainedMonth = Math.max(1, Math.min(constrainedMonth, 13));
          const dim = calendarDaysInMonth(year, constrainedMonth, calId);
          if (dim) constrainedDay = Math.max(1, Math.min(constrainedDay, dim));
          else constrainedDay = Math.max(1, Math.min(constrainedDay, 30));
        } else {
          constrainedMonth = Math.max(1, Math.min(constrainedMonth, 12));
          const dim = calendarDaysInMonth(year, constrainedMonth, calId);
          if (dim) constrainedDay = Math.max(1, Math.min(constrainedDay, dim));
          else constrainedDay = Math.max(1, Math.min(constrainedDay, 31));
        }
      }
      const iso = calendarDateToISO(year, constrainedMonth, constrainedDay, calId);
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
    if (calId === 'ethioaa') return this._inner.year;
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
    return resolveEraForCalendar(calId, this._inner.year, v, this._inner.eraYear, this._inner.month, this._inner.day).era;
  }
  get eraYear() {
    const calId = getRealCalendarId(this);
    const v = this._inner.eraYear;
    if (v === null) return undefined;
    return resolveEraForCalendar(calId, this._inner.year, this._inner.era, v, this._inner.month, this._inner.day).eraYear;
  }
  get calendarId() { return getRealCalendarId(this); }
  get calendar() { return getRealCalendarId(this); }

  with(fields, options) {
    requireBranding(this, NapiPlainDate, 'Temporal.PlainDate');
    validateWithFields(fields, null, 'PlainDate');
    const calId = getRealCalendarId(this);
    // Per spec: read fields in ALPHABETICAL order, coercing each immediately
    // For date fields: day, month, monthCode, year (era/eraYear only for calendars that support them)
    const _day = fields.day;
    const day = _day !== undefined ? toInteger(_day) : this.day;
    const _month = fields.month;
    const monthRaw = _month !== undefined ? toInteger(_month) : undefined;
    const _monthCode = fields.monthCode;
    const monthCodeStr = _monthCode !== undefined ? toStringOption(_monthCode) : undefined;
    const _year = fields.year;
    const yearRaw = _year !== undefined ? toInteger(_year) : undefined;
    // Era handling (only for calendars that support eras, and only if era/eraYear explicitly provided)
    const calValidEras = VALID_ERAS[calId];
    const calSupportsEras = calValidEras && calValidEras.size > 0;
    let era, eraYear, year;
    let _hasEra = false, _hasEraYear = false;
    if (calSupportsEras) {
      const hasEra = fields.era !== undefined;
      const hasEraYear = fields.eraYear !== undefined;
      _hasEra = hasEra;
      _hasEraYear = hasEraYear;
      if (!calSupportsEras && (hasEra || hasEraYear) && calId !== 'iso8601') {
        throw new TypeError(`era and eraYear are not valid for the ${calId} calendar`);
      }
      if (hasEra !== hasEraYear) {
        throw new TypeError('era and eraYear must be provided together');
      }
      if (hasEra && hasEraYear) {
        era = fields.era;
        eraYear = toInteger(fields.eraYear);
        year = undefined;
      } else if (yearRaw !== undefined) {
        year = yearRaw;
      } else {
        year = this.year;
        era = this.era;
        eraYear = this.eraYear;
      }
    } else {
      year = yearRaw !== undefined ? yearRaw : this.year;
    }
    // Check at least one recognized field was provided (after reading all fields including era/eraYear)
    if (_day === undefined && _month === undefined && _monthCode === undefined && _year === undefined &&
        !_hasEra && !_hasEraYear) {
      throw new TypeError('At least one recognized property must be provided');
    }
    rejectPropertyBagInfinity({ year: year || 0, day }, 'year', 'day');
    // Resolve era/eraYear to year first so we know the target year for monthCode resolution
    const merged = { year, era, eraYear };
    resolveEraYear(merged, calId);
    const targetYear = merged.year;
    let month;
    const monthBag = { month: monthRaw, monthCode: monthCodeStr };
    if (monthRaw !== undefined && monthCodeStr !== undefined) {
      month = monthRaw;
      rejectInfinity(month, 'month');
      const fromCode = monthCodeToMonth(monthCodeStr, calId, targetYear);
      if (_trunc(month) !== fromCode) {
        throw new RangeError(`month ${month} and monthCode ${monthCodeStr} do not agree`);
      }
    } else if (_month !== undefined) {
      month = monthRaw;
      rejectInfinity(month, 'month');
    } else if (_monthCode !== undefined) {
      month = monthCodeToMonth(monthCodeStr, calId, targetYear);
    } else {
      // When year changes, resolve monthCode for the new year context
      month = monthCodeToMonth(this.monthCode, calId, targetYear);
    }
    // Determine which monthCode is in effect for leap-month validation
    const effectiveMonthCode = _monthCode !== undefined ? monthCodeStr : (_month === undefined ? this.monthCode : undefined);
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
    // Use ISO date from toString() to avoid calendar-year confusion
    const isoDate = _extractISOFromNapiDT(this._inner);
    if (time === undefined) {
      const dt = call(() => new NapiPlainDateTime(isoDate.year, isoDate.month, isoDate.day, 0, 0, 0, 0, 0, 0, toNapiCalendar(calId)));
      return wrapPlainDateTime(dt, calId);
    }
    const t = toNapiPlainTime(time);
    const dt = call(() => new NapiPlainDateTime(
      isoDate.year, isoDate.month, isoDate.day,
      t.hour, t.minute, t.second,
      t.millisecond, t.microsecond, t.nanosecond,
      toNapiCalendar(calId),
    ));
    return wrapPlainDateTime(dt, calId);
  }

  toZonedDateTime(item) {
    requireBranding(this, NapiPlainDate, 'Temporal.PlainDate');
    const calId = getRealCalendarId(this);
    // Get ISO date string, stripping any calendar annotation
    const baseStr = this.toString().replace(/\[u-ca=[^\]]*\]/, '');
    const calAnnotation = calId && calId !== 'iso8601' ? `[u-ca=${calId}]` : '';
    if (typeof item === 'string') {
      const tz = toNapiTimeZone(item);
      // Per spec: string shorthand uses start-of-day semantics (first instant of the day)
      // which handles DST gaps that skip midnight correctly.
      const zdtStr = baseStr + 'T12:00:00[' + tz.id + ']' + calAnnotation;
      const tempZdt = call(() => NapiZonedDateTime.from(zdtStr));
      const sod = call(() => tempZdt.startOfDay());
      return wrapZonedDateTime(sod, calId);
    }
    if (typeof item === 'object' && item !== null) {
      const tz = toNapiTimeZone(item.timeZone);
      if (item.plainTime === undefined) {
        // Per spec: omitted or undefined plainTime uses start-of-day semantics
        const zdtStr = baseStr + 'T12:00:00[' + tz.id + ']' + calAnnotation;
        const tempZdt = call(() => NapiZonedDateTime.from(zdtStr));
        const sod = call(() => tempZdt.startOfDay());
        return wrapZonedDateTime(sod, calId);
      }
      const t = toNapiPlainTime(item.plainTime);
      const pad2 = n => String(n).padStart(2, '0');
      const pad3 = n => String(n).padStart(3, '0');
      let timeStr = `T${pad2(t.hour)}:${pad2(t.minute)}:${pad2(t.second)}`;
      if (t.millisecond || t.microsecond || t.nanosecond) {
        const frac = pad3(t.millisecond) + pad3(t.microsecond) + pad3(t.nanosecond);
        timeStr += '.' + frac.replace(/0+$/, '');
      }
      const zdtStr = baseStr + timeStr + '[' + tz.id + ']' + calAnnotation;
      const zdt = call(() => NapiZonedDateTime.from(zdtStr));
      return wrapZonedDateTime(zdt, calId);
    }
    throw new TypeError('Invalid argument to toZonedDateTime');
  }

  toPlainYearMonth() {
    requireBranding(this, NapiPlainDate, 'Temporal.PlainDate');
    const calId = getRealCalendarId(this);
    const cal = toNapiCalendar(calId);
    // Use ISO year/month/day from toString() to avoid calendar-year confusion
    const isoDate = _extractISOFromNapiDT(this._inner);
    // For non-ISO-month-aligned calendars, pass the ISO day as reference day
    // because the calendar month boundary doesn't align with ISO month boundaries
    // For ISO-aligned calendars, use day 1 as required by spec
    const refDay = ISO_MONTH_ALIGNED_CALENDARS.has(calId) ? 1 : isoDate.day;
    return wrapPlainYearMonth(call(() => new NapiPlainYearMonth(isoDate.year, isoDate.month, cal, refDay)), calId);
  }

  toPlainMonthDay() {
    requireBranding(this, NapiPlainDate, 'Temporal.PlainDate');
    const calId = this.calendarId;
    // Per spec: for Chinese/Dangi, toPlainMonthDay must apply Table 6 constraining
    // (e.g. M01L day 30 → M01 day 30 with correct reference year)
    if (calId === 'chinese' || calId === 'dangi') {
      return PlainMonthDay.from({ calendar: calId, monthCode: this.monthCode, day: this.day });
    }
    const cal = toNapiCalendar(calId);
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
    // Use _isTemporalX helpers to avoid Proxy traps
    if (_isTemporalPlainTime(arg)) {
      if (options !== undefined) extractOverflow(options);
      return new PlainTime(arg._inner);
    }
    if (arg instanceof NapiPlainTime) {
      if (options !== undefined) extractOverflow(options);
      return new PlainTime(arg);
    }
    if (_isTemporalPlainDateTime(arg)) {
      if (options !== undefined) extractOverflow(options);
      const dt = arg._inner;
      return new PlainTime(call(() => new NapiPlainTime(dt.hour, dt.minute, dt.second, dt.millisecond, dt.microsecond, dt.nanosecond)));
    }
    if (_isTemporalZonedDateTime(arg)) {
      if (options !== undefined) extractOverflow(options);
      return new PlainTime(arg._inner.toPlainTime());
    }
    if (typeof arg === 'object' && arg !== null) {
      // Reject known Temporal objects that are not PlainTime-like
      if (_isTemporalPlainDate(arg) || _isTemporalPlainYearMonth(arg) ||
          _isTemporalPlainMonthDay(arg) || _isTemporalDuration(arg)) {
        throw new TypeError('Invalid argument for PlainTime.from()');
      }
      // Per spec: read time fields in ALPHABETICAL order, coercing each immediately
      const _hour = arg.hour;
      let h = _hour !== undefined ? toIntegerWithTruncation(_hour) : undefined;
      const _microsecond = arg.microsecond;
      let us = _microsecond !== undefined ? toIntegerWithTruncation(_microsecond) : undefined;
      const _millisecond = arg.millisecond;
      let ms = _millisecond !== undefined ? toIntegerWithTruncation(_millisecond) : undefined;
      const _minute = arg.minute;
      let mi = _minute !== undefined ? toIntegerWithTruncation(_minute) : undefined;
      const _nanosecond = arg.nanosecond;
      let ns = _nanosecond !== undefined ? toIntegerWithTruncation(_nanosecond) : undefined;
      const _second = arg.second;
      let s = _second !== undefined ? toIntegerWithTruncation(_second) : undefined;
      // Per spec, at least one time property must be present
      if (_hour === undefined && _microsecond === undefined && _millisecond === undefined &&
          _minute === undefined && _nanosecond === undefined && _second === undefined) {
        throw new TypeError('Invalid PlainTime property bag: at least one time property must be present');
      }
      // Default undefined to 0
      if (h === undefined) h = 0;
      if (mi === undefined) mi = 0;
      if (s === undefined) s = 0;
      if (ms === undefined) ms = 0;
      if (us === undefined) us = 0;
      if (ns === undefined) ns = 0;
      // Read overflow AFTER fields per spec
      const overflow = extractOverflow(options);
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
    validateWithFields(fields, null, 'PlainTime');
    // Per spec: read fields in ALPHABETICAL order, coercing each immediately
    const _hour = fields.hour;
    const h = _hour !== undefined ? toIntegerWithTruncation(_hour) : this.hour;
    const _microsecond = fields.microsecond;
    const us = _microsecond !== undefined ? toIntegerWithTruncation(_microsecond) : this.microsecond;
    const _millisecond = fields.millisecond;
    const ms = _millisecond !== undefined ? toIntegerWithTruncation(_millisecond) : this.millisecond;
    const _minute = fields.minute;
    const mi = _minute !== undefined ? toIntegerWithTruncation(_minute) : this.minute;
    const _nanosecond = fields.nanosecond;
    const ns = _nanosecond !== undefined ? toIntegerWithTruncation(_nanosecond) : this.nanosecond;
    const _second = fields.second;
    const s = _second !== undefined ? toIntegerWithTruncation(_second) : this.second;
    // Check at least one recognized field was provided
    if (_hour === undefined && _microsecond === undefined && _millisecond === undefined &&
        _minute === undefined && _nanosecond === undefined && _second === undefined) {
      throw new TypeError('At least one recognized property must be provided');
    }
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
    if (options === undefined) return call(() => this._inner.toString());
    validateOptions(options);
    // Per spec: read options in alphabetical order (no calendarName for PlainTime)
    // fractionalSecondDigits, roundingMode, smallestUnit
    const roundingOptions = {};
    const _fsd = options.fractionalSecondDigits;
    const fsd = resolveFractionalSecondDigits(_fsd);
    if (fsd !== undefined && fsd !== 'auto') roundingOptions.precision = fsd;
    const _rm = options.roundingMode;
    if (_rm !== undefined) roundingOptions.roundingMode = mapRoundingMode(_rm);
    const _su = options.smallestUnit;
    if (_su !== undefined) {
      const mapped = mapUnit(_su);
      roundingOptions.smallestUnit = mapped;
      if (mapped === 'Minute') roundingOptions.isMinute = true;
    }
    const ro = Object.keys(roundingOptions).length > 0 ? roundingOptions : undefined;
    return call(() => this._inner.toString(ro));
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
    if (_isTemporalPlainDateTime(arg)) {
      if (options !== undefined) extractOverflow(options);
      const r = new PlainDateTime(arg._inner);
      if (arg._calId) r._calId = arg._calId;
      return r;
    }
    if (arg instanceof NapiPlainDateTime) {
      if (options !== undefined) extractOverflow(options);
      return new PlainDateTime(arg);
    }
    if (_isTemporalPlainDate(arg)) {
      if (options !== undefined) extractOverflow(options);
      const d = arg._inner;
      const r = new PlainDateTime(call(() => new NapiPlainDateTime(d.year, d.month, d.day, 0, 0, 0, 0, 0, 0, d.calendar)));
      if (arg._calId) r._calId = arg._calId;
      return r;
    }
    if (_isTemporalZonedDateTime(arg)) {
      if (options !== undefined) extractOverflow(options);
      const r = new PlainDateTime(arg._inner.toPlainDateTime());
      if (arg._calId) r._calId = arg._calId;
      return r;
    }
    if (typeof arg === 'object' && arg !== null) {
      // Per spec: read fields in ALPHABETICAL order, coercing each immediately
      const _calendar = arg.calendar;
      const calId = getCalendarId(_calendar);
      const cal = toNapiCalendar(_calendar);
      // Per spec: read fields in ALPHABETICAL order, coercing each immediately
      const _day = arg.day;
      const day = toInteger(_day);
      const _hour = arg.hour;
      const hour = toInteger(_hour);
      const _microsecond = arg.microsecond;
      const microsecond = toInteger(_microsecond);
      const _millisecond = arg.millisecond;
      const millisecond = toInteger(_millisecond);
      const _minute = arg.minute;
      const minute = toInteger(_minute);
      const _month = arg.month;
      const monthRaw = toInteger(_month);
      const _monthCode = arg.monthCode;
      const monthCodeStr = _monthCode !== undefined ? toStringOption(_monthCode) : undefined;
      const _nanosecond = arg.nanosecond;
      const nanosecond = toInteger(_nanosecond);
      const _second = arg.second;
      const second = toInteger(_second);
      const _year = arg.year;
      const yearVal = toInteger(_year);
      // Read overflow AFTER fields
      const overflow = extractOverflow(options);
      // Validate monthCode syntax
      if (monthCodeStr !== undefined) validateMonthCodeSyntax(monthCodeStr);
      // Resolve era/eraYear for calendars that support them
      let resolvedYear = yearVal;
      const _calValidErasDTF = VALID_ERAS[calId];
      if (_calValidErasDTF && _calValidErasDTF.size > 0) {
        const eraFields = { year: yearVal, era: arg.era, eraYear: toInteger(arg.eraYear) };
        resolveEraYear(eraFields, calId);
        resolvedYear = eraFields.year;
      }
      // Per spec: validate required fields
      if (resolvedYear === undefined) throw new TypeError('Required property year is missing or undefined');
      if (_month === undefined && _monthCode === undefined) throw new TypeError('Required property month or monthCode is missing');
      if (day === undefined) throw new TypeError('Required property day is missing or undefined');
      const monthBag = { month: monthRaw, monthCode: monthCodeStr };
      const month = resolveMonth(monthBag, calId, resolvedYear);
      rejectPropertyBagInfinity({ year: resolvedYear, month, day, hour, minute, second, millisecond, microsecond, nanosecond }, 'year', 'month', 'day', 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond');
      // In reject mode, validate monthCode
      if (overflow === 'Reject' && monthCodeStr !== undefined) {
        if (!isMonthCodeValidForYear(monthCodeStr, calId, resolvedYear)) {
          throw new RangeError(`monthCode ${monthCodeStr} does not exist in year ${resolvedYear} for ${calId} calendar`);
        }
      }
      validateOverflowReject({ year: resolvedYear, month, day }, overflow, cal);
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
      // Constrain month for non-ISO calendars
      let constrainedMonth = month;
      if (overflow !== 'Reject' && !ISO_MONTH_ALIGNED_CALENDARS.has(calId)) {
        const maxM = _getMaxMonthForCalendarYear(calId, resolvedYear);
        constrainedMonth = Math.max(1, Math.min(month, maxM));
      }
      const iso = calendarDateToISO(resolvedYear, constrainedMonth, day, calId);
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

  get year() { const calId = getRealCalendarId(this); if (calId === 'ethioaa') return this._inner.year; return this._inner.year; }
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
    return resolveEraForCalendar(calId, this._inner.year, v, this._inner.eraYear, this._inner.month, this._inner.day).era;
  }
  get eraYear() {
    const calId = getRealCalendarId(this);
    const v = this._inner.eraYear;
    if (v === null) return undefined;
    return resolveEraForCalendar(calId, this._inner.year, this._inner.era, v, this._inner.month, this._inner.day).eraYear;
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
    if (!calSupportsEras && (hasEra || hasEraYear) && calId !== 'iso8601') {
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
      // Extract ISO date from NAPI toString() to avoid calendar-year confusion
      const isoDate = _extractISOFromNapiDT(this._inner);
      const r = new PlainDateTime(call(() => new NapiPlainDateTime(
        isoDate.year, isoDate.month, isoDate.day, 0, 0, 0, 0, 0, 0, cal,
      )));
      r._calId = calId;
      return r;
    }
    const t = toNapiPlainTime(time);
    const cal = toNapiCalendar(calId);
    // Extract ISO date from NAPI toString() to avoid calendar-year confusion
    const isoDate = _extractISOFromNapiDT(this._inner);
    return wrapPlainDateTime(call(() => new NapiPlainDateTime(
      isoDate.year, isoDate.month, isoDate.day,
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
    let disambiguationStr = 'compatible';
    if (disambiguation !== undefined) {
      disambiguationStr = toStringOption(disambiguation);
      if (!DISAMBIGUATION_MAP[disambiguationStr]) throw new RangeError(`Invalid disambiguation option: ${disambiguationStr}`);
    }
    // Use disambiguation to resolve ambiguous/gap local times
    const inner = this._inner;
    const isoYear = inner.isoYear || inner.year;
    const isoMonth = inner.isoMonth || inner.month;
    const isoDay = inner.isoDay || inner.day;
    const resolved = _resolveLocalToEpochMs(
      isoYear, isoMonth, isoDay,
      inner.hour, inner.minute, inner.second, inner.millisecond,
      tz.id, disambiguationStr
    );
    const epochNs = BigInt(resolved.epochMs) * 1000000n +
      BigInt(inner.microsecond) * 1000n + BigInt(inner.nanosecond);
    const zdtStr = bigintNsToZdtString(epochNs, tz.id, this.calendarId !== 'iso8601' ? this.calendarId : 'iso8601');
    return wrapZonedDateTime(call(() => NapiZonedDateTime.from(zdtStr)), getRealCalendarId(this));
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
    const isoFields = _extractISOFromNapiDT(inner);
    const d = new Date(0);
    d.setUTCFullYear(isoFields.year, isoFields.month - 1, isoFields.day);
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
      // Per spec: constructor requires a timezone identifier, not an ISO string
      if (typeof timeZone === 'string' && /\[/.test(timeZone)) {
        throw new RangeError(`"${timeZone}" is not a valid time zone identifier`);
      }
      const tz = toNapiTimeZone(timeZone);
      rejectISOStringAsCalendar(calendar);
      const cal = toNapiCalendar(calendar);
      // Use string-based construction to preserve nanosecond precision
      const tzId = tz ? tz.id : 'UTC';
      const calId = cal ? cal.id : 'iso8601';
      try {
        // Cache NAPI inner objects by (epochNs, tzId, calId) for repeated constructions
        const cacheKey = `${epochNanoseconds}|${tzId}|${calId}`;
        const cached = _napiZdtCache.get(cacheKey);
        if (cached) {
          this._inner = cached;
        } else {
          const zdtStr = bigintNsToZdtString(epochNanoseconds, tzId, calId);
          this._inner = call(() => NapiZonedDateTime.from(zdtStr));
          if (_napiZdtCache.size < 1000) _napiZdtCache.set(cacheKey, this._inner);
        }
      } catch {
        // For extreme epoch values where the local time is out of representable range,
        // try an alternative approach: use UTC string with the timezone annotation.
        // The NAPI should be able to handle the UTC instant even if the local
        // wall-clock time is extreme.
        try {
          const utcStr = bigintNsToZdtString(epochNanoseconds, 'UTC', calId);
          const fallbackStr = utcStr.replace('[UTC]', '[' + tzId + ']');
          this._inner = call(() => NapiZonedDateTime.from(fallbackStr));
        } catch {
          // Last resort: construct at the nearest representable boundary
          // For named timezones at extreme epochs, the local wall-clock time may exceed
          // the ISO date range even though the instant is valid. Compute the actual offset
          // using Intl.DateTimeFormat and build the string with the correct offset.
          try {
            const isFixedOffset = /^[+-]\d{2}(:\d{2})?$/.test(tzId);
            if (isFixedOffset) {
              const offset = tzId.length <= 3 ? tzId + ':00' : tzId;
              const boundary = epochNanoseconds < 0n
                ? `-271821-04-20T00:00:00${offset}[${tzId}]`
                : `+275760-09-13T00:00:00${offset}[${tzId}]`;
              const calStr = calId !== 'iso8601' ? `[u-ca=${calId}]` : '';
              this._inner = call(() => NapiZonedDateTime.from(boundary + calStr));
            } else {
              // Named timezone: compute the actual offset at a nearby representable epoch,
              // then use a representable ISO date near the boundary with that offset.
              // We need an epoch ms within Date range where _getOffsetMs works.
              const msNum = Number(epochNanoseconds / 1000000n);
              const safeMs = epochNanoseconds < 0n
                ? Math.max(msNum, -8639999900000000) // safely within range
                : Math.min(msNum, 8639999900000000);
              const offsetMs = _getOffsetMs(safeMs, tzId);
              const totalSeconds = Math.round(offsetMs / 1000);
              const sign = totalSeconds >= 0 ? '+' : '-';
              const absSeconds = Math.abs(totalSeconds);
              const offHr = String(Math.floor(absSeconds / 3600)).padStart(2, '0');
              const offMn = String(Math.floor((absSeconds % 3600) / 60)).padStart(2, '0');
              const offSc = absSeconds % 60;
              const offset = offSc !== 0
                ? sign + offHr + ':' + offMn + ':' + String(offSc).padStart(2, '0')
                : sign + offHr + ':' + offMn;
              const calStr = calId !== 'iso8601' ? `[u-ca=${calId}]` : '';
              // Use a safe date near the boundary
              const boundary = epochNanoseconds < 0n
                ? `-271821-04-20T00:00:00${offset}[${tzId}]${calStr}`
                : `+275760-09-13T00:00:00${offset}[${tzId}]${calStr}`;
              this._inner = call(() => NapiZonedDateTime.from(boundary));
            }
          } catch {
            throw new RangeError('ZonedDateTime out of representable range');
          }
        }
      }
      this._epochNs = epochNanoseconds;
      this._tzId = tzId;
      if (typeof calendar === 'string') this._calId = canonicalizeCalendarId(calendar);
    }
    _wrapperSet.add(this);
  }

  // Check if the local wall clock time is within representable range
  // For extreme epoch ns with offset timezones, the local time may be out of range.
  // The start-of-day computation needs to go to midnight, which is even more extreme.
  _checkLocalTimeInRange() {
    if (this._epochNs !== undefined) {
      const tzId = this._tzId || this.timeZoneId;
      if (tzId && tzId !== 'UTC' && /^[+-]\d{2}(:\d{2})?$/.test(tzId)) {
        const epochMs = Number(this._epochNs / 1000000n);
        const sign = tzId[0] === '+' ? 1 : -1;
        const h = parseInt(tzId.substring(1, 3), 10);
        const m = tzId.length > 3 ? parseInt(tzId.substring(4, 6), 10) : 0;
        const offsetMs = sign * (h * 3600000 + m * 60000);
        // The start-of-day computation needs to find midnight of the local day,
        // which could be up to 24h before/after the local time.
        // Use a tighter check: the LOCAL midnight must be representable as an Instant.
        // Local midnight epoch = (local_date_at_midnight - offset) must be in [-8.64e18, 8.64e18]
        // Local time = epochMs + offsetMs
        // Local midnight = floor(local time to day boundary)
        // Instant at local midnight = local midnight - offsetMs
        // This instant must be in Instant range [-8.64e15, 8.64e15]
        const localMs = epochMs + offsetMs;
        const localDayMs = Math.floor(localMs / 86400000) * 86400000;
        const midnightEpochMs = localDayMs - offsetMs;
        // Also check the next day's midnight
        const nextMidnightEpochMs = midnightEpochMs + 86400000;
        const limit = 8640000000000000;
        if (midnightEpochMs < -limit || midnightEpochMs > limit ||
            nextMidnightEpochMs < -limit || nextMidnightEpochMs > limit) {
          throw new RangeError('ZonedDateTime local time is outside the representable range');
        }
      }
    }
  }

  static from(arg, options) {
    if (typeof arg === 'string') {
      rejectTooManyFractionalSeconds(arg);
      // Per spec: parse string first, then validate options
      // Detect invalid ZonedDateTime strings (missing time zone annotation) before options validation
      if (!/\[/.test(arg)) {
        throw new RangeError('ZonedDateTime requires a time zone annotation in brackets');
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
        } else if (content.includes('=')) {
          // Per spec: annotation keys must be lowercase (a-z, 0-9, hyphen only)
          const keyMatch = content.match(/^([^=]+)=/);
          if (keyMatch) {
            const key = keyMatch[1];
            if (/[A-Z]/.test(key)) {
              throw new RangeError(`Annotation key must be lowercase: ${ann}`);
            }
          }
          if (isCritical) {
            // Unknown critical annotation
            throw new RangeError(`Unknown critical annotation: ${ann}`);
          }
        }
      }
      if (calAnnotationCount > 1 && hasCriticalCal) {
        throw new RangeError('Multiple calendar annotations with critical flag are not allowed');
      }
      // Strip the critical flag (!) from timezone annotation for NAPI
      const cleanArg = arg.replace(/\[!/, '[');
      // Validate the string can be parsed before reading options (per spec)
      // Try a quick parse to detect obviously invalid strings like 2020-13-34T25:60:60+99:99[UTC]
      const _quickParsed = _parseZdtStringParts(cleanArg);
      if (_quickParsed) {
        // Validate month/day/time ranges
        if (_quickParsed.isoMonth < 1 || _quickParsed.isoMonth > 12) throw new RangeError('Parsed month value not in a valid range.');
        if (_quickParsed.isoDay < 1 || _quickParsed.isoDay > 31) throw new RangeError('Parsed day value not in a valid range.');
        if (_quickParsed.hour > 23) throw new RangeError('Parsed hour value not in a valid range.');
        if (_quickParsed.minute > 59) throw new RangeError('Parsed minute value not in a valid range.');
        // Note: second=60 is a leap second, accepted per spec (treated as 59)
        if (_quickParsed.second > 60) throw new RangeError('Parsed second value not in a valid range.');
      }
      // Extract calId from annotation for preservation
      const _zdtCalMatch = arg.match(/\[u-ca=([^\]]+)\]/);
      const _zdtCalId = _zdtCalMatch ? canonicalizeCalendarId(_zdtCalMatch[1]) : undefined;

      // Now validate and read options (per spec: after string parsing, before use)
      validateOptions(options);
      // Read option values exactly once each, in alphabetical order per spec
      const _disambigVal = options !== undefined && options !== null ? options.disambiguation : undefined;
      let disambiguation = 'compatible';
      if (_disambigVal !== undefined) {
        disambiguation = toStringOption(_disambigVal);
        if (!DISAMBIGUATION_MAP[disambiguation]) throw new RangeError(`Invalid disambiguation option: ${disambiguation}`);
      }
      const _offsetVal = options !== undefined && options !== null ? options.offset : undefined;
      let offsetMode = 'reject';
      if (_offsetVal !== undefined) {
        offsetMode = toStringOption(_offsetVal);
        if (!['use', 'prefer', 'ignore', 'reject'].includes(offsetMode)) {
          throw new RangeError(`Invalid offset option: ${offsetMode}`);
        }
      }
      const _overflowVal = options !== undefined && options !== null ? options.overflow : undefined;
      if (_overflowVal !== undefined) {
        const os = toStringOption(_overflowVal);
        if (!OVERFLOW_MAP[os]) throw new RangeError(`Invalid overflow option: ${os}`);
      }

      // Check if string has an explicit offset
      const bracketIdx = cleanArg.indexOf('[');
      const dtPart = cleanArg.substring(0, bracketIdx);
      const hasExplicitOffset = /[+-]\d{2}(:\d{2})?(:\d{2}(\.\d+)?)?$/.test(dtPart) || dtPart.endsWith('Z');

      if (offsetMode === 'ignore' || (!hasExplicitOffset && disambiguation !== 'compatible')) {
        // Need to use our disambiguation logic
        // Parse the local datetime from the string
        const parsed = _parseZdtStringParts(cleanArg);
        if (parsed) {
          const resolved = _resolveLocalToEpochMs(
            parsed.isoYear, parsed.isoMonth, parsed.isoDay,
            parsed.hour, parsed.minute, parsed.second, parsed.millisecond,
            parsed.tzId, disambiguation
          );
          const epochNs = BigInt(resolved.epochMs) * 1000000n +
            BigInt(parsed.microsecond) * 1000n + BigInt(parsed.nanosecond);
          // Use the ZonedDateTime constructor which handles extreme values with fallbacks
          try {
            return new ZonedDateTime(epochNs, parsed.tzId, _zdtCalId !== 'iso8601' ? _zdtCalId : undefined);
          } catch {
            // Fallback to NAPI string-based construction
            const zdtStr = bigintNsToZdtString(epochNs, parsed.tzId, _zdtCalId || 'iso8601');
            const inner = call(() => NapiZonedDateTime.from(zdtStr));
            return wrapZonedDateTime(inner, _zdtCalId);
          }
        }
        // Fallback to removing offset
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
          // Fall back to disambiguation-based resolution
          const parsed = _parseZdtStringParts(cleanArg);
          if (parsed) {
            const resolved = _resolveLocalToEpochMs(
              parsed.isoYear, parsed.isoMonth, parsed.isoDay,
              parsed.hour, parsed.minute, parsed.second, parsed.millisecond,
              parsed.tzId, disambiguation
            );
            const epochNs = BigInt(resolved.epochMs) * 1000000n +
              BigInt(parsed.microsecond) * 1000n + BigInt(parsed.nanosecond);
            const zdtStr = bigintNsToZdtString(epochNs, parsed.tzId, _zdtCalId || 'iso8601');
            const inner2 = call(() => NapiZonedDateTime.from(zdtStr));
            return wrapZonedDateTime(inner2, _zdtCalId);
          }
          const stripped = cleanArg.replace(/([T\d.]+)[+-]\d{2}(:\d{2})?(:\d{2}(\.\d+)?)?(\[)/, '$1$5')
                              .replace(/([T\d.]+)Z(\[)/, '$1$2');
          const inner = call(() => NapiZonedDateTime.from(stripped));
          return wrapZonedDateTime(inner, _zdtCalId);
        }
        throw e;
      }
    }
    validateOptions(options);
    if (_isTemporalZonedDateTime(arg) || arg instanceof NapiZonedDateTime) {
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
      // Read options once each in alphabetical order per spec: disambiguation, offset, overflow
      let _pbDisambiguation = 'compatible';
      const _pbDisambigVal = options !== undefined && options !== null ? options.disambiguation : undefined;
      if (_pbDisambigVal !== undefined) {
        _pbDisambiguation = toStringOption(_pbDisambigVal);
        if (!DISAMBIGUATION_MAP[_pbDisambiguation]) throw new RangeError(`Invalid disambiguation option: ${_pbDisambiguation}`);
      }
      let offsetMode = 'reject';
      const _pbOffsetVal = options !== undefined && options !== null ? options.offset : undefined;
      if (_pbOffsetVal !== undefined) {
        offsetMode = toStringOption(_pbOffsetVal);
        if (!OFFSET_DISAMBIGUATION_MAP[offsetMode]) throw new RangeError(`Invalid offset option: ${offsetMode}`);
      }
      const _pbOverflowVal = options !== undefined && options !== null ? options.overflow : undefined;
      let overflow;
      if (_pbOverflowVal !== undefined) {
        overflow = mapOverflow(toStringOption(_pbOverflowVal));
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
        // For non-ISO calendars, also check calendar-specific daysInMonth
        if (calId !== 'iso8601' && calId !== 'gregory') {
          const dim = calendarDaysInMonth(year, _trunc(month), calId);
          if (dim !== undefined && _trunc(day) > dim) {
            throw new RangeError(`day ${day} out of range for month ${month} in ${calId} calendar (max ${dim} days)`);
          }
        }
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
      }
      // Use previously read disambiguation value
      const disambiguation = _pbDisambiguation;
      const calAnnotation = calId && calId !== 'iso8601' ? `[u-ca=${calId}]` : '';
      const pad3 = n => String(n || 0).padStart(3, '0');
      const buildFrac = () => {
        if (millisecond || microsecond || nanosecond) {
          const frac = pad3(millisecond) + pad3(microsecond) + pad3(nanosecond);
          return '.' + frac.replace(/0+$/, '');
        }
        return '';
      };

      if (offsetProp !== undefined) {
        // With offset: behavior depends on offsetMode
        const baseStr = `${padYear(isoYear)}-${pad2(isoMonth)}-${pad2(isoDay)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}${buildFrac()}`;
        if (offsetMode === 'ignore') {
          // Ignore offset: use disambiguation to resolve
          const resolved = _resolveLocalToEpochMs(isoYear, isoMonth, isoDay, hour, minute, second, millisecond, tz.id, disambiguation);
          const zdtStr = bigintNsToZdtString(
            BigInt(resolved.epochMs) * 1000000n + BigInt(microsecond) * 1000n + BigInt(nanosecond),
            tz.id, calId !== 'iso8601' ? calId : 'iso8601'
          );
          const zdtR = new ZonedDateTime(call(() => NapiZonedDateTime.from(zdtStr)));
          zdtR._calId = calId;
          return zdtR;
        }
        if (offsetMode === 'use') {
          // Use the provided offset to determine the instant
          const str = baseStr + offsetProp + '[' + tz.id + ']' + calAnnotation;
          const zdtR = _zdtFromStringWithOffset(str, 'use');
          zdtR._calId = calId;
          return zdtR;
        }
        // reject or prefer: validate offset matches timezone
        // For property bags, per spec: offset must match EXACTLY (no fuzzy minute-rounding)
        // But during DST overlaps, both offsets are valid
        if (offsetMode === 'reject' && offsetProp !== undefined) {
          const providedOffsetNs = parseOffsetStringToNs(offsetProp);
          if (providedOffsetNs !== undefined) {
            // Check all possible offsets at this local time (earlier and later for overlaps)
            let offsetMatches = false;
            for (const disamb of ['compatible', 'earlier', 'later']) {
              try {
                const resolved = _resolveLocalToEpochMs(isoYear, isoMonth, isoDay, hour, minute, second, millisecond, tz.id, disamb);
                const actualOffsetNs = _getOffsetNsAtEpoch(resolved.epochMs, tz.id);
                if (providedOffsetNs === actualOffsetNs) { offsetMatches = true; break; }
              } catch { /* gap/reject - skip */ }
            }
            if (!offsetMatches) {
              throw new RangeError(`Offset ${offsetProp} does not match the time zone offset for ${tz.id}`);
            }
          }
        }
        const str = baseStr + offsetProp + '[' + tz.id + ']' + calAnnotation;
        try {
          const zdtR = new ZonedDateTime(call(() => NapiZonedDateTime.from(str)));
          zdtR._calId = calId;
          return zdtR;
        } catch (e) {
          if (offsetMode === 'prefer' && e instanceof RangeError) {
            // Fall back to disambiguation-based resolution
            const resolved = _resolveLocalToEpochMs(isoYear, isoMonth, isoDay, hour, minute, second, millisecond, tz.id, disambiguation);
            const zdtStr = bigintNsToZdtString(
              BigInt(resolved.epochMs) * 1000000n + BigInt(microsecond) * 1000n + BigInt(nanosecond),
              tz.id, calId !== 'iso8601' ? calId : 'iso8601'
            );
            const zdtR2 = new ZonedDateTime(call(() => NapiZonedDateTime.from(zdtStr)));
            zdtR2._calId = calId;
            return zdtR2;
          }
          throw e;
        }
      } else {
        // No offset: use disambiguation to resolve the local time
        const resolved = _resolveLocalToEpochMs(isoYear, isoMonth, isoDay, hour, minute, second, millisecond, tz.id, disambiguation);
        const epochNs = BigInt(resolved.epochMs) * 1000000n + BigInt(microsecond) * 1000n + BigInt(nanosecond);
        const zdtStr = bigintNsToZdtString(epochNs, tz.id, calId !== 'iso8601' ? calId : 'iso8601');
        const zdtR = new ZonedDateTime(call(() => NapiZonedDateTime.from(zdtStr)));
        zdtR._calId = calId;
        return zdtR;
      }
    }
    throw new TypeError('Invalid argument for ZonedDateTime.from()');
  }

  static compare(one, two) {
    const a = toNapiZonedDateTime(one);
    const b = toNapiZonedDateTime(two);
    return NapiZonedDateTime.compareInstant(a, b);
  }

  get year() { const calId = getRealCalendarId(this); if (calId === 'ethioaa') return this._inner.year; return this._inner.year; }
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
    return resolveEraForCalendar(calId, this._inner.year, v, this._inner.eraYear, this._inner.month, this._inner.day).era;
  }
  get eraYear() {
    const calId = getRealCalendarId(this);
    const v = this._inner.eraYear;
    if (v === null) return undefined;
    return resolveEraForCalendar(calId, this._inner.year, this._inner.era, v, this._inner.month, this._inner.day).eraYear;
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
  get hoursInDay() { this._checkLocalTimeInRange(); return call(() => this._inner.hoursInDay); }

  with(fields, options) {
    validateWithFields(fields, ZONED_DATETIME_FIELDS, 'ZonedDateTime');
    const calId = this.calendarId;
    // Per spec: era and eraYear are mutually exclusive with year.
    const hasEra = fields.era !== undefined;
    const hasEraYear = fields.eraYear !== undefined;
    const hasYear = fields.year !== undefined;
    const calValidEras = VALID_ERAS[calId];
    const calSupportsEras = calValidEras && calValidEras.size > 0;
    if (!calSupportsEras && (hasEra || hasEraYear) && calId !== 'iso8601') {
      throw new TypeError(`era and eraYear are not valid for the ${calId} calendar`);
    }
    if (calSupportsEras && (hasEra !== hasEraYear)) {
      throw new TypeError('era and eraYear must be provided together');
    }
    // Read fields once upfront to avoid double valueOf calls on observables
    const merged = {
      day: fields.day !== undefined ? toInteger(fields.day) : this.day,
      hour: fields.hour !== undefined ? toInteger(fields.hour) : this.hour,
      minute: fields.minute !== undefined ? toInteger(fields.minute) : this.minute,
      second: fields.second !== undefined ? toInteger(fields.second) : this.second,
      millisecond: fields.millisecond !== undefined ? toInteger(fields.millisecond) : this.millisecond,
      microsecond: fields.microsecond !== undefined ? toInteger(fields.microsecond) : this.microsecond,
      nanosecond: fields.nanosecond !== undefined ? toInteger(fields.nanosecond) : this.nanosecond,
      offset: fields.offset !== undefined ? fields.offset : this.offset,
    };
    if (calSupportsEras && hasEra && hasEraYear) {
      merged.era = fields.era;
      merged.eraYear = toInteger(fields.eraYear);
    } else if (hasYear) {
      merged.year = toInteger(fields.year);
    } else {
      merged.year = this.year;
      merged.era = this.era;
      merged.eraYear = this.eraYear;
    }
    // Resolve era/eraYear to get target year for monthCode resolution
    resolveEraYear(merged, calId);
    // Set month/monthCode from original only if not being overridden
    // Defer calendar-specific monthCode validation until after options are read (per spec)
    // Read month once to avoid double valueOf
    const _fieldsMonth = fields.month !== undefined ? toInteger(fields.month) : undefined;
    let _pendingMonthCodeValidation = null; // deferred monthCode to validate with calendar
    if (_fieldsMonth !== undefined && fields.monthCode !== undefined) {
      merged.month = _fieldsMonth;
      _pendingMonthCodeValidation = { monthCode: fields.monthCode, month: _fieldsMonth };
    } else if (_fieldsMonth !== undefined) {
      merged.month = _fieldsMonth;
    } else if (fields.monthCode !== undefined) {
      // Use calendar-aware monthCode resolution to get correct ordinal month.
      // This handles Hebrew M06→7 in leap years, Chinese/Dangi leap month shifts, etc.
      // Syntax validation is deferred via _pendingMonthCodeValidation.
      try {
        merged.month = monthCodeToMonth(fields.monthCode, calId, merged.year);
      } catch {
        // If monthCodeToMonth throws (syntax error), do naive extraction and let deferred validation handle it
        const mc = fields.monthCode;
        const mcMatch = typeof mc === 'string' ? mc.match(/^M(\d{2})(L?)$/) : null;
        if (mcMatch) {
          const num = parseInt(mcMatch[1], 10);
          merged.month = mcMatch[2] === 'L' ? num + 1 : num;
        } else {
          merged.month = 1; // will be caught by deferred validation
        }
      }
      _pendingMonthCodeValidation = { monthCode: fields.monthCode, calId, year: merged.year };
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
    // Read all options in alphabetical order after field validation but before algorithmic validation
    validateOptions(options);
    const _withDisambigRaw = options !== undefined && options !== null ? options.disambiguation : undefined;
    let _withDisambigStr;
    if (_withDisambigRaw !== undefined) {
      _withDisambigStr = toStringOption(_withDisambigRaw);
      if (!DISAMBIGUATION_MAP[_withDisambigStr]) throw new RangeError(`Invalid disambiguation option: ${_withDisambigStr}`);
    }
    const _withOffsetRaw = options !== undefined && options !== null ? options.offset : undefined;
    let _withOffsetStr;
    if (_withOffsetRaw !== undefined) {
      _withOffsetStr = toStringOption(_withOffsetRaw);
      if (!OFFSET_DISAMBIGUATION_MAP[_withOffsetStr]) throw new RangeError(`Invalid offset option: ${_withOffsetStr}`);
    }
    const _withOverflowRaw = options !== undefined && options !== null ? options.overflow : undefined;
    let overflow;
    if (_withOverflowRaw !== undefined) {
      overflow = mapOverflow(toStringOption(_withOverflowRaw));
    }
    // Now perform deferred calendar-specific monthCode validation
    if (_pendingMonthCodeValidation) {
      if (_pendingMonthCodeValidation.month !== undefined) {
        // Validate month/monthCode agreement
        const fromCode = monthCodeToMonth(_pendingMonthCodeValidation.monthCode, calId, merged.year);
        if (_trunc(_pendingMonthCodeValidation.month) !== fromCode) {
          throw new RangeError(`month ${_pendingMonthCodeValidation.month} and monthCode ${_pendingMonthCodeValidation.monthCode} do not agree`);
        }
      } else if (_pendingMonthCodeValidation.calId) {
        // Validate monthCode is valid for the calendar
        monthCodeToMonth(_pendingMonthCodeValidation.monthCode, _pendingMonthCodeValidation.calId, _pendingMonthCodeValidation.year);
      }
    }
    // For non-ISO calendars, constrain day to daysInMonth before converting
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
    // Per spec: ZonedDateTime.prototype.with defaults to offset: 'prefer', disambiguation: 'compatible'
    // Pass already-resolved string values to avoid double property reads on proxy options
    const withOptions = {};
    if (_withDisambigStr !== undefined) withOptions.disambiguation = _withDisambigStr;
    withOptions.offset = _withOffsetStr !== undefined ? _withOffsetStr : 'prefer';
    if (overflow !== undefined) withOptions.overflow = overflow === 'Reject' ? 'reject' : 'constrain';
    return ZonedDateTime.from(merged, withOptions);
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
      this._checkLocalTimeInRange();
      return this.startOfDay();
    }
    const t = toNapiPlainTime(time);
    // For extreme epoch values with offset timezones, compute correct local date
    let localYear = this.year, localMonth = this.month, localDay = this.day;
    if (this._epochNs !== undefined) {
      const tzId = this._tzId || this.timeZoneId;
      if (tzId && /^[+-]\d{2}(:\d{2})?$/.test(tzId)) {
        const sign = tzId[0] === '+' ? 1n : -1n;
        const h = BigInt(parseInt(tzId.substring(1, 3), 10));
        const m = tzId.length > 3 ? BigInt(parseInt(tzId.substring(4, 6), 10)) : 0n;
        const offsetNs = sign * (h * 3600000000000n + m * 60000000000n);
        const localNs = this._epochNs + offsetNs;
        const nsPerDay = 86400000000000n;
        let epochDays = localNs / nsPerDay;
        if (localNs % nsPerDay < 0n) epochDays -= 1n;
        const isoDate = epochDaysToISO(Number(epochDays));
        localYear = isoDate.year;
        localMonth = isoDate.month;
        localDay = isoDate.day;
        // Check if the resulting epoch ns would be in range
        const newLocalMs = Date.UTC(localYear, localMonth - 1, localDay, t.hour, t.minute, t.second);
        const offsetMs = Number(offsetNs / 1000000n);
        const newEpochMs = newLocalMs - offsetMs;
        const limit = 8640000000000000;
        if (newEpochMs < -limit || newEpochMs > limit) {
          throw new RangeError('ZonedDateTime out of representable range');
        }
      }
    }
    const merged = {
      year: localYear, month: localMonth, day: localDay,
      hour: t.hour, minute: t.minute, second: t.second,
      millisecond: t.millisecond, microsecond: t.microsecond, nanosecond: t.nanosecond,
      timeZone: this.timeZoneId, calendar: this.calendarId,
    };
    // withPlainTime defaults to offset: 'prefer', disambiguation: 'compatible'
    return ZonedDateTime.from(merged, { offset: 'prefer' });
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
    if (typeof options === 'string') {
      const obj = Object.create(null);
      obj.smallestUnit = options;
      options = obj;
    }
    validateOptions(options);
    // Per spec: ZDT.round reads only roundingIncrement, roundingMode, smallestUnit (no largestUnit)
    const opts = Object.create(null);
    const _ri = options.roundingIncrement;
    if (_ri !== undefined) opts.roundingIncrement = coerceRoundingIncrement(_ri);
    const _rm = options.roundingMode;
    if (_rm !== undefined) opts.roundingMode = mapRoundingMode(_rm);
    const _su = options.smallestUnit;
    if (_su !== undefined) opts.smallestUnit = mapUnit(_su);
    this._checkLocalTimeInRange();
    return wrapZonedDateTime(call(() => this._inner.round(opts)), getRealCalendarId(this));
  }

  equals(other) {
    const otherInner = toNapiZonedDateTime(other);
    // Per spec: ZDT.equals compares epoch nanoseconds, timezone ID (canonicalized), and calendar ID.
    // Short-circuit: if canonical timezone IDs differ, they're not equal.
    try {
      const thisTzId = this._inner.timeZone.id;
      const otherTzId = otherInner.timeZone.id;
      if (thisTzId !== otherTzId) {
        // Canonicalize and compare
        const thisCanon = _canonicalTzId(thisTzId);
        const otherCanon = _canonicalTzId(otherTzId);
        if (thisCanon !== otherCanon) return false;
      }
    } catch { /* fall through to NAPI */ }
    return call(() => this._inner.equals(otherInner));
  }

  startOfDay() {
    this._checkLocalTimeInRange();
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
    // For extreme epoch nanoseconds with large UTC offsets, the NAPI's internal
    // representation may be incorrect. Use manual computation via BigInt arithmetic
    // to get the correct local date/time.
    if (this._epochNs !== undefined) {
      const tzId = this._tzId || this.timeZoneId;
      if (tzId && /^[+-]\d{2}(:\d{2})?$/.test(tzId)) {
        const sign = tzId[0] === '+' ? 1n : -1n;
        const h = BigInt(parseInt(tzId.substring(1, 3), 10));
        const m = tzId.length > 3 ? BigInt(parseInt(tzId.substring(4, 6), 10)) : 0n;
        const offsetNs = sign * (h * 3600000000000n + m * 60000000000n);
        const localNs = this._epochNs + offsetNs;
        // Convert nanoseconds to date/time components
        const nsPerDay = 86400000000000n;
        let dayNs = localNs % nsPerDay;
        let epochDays = localNs / nsPerDay;
        if (dayNs < 0n) { dayNs += nsPerDay; epochDays -= 1n; }
        const totalNs = Number(dayNs);
        const hour = Math.floor(totalNs / 3600000000000) % 24;
        const minute = Math.floor(totalNs / 60000000000) % 60;
        const second = Math.floor(totalNs / 1000000000) % 60;
        const millisecond = Math.floor(totalNs / 1000000) % 1000;
        const microsecond = Math.floor(totalNs / 1000) % 1000;
        const nanosecond = totalNs % 1000;
        // Convert epoch days to ISO date
        const isoDate = epochDaysToISO(Number(epochDays));
        try {
          const cal = toNapiCalendar(getRealCalendarId(this));
          const pdt = call(() => new NapiPlainDateTime(isoDate.year, isoDate.month, isoDate.day, hour, minute, second, millisecond, microsecond, nanosecond, cal));
          return wrapPlainDateTime(pdt, getRealCalendarId(this));
        } catch { /* fall through to NAPI */ }
      }
    }
    return call(() => wrapPlainDateTime(this._inner.toPlainDateTime(), getRealCalendarId(this)));
  }

  getTimeZoneTransition(directionParam) {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    // Per spec: GetOptionsObject first, then GetDirectionOption
    // GetOptionsObject: undefined → TypeError, string → treated as shorthand,
    // null/boolean/number/bigint/symbol → TypeError, object/function → extract property
    if (directionParam === undefined || directionParam === null) {
      throw new TypeError('options must be an object');
    }
    let dir;
    if (typeof directionParam === 'string') {
      // String shorthand: the string IS the direction value
      if (directionParam !== 'next' && directionParam !== 'previous') {
        throw new RangeError('direction must be "next" or "previous"');
      }
      dir = directionParam;
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
      // boolean, number, bigint, symbol → TypeError (not a valid options object)
      throw new TypeError('options must be an object or string');
    }
    return _findTimeZoneTransition(this, dir);
  }

  toString(options) {
    if (options !== undefined) validateOptions(options);
    if (options === undefined) {
      return call(() => this._inner.toString());
    }
    // Per spec: read options in ALPHABETICAL order, each once, coercing immediately
    const _cnRaw = options.calendarName;
    const displayCalendar = _cnRaw !== undefined ? mapDisplayCalendar(_cnRaw) : undefined;
    const _fsdRaw = options.fractionalSecondDigits;
    const fsd = resolveFractionalSecondDigits(_fsdRaw);
    const _offRaw = options.offset;
    const displayOffset = _offRaw !== undefined ? mapDisplayOffset(_offRaw) : undefined;
    const _rmRaw = options.roundingMode;
    const roundingMode = _rmRaw !== undefined ? mapRoundingMode(_rmRaw) : 'Trunc';
    let smallestUnit;
    const _suRaw = options.smallestUnit;
    if (_suRaw !== undefined) {
      if (typeof _suRaw === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
      const su = String(_suRaw);
      const UNIT_ALIAS = { minutes: 'minute', seconds: 'second', milliseconds: 'millisecond', microseconds: 'microsecond', nanoseconds: 'nanosecond' };
      const canonical = UNIT_ALIAS[su] || su;
      const VALID_UNITS = new Set(['minute', 'second', 'millisecond', 'microsecond', 'nanosecond']);
      if (!VALID_UNITS.has(canonical)) {
        throw new RangeError(`Invalid smallestUnit for ZonedDateTime.toString: ${su}`);
      }
      smallestUnit = canonical;
    }
    const _tznRaw = options.timeZoneName;
    const displayTimeZone = _tznRaw !== undefined ? mapDisplayTimeZone(_tznRaw) : undefined;

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
      // Remove offset before timezone bracket or at end of string
      str = str.replace(/([T\d.:]+)[+-]\d{2}:\d{2}(:\d{2})?(\[|$)/, '$1$3');
      str = str.replace(/([T\d.:]+)Z(\[|$)/, '$1$2');
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
    // Parse duration and compute total nanoseconds using BigInt for precision
    const { dur, totalNs } = _parseDurationForInstant(durationArg);
    const currentNs = this.epochNanoseconds;
    const resultNs = currentNs + totalNs;
    return new Instant(resultNs);
  }

  subtract(durationArg) {
    // Parse duration and compute total nanoseconds using BigInt for precision
    const { dur, totalNs } = _parseDurationForInstant(durationArg);
    const currentNs = this.epochNanoseconds;
    const resultNs = currentNs - totalNs;
    return new Instant(resultNs);
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
    // Per spec, read options in alphabetical order, each exactly once:
    // fractionalSecondDigits, roundingMode, smallestUnit, timeZone
    const _fsdRaw = options.fractionalSecondDigits;
    const fsd = resolveFractionalSecondDigits(_fsdRaw);
    const _rmRaw = options.roundingMode;
    const roundingMode = _rmRaw !== undefined ? mapRoundingMode(_rmRaw) : 'Trunc';
    let smallestUnit;
    const _suRaw = options.smallestUnit;
    if (_suRaw !== undefined) {
      const su = toStringOption(_suRaw);
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
      // Per spec: validate calendar BEFORE coercing referenceDay
      rejectISOStringAsCalendar(calendar);
      const cal = toNapiCalendar(calendar);
      const rd = referenceDay !== undefined ? toIntegerWithTruncation(referenceDay) : referenceDay;
      // Per spec: constructor always rejects out-of-range ISO values
      if (rd !== undefined) rejectISODateRange(y, m, rd);
      else if (m < 1 || m > 12) throw new RangeError('Month out of range');
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
    if (_isTemporalPlainYearMonth(arg)) {
      if (options !== undefined) extractOverflow(options);
      const r = new PlainYearMonth(arg._inner);
      if (arg._calId) r._calId = arg._calId;
      return r;
    }
    if (arg instanceof NapiPlainYearMonth) {
      if (options !== undefined) extractOverflow(options);
      return new PlainYearMonth(arg);
    }
    if (typeof arg === 'object' && arg !== null) {
      // Per spec: read fields in ALPHABETICAL order, coercing each immediately
      const _calendar = arg.calendar;
      const calId = getCalendarId(_calendar);
      const cal = toNapiCalendar(_calendar);
      const _month = arg.month;
      const rawMonth = toInteger(_month);
      const _monthCode = arg.monthCode;
      const rawMonthCode = _monthCode !== undefined ? toStringOption(_monthCode) : undefined;
      const _year = arg.year;
      const yearVal = toInteger(_year);
      // Read overflow AFTER fields
      const overflow = extractOverflow(options);
      // Per spec: validate monthCode SYNTAX before checking year type
      if (rawMonthCode !== undefined) {
        validateMonthCodeSyntax(rawMonthCode);
      }
      // Resolve era/eraYear for calendars that support them
      let resolvedYear = yearVal;
      const _calValidErasYMF = VALID_ERAS[calId];
      if (_calValidErasYMF && _calValidErasYMF.size > 0) {
        const eraFields = { year: yearVal, era: arg.era, eraYear: toInteger(arg.eraYear) };
        resolveEraYear(eraFields, calId);
        resolvedYear = eraFields.year;
      }
      if (resolvedYear === undefined) throw new TypeError('Required property year is missing or undefined');
      const month = resolveMonth({ month: rawMonth, monthCode: rawMonthCode }, calId, resolvedYear);
      if (month === undefined && rawMonthCode === undefined) throw new TypeError('Required property month or monthCode is missing');
      rejectPropertyBagInfinity({ year: resolvedYear, month }, 'year', 'month');
      // Validate month range (0 is always out of range regardless of overflow)
      if (month !== undefined) {
        const m = _trunc(month);
        if (m < 1) throw new RangeError(`month ${m} out of range`);
        // In reject mode, validate month upper bound
        if (overflow === 'Reject') {
          const maxMonth = THIRTEEN_MONTH_CALENDARS.has(calId) ? 13 : 12;
          if (m > maxMonth) throw new RangeError(`month ${m} out of range for ${calId} calendar`);
        }
      }
      // In reject mode, validate that monthCode is valid for the target year
      if (overflow === 'Reject' && rawMonthCode !== undefined) {
        if (!isMonthCodeValidForYear(rawMonthCode, calId, resolvedYear)) {
          throw new RangeError(`monthCode ${rawMonthCode} does not exist in year ${resolvedYear} for ${calId} calendar`);
        }
        // Also reject month > monthsInYear for the target year
        if (calId === 'hebrew' && !isHebrewLeapYear(resolvedYear) && rawMonth !== undefined && _trunc(rawMonth) > 12) {
          throw new RangeError(`month ${rawMonth} out of range for non-leap year ${resolvedYear}`);
        }
      }
      // In reject mode, reject month 13 in non-leap Hebrew year
      if (overflow === 'Reject' && calId === 'hebrew' && rawMonth !== undefined && rawMonthCode === undefined) {
        if (!isHebrewLeapYear(resolvedYear) && _trunc(rawMonth) > 12) {
          throw new RangeError(`month ${rawMonth} out of range for non-leap Hebrew year ${resolvedYear}`);
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
        return new PlainYearMonth(call(() => new NapiPlainYearMonth(_trunc(resolvedYear), m, cal, 1)));
      }
      // Per spec: day is NOT validated for PlainYearMonth - only year and month matter
      // Constrain month to the actual number of months in the target year
      let constrainedMonth = _trunc(month);
      if (overflow !== 'Reject') {
        // Determine max months for this calendar year
        if (calId === 'hebrew') {
          const maxM = isHebrewLeapYear(resolvedYear) ? 13 : 12;
          constrainedMonth = Math.max(1, Math.min(constrainedMonth, maxM));
        } else if (calId === 'chinese' || calId === 'dangi') {
          const leapBase = getChineseDangiLeapMonth(resolvedYear, calId);
          const maxM = leapBase > 0 ? 13 : 12;
          constrainedMonth = Math.max(1, Math.min(constrainedMonth, maxM));
        } else if (THIRTEEN_MONTH_CALENDARS.has(calId)) {
          constrainedMonth = Math.max(1, Math.min(constrainedMonth, 13));
        } else {
          constrainedMonth = Math.max(1, Math.min(constrainedMonth, 12));
        }
      }
      // Always use day 1 as the reference day
      const iso = calendarDateToISO(_trunc(resolvedYear), constrainedMonth, 1, calId);
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

  get year() { const calId = getRealCalendarId(this); if (calId === 'ethioaa') return this._inner.year; return this._inner.year; }
  get month() { return this._inner.month; }
  get monthCode() { return this._inner.monthCode; }
  get era() {
    const calId = getRealCalendarId(this);
    const v = this._inner.era;
    if (v === null) return undefined;
    return resolveEraForCalendar(calId, this._inner.year, v, this._inner.eraYear, this._inner.month, this._inner.day).era;
  }
  get eraYear() {
    const calId = getRealCalendarId(this);
    const v = this._inner.eraYear;
    if (v === null) return undefined;
    return resolveEraForCalendar(calId, this._inner.year, this._inner.era, v, this._inner.month, this._inner.day).eraYear;
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
    if (!calSupportsEras && (hasEra || hasEraYear) && calId !== 'iso8601') {
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
      // Create PlainDate with day 1 for both by extracting ISO from the inner's toString()
      try {
        const startDate = _ymInnerToPlainDate(this._inner);
        const endDate = _ymInnerToPlainDate(otherInner);
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
        const startDate = _ymInnerToPlainDate(this._inner);
        const endDate = _ymInnerToPlainDate(otherInner);
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
      // Per spec: PlainYearMonth must not display the reference day.
      // Convert dateStyle to equivalent year+month component options,
      // but only if no conflicting component options are present (let Intl throw TypeError for conflicts).
      if (opts.dateStyle !== undefined) {
        const hasConflict = opts.month !== undefined || opts.day !== undefined || opts.year !== undefined ||
          opts.weekday !== undefined || opts.hour !== undefined || opts.minute !== undefined || opts.second !== undefined ||
          opts.era !== undefined;
        if (!hasConflict) {
          const style = opts.dateStyle;
          delete opts.dateStyle;
          if (style === 'full' || style === 'long' || style === 'medium') {
            opts.year = 'numeric';
            opts.month = 'long';
          } else {
            opts.year = 'numeric';
            opts.month = 'numeric';
          }
        }
      }
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
      // Per spec: validate calendar BEFORE coercing referenceYear
      rejectISOStringAsCalendar(calendar);
      const cal = toNapiCalendar(calendar);
      const ry = referenceYear !== undefined ? toIntegerWithTruncation(referenceYear) : referenceYear;
      // Per spec: constructor always rejects out-of-range ISO values
      if (ry !== undefined) rejectISODateRange(ry, m, d);
      else if (m < 1 || m > 12 || d < 1 || d > 31) throw new RangeError('Month/day out of range');
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
      // Per spec: convert year type before monthCode semantics validation
      const yearVal = toInteger(arg.year);
      if (yearVal !== undefined) rejectInfinity(yearVal, 'year');
      // Per spec: era and eraYear must come together for calendars that support eras
      const calValidErasForMD = VALID_ERAS[mdFromCalId];
      const calSupportsErasForMD = calValidErasForMD && calValidErasForMD.size > 0;
      if (calSupportsErasForMD && ((arg.era !== undefined) !== (arg.eraYear !== undefined))) {
        throw new TypeError('era and eraYear must be provided together');
      }
      // Resolve era/eraYear to year, and check for conflicts
      if (calSupportsErasForMD && arg.era !== undefined && arg.eraYear !== undefined) {
        const eraYearNum = toInteger(arg.eraYear);
        if (eraYearNum !== undefined) rejectInfinity(eraYearNum, 'eraYear');
        // Compute the year from era/eraYear independently to check for conflicts with year
        const eraOnlyFields = { era: arg.era, eraYear: eraYearNum };
        resolveEraYear(eraOnlyFields, mdFromCalId);
        if (yearVal !== undefined && eraOnlyFields.year !== undefined && _trunc(yearVal) !== eraOnlyFields.year) {
          throw new RangeError(`year ${yearVal} does not match era ${arg.era} eraYear ${arg.eraYear} (expected ${eraOnlyFields.year})`);
        }
      }
      let month = toInteger(arg.month);
      if (month !== undefined) rejectInfinity(month, 'month');
      const day = toInteger(arg.day);
      if (day !== undefined) rejectInfinity(day, 'day');
      // Per spec: for Chinese/Dangi/Hebrew/Islamic, year is required in specific cases:
      // - When month is provided without monthCode, year is needed to resolve the ordinal month
      // - When month and monthCode both provided, year is needed to check if they agree
      // Missing year TypeError must come before month/monthCode conflict RangeError
      const YEAR_REQUIRED_CALENDARS = new Set(['chinese', 'dangi', 'hebrew', 'islamic-civil', 'islamic-tbla', 'islamic-umalqura', 'islamic-rgsa']);
      if (YEAR_REQUIRED_CALENDARS.has(mdFromCalId) && yearVal === undefined && month !== undefined && hasMonthCode) {
        // Both month and monthCode provided but no year - year is needed to check agreement
        throw new TypeError(`year is required for PlainMonthDay with calendar '${mdFromCalId}'`);
      }
      // Per spec: for non-ISO calendars, need either monthCode OR month+year
      if (mdFromCalId && mdFromCalId !== 'iso8601' && !hasMonthCode) {
        if (arg.month === undefined || yearVal === undefined) {
          throw new TypeError(`monthCode is required for PlainMonthDay with calendar '${mdFromCalId}' (or provide month and year)`);
        }
      }
      // Determine the effective monthCode for reference year searching
      let effectiveMonthCode;
      if (hasMonthCode) {
        effectiveMonthCode = arg.monthCode;
        // For PlainMonthDay, resolve monthCode using the reference year context
        // (if year is provided use that, otherwise use the default reference year for the calendar)
        const mcRefYear = yearVal !== undefined ? _trunc(yearVal) :
          (mdFromCalId && mdFromCalId !== 'iso8601' && !ISO_MONTH_ALIGNED_CALENDARS.has(mdFromCalId)
            ? _defaultCalendarRefYear(mdFromCalId) : undefined);
        const fromCode = monthCodeToMonth(arg.monthCode, mdFromCalId, mcRefYear);
        if (month !== undefined && _trunc(month) !== fromCode) {
          throw new RangeError(`month ${month} and monthCode ${arg.monthCode} do not agree`);
        }
        month = fromCode;
        // Per spec: when year is provided and monthCode is a leap month that doesn't exist
        // in that year, reject mode should throw and constrain mode should use the base month.
        if (yearVal !== undefined && arg.monthCode.endsWith('L')) {
          const mcMonth = parseInt(arg.monthCode.slice(1, 3), 10);
          let yearHasLeap = false;
          if ((mdFromCalId === 'chinese' || mdFromCalId === 'dangi')) {
            const leapBase = getChineseDangiLeapMonth(_trunc(yearVal), mdFromCalId);
            yearHasLeap = (leapBase === mcMonth);
          } else if (mdFromCalId === 'hebrew') {
            yearHasLeap = isHebrewLeapYear(_trunc(yearVal)) && mcMonth === 5;
          }
          if (!yearHasLeap) {
            if (overflow === 'Reject') {
              throw new RangeError(`monthCode ${arg.monthCode} does not exist in year ${yearVal} for ${mdFromCalId} calendar`);
            }
            // Constrain: use the non-leap base month
            effectiveMonthCode = arg.monthCode.slice(0, -1); // "M01L" -> "M01"
          }
        }
      } else if (yearVal !== undefined && month !== undefined && mdFromCalId && mdFromCalId !== 'iso8601' && !ISO_MONTH_ALIGNED_CALENDARS.has(mdFromCalId)) {
        // When month+year is provided without monthCode for non-aligned calendars,
        // determine the actual monthCode from the (year, ordinal month) pair
        effectiveMonthCode = _getMonthCodeForOrdinal(_trunc(yearVal), _trunc(month), mdFromCalId);
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
      // Per spec: if the provided year converts to an ISO year outside the representable
      // range, throw RangeError immediately (don't try to find a reference year)
      if (refCalYear !== undefined) {
        // Estimate the ISO year using known calendar offsets
        let estimatedIsoYear = refCalYear;
        if (mdFromCalId === 'buddhist') estimatedIsoYear = refCalYear - 543;
        else if (mdFromCalId === 'roc') estimatedIsoYear = refCalYear + 1911;
        else if (mdFromCalId === 'coptic') estimatedIsoYear = refCalYear + 284;
        else if (mdFromCalId === 'ethioaa') estimatedIsoYear = refCalYear - 5492;
        else if (mdFromCalId === 'ethiopic' || mdFromCalId === 'ethiopian') estimatedIsoYear = refCalYear + 8;
        else if (mdFromCalId === 'indian') estimatedIsoYear = refCalYear + 78;
        else if (mdFromCalId === 'persian') estimatedIsoYear = refCalYear + 621;
        else if (mdFromCalId === 'hebrew') estimatedIsoYear = refCalYear - 3760;
        else if (mdFromCalId === 'islamic-civil' || mdFromCalId === 'islamic-tbla' || mdFromCalId === 'islamic-umalqura' || mdFromCalId === 'islamic-rgsa') {
          estimatedIsoYear = Math.round(622 + refCalYear * 354 / 365);
        }
        // Use a generous margin (±100 years) to avoid false positives for calendars
        // where the offset estimate is approximate
        if (estimatedIsoYear < -272000 || estimatedIsoYear > 276000) {
          throw new RangeError(`year ${refCalYear} is out of range for ${mdFromCalId} calendar`);
        }
      }
      // Also check era/eraYear-resolved year for out-of-range
      if (refCalYear === undefined && calSupportsErasForMD && arg.era !== undefined && arg.eraYear !== undefined) {
        const eraFields = { era: arg.era, eraYear: toInteger(arg.eraYear) };
        resolveEraYear(eraFields, mdFromCalId);
        if (eraFields.year !== undefined) {
          let estimatedIsoEra = eraFields.year;
          if (mdFromCalId === 'buddhist') estimatedIsoEra = eraFields.year - 543;
          else if (mdFromCalId === 'roc') estimatedIsoEra = eraFields.year + 1911;
          else if (mdFromCalId === 'coptic') estimatedIsoEra = eraFields.year + 284;
          else if (mdFromCalId === 'ethioaa') estimatedIsoEra = eraFields.year - 5492;
          else if (mdFromCalId === 'ethiopic' || mdFromCalId === 'ethiopian') estimatedIsoEra = eraFields.year + 8;
          else if (mdFromCalId === 'indian') estimatedIsoEra = eraFields.year + 78;
          else if (mdFromCalId === 'persian') estimatedIsoEra = eraFields.year + 621;
          else if (mdFromCalId === 'hebrew') estimatedIsoEra = eraFields.year - 3760;
          else if (mdFromCalId === 'islamic-civil' || mdFromCalId === 'islamic-tbla' || mdFromCalId === 'islamic-umalqura' || mdFromCalId === 'islamic-rgsa') {
            estimatedIsoEra = Math.round(622 + eraFields.year * 354 / 365);
          }
          if (estimatedIsoEra < -272000 || estimatedIsoEra > 276000) {
            throw new RangeError(`eraYear ${arg.eraYear} era ${arg.era} is out of range for ${mdFromCalId} calendar`);
          }
        }
      }
      // Constrain or reject month based on the year's monthsInYear
      if (refCalYear !== undefined) {
        const maxMonth = _getMaxMonthForCalendarYear(mdFromCalId, refCalYear);
        if (calMonth > maxMonth) {
          if (overflow === 'Reject') {
            throw new RangeError(`month ${calMonth} out of range for ${mdFromCalId} calendar year ${refCalYear} (max ${maxMonth})`);
          }
          calMonth = maxMonth;
          // Recompute effectiveMonthCode after constraining
          effectiveMonthCode = _getMonthCodeForOrdinal(refCalYear, calMonth, mdFromCalId);
        }
      }
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
      // For leap month codes (e.g. M05L), we need to find a year where that monthCode exists
      let targetMonthCode = effectiveMonthCode || (hasMonthCode ? arg.monthCode : undefined);
      let isLeapMonthCode = targetMonthCode && targetMonthCode.endsWith('L');

      // Per spec Table 6: Chinese/Dangi leap month constraining
      // Only M03L, M04L, M05L, M06L, M07L can have day 30.
      // M01L, M02L, M08L-M12L never have day 30 in the reference range.
      // M01L and M12L never occur at all in the accurate calculation range.
      if (isLeapMonthCode && (mdFromCalId === 'chinese' || mdFromCalId === 'dangi')) {
        const leapMonthNum = parseInt(targetMonthCode.slice(1, 3), 10);
        const LEAP_MONTHS_WITH_30_DAYS = new Set([3, 4, 5, 6, 7]);
        const NONEXISTENT_LEAP_MONTHS = new Set([1, 12]); // never occur in accurate range
        if (NONEXISTENT_LEAP_MONTHS.has(leapMonthNum)) {
          // Per spec: M01L and M12L never occur. Constrain to non-leap, or reject.
          if (overflow === 'Reject') {
            throw new RangeError(`monthCode ${targetMonthCode} does not exist for ${mdFromCalId} calendar`);
          }
          targetMonthCode = targetMonthCode.slice(0, -1); // M01L -> M01
          isLeapMonthCode = false;
          effectiveMonthCode = targetMonthCode;
        } else if (!LEAP_MONTHS_WITH_30_DAYS.has(leapMonthNum) && calDay >= 30) {
          // This leap month never has 30 days in the reference range.
          // Constrain day >= 30 to day 30 of the non-leap month, or reject.
          if (overflow === 'Reject') {
            throw new RangeError(`day ${calDay} out of range for ${targetMonthCode} (max 29)`);
          }
          targetMonthCode = targetMonthCode.slice(0, -1); // M08L -> M08
          isLeapMonthCode = false;
          effectiveMonthCode = targetMonthCode;
          calDay = 30;
          // Recompute month for the non-leap monthCode
          month = monthCodeToMonth(targetMonthCode, mdFromCalId,
            _defaultCalendarRefYear(mdFromCalId));
        }
      }
      const baseRefYear = _defaultCalendarRefYear(mdFromCalId, calMonth);
      // Try multiple calendar years around the base to find the best match:
      // - ISO year ≤ 1972 (required by spec)
      // - Day must fit (calDay <= daysInMonth)
      // - Latest ISO year (closest to 1972) among years where day fits
      // - For leap month codes, the year must actually have that leap month
      // Track max daysInMonth across ALL candidate years for overflow validation
      // Collect all candidate calendar years, their daysInMonth, and ISO dates
      const candidates = [];
      let maxDim = 0;
      // Chinese/Dangi leap months can be rare (e.g. M02L occurs every ~19+ years)
      // Need wide search range to find the latest ISO year <= 1972 with the given monthCode
      // Regular months can also vary in daysInMonth, so use wider range for those too
      const searchRange = (mdFromCalId === 'chinese' || mdFromCalId === 'dangi')
        ? (isLeapMonthCode ? 80 : 15)
        : (isLeapMonthCode ? 40 : 5);
      for (let yOff = -searchRange; yOff <= searchRange; yOff++) {
        const tryCalYear = baseRefYear + yOff;
        // For leap month codes, check that this year actually has the leap month
        if (isLeapMonthCode) {
          if (mdFromCalId === 'hebrew') {
            if (!isHebrewLeapYear(tryCalYear)) continue;
          } else if (mdFromCalId === 'chinese' || mdFromCalId === 'dangi') {
            const leapBase = getChineseDangiLeapMonth(tryCalYear, mdFromCalId);
            const mcMonthNum = parseInt(targetMonthCode.slice(1, 3), 10);
            if (leapBase !== mcMonthNum) continue;
          }
        }
        // Compute the month number for this specific year
        const yearMonth = targetMonthCode ? monthCodeToMonth(targetMonthCode, mdFromCalId, tryCalYear) : calMonth;
        const dim = calendarDaysInMonth(tryCalYear, yearMonth, mdFromCalId);
        if (dim === undefined) continue;
        if (dim > maxDim) maxDim = dim;
        candidates.push({ tryCalYear, yearMonth, dim });
      }
      // Constrain day to max possible for this monthCode across all years
      let constrainedDay = Math.min(calDay, maxDim || calDay);
      // Overflow check
      if (overflow === 'Reject' && calDay > maxDim) {
        throw new RangeError(`day ${calDay} out of range for month ${calMonth} (max ${maxDim})`);
      }
      // Leap month constraining: if a leap month code doesn't have enough days
      // (e.g. M02L max is 29 but day=30), and the base month (M02) can hold the day,
      // constrain to the base month. This only applies when the base month has more days
      // than the leap month for the requested day.
      if (isLeapMonthCode && overflow !== 'Reject' && calDay > maxDim && maxDim > 0) {
        const baseMonthCode = targetMonthCode.slice(0, 3); // e.g. "M02L" -> "M02"
        // Check if the base month can hold the requested day (or at least more than maxDim)
        const baseMonthNum = parseInt(baseMonthCode.slice(1), 10);
        // Find max days in base month across candidate years
        let baseMaxDim = 0;
        for (let yOff = -searchRange; yOff <= searchRange; yOff++) {
          const tryCalYear = baseRefYear + yOff;
          const yearMonth = monthCodeToMonth(baseMonthCode, mdFromCalId, tryCalYear);
          const dim = calendarDaysInMonth(tryCalYear, yearMonth, mdFromCalId);
          if (dim !== undefined && dim > baseMaxDim) baseMaxDim = dim;
        }
        if (baseMaxDim > maxDim) {
          // Base month has more days — fall back to base month with the requested day
          return PlainMonthDay.from({ calendar: mdFromCalId, monthCode: baseMonthCode, day: calDay }, { overflow: 'constrain' });
        }
        // Otherwise, stay in the leap month and constrain day within it
      }
      // Now find the latest ISO year <= 1972 where (monthCode, constrainedDay) exists
      // If no such year exists (rare leap months), find the earliest ISO year > 1972
      let bestIso = null;
      let bestIsoAfter1972 = null; // earliest ISO year > 1972 as fallback
      for (const c of candidates) {
        if (constrainedDay > c.dim) continue; // day doesn't fit in this year
        const tryIso = calendarDateToISO(c.tryCalYear, c.yearMonth, constrainedDay, mdFromCalId);
        // Verify monthCode
        if (targetMonthCode) {
          try {
            const verifyDate = new NapiPlainDate(tryIso.isoYear, tryIso.isoMonth, tryIso.isoDay, cal);
            if (verifyDate.monthCode !== targetMonthCode) continue;
          } catch { continue; }
        }
        if (tryIso.isoYear <= 1972) {
          if (!bestIso || tryIso.isoYear > bestIso.isoYear ||
              (tryIso.isoYear === bestIso.isoYear && (tryIso.isoMonth > bestIso.isoMonth || (tryIso.isoMonth === bestIso.isoMonth && tryIso.isoDay > bestIso.isoDay)))) {
            bestIso = { ...tryIso, calYear: c.tryCalYear, dim: c.dim, yearMonth: c.yearMonth };
          }
        } else {
          // Track earliest year after 1972 as fallback for rare leap months
          if (!bestIsoAfter1972 || tryIso.isoYear < bestIsoAfter1972.isoYear ||
              (tryIso.isoYear === bestIsoAfter1972.isoYear && (tryIso.isoMonth < bestIsoAfter1972.isoMonth || (tryIso.isoMonth === bestIsoAfter1972.isoMonth && tryIso.isoDay < bestIsoAfter1972.isoDay)))) {
            bestIsoAfter1972 = { ...tryIso, calYear: c.tryCalYear, dim: c.dim, yearMonth: c.yearMonth };
          }
        }
      }
      // If no year <= 1972 found, use earliest year > 1972 (for rare leap months like M09L, M10L, M11L)
      if (!bestIso && bestIsoAfter1972) {
        bestIso = bestIsoAfter1972;
      }
      if (!bestIso) {
        // Fallback: find any candidate even if day doesn't fit perfectly
        for (const c of candidates) {
          const tryDay = Math.min(constrainedDay, c.dim);
          const tryIso = calendarDateToISO(c.tryCalYear, c.yearMonth, tryDay, mdFromCalId);
          if (!bestIso || tryIso.isoYear <= 1972) {
            bestIso = { ...tryIso, calYear: c.tryCalYear, dim: c.dim, yearMonth: c.yearMonth };
            if (tryIso.isoYear <= 1972) break;
          }
        }
        if (!bestIso) {
          // Last resort fallback
          const dim0 = calendarDaysInMonth(baseRefYear, calMonth, mdFromCalId) || 31;
          const clampedDay0 = Math.min(constrainedDay, dim0);
          const fallback = calendarDateToISO(baseRefYear, calMonth, clampedDay0, mdFromCalId);
          bestIso = { ...fallback, calYear: baseRefYear, dim: dim0, yearMonth: calMonth };
        }
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
    // Per spec: for non-ISO calendars, month alone is insufficient - need monthCode
    if (calId !== 'iso8601' && calId) {
      if (month !== undefined && fields.monthCode === undefined) {
        throw new TypeError(`monthCode is required for PlainMonthDay.with() with calendar '${calId}' (month alone is insufficient)`);
      }
    }
    let effectiveMonthCode;
    if (fields.monthCode !== undefined) {
      effectiveMonthCode = fields.monthCode;
      const fromCode = monthCodeToMonth(fields.monthCode, calId);
      if (month !== undefined && _trunc(month) !== fromCode) {
        throw new RangeError(`month ${month} and monthCode ${fields.monthCode} do not agree`);
      }
      month = fromCode;
    }
    if (month === undefined) {
      effectiveMonthCode = this.monthCode;
      const code = this.monthCode;
      const m = code.match(/^M(\d{2})L?$/);
      if (m) month = parseInt(m[1], 10);
    }
    if (effectiveMonthCode === undefined) effectiveMonthCode = this.monthCode;
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
    // Non-ISO calendars: use PlainMonthDay.from to properly resolve reference year
    return PlainMonthDay.from({ monthCode: effectiveMonthCode, day: td, calendar: calId }, { overflow: overflow === 'Reject' ? 'reject' : 'constrain' });
  }

  equals(other) {
    const otherInner = toNapiPlainMonthDay(other);
    return this._inner.equals(otherInner);
  }

  toPlainDate(fields) {
    requireBranding(this, NapiPlainMonthDay, 'Temporal.PlainMonthDay');
    if (typeof fields !== 'object' || fields === null) {
      throw new TypeError('year is required');
    }
    const calId = this.calendarId;
    const calValidEras = VALID_ERAS[calId];
    const calSupportsEras = calValidEras && calValidEras.size > 0;
    // For calendars with eras, accept era+eraYear as alternative to year
    if (fields.year === undefined && !(calSupportsEras && fields.era !== undefined && fields.eraYear !== undefined)) {
      throw new TypeError('year is required');
    }
    // Handle era/eraYear
    const resolvedFields = { year: fields.year !== undefined ? toIntegerWithTruncation(fields.year) : undefined, era: fields.era, eraYear: fields.eraYear !== undefined ? toIntegerWithTruncation(fields.eraYear) : undefined };
    if (resolvedFields.eraYear !== undefined) rejectInfinity(resolvedFields.eraYear, 'eraYear');
    resolveEraYear(resolvedFields, calId);
    const yearVal = resolvedFields.year !== undefined ? resolvedFields.year : toIntegerWithTruncation(fields.year);
    rejectInfinity(yearVal, 'year');
    // Get month from monthCode, accounting for leap year shifts
    const code = this.monthCode;
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
      // Per spec: PlainMonthDay must not display the reference year.
      // Convert dateStyle to equivalent month+day component options,
      // but only if no conflicting component options are present (let Intl throw TypeError for conflicts).
      if (opts.dateStyle !== undefined) {
        const hasConflict = opts.month !== undefined || opts.day !== undefined || opts.year !== undefined ||
          opts.weekday !== undefined || opts.hour !== undefined || opts.minute !== undefined || opts.second !== undefined ||
          opts.era !== undefined;
        if (!hasConflict) {
          const style = opts.dateStyle;
          delete opts.dateStyle;
          if (style === 'full' || style === 'long' || style === 'medium') {
            opts.month = 'long';
            opts.day = 'numeric';
          } else {
            opts.month = 'numeric';
            opts.day = 'numeric';
          }
        }
      }
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
    // Try full ISO date first (non-ISO calendars include day in toString)
    const m3 = str.match(/(-?\d+|\+\d+)-(\d{2})-(\d{2})/);
    if (m3) {
      const d = new Date(0);
      d.setUTCFullYear(parseInt(m3[1], 10), parseInt(m3[2], 10) - 1, parseInt(m3[3], 10));
      d.setUTCHours(12, 0, 0, 0);
      return d.getTime();
    }
    // Fallback: ISO calendar format "YYYY-MM" (no day)
    const m2 = str.match(/(-?\d+|\+\d+)-(\d{2})/);
    if (m2) {
      const d = new Date(0);
      d.setUTCFullYear(parseInt(m2[1], 10), parseInt(m2[2], 10) - 1, 1);
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
