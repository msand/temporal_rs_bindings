import { NapiPlainDate, NapiPlainDateTime, NapiZonedDateTime, NapiDuration, type NapiZonedDateTimeT } from './binding';

import {
  call,
  _wrapperSet,
  _isTemporalZonedDateTime,
  _isTemporalPlainDate,
  _isTemporalPlainDateTime,
  _isTemporalPlainTime,
  toIntegerWithTruncation,
  toIntegerIfIntegral,
  requireBranding,
  validateOptions,
  validateWithFields,
  wrapZonedDateTime,
  wrapPlainDate,
  wrapPlainTime,
  wrapPlainDateTime,
  wrapDuration,
  wrapInstant,
  toPrimitiveAndRequireString,
  validateMonthCodeSyntax,
  rejectPropertyBagInfinity,
  addWithOverflow,
  _trunc,
  _classes,
  getRealCalendarId,
  resolveEraForCalendar,
  extractOverflow,
  computeEpochNanoseconds,
  isValidOffsetString,
  parseOffsetStringToNs,
  parseOffsetTzToMs,
  parseOffsetTzToNs,
  _getOffsetNsAtEpoch,
  _roundToIncrement,
  formatFractionalSeconds,
  rejectTooManyFractionalSeconds,
  wrapError,
  toStringOption,
  epochDaysToISO,
  DIGIT_ROUND,
  coerceRoundingIncrement,
  resolveFractionalSecondDigits,
} from './helpers';

import {
  mapUnit,
  mapRoundingMode,
  mapOverflow,
  ROUNDING_MODE_MAP,
  OVERFLOW_MAP,
  DISAMBIGUATION_MAP,
  OFFSET_DISAMBIGUATION_MAP,
  DISPLAY_CALENDAR_MAP,
  DISPLAY_OFFSET_MAP,
  DISPLAY_TIMEZONE_MAP,
} from './enums';

import {
  toNapiCalendar,
  toNapiTimeZone,
  toNapiDuration,
  toNapiPlainTime,
  toNapiZonedDateTime,
  convertDifferenceSettings,
} from './convert';

import {
  canonicalizeCalendarId,
  rejectISOStringAsCalendar,
  getCalendarId,
  VALID_ERAS,
  resolveEraYear,
  calendarDateToISO,
  calendarDateDifference,
  isMonthCodeValidForYear,
  calendarDaysInMonth,
  ISO_MONTH_ALIGNED_CALENDARS,
  THIRTEEN_MONTH_CALENDARS,
  monthCodeToMonth,
} from './calendar';

import {
  _resolveLocalToEpochMs,
  _getOffsetMs,
  _findTimeZoneTransition,
  _validateZdtString,
  _validateZdtStringLimits,
  _parseZdtStringParts,
  _zdtFromStringWithOffset,
  bigintNsToZdtString,
  _napiZdtCache,
  _CACHE_MAX,
  _CACHE_EVICT,
  _evictOldest,
  _formatOffsetMs,
  _canonicalTzId,
  _tzClasses,
} from './timezone';

import { _hasDateTimeOptions, _origFormatGetter, _temporalToEpochMs } from './intl';

// ═══════════════════════════════════════════════════════════════
//  Module-level constants (avoid per-call allocation)
// ═══════════════════════════════════════════════════════════════

const FIXED_OFFSET_TZ_RE = /^[+-]\d{2}(:\d{2}(:\d{2}(\.\d+)?)?)?$/;

const ZDT_TOSTRING_UNIT_ALIAS: Record<string, string> = {
  minutes: 'minute',
  seconds: 'second',
  milliseconds: 'millisecond',
  microseconds: 'microsecond',
  nanoseconds: 'nanosecond',
};
const ZDT_TOSTRING_VALID_UNITS = new Set(['minute', 'second', 'millisecond', 'microsecond', 'nanosecond']);

// ═══════════════════════════════════════════════════════════════
//  ZonedDateTime
// ═══════════════════════════════════════════════════════════════

