import {
  NapiCalendar,
  NapiTimeZone,
  NapiPlainDate,
  NapiPlainTime,
  NapiPlainDateTime,
  NapiZonedDateTime,
  NapiInstant,
  NapiDuration,
  NapiPlainYearMonth,
  NapiPlainMonthDay,
  type NapiPlainDateT,
  type NapiPlainTimeT,
  type NapiPlainDateTimeT,
  type NapiZonedDateTimeT,
  type NapiInstantT,
  type NapiDurationT,
  type NapiPlainYearMonthT,
  type NapiPlainMonthDayT,
  type NapiToStringRoundingOptions,
} from './binding';
import {
  call,
  _wrapperSet,
  _isTemporalDuration,
  _isTemporalPlainDate,
  _isTemporalPlainTime,
  _isTemporalPlainDateTime,
  _isTemporalZonedDateTime,
  _isTemporalInstant,
  _isTemporalPlainYearMonth,
  _isTemporalPlainMonthDay,
  toInteger,
  toIntegerIfIntegral,
  toIntegerWithTruncation,
  rejectInfinity,
  rejectPropertyBagInfinity,
  rejectTooManyFractionalSeconds,
  toPrimitiveAndRequireString,
  validateMonthCodeSyntax,
  isValidOffsetString,
  parseOffsetStringToNs,
  validateOptions,
  extractOverflow,
  _trunc,
  coerceRoundingIncrement,
  resolveFractionalSecondDigits,
  _getOffsetNsAtEpoch,
  isoDateToEpochDays,
  wrapError,
} from './helpers';
import { mapUnit, mapRoundingMode, mapOverflow, mapDisplayCalendar } from './enums';
import {
  VALID_CALENDAR_IDS,
  REJECTED_CALENDAR_IDS,
  canonicalizeCalendarId,
  rejectISOStringAsCalendar,
  VALID_ERAS,
  getCalendarId,
  calendarDateToISO,
  resolveMonth,
  resolveEraYear,
  monthCodeToMonth,
  isMonthCodeValidForYear,
  calendarDaysInMonth,
  _setToNapiCalendar,
} from './calendar';
import {
  _validateZdtString,
  _validateZdtStringLimits,
  _resolveLocalToEpochMs,
  _getOffsetMs,
  bigintNsToZdtString,
  _extractISOFromNapiDT,
  _formatOffsetMs,
} from './timezone';

// Late-bound class references to break circular deps with class modules
export const _convertClasses: Record<string, any> = {};

// ─── Helper: convert to NAPI Calendar ─────────────────────────

export function toNapiCalendar(cal: any): NapiCalendar {
  if (cal === undefined) return undefined as any;
  if (
    cal === null ||
    typeof cal === 'boolean' ||
    typeof cal === 'number' ||
    typeof cal === 'bigint' ||
    typeof cal === 'symbol'
  ) {
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
    if (
      cal._inner instanceof NapiPlainDate ||
      cal._inner instanceof NapiPlainDateTime ||
      cal._inner instanceof NapiPlainYearMonth ||
      cal._inner instanceof NapiPlainMonthDay ||
      cal._inner instanceof NapiZonedDateTime
    ) {
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

// ─── Helper: convert to NAPI TimeZone ─────────────────────────

export function toNapiTimeZone(tz: any): NapiTimeZone {
  if (tz === undefined) return undefined as any;
  if (
    tz === null ||
    typeof tz === 'boolean' ||
    typeof tz === 'number' ||
    typeof tz === 'bigint' ||
    typeof tz === 'symbol'
  ) {
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

export function toNapiDuration(arg: any): NapiDurationT {
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
    if (
      _days === undefined &&
      _hours === undefined &&
      _microseconds === undefined &&
      _milliseconds === undefined &&
      _minutes === undefined &&
      _months === undefined &&
      _nanoseconds === undefined &&
      _seconds === undefined &&
      _weeks === undefined &&
      _years === undefined
    ) {
      throw new TypeError('Invalid duration-like argument: at least one property must be present');
    }
    return call(
      () =>
        new NapiDuration(
          yearsVal,
          monthsVal,
          weeksVal,
          daysVal,
          hoursVal,
          minutesVal,
          secondsVal,
          millisecondsVal,
          microsecondsVal,
          nanosecondsVal,
        ),
    );
  }
  throw new TypeError('Invalid duration-like argument');
}

// Helper: parse a duration argument for Instant.add/subtract, preserving BigInt precision
// Returns { dur (for validation), totalNs (BigInt) }
export function _parseDurationForInstant(arg: any): { dur: NapiDurationT; totalNs: bigint } {
  // If it's a string, parse through NAPI and use the result
  if (typeof arg === 'string') {
    const dur = call(() => NapiDuration.from(arg));
    if (dur.years || dur.months || dur.weeks || dur.days) {
      throw new RangeError('Instant.add/subtract does not accept date components');
    }
    const totalNs =
      BigInt(dur.hours) * 3600000000000n +
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
    const totalNs =
      BigInt(dur.hours) * 3600000000000n +
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
    if (
      _days === undefined &&
      _hours === undefined &&
      _microseconds === undefined &&
      _milliseconds === undefined &&
      _minutes === undefined &&
      _months === undefined &&
      _nanoseconds === undefined &&
      _seconds === undefined &&
      _weeks === undefined &&
      _years === undefined
    ) {
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
    const totalNs =
      BigInt(hVal) * 3600000000000n +
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

// ─── Helper: convert to NAPI PlainDate ────────────────────────

export function toNapiPlainDate(arg: any): NapiPlainDateT {
  if (arg instanceof NapiPlainDate) return arg;
  if (_isTemporalPlainDate(arg)) return arg._inner;
  if (typeof arg === 'string') {
    rejectTooManyFractionalSeconds(arg);
    return call(() => NapiPlainDate.from(arg));
  }
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
    const monthCodeStr = _monthCode !== undefined ? toPrimitiveAndRequireString(_monthCode, 'monthCode') : undefined;
    // Per spec: validate monthCode syntax immediately after coercing, before reading subsequent fields
    if (monthCodeStr !== undefined) validateMonthCodeSyntax(monthCodeStr);
    const _year = arg.year;
    const yearVal = toInteger(_year);
    // Resolve era/eraYear for calendars that support them (don't read for ISO)
    let resolvedYear = yearVal;
    const _calValidEras = VALID_ERAS[calId];
    if (_calValidEras && _calValidEras.size > 0) {
      const eraFields: any = { year: yearVal, era: arg.era, eraYear: toInteger(arg.eraYear) };
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
    if (month === undefined && _monthCode === undefined)
      throw new TypeError('Required property month or monthCode is missing');
    if (dayVal === undefined) throw new TypeError('Required property day is missing');
    throw new TypeError('Missing required date fields');
  }
  throw new TypeError('Invalid PlainDate argument');
}

// ─── Helper: convert to NAPI PlainTime ────────────────────────

export function toNapiPlainTime(arg: any): NapiPlainTimeT {
  if (arg instanceof NapiPlainTime) return arg;
  if (_isTemporalPlainTime(arg)) return arg._inner;
  if (typeof arg === 'string') {
    rejectTooManyFractionalSeconds(arg);
    return call(() => NapiPlainTime.from(arg));
  }
  if (typeof arg === 'object' && arg !== null) {
    if (_isTemporalPlainDateTime(arg)) {
      const dt = arg._inner;
      return call(
        () => new NapiPlainTime(dt.hour, dt.minute, dt.second, dt.millisecond, dt.microsecond, dt.nanosecond),
      );
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
    if (
      _hour === undefined &&
      _microsecond === undefined &&
      _millisecond === undefined &&
      _minute === undefined &&
      _nanosecond === undefined &&
      _second === undefined
    ) {
      throw new TypeError('Invalid PlainTime argument: at least one time property must be present');
    }
    return call(
      () =>
        new NapiPlainTime(hourVal || 0, minuteVal || 0, secondVal || 0, millisecondVal, microsecondVal, nanosecondVal),
    );
  }
  throw new TypeError('Invalid PlainTime argument');
}

// ─── Helper: convert to NAPI PlainDateTime ────────────────────

export function toNapiPlainDateTime(arg: any): NapiPlainDateTimeT {
  if (arg instanceof NapiPlainDateTime) return arg;
  if (_isTemporalPlainDateTime(arg)) return arg._inner;
  if (typeof arg === 'string') {
    rejectTooManyFractionalSeconds(arg);
    return call(() => NapiPlainDateTime.from(arg));
  }
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
    const monthCodeStr = _monthCode !== undefined ? toPrimitiveAndRequireString(_monthCode, 'monthCode') : undefined;
    // Per spec: validate monthCode syntax immediately after coercing, before reading subsequent fields
    if (monthCodeStr !== undefined) validateMonthCodeSyntax(monthCodeStr);
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
      const eraFields: any = { year: yearVal, era: arg.era, eraYear: toInteger(arg.eraYear) };
      resolveEraYear(eraFields, calId);
      resolvedYear = eraFields.year;
    }
    if (resolvedYear === undefined) throw new TypeError('Required property year is missing or undefined');
    const monthBag = { month: monthRaw, monthCode: monthCodeStr };
    const month = resolveMonth(monthBag, calId, resolvedYear);
    if (month === undefined && _monthCode === undefined)
      throw new TypeError('Required property month or monthCode is missing');
    if (day === undefined) throw new TypeError('Required property day is missing or undefined');
    rejectPropertyBagInfinity(
      { year: resolvedYear, month, day, hour, minute, second, millisecond, microsecond, nanosecond },
      'year',
      'month',
      'day',
      'hour',
      'minute',
      'second',
      'millisecond',
      'microsecond',
      'nanosecond',
    );
    const iso = calendarDateToISO(resolvedYear, month, day, calId);
    return call(
      () =>
        new NapiPlainDateTime(
          iso.isoYear,
          iso.isoMonth,
          iso.isoDay,
          hour,
          minute,
          second,
          millisecond,
          microsecond,
          nanosecond,
          cal,
        ),
    );
  }
  throw new TypeError('Invalid PlainDateTime argument');
}

// ─── Helper: convert to NAPI ZonedDateTime ────────────────────

export function toNapiZonedDateTime(arg: any): NapiZonedDateTimeT {
  if (arg instanceof NapiZonedDateTime) return arg;
  if (_isTemporalZonedDateTime(arg)) return arg._inner;
  if (typeof arg === 'string') {
    rejectTooManyFractionalSeconds(arg);
    try {
      return call(() => NapiZonedDateTime.from(arg));
    } catch (e: any) {
      // If parsing fails due to offset mismatch (e.g. historical timezone data differences),
      // extract the instant from the offset+local time and create ZDT from epochNs + timezone.
      // Per IXDTF spec, when both offset and timezone annotation are present, the offset
      // determines the instant.
      if (e instanceof RangeError && arg.includes('[')) {
        const ixdtfMatch = arg.match(
          /^([+-]?\d{4,6})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?([+-]\d{2}:?\d{2})\[([^\]]+)\](?:\[u-ca=([^\]]+)\])?$/,
        );
        if (ixdtfMatch) {
          const [, yr, mo, dy, hr, mi, se, frac, offset, tzId, calAnnot] = ixdtfMatch as string[];
          const isoYear = parseInt(yr!, 10);
          const isoMonth = parseInt(mo!, 10);
          const isoDay = parseInt(dy!, 10);
          const isoHour = parseInt(hr!, 10);
          const isoMinute = parseInt(mi!, 10);
          const isoSecond = parseInt(se!, 10);
          let fracNs = 0n;
          if (frac) {
            const padded = frac.padEnd(9, '0').slice(0, 9);
            fracNs = BigInt(padded);
          }
          const offsetNs = BigInt(parseOffsetStringToNs(offset!) || 0);
          // Compute epoch nanoseconds from local ISO date/time using pure arithmetic
          // (Date.UTC fails for dates beyond JS Date range)
          const epochDays = BigInt(isoDateToEpochDays(isoYear, isoMonth, isoDay));
          const dayNs =
            BigInt(isoHour) * 3600000000000n + BigInt(isoMinute) * 60000000000n + BigInt(isoSecond) * 1000000000n;
          const localNs = epochDays * 86400000000000n + dayNs + fracNs;
          const epochNs = localNs - offsetNs;
          // Validate epoch nanoseconds are within the representable range
          const epochLimit = 8640000000000000000000n;
          if (epochNs < -epochLimit || epochNs > epochLimit) {
            throw e; // Re-throw the original RangeError
          }
          try {
            // Use string-based construction to preserve full nanosecond precision
            const zdtStr = bigintNsToZdtString(epochNs, tzId!, calAnnot || 'iso8601');
            const result = call(() => NapiZonedDateTime.from(zdtStr));
            return result;
          } catch {
            /* fall through to original error */
          }
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
    const monthCodeStr = _monthCode !== undefined ? toPrimitiveAndRequireString(_monthCode, 'monthCode') : undefined;
    // Per spec: validate monthCode syntax immediately after coercing
    if (monthCodeStr !== undefined) validateMonthCodeSyntax(monthCodeStr);
    const _nanosecond = arg.nanosecond;
    const nanosecondVal = toIntegerIfIntegral(_nanosecond);
    const _offset = arg.offset;
    // Per spec: coerce offset with ToPrimitiveAndRequireString
    let offsetProp;
    if (_offset !== undefined) {
      offsetProp = toPrimitiveAndRequireString(_offset, 'offset');
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
      const eraFields: any = { year: yearVal, era: arg.era, eraYear: toIntegerIfIntegral(arg.eraYear) };
      resolveEraYear(eraFields, calId);
      resolvedYear = eraFields.year;
    }
    // Validate required properties
    if (resolvedYear === undefined) throw new TypeError('Required property year is missing or undefined');
    const monthBag = { month: monthRaw, monthCode: monthCodeStr };
    const monthVal = resolveMonth(monthBag, calId, resolvedYear);
    if (monthVal === undefined && _monthCode === undefined)
      throw new TypeError('Required property month or monthCode is missing');
    if (dayVal === undefined) throw new TypeError('Required property day is missing or undefined');
    const calYear = resolvedYear || 0;
    let month = monthVal || 1;
    let day = dayVal || 1;
    const hour = hourVal || 0;
    const minute = minuteVal || 0;
    const second = secondVal || 0;
    // Reject Infinity values
    rejectPropertyBagInfinity(
      { year: calYear, month, day, hour, minute, second },
      'year',
      'month',
      'day',
      'hour',
      'minute',
      'second',
    );
    if (millisecondVal !== undefined) rejectInfinity(millisecondVal, 'millisecond');
    if (microsecondVal !== undefined) rejectInfinity(microsecondVal, 'microsecond');
    if (nanosecondVal !== undefined) rejectInfinity(nanosecondVal, 'nanosecond');
    // Constrain values to valid ISO ranges
    month = Math.max(1, Math.min(month, 13));
    day = Math.max(1, Math.min(day, 31));
    const pad2 = (n: any) => String(n).padStart(2, '0');
    const padYear = (n: any) => {
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
        try {
          call(() => new NapiPlainDate(year, isoMonth, d, cal));
          isoDay = d;
        } catch {
          break;
        }
      }
    }
    let str = `${padYear(year)}-${pad2(isoMonth)}-${pad2(isoDay)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
    if (millisecondVal || microsecondVal || nanosecondVal) {
      const pad3 = (n: any) => String(n || 0).padStart(3, '0');
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
            if (providedOffsetNs === actualOffsetNs) {
              offsetMatches = true;
              break;
            }
          } catch {
            /* gap/reject - skip */
          }
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

export function toNapiInstant(arg: any): NapiInstantT {
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

export function toNapiPlainYearMonth(arg: any): NapiPlainYearMonthT {
  if (arg instanceof NapiPlainYearMonth) return arg;
  if (_isTemporalPlainYearMonth(arg)) return arg._inner;
  if (typeof arg === 'string') {
    rejectTooManyFractionalSeconds(arg);
    return call(() => NapiPlainYearMonth.from(arg));
  }
  if (typeof arg === 'object' && arg !== null) {
    // Per spec: read fields in ALPHABETICAL order, coercing each immediately
    const _calendar = arg.calendar;
    const calId = getCalendarId(_calendar);
    const cal = toNapiCalendar(_calendar);
    const _month = arg.month;
    const monthRaw = toInteger(_month);
    const _monthCode = arg.monthCode;
    const monthCodeStr = _monthCode !== undefined ? toPrimitiveAndRequireString(_monthCode, 'monthCode') : undefined;
    // Per spec: validate monthCode syntax immediately after coercing, before reading subsequent fields
    if (monthCodeStr !== undefined) validateMonthCodeSyntax(monthCodeStr);
    const _year = arg.year;
    const yearVal = toInteger(_year);
    // Resolve era/eraYear for calendars that support them
    let resolvedYear = yearVal;
    const _calValidErasYM = VALID_ERAS[calId];
    if (_calValidErasYM && _calValidErasYM.size > 0) {
      const eraFields: any = { year: yearVal, era: arg.era, eraYear: toInteger(arg.eraYear) };
      resolveEraYear(eraFields, calId);
      resolvedYear = eraFields.year;
    }
    if (resolvedYear === undefined) throw new TypeError('Required property year is missing or undefined');
    const monthBag = { month: monthRaw, monthCode: monthCodeStr };
    const month = resolveMonth(monthBag, calId, resolvedYear);
    if (month === undefined && _monthCode === undefined)
      throw new TypeError('Required property month or monthCode is missing');
    rejectPropertyBagInfinity({ year: resolvedYear, month }, 'year', 'month');
    // For ISO calendar, reference day is always 1; for non-ISO, use day hint
    const refDay = !calId || calId === 'iso8601' ? 1 : toInteger(arg.day) || 1;
    const iso = calendarDateToISO(resolvedYear, month, refDay, calId);
    return call(() => new NapiPlainYearMonth(iso.isoYear, iso.isoMonth, cal, iso.isoDay));
  }
  throw new TypeError('Invalid PlainYearMonth argument');
}

// ─── Helper: convert to NAPI PlainMonthDay ────────────────────

export function toNapiPlainMonthDay(arg: any): NapiPlainMonthDayT {
  if (arg instanceof NapiPlainMonthDay) return arg;
  if (_isTemporalPlainMonthDay(arg)) return arg._inner;
  if (typeof arg === 'string') {
    rejectTooManyFractionalSeconds(arg);
    return call(() => NapiPlainMonthDay.from(arg));
  }
  if (typeof arg === 'object' && arg !== null) {
    // Delegate to PlainMonthDay.from which properly handles calendar conversion
    const result = _convertClasses.PlainMonthDay.from(arg);
    return result._inner;
  }
  throw new TypeError('Invalid PlainMonthDay argument');
}

// ─── Helper: convert DifferenceSettings ───────────────────────

export function convertDifferenceSettings(options: any): any {
  if (options === undefined) return undefined;
  validateOptions(options);
  // Per spec: read options in ALPHABETICAL order, coercing each immediately
  const result: any = {};
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

// ─── Helper: extract relativeTo for Duration methods ──────────

export function extractRelativeTo(rt: any): {
  relativeToDate: NapiPlainDateT | null;
  relativeToZdt: NapiZonedDateTimeT | null;
} {
  let relativeToDate = null;
  let relativeToZdt = null;
  if (rt === undefined) return { relativeToDate, relativeToZdt };
  if (
    rt === null ||
    typeof rt === 'boolean' ||
    typeof rt === 'number' ||
    typeof rt === 'bigint' ||
    typeof rt === 'symbol'
  ) {
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
    } catch (e: any) {
      throw wrapError(e);
    }
  }
  if (typeof rt === 'object' && rt !== null) {
    // Per spec: read all temporal properties in ALPHABETICAL order, coercing each immediately
    const _calendar = rt.calendar;
    const _calId = getCalendarId(_calendar);
    const _calSupportsEras = VALID_ERAS[_calId] && VALID_ERAS[_calId].size > 0;
    const _day = rt.day;
    const _dayVal = _day !== undefined ? toInteger(_day) : undefined;
    if (_dayVal !== undefined) rejectInfinity(_dayVal, 'day');
    // Per spec: read era/eraYear in alphabetical order (between day and hour), only for calendars with eras
    let _era, _eraYearVal;
    if (_calSupportsEras) {
      _era = rt.era;
      const _eraYear = rt.eraYear;
      _eraYearVal = _eraYear !== undefined ? toInteger(_eraYear) : undefined;
      if (_eraYearVal !== undefined) rejectInfinity(_eraYearVal, 'eraYear');
    }
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
    const _monthCodeStr = _monthCode !== undefined ? toPrimitiveAndRequireString(_monthCode, 'monthCode') : undefined;
    // Per spec: validate monthCode syntax immediately after coercing
    if (_monthCodeStr !== undefined) validateMonthCodeSyntax(_monthCodeStr);
    const _nanosecond = rt.nanosecond;
    const _nanosecondVal = _nanosecond !== undefined ? toInteger(_nanosecond) : undefined;
    if (_nanosecondVal !== undefined) rejectInfinity(_nanosecondVal, 'nanosecond');
    const _offset = rt.offset;
    // Per spec: coerce offset with ToPrimitiveAndRequireString
    let _offsetStr;
    if (_offset !== undefined) {
      _offsetStr = toPrimitiveAndRequireString(_offset, 'offset');
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
      const bag: any = Object.create(null);
      bag.calendar = _calendar;
      bag.day = _dayVal;
      if (_era !== undefined) bag.era = _era;
      if (_eraYearVal !== undefined) bag.eraYear = _eraYearVal;
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
    if (_era !== undefined) bag.era = _era;
    if (_eraYearVal !== undefined) bag.eraYear = _eraYearVal;
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

export function convertRoundingOptions(options: any, { includeLargestUnit = true } = {}): any {
  if (options === undefined) return Object.assign(Object.create(null), { smallestUnit: undefined });
  if (typeof options === 'string') {
    return Object.assign(Object.create(null), { smallestUnit: mapUnit(options) });
  }
  validateOptions(options);
  // Per spec: read options in ALPHABETICAL order, coercing each immediately
  const result: any = Object.create(null);
  if (includeLargestUnit) {
    const _lu = options.largestUnit;
    if (_lu !== undefined) result.largestUnit = mapUnit(_lu);
  }
  const _ri = options.roundingIncrement;
  if (_ri !== undefined) result.roundingIncrement = coerceRoundingIncrement(_ri);
  const _rm = options.roundingMode;
  if (_rm !== undefined) result.roundingMode = mapRoundingMode(_rm);
  const _su = options.smallestUnit;
  if (_su !== undefined) result.smallestUnit = mapUnit(_su);
  return result;
}

// ─── Helper: convert ToStringRoundingOptions for PlainTime/PlainDateTime ──

export function convertToStringOptions(options: any): {
  roundingOptions: NapiToStringRoundingOptions | undefined;
  displayCalendar: string | undefined;
} {
  if (options === undefined) return { roundingOptions: undefined, displayCalendar: undefined };
  validateOptions(options);
  // Per spec: read options in ALPHABETICAL order, coercing each immediately
  // calendarName (c) comes first
  const _cn = options.calendarName;
  const displayCalendar = mapDisplayCalendar(_cn);
  const roundingOptions: any = {};
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

// Register toNapiCalendar with calendar.ts to break circular dep
_setToNapiCalendar(toNapiCalendar);