class ZonedDateTime {
  _inner!: NapiZonedDateTimeT;
  _epochNs?: bigint;
  _tzId?: string;
  _calId?: string;
  constructor(epochNanoseconds: any, timeZone?: any, calendar?: any) {
    if (epochNanoseconds instanceof NapiZonedDateTime) {
      this._inner = epochNanoseconds;
    } else {
      // Per spec: ToBigInt(epochNanoseconds) - booleans/strings/BigInt OK, number/null/undefined/symbol throw TypeError
      if (
        epochNanoseconds === null ||
        epochNanoseconds === undefined ||
        typeof epochNanoseconds === 'number' ||
        typeof epochNanoseconds === 'symbol'
      ) {
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
          if (_napiZdtCache.size >= _CACHE_MAX) _evictOldest(_napiZdtCache, _CACHE_EVICT);
          _napiZdtCache.set(cacheKey, this._inner);
        }
      } catch (outerErr) {
        // Only fall back for RangeErrors (out-of-range dates); rethrow unexpected errors
        if (!(outerErr instanceof RangeError)) throw outerErr;
        // For extreme epoch values where the local time is out of representable range,
        // try an alternative approach: use UTC string with the timezone annotation.
        // The NAPI should be able to handle the UTC instant even if the local
        // wall-clock time is extreme.
        try {
          const utcStr = bigintNsToZdtString(epochNanoseconds, 'UTC', calId);
          const fallbackStr = utcStr.replace('[UTC]', '[' + tzId + ']');
          this._inner = call(() => NapiZonedDateTime.from(fallbackStr));
        } catch (midErr) {
          // Only fall back for RangeErrors; rethrow unexpected errors
          if (!(midErr instanceof RangeError)) throw midErr;
          // Last resort: for extreme epoch values where the local wall-clock time
          // exceeds representable range, try to construct at the boundary.
          // NOTE: This may produce a ZDT whose local time differs from the
          // requested epoch, but is the best approximation possible.
          try {
            const isFixedOffset = FIXED_OFFSET_TZ_RE.test(tzId);
            if (isFixedOffset) {
              const offset = tzId.length <= 3 ? tzId + ':00' : tzId;
              const boundary =
                epochNanoseconds < 0n
                  ? `-271821-04-20T00:00:00${offset}[${tzId}]`
                  : `+275760-09-13T00:00:00${offset}[${tzId}]`;
              const calStr = calId !== 'iso8601' ? `[u-ca=${calId}]` : '';
              this._inner = call(() => NapiZonedDateTime.from(boundary + calStr));
            } else {
              const msNum = Number(epochNanoseconds / 1000000n);
              const safeMs =
                epochNanoseconds < 0n ? Math.max(msNum, -8639999900000000) : Math.min(msNum, 8639999900000000);
              const offsetMs = _getOffsetMs(safeMs, tzId);
              const offset = _formatOffsetMs(offsetMs);
              const calStr = calId !== 'iso8601' ? `[u-ca=${calId}]` : '';
              const boundary =
                epochNanoseconds < 0n
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
  _checkLocalTimeInRange(): void {
    if (this._epochNs !== undefined) {
      const tzId = this._tzId || this.timeZoneId;
      if (tzId && tzId !== 'UTC' && FIXED_OFFSET_TZ_RE.test(tzId)) {
        const epochMs = Number(this._epochNs / 1000000n);
        const offsetMs = parseOffsetTzToMs(tzId);
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
        if (
          midnightEpochMs < -limit ||
          midnightEpochMs > limit ||
          nextMidnightEpochMs < -limit ||
          nextMidnightEpochMs > limit
        ) {
          throw new RangeError('ZonedDateTime local time is outside the representable range');
        }
      }
    }
  }

  static from(arg: any, options?: any): any {
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
            if (/[A-Z]/.test(key!)) {
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
      // Strip all critical flags (!) from annotations for NAPI
      const cleanArg = arg.replace(/\[!/g, '[');
      // Validate the string can be parsed before reading options (per spec)
      // Try a quick parse to detect obviously invalid strings like 2020-13-34T25:60:60+99:99[UTC]
      const _quickParsed = _parseZdtStringParts(cleanArg);
      if (_quickParsed) {
        // Validate month/day/time ranges
        if (_quickParsed.isoMonth < 1 || _quickParsed.isoMonth > 12)
          throw new RangeError('Parsed month value not in a valid range.');
        if (_quickParsed.isoDay < 1 || _quickParsed.isoDay > 31)
          throw new RangeError('Parsed day value not in a valid range.');
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
        if (!DISAMBIGUATION_MAP[disambiguation])
          throw new RangeError(`Invalid disambiguation option: ${disambiguation}`);
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
            parsed.isoYear,
            parsed.isoMonth,
            parsed.isoDay,
            parsed.hour,
            parsed.minute,
            parsed.second,
            parsed.millisecond,
            parsed.tzId,
            disambiguation,
          );
          const epochNs =
            BigInt(resolved.epochMs) * 1000000n + BigInt(parsed.microsecond) * 1000n + BigInt(parsed.nanosecond);
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
        const stripped = cleanArg
          .replace(/([T\d.]+)[+-]\d{2}(:\d{2})?(:\d{2}(\.\d+)?)?(\[)/, '$1$5')
          .replace(/([T\d.]+)Z(\[)/, '$1$2');
        const inner = call(() => NapiZonedDateTime.from(stripped));
        return wrapZonedDateTime(inner, _zdtCalId);
      }
      if (offsetMode === 'use') {
        // Parse the offset from the string and use it to compute the instant
        const r = _zdtFromStringWithOffset(cleanArg);
        if (_zdtCalId) r._calId = _zdtCalId;
        return r;
      }
      try {
        const inner = call(() => NapiZonedDateTime.from(cleanArg));
        return wrapZonedDateTime(inner, _zdtCalId);
      } catch (e: any) {
        if (offsetMode === 'prefer' && e instanceof RangeError && (e as any).message.includes('Offsets could not')) {
          // Fall back to disambiguation-based resolution
          const parsed = _parseZdtStringParts(cleanArg);
          if (parsed) {
            const resolved = _resolveLocalToEpochMs(
              parsed.isoYear,
              parsed.isoMonth,
              parsed.isoDay,
              parsed.hour,
              parsed.minute,
              parsed.second,
              parsed.millisecond,
              parsed.tzId,
              disambiguation,
            );
            const epochNs =
              BigInt(resolved.epochMs) * 1000000n + BigInt(parsed.microsecond) * 1000n + BigInt(parsed.nanosecond);
            const zdtStr = bigintNsToZdtString(epochNs, parsed.tzId, _zdtCalId || 'iso8601');
            const inner2 = call(() => NapiZonedDateTime.from(zdtStr));
            return wrapZonedDateTime(inner2, _zdtCalId);
          }
          const stripped = cleanArg
            .replace(/([T\d.]+)[+-]\d{2}(:\d{2})?(:\d{2}(\.\d+)?)?(\[)/, '$1$5')
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
        const _d = options.disambiguation;
        if (_d !== undefined) {
          const ds = toStringOption(_d);
          if (!DISAMBIGUATION_MAP[ds]) throw new RangeError(`Invalid disambiguation option: ${ds}`);
        }
        const _o = options.offset;
        if (_o !== undefined) {
          const os = toStringOption(_o);
          if (!OFFSET_DISAMBIGUATION_MAP[os]) throw new RangeError(`Invalid offset option: ${os}`);
        }
        const _ov = options.overflow;
        if (_ov !== undefined) {
          const os = toStringOption(_ov);
          if (!OVERFLOW_MAP[os]) throw new RangeError(`Invalid overflow option: ${os}`);
        }
      }
      const zdtCopy = new ZonedDateTime((arg as any)._inner || arg);
      if ((arg as any)._calId) zdtCopy._calId = (arg as any)._calId;
      return zdtCopy;
    }
    if (typeof arg === 'object' && arg !== null) {
      // Per spec step 1: read calendar (ToTemporalCalendar)
      const _calRaw = arg.calendar;
      const calId = getCalendarId(_calRaw);
      const cal = toNapiCalendar(_calRaw);
      // Per spec: PrepareTemporalFields - read fields in ALPHABETICAL order, each once, coercing immediately
      const _day = arg.day;
      const dayVal = _day !== undefined ? toIntegerIfIntegral(_day) : undefined;
      const _hour = arg.hour;
      const hourVal = _hour !== undefined ? toIntegerIfIntegral(_hour) : undefined;
      const _microsecond = arg.microsecond;
      const microsecondVal = _microsecond !== undefined ? toIntegerIfIntegral(_microsecond) : undefined;
      const _millisecond = arg.millisecond;
      const millisecondVal = _millisecond !== undefined ? toIntegerIfIntegral(_millisecond) : undefined;
      const _minute = arg.minute;
      const minuteVal = _minute !== undefined ? toIntegerIfIntegral(_minute) : undefined;
      const _month = arg.month;
      const monthVal = _month !== undefined ? toIntegerIfIntegral(_month) : undefined;
      const _monthCode = arg.monthCode;
      const monthCodeStr = _monthCode !== undefined ? toPrimitiveAndRequireString(_monthCode, 'monthCode') : undefined;
      // Per spec: validate monthCode syntax immediately after coercing
      if (monthCodeStr !== undefined) validateMonthCodeSyntax(monthCodeStr);
      const _nanosecond = arg.nanosecond;
      const nanosecondVal = _nanosecond !== undefined ? toIntegerIfIntegral(_nanosecond) : undefined;
      const _offset = arg.offset;
      let offsetProp;
      if (_offset !== undefined) {
        offsetProp = toPrimitiveAndRequireString(_offset, 'offset');
      }
      // Per spec: validate offset syntax immediately after coercing (before subsequent field reads)
      if (offsetProp !== undefined && !isValidOffsetString(offsetProp)) {
        throw new RangeError(`"${offsetProp}" is not a valid offset string`);
      }
      const _second = arg.second;
      const secondVal = _second !== undefined ? toIntegerIfIntegral(_second) : undefined;
      const _timeZone = arg.timeZone;
      const _year = arg.year;
      const yearVal = _year !== undefined ? toIntegerIfIntegral(_year) : undefined;
      // Per spec: read options AFTER fields - disambiguation, offset, overflow
      let _pbDisambiguation = 'compatible';
      const _pbDisambigVal = options !== undefined && options !== null ? options.disambiguation : undefined;
      if (_pbDisambigVal !== undefined) {
        _pbDisambiguation = toStringOption(_pbDisambigVal);
        if (!DISAMBIGUATION_MAP[_pbDisambiguation])
          throw new RangeError(`Invalid disambiguation option: ${_pbDisambiguation}`);
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
      // Validate timeZone required
      if (_timeZone === undefined) {
        throw new TypeError('Missing timeZone in ZonedDateTime property bag');
      }
      const tz = toNapiTimeZone(_timeZone);
      // Offset syntax and monthCode syntax already validated above during field reading
      // Era handling
      const calValidEras = VALID_ERAS[calId];
      const calSupportsEras = calValidEras && calValidEras.size > 0;
      let era, eraYear;
      if (calSupportsEras) {
        const _era = arg.era;
        const _eraYear = arg.eraYear;
        if ((_era !== undefined) !== (_eraYear !== undefined)) {
          throw new TypeError('era and eraYear must be provided together');
        }
        if (_era !== undefined) era = _era;
        if (_eraYear !== undefined) eraYear = toIntegerIfIntegral(_eraYear);
      }
      const fields = { year: yearVal, era, eraYear };
      resolveEraYear(fields, calId);
      // Validate required fields
      if (fields.year === undefined) throw new TypeError('Required property year is missing or undefined');
      if (_month === undefined && _monthCode === undefined)
        throw new TypeError('Required property month or monthCode is missing');
      if (dayVal === undefined) throw new TypeError('Required property day is missing or undefined');
      // Resolve month from month/monthCode
      let month;
      if (monthVal !== undefined && monthCodeStr !== undefined) {
        month = monthVal;
        const fromCode = monthCodeToMonth(monthCodeStr, calId, fields.year);
        if (_trunc(month) !== fromCode) {
          throw new RangeError(`month ${month} and monthCode ${monthCodeStr} do not agree`);
        }
      } else if (_month !== undefined) {
        month = monthVal;
      } else if (_monthCode !== undefined) {
        month = monthCodeToMonth(monthCodeStr, calId, fields.year);
      }
      const year = fields.year;
      if (month === undefined) month = 1;
      let day = dayVal ?? 1;
      let hour = hourVal ?? 0;
      let minute = minuteVal ?? 0;
      let second = secondVal ?? 0;
      let millisecond = millisecondVal ?? 0;
      let microsecond = microsecondVal ?? 0;
      let nanosecond = nanosecondVal ?? 0;
      // Per spec: Infinity/-Infinity always rejected regardless of overflow
      rejectPropertyBagInfinity(
        { year, month, day, hour, minute, second, millisecond, microsecond, nanosecond },
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
      if (overflow === 'Reject' && monthCodeStr !== undefined) {
        if (!isMonthCodeValidForYear(monthCodeStr, calId, year)) {
          throw new RangeError(`monthCode ${monthCodeStr} does not exist in year ${year} for ${calId} calendar`);
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
        const dim = calendarDaysInMonth(year, _trunc(month), calId);
        day = Math.min(day, dim !== undefined ? dim : 31);
        hour = Math.min(hour, 23);
        minute = Math.min(minute, 59);
        second = Math.min(second, 59);
        millisecond = Math.min(millisecond, 999);
        microsecond = Math.min(microsecond, 999);
        nanosecond = Math.min(nanosecond, 999);
      }
      // Build ISO string and parse
      const pad2 = (n: any) => String(n).padStart(2, '0');
      const padYear = (n: any) => {
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
          const actualIsoDay = parseInt(isoMatch[3]!, 10);
          if (actualIsoDay !== isoDay) {
            if (overflow === 'Reject') {
              throw new RangeError(`Day ${day} out of range for month ${month}`);
            }
            isoDay = actualIsoDay;
            isoMonth = parseInt(isoMatch[2]!, 10);
            isoYear = parseInt(isoMatch[1]!, 10);
          }
        }
      } catch (e: any) {
        if (e instanceof RangeError) throw e;
        if (overflow === 'Reject') throw wrapError(e);
        // If constrain mode and day is too large, find max valid day
        let maxDay = 28;
        try {
          for (let d = 29; d <= 31; d++) {
            try {
              call(() => new NapiPlainDate(isoYear, isoMonth, d, cal));
              maxDay = d;
            } catch {
              break;
            }
          }
        } catch {
          /* use 28 */
        }
        isoDay = Math.min(isoDay, maxDay);
      }
      // Use previously read disambiguation value
      const disambiguation = _pbDisambiguation;
      const calAnnotation = calId && calId !== 'iso8601' ? `[u-ca=${calId}]` : '';
      const pad3 = (n: any) => String(n || 0).padStart(3, '0');
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
          const resolved = _resolveLocalToEpochMs(
            isoYear,
            isoMonth,
            isoDay,
            hour,
            minute,
            second,
            millisecond,
            tz.id,
            disambiguation,
          );
          const zdtStr = bigintNsToZdtString(
            BigInt(resolved.epochMs) * 1000000n + BigInt(microsecond) * 1000n + BigInt(nanosecond),
            tz.id,
            calId !== 'iso8601' ? calId : 'iso8601',
          );
          const zdtR = new ZonedDateTime(call(() => NapiZonedDateTime.from(zdtStr)));
          zdtR._calId = calId;
          return zdtR;
        }
        if (offsetMode === 'use') {
          // Use the provided offset to determine the instant
          const str = baseStr + offsetProp + '[' + tz.id + ']' + calAnnotation;
          const zdtR = _zdtFromStringWithOffset(str);
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
                const resolved = _resolveLocalToEpochMs(
                  isoYear,
                  isoMonth,
                  isoDay,
                  hour,
                  minute,
                  second,
                  millisecond,
                  tz.id,
                  disamb,
                );
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
        const str = baseStr + offsetProp + '[' + tz.id + ']' + calAnnotation;
        try {
          const zdtR = new ZonedDateTime(call(() => NapiZonedDateTime.from(str)));
          zdtR._calId = calId;
          return zdtR;
        } catch (e: any) {
          if (offsetMode === 'prefer' && e instanceof RangeError) {
            // Fall back to disambiguation-based resolution
            const resolved = _resolveLocalToEpochMs(
              isoYear,
              isoMonth,
              isoDay,
              hour,
              minute,
              second,
              millisecond,
              tz.id,
              disambiguation,
            );
            const zdtStr = bigintNsToZdtString(
              BigInt(resolved.epochMs) * 1000000n + BigInt(microsecond) * 1000n + BigInt(nanosecond),
              tz.id,
              calId !== 'iso8601' ? calId : 'iso8601',
            );
            const zdtR2 = new ZonedDateTime(call(() => NapiZonedDateTime.from(zdtStr)));
            zdtR2._calId = calId;
            return zdtR2;
          }
          throw e;
        }
      } else {
        // No offset: use disambiguation to resolve the local time
        const resolved = _resolveLocalToEpochMs(
          isoYear,
          isoMonth,
          isoDay,
          hour,
          minute,
          second,
          millisecond,
          tz.id,
          disambiguation,
        );
        const epochNs = BigInt(resolved.epochMs) * 1000000n + BigInt(microsecond) * 1000n + BigInt(nanosecond);
        const zdtStr = bigintNsToZdtString(epochNs, tz.id, calId !== 'iso8601' ? calId : 'iso8601');
        const zdtR = new ZonedDateTime(call(() => NapiZonedDateTime.from(zdtStr)));
        zdtR._calId = calId;
        return zdtR;
      }
    }
    throw new TypeError('Invalid argument for ZonedDateTime.from()');
  }

  static compare(one: any, two: any): number {
    const a = toNapiZonedDateTime(one);
    const b = toNapiZonedDateTime(two);
    return NapiZonedDateTime.compareInstant(a, b);
  }

  get year() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    return this._inner.year;
  }
  get month() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    return this._inner.month;
  }
  get monthCode() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    return this._inner.monthCode;
  }
  get day() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    return this._inner.day;
  }
  get dayOfWeek() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    return this._inner.dayOfWeek;
  }
  get dayOfYear() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    return this._inner.dayOfYear;
  }
  get weekOfYear() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    const v = this._inner.weekOfYear;
    return v === null ? undefined : v;
  }
  get yearOfWeek() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    const v = this._inner.yearOfWeek;
    return v === null ? undefined : v;
  }
  get daysInWeek() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    return this._inner.daysInWeek;
  }
  get daysInMonth() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    return this._inner.daysInMonth;
  }
  get daysInYear() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    return this._inner.daysInYear;
  }
  get monthsInYear() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    return this._inner.monthsInYear;
  }
  get inLeapYear() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    return this._inner.inLeapYear;
  }
  get era() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    const calId = getRealCalendarId(this);
    const v = this._inner.era;
    if (v === null) return undefined;
    return resolveEraForCalendar(calId, this._inner.year, v, this._inner.eraYear, this._inner.month, this._inner.day)
      .era;
  }
  get eraYear() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    const calId = getRealCalendarId(this);
    const v = this._inner.eraYear;
    if (v === null) return undefined;
    return resolveEraForCalendar(calId, this._inner.year, this._inner.era, v, this._inner.month, this._inner.day)
      .eraYear;
  }
  get hour() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    return this._inner.hour;
  }
  get minute() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    return this._inner.minute;
  }
  get second() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    return this._inner.second;
  }
  get millisecond() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    return this._inner.millisecond;
  }
  get microsecond() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    return this._inner.microsecond;
  }
  get nanosecond() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    return this._inner.nanosecond;
  }
  get calendarId() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    return getRealCalendarId(this);
  }
  get calendar() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    return getRealCalendarId(this);
  }
  get timeZoneId() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    return this._inner.timeZone.id;
  }
  get timeZone() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    return this._inner.timeZone.id;
  }
  get offset() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    return this._inner.offset;
  }
  get offsetNanoseconds() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    return this._inner.offsetNanoseconds;
  }
  get epochMilliseconds() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    return this._inner.epochMilliseconds;
  }
  get epochNanoseconds() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    if (this._epochNs !== undefined) return this._epochNs;
    return computeEpochNanoseconds(this._inner);
  }
  get hoursInDay() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    this._checkLocalTimeInRange();
    return call(() => this._inner.hoursInDay);
  }

  with(fields: any, options?: any): any {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    validateWithFields(fields, null, 'ZonedDateTime');
    const calId = this.calendarId;
    const calValidEras = VALID_ERAS[calId];
    const calSupportsEras = calValidEras && calValidEras.size > 0;
    // Per spec: read fields in ALPHABETICAL order, each once, coercing immediately (ToIntegerWithTruncation for numbers)
    const _day = fields.day;
    const dayVal = _day !== undefined ? toIntegerWithTruncation(_day) : this.day;
    const _hour = fields.hour;
    const hourVal = _hour !== undefined ? toIntegerWithTruncation(_hour) : this.hour;
    const _microsecond = fields.microsecond;
    const microsecondVal = _microsecond !== undefined ? toIntegerWithTruncation(_microsecond) : this.microsecond;
    const _millisecond = fields.millisecond;
    const millisecondVal = _millisecond !== undefined ? toIntegerWithTruncation(_millisecond) : this.millisecond;
    const _minute = fields.minute;
    const minuteVal = _minute !== undefined ? toIntegerWithTruncation(_minute) : this.minute;
    const _month = fields.month;
    const monthRaw = _month !== undefined ? toIntegerWithTruncation(_month) : undefined;
    const _monthCode = fields.monthCode;
    const monthCodeStr = _monthCode !== undefined ? toPrimitiveAndRequireString(_monthCode, 'monthCode') : undefined;
    if (monthCodeStr !== undefined) validateMonthCodeSyntax(monthCodeStr);
    const _nanosecond = fields.nanosecond;
    const nanosecondVal = _nanosecond !== undefined ? toIntegerWithTruncation(_nanosecond) : this.nanosecond;
    const _offset = fields.offset;
    let offsetStr;
    if (_offset !== undefined) {
      // Per spec: ToPrimitiveAndRequireString - only string and object/function are accepted
      if (typeof _offset === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
      if (typeof _offset === 'bigint') throw new TypeError('Cannot convert a BigInt value to a string');
      if (_offset === null) throw new TypeError('offset must be a string');
      if (typeof _offset === 'string') {
        offsetStr = _offset;
      } else if (typeof _offset === 'object' || typeof _offset === 'function') {
        offsetStr = String(_offset);
      } else {
        throw new TypeError(`offset must be a string, got ${typeof _offset}`);
      }
    } else {
      offsetStr = this.offset;
    }
    const _second = fields.second;
    const secondVal = _second !== undefined ? toIntegerWithTruncation(_second) : this.second;
    const _year = fields.year;
    const yearRaw = _year !== undefined ? toIntegerWithTruncation(_year) : undefined;
    // Read era/eraYear for calendars that support them
    let era, eraYear, year;
    let _hasEra = false,
      _hasEraYear = false;
    if (calSupportsEras) {
      const _era = fields.era;
      const _eraYear = fields.eraYear;
      _hasEra = _era !== undefined;
      _hasEraYear = _eraYear !== undefined;
      if (_hasEra !== _hasEraYear) {
        throw new TypeError('era and eraYear must be provided together');
      }
      if (_hasEra && _hasEraYear) {
        era = _era;
        eraYear = toIntegerWithTruncation(_eraYear);
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
    // Check at least one recognized field was provided
    if (
      _day === undefined &&
      _hour === undefined &&
      _microsecond === undefined &&
      _millisecond === undefined &&
      _minute === undefined &&
      _month === undefined &&
      _monthCode === undefined &&
      _nanosecond === undefined &&
      _offset === undefined &&
      _second === undefined &&
      _year === undefined &&
      !_hasEra &&
      !_hasEraYear
    ) {
      throw new TypeError('At least one recognized property must be provided');
    }
    const merged: any = {
      day: dayVal,
      hour: hourVal,
      microsecond: microsecondVal,
      millisecond: millisecondVal,
      minute: minuteVal,
      nanosecond: nanosecondVal,
      second: secondVal,
      offset: offsetStr,
      year,
      era,
      eraYear,
    };
    // Resolve era/eraYear to get target year for monthCode resolution
    resolveEraYear(merged, calId);
    // Resolve month from month/monthCode
    let _pendingMonthCodeValidation = null;
    if (monthRaw !== undefined && monthCodeStr !== undefined) {
      merged.month = monthRaw;
      _pendingMonthCodeValidation = { monthCode: monthCodeStr, month: monthRaw };
    } else if (_month !== undefined) {
      merged.month = monthRaw;
    } else if (_monthCode !== undefined) {
      // Defer monthCodeToMonth until after options are read (spec requires options to be observed first)
      _pendingMonthCodeValidation = { monthCode: monthCodeStr, calId, year: merged.year, needsMonth: true };
      // Tentatively extract month from monthCode syntax for early range checks
      const mcMatch = typeof monthCodeStr === 'string' ? monthCodeStr.match(/^M(\d{2})(L?)$/) : null;
      if (mcMatch) {
        const num = parseInt(mcMatch[1]!, 10);
        merged.month = mcMatch[2] === 'L' ? num + 1 : num;
      } else {
        merged.month = 1; // Will be validated later
      }
    } else {
      merged.month = monthCodeToMonth(this.monthCode, calId, merged.year);
    }
    const effectiveMonthCodeZDT =
      _monthCode !== undefined ? monthCodeStr : _month === undefined ? this.monthCode : undefined;
    merged.timeZone = this.timeZoneId;
    merged.calendar = calId;
    const td = _trunc(merged.day);
    if (td < 1) throw new RangeError(`day ${td} out of range`);
    const tm = _trunc(merged.month);
    if (tm < 1) throw new RangeError(`month ${tm} out of range`);
    // Read all options in alphabetical order AFTER fields
    validateOptions(options);
    const _withDisambigRaw = options !== undefined && options !== null ? options.disambiguation : undefined;
    let _withDisambigStr;
    if (_withDisambigRaw !== undefined) {
      _withDisambigStr = toStringOption(_withDisambigRaw);
      if (!DISAMBIGUATION_MAP[_withDisambigStr])
        throw new RangeError(`Invalid disambiguation option: ${_withDisambigStr}`);
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
    // Deferred calendar-specific monthCode validation (after options are read per spec)
    if (_pendingMonthCodeValidation) {
      if (_pendingMonthCodeValidation.needsMonth) {
        // Resolve month from monthCode now that options have been read
        merged.month = monthCodeToMonth(
          _pendingMonthCodeValidation.monthCode,
          _pendingMonthCodeValidation.calId,
          _pendingMonthCodeValidation.year,
        );
      } else if (_pendingMonthCodeValidation.month !== undefined) {
        const fromCode = monthCodeToMonth(_pendingMonthCodeValidation.monthCode, calId, merged.year);
        if (_trunc(_pendingMonthCodeValidation.month) !== fromCode) {
          throw new RangeError(
            `month ${_pendingMonthCodeValidation.month} and monthCode ${_pendingMonthCodeValidation.monthCode} do not agree`,
          );
        }
      } else if (_pendingMonthCodeValidation.calId) {
        monthCodeToMonth(
          _pendingMonthCodeValidation.monthCode,
          _pendingMonthCodeValidation.calId,
          _pendingMonthCodeValidation.year,
        );
      }
    }
    if (
      overflow === 'Reject' &&
      effectiveMonthCodeZDT &&
      !isMonthCodeValidForYear(effectiveMonthCodeZDT, calId, merged.year)
    ) {
      throw new RangeError(
        `monthCode ${effectiveMonthCodeZDT} is not valid for year ${merged.year} in ${calId} calendar`,
      );
    }
    // Recompute tm after deferred validation may have updated merged.month
    const resolvedTm = _trunc(merged.month);
    if (!ISO_MONTH_ALIGNED_CALENDARS.has(calId) || calId === 'japanese') {
      const dim = calendarDaysInMonth(merged.year, resolvedTm, calId);
      if (dim !== undefined) {
        if (overflow === 'Reject' && td > dim) {
          throw new RangeError(
            `Date field values out of range: day ${td} is not valid for month ${merged.month} (max ${dim})`,
          );
        }
        merged.day = Math.min(td, dim);
      }
    }
    const withOptions: any = {};
    if (_withDisambigStr !== undefined) withOptions.disambiguation = _withDisambigStr;
    withOptions.offset = _withOffsetStr !== undefined ? _withOffsetStr : 'prefer';
    if (overflow !== undefined) withOptions.overflow = overflow === 'Reject' ? 'reject' : 'constrain';
    return ZonedDateTime.from(merged, withOptions);
  }

  withCalendar(calendar: any): any {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    if (calendar === undefined) throw new TypeError('calendar argument is required');
    const newCalId = getCalendarId(calendar);
    const cal = toNapiCalendar(calendar);
    return wrapZonedDateTime(this._inner.withCalendar(cal), newCalId);
  }

  withTimeZone(timeZone: any): any {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    const tz = toNapiTimeZone(timeZone);
    return wrapZonedDateTime(
      call(() => this._inner.withTimeZone(tz)),
      getRealCalendarId(this),
    );
  }

  withPlainTime(time: any) {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    if (time === undefined) {
      this._checkLocalTimeInRange();
      return this.startOfDay();
    }
    const t = toNapiPlainTime(time);
    // For extreme epoch values with offset timezones, compute correct local date
    let localYear = this.year,
      localMonth = this.month,
      localDay = this.day;
    if (this._epochNs !== undefined) {
      const tzId = this._tzId || this.timeZoneId;
      if (tzId && FIXED_OFFSET_TZ_RE.test(tzId)) {
        const offsetNs = parseOffsetTzToNs(tzId);
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
        const offsetMs = parseOffsetTzToMs(tzId);
        const newEpochMs = newLocalMs - offsetMs;
        const limit = 8640000000000000;
        if (newEpochMs < -limit || newEpochMs > limit) {
          throw new RangeError('ZonedDateTime out of representable range');
        }
      }
    }
    const merged: any = {
      year: localYear,
      month: localMonth,
      day: localDay,
      hour: t.hour,
      minute: t.minute,
      second: t.second,
      millisecond: t.millisecond,
      microsecond: t.microsecond,
      nanosecond: t.nanosecond,
      timeZone: this.timeZoneId,
      calendar: this.calendarId,
    };
    // withPlainTime defaults to offset: 'prefer', disambiguation: 'compatible'
    return ZonedDateTime.from(merged, { offset: 'prefer' });
  }

  add(durationArg: any, options?: any): any {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    const calId = getRealCalendarId(this);
    return addWithOverflow(this._inner, dur, overflow, 'add', (n) => wrapZonedDateTime(n, calId));
  }

  subtract(durationArg: any, options?: any): any {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    const calId = getRealCalendarId(this);
    return addWithOverflow(this._inner, dur, overflow, 'subtract', (n) => wrapZonedDateTime(n, calId));
  }

  until(other: any, options?: any): any {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    const otherInner = toNapiZonedDateTime(other);
    const settings = convertDifferenceSettings(options);
    const calId = getRealCalendarId(this);
    const lu = settings && settings.largestUnit ? settings.largestUnit : 'Hour';
    const hasRounding = settings && (settings.smallestUnit || settings.roundingIncrement);
    if (!hasRounding && (lu === 'Year' || lu === 'Month') && !ISO_MONTH_ALIGNED_CALENDARS.has(calId)) {
      const startDate = this._inner.toPlainDate();
      const endDate = otherInner.toPlainDate();
      const dateDiff = calendarDateDifference(startDate, endDate, lu, calId);
      if (dateDiff) {
        const napiDur = call(() => this._inner.until(otherInner, settings));
        return wrapDuration(
          call(
            () =>
              new NapiDuration(
                dateDiff.years,
                dateDiff.months,
                dateDiff.weeks,
                dateDiff.days,
                napiDur.hours,
                napiDur.minutes,
                napiDur.seconds,
                napiDur.milliseconds,
                napiDur.microseconds,
                napiDur.nanoseconds,
              ),
          ),
        );
      }
    }
    return wrapDuration(call(() => this._inner.until(otherInner, settings)));
  }

  since(other: any, options?: any): any {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    const otherInner = toNapiZonedDateTime(other);
    const settings = convertDifferenceSettings(options);
    const calId = getRealCalendarId(this);
    const lu = settings && settings.largestUnit ? settings.largestUnit : 'Hour';
    const hasRounding = settings && (settings.smallestUnit || settings.roundingIncrement);
    if (!hasRounding && (lu === 'Year' || lu === 'Month') && !ISO_MONTH_ALIGNED_CALENDARS.has(calId)) {
      const startDate = this._inner.toPlainDate();
      const endDate = otherInner.toPlainDate();
      const dateDiff = calendarDateDifference(startDate, endDate, lu, calId);
      if (dateDiff) {
        const napiDur = call(() => this._inner.since(otherInner, settings));
        return wrapDuration(
          call(
            () =>
              new NapiDuration(
                -dateDiff.years,
                -dateDiff.months,
                -dateDiff.weeks,
                -dateDiff.days,
                napiDur.hours,
                napiDur.minutes,
                napiDur.seconds,
                napiDur.milliseconds,
                napiDur.microseconds,
                napiDur.nanoseconds,
              ),
          ),
        );
      }
    }
    return wrapDuration(call(() => this._inner.since(otherInner, settings)));
  }

  round(options: any): any {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
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
    // Per spec: smallestUnit is required for ZonedDateTime.round
    if (opts.smallestUnit === undefined) {
      throw new RangeError('smallestUnit is required for ZonedDateTime.prototype.round');
    }
    this._checkLocalTimeInRange();
    return wrapZonedDateTime(
      call(() => this._inner.round(opts)),
      getRealCalendarId(this),
    );
  }

  equals(other: any): boolean {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
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
    } catch {
      /* fall through to NAPI */
    }
    return call(() => this._inner.equals(otherInner));
  }

  startOfDay() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    this._checkLocalTimeInRange();
    return wrapZonedDateTime(
      call(() => this._inner.startOfDay()),
      getRealCalendarId(this),
    );
  }

  toInstant() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    return wrapInstant(this._inner.toInstant());
  }

  toPlainDate() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    return wrapPlainDate(this._inner.toPlainDate(), getRealCalendarId(this));
  }

  toPlainTime() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    return wrapPlainTime(this._inner.toPlainTime());
  }

  toPlainDateTime() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    // For extreme epoch nanoseconds with large UTC offsets, the NAPI's internal
    // representation may be incorrect. Use manual computation via BigInt arithmetic
    // to get the correct local date/time.
    if (this._epochNs !== undefined) {
      const tzId = this._tzId || this.timeZoneId;
      if (tzId && FIXED_OFFSET_TZ_RE.test(tzId)) {
        const offsetNs = parseOffsetTzToNs(tzId);
        const localNs = this._epochNs + offsetNs;
        // Convert nanoseconds to date/time components
        const nsPerDay = 86400000000000n;
        let dayNs = localNs % nsPerDay;
        let epochDays = localNs / nsPerDay;
        if (dayNs < 0n) {
          dayNs += nsPerDay;
          epochDays -= 1n;
        }
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
          const pdt = call(
            () =>
              new NapiPlainDateTime(
                isoDate.year,
                isoDate.month,
                isoDate.day,
                hour,
                minute,
                second,
                millisecond,
                microsecond,
                nanosecond,
                cal,
              ),
          );
          return wrapPlainDateTime(pdt, getRealCalendarId(this));
        } catch {
          /* fall through to NAPI */
        }
      }
    }
    return call(() => wrapPlainDateTime(this._inner.toPlainDateTime(), getRealCalendarId(this)));
  }

  getTimeZoneTransition(directionParam: any) {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    // Per spec: GetOptionsObject first, then GetDirectionOption
    // GetOptionsObject: undefined -> TypeError, string -> treated as shorthand,
    // null/boolean/number/bigint/symbol -> TypeError, object/function -> extract property
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
      // boolean, number, bigint, symbol -> TypeError (not a valid options object)
      throw new TypeError('options must be an object or string');
    }
    return _findTimeZoneTransition(this, dir);
  }

  toString(options?: any): string {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    if (options !== undefined) validateOptions(options);
    if (options === undefined) {
      return call(() => this._inner.toString());
    }
    // Per spec: read ALL options in ALPHABETICAL order, coercing to string, THEN validate
    // Step 1: Read and coerce all options
    const _cnRaw = options.calendarName;
    const cnStr = _cnRaw !== undefined ? toStringOption(_cnRaw) : undefined;
    const _fsdRaw = options.fractionalSecondDigits;
    const fsd = resolveFractionalSecondDigits(_fsdRaw);
    const _offRaw = options.offset;
    const offStr = _offRaw !== undefined ? toStringOption(_offRaw) : undefined;
    const _rmRaw = options.roundingMode;
    const rmStr = _rmRaw !== undefined ? toStringOption(_rmRaw) : undefined;
    const _suRaw = options.smallestUnit;
    const suStr = _suRaw !== undefined ? toStringOption(_suRaw) : undefined;
    const _tznRaw = options.timeZoneName;
    const tznStr = _tznRaw !== undefined ? toStringOption(_tznRaw) : undefined;

    // Step 2: Validate all options
    const displayCalendar =
      cnStr !== undefined
        ? (() => {
            const m = DISPLAY_CALENDAR_MAP[cnStr];
            if (!m) throw new RangeError(`Invalid calendarName option: ${cnStr}`);
            return m;
          })()
        : undefined;
    const displayOffset =
      offStr !== undefined
        ? (() => {
            const m = DISPLAY_OFFSET_MAP[offStr];
            if (!m) throw new RangeError(`Invalid offset option: ${offStr}`);
            return m;
          })()
        : undefined;
    const roundingMode =
      rmStr !== undefined
        ? (() => {
            const m = ROUNDING_MODE_MAP[rmStr];
            if (!m) throw new RangeError(`Invalid rounding mode: ${rmStr}`);
            return m;
          })()
        : 'Trunc';
    let smallestUnit;
    if (suStr !== undefined) {
      const canonical = ZDT_TOSTRING_UNIT_ALIAS[suStr] || suStr;
      if (!ZDT_TOSTRING_VALID_UNITS.has(canonical)) {
        throw new RangeError(`Invalid smallestUnit for ZonedDateTime.toString: ${suStr}`);
      }
      smallestUnit = canonical;
    }
    const displayTimeZone =
      tznStr !== undefined
        ? (() => {
            const m = DISPLAY_TIMEZONE_MAP[tznStr];
            if (!m) throw new RangeError(`Invalid timeZoneName option: ${tznStr}`);
            return m;
          })()
        : undefined;

    // Determine precision: smallestUnit overrides fractionalSecondDigits
    let precision: any = 'auto';
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
      inner = call(() => this._inner.round(roundOpts as any));
    } else if (typeof precision === 'number' && precision < 9) {
      const { unit, increment } = DIGIT_ROUND[precision]!;
      const roundOpts = { smallestUnit: unit, roundingMode, roundingIncrement: increment };
      inner = call(() => this._inner.round(roundOpts as any));
    }

    let str = call(() => inner.toString());

    // Format fractional seconds
    if (precision === 'minute') {
      const tIdx = str.indexOf('T');
      if (tIdx !== -1) {
        const offsetMatch = str.substring(tIdx).match(/[+-]\d{2}:\d{2}|Z/);
        if (offsetMatch) {
          const offsetStart = tIdx + offsetMatch.index!;
          const timePart = str.substring(tIdx + 1, offsetStart);
          const parts = timePart.split(':');
          if (parts.length >= 2) {
            str = str.substring(0, tIdx + 1) + (parts[0] ?? '') + ':' + (parts[1] ?? '') + str.substring(offsetStart);
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

  toJSON() {
    requireBranding(this, NapiZonedDateTime, 'Temporal.ZonedDateTime');
    return this.toString();
  }
  toLocaleString(locales?: any, options?: any): string {
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
        const resolvedCal = new Intl.DateTimeFormat(
          locales,
          options && typeof options === 'object' ? { calendar: options.calendar } : undefined,
        ).resolvedOptions().calendar;
        if (calId !== resolvedCal) {
          throw new RangeError(`Calendar ${calId} does not match locale calendar ${resolvedCal}`);
        }
      }
      // Build options: force timeZone to ZDT's timezone
      let opts: any;
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
        if (_origFormatGetter) {
          return _origFormatGetter.call(dtf)(ms);
        }
        return dtf.format(ms);
      } catch (e: any) {
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

  static [Symbol.hasInstance](v: any): boolean {
    return (
      v !== null && v !== undefined && typeof v === 'object' && '_inner' in v && v._inner instanceof NapiZonedDateTime
    );
  }
}

_classes['ZonedDateTime'] = ZonedDateTime;
// Register with timezone.ts for _findTimeZoneTransition
_tzClasses['ZonedDateTime'] = ZonedDateTime;

export { ZonedDateTime };
