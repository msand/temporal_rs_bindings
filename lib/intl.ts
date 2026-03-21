// Intl patching and Date.prototype.toTemporalInstant - side-effect-only module
// Extracted from temporal.ts

import {
  NapiPlainDate,
  NapiPlainTime,
  NapiPlainDateTime,
  NapiZonedDateTime,
  NapiInstant,
  NapiPlainYearMonth,
  NapiPlainMonthDay,
  NapiDuration,
} from './binding';
import { _isTemporalDuration } from './helpers';
import { Instant } from './instant';
import { Duration } from './duration';

// Augment ImportMeta for Node.js ESM
declare global {
  // Intl.DurationFormat is not yet in TS libs
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Intl {
    class DurationFormat {
      constructor(locales?: string | string[], options?: Record<string, unknown>);
      format(duration: Record<string, unknown> | string): string;
      formatToParts(duration: Record<string, unknown> | string): Array<{ type: string; value: string }>;
      resolvedOptions(): Record<string, unknown>;
    }
  }
}

// ISO date fields
interface ISOFields {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

// Range info for Intl formatting
interface RangeInfo {
  ms: any;
  isoFields: ISOFields | null | undefined;
  isTemporal: boolean;
}

// ═══════════════════════════════════════════════════════════════
//  Date.prototype.toTemporalInstant
// ═══════════════════════════════════════════════════════════════

if (!(Date.prototype as any).toTemporalInstant) {
  const _toTemporalInstant = {
    toTemporalInstant(this: Date) {
      // Per spec, throw if this is not a Date object
      if (!(this instanceof Date)) {
        throw new TypeError('Date.prototype.toTemporalInstant requires a Date object');
      }
      const ms = this.getTime();
      if (ms !== ms) {
        // NaN check (invalid date)
        throw new RangeError('Invalid Date');
      }
      return new Instant(BigInt(ms) * 1000000n);
    },
  };
  Object.defineProperty(Date.prototype as any, 'toTemporalInstant', {
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
const _DATE_TIME_COMPONENT_OPTS = [
  'year',
  'month',
  'day',
  'weekday',
  'hour',
  'minute',
  'second',
  'fractionalSecondDigits',
  'dayPeriod',
  'dateStyle',
  'timeStyle',
];
function _hasDateTimeOptionsLocal(opts: any): boolean {
  if (!opts || typeof opts !== 'object') return false;
  for (const key of _DATE_TIME_COMPONENT_OPTS) {
    if (opts[key] !== undefined) return true;
  }
  return false;
}

// Helper: extract ISO year/month/day/hour/minute/second from a Temporal object
function _temporalToISOFields(temporalObj: any): ISOFields | undefined {
  if (!temporalObj || typeof temporalObj !== 'object') return undefined;
  const inner = temporalObj._inner;
  if (!inner) return undefined;
  if (inner instanceof NapiPlainDateTime) {
    const str = inner.toString();
    const m = str.match(/^(-?\d+|\+?\d+)-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    if (m)
      return {
        year: parseInt(m[1]!, 10),
        month: parseInt(m[2]!, 10),
        day: parseInt(m[3]!, 10),
        hour: parseInt(m[4]!, 10),
        minute: parseInt(m[5]!, 10),
        second: parseInt(m[6]!, 10),
      };
    return {
      year: inner.year,
      month: inner.month,
      day: inner.day,
      hour: inner.hour as any,
      minute: inner.minute as any,
      second: inner.second as any,
    };
  }
  if (inner instanceof NapiPlainDate) {
    const str = inner.toString();
    const m = str.match(/^(-?\d+|\+?\d+)-(\d{2})-(\d{2})/);
    if (m)
      return {
        year: parseInt(m[1]!, 10),
        month: parseInt(m[2]!, 10),
        day: parseInt(m[3]!, 10),
        hour: 12,
        minute: 0,
        second: 0,
      };
    return { year: inner.year, month: inner.month, day: inner.day, hour: 12, minute: 0, second: 0 };
  }
  if (inner instanceof NapiPlainYearMonth) {
    const str = inner.toString();
    const m3 = str.match(/(-?\d+|\+?\d+)-(\d{2})-(\d{2})/);
    if (m3)
      return {
        year: parseInt(m3[1]!, 10),
        month: parseInt(m3[2]!, 10),
        day: parseInt(m3[3]!, 10),
        hour: 12,
        minute: 0,
        second: 0,
      };
    const m2 = str.match(/(-?\d+|\+?\d+)-(\d{2})/);
    if (m2) return { year: parseInt(m2[1]!, 10), month: parseInt(m2[2]!, 10), day: 1, hour: 12, minute: 0, second: 0 };
    return undefined;
  }
  if (inner instanceof NapiPlainMonthDay) {
    const str = inner.toString();
    const m = str.match(/(-?\d+|\+?\d+)-(\d{2})-(\d{2})/) || str.match(/^(\d{2})-(\d{2})$/);
    if (m) {
      if (m.length === 4)
        return {
          year: parseInt(m[1]!, 10),
          month: parseInt(m[2]!, 10),
          day: parseInt(m[3]!, 10),
          hour: 12,
          minute: 0,
          second: 0,
        };
      return { year: 1972, month: parseInt(m[1]!, 10), day: parseInt(m[2]!, 10), hour: 12, minute: 0, second: 0 };
    }
    return undefined;
  }
  if (inner instanceof NapiPlainTime) {
    return { year: 1970, month: 1, day: 1, hour: inner.hour, minute: inner.minute, second: inner.second };
  }
  return undefined;
}

// Check if an ISO year is outside the range representable by Date
function _isExtremeYear(year: number): boolean {
  return year < -271820 || year > 275759;
}

// Tomohiko Sakamoto's algorithm for day-of-week (0=Sunday..6=Saturday)
function _dayOfWeek(y: number, m: number, d: number): number {
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  if (m < 3) y -= 1;
  return (((y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[m - 1]! + d) % 7) + 7) % 7;
}

// Format a Temporal object that is outside Date range by shifting the year
// Returns formatted string or undefined if not applicable
function _formatExtremeTemporalParts(
  dtf: Intl.DateTimeFormat,
  isoFields: ISOFields,
): Array<{ type: string; value: string }> | undefined {
  const { year, month, day, hour, minute, second } = isoFields;
  // Shift to a year within Date range preserving leap year cycle
  const shiftedYear = 2000 + (((year % 400) + 400) % 400);
  const d = new Date(0);
  d.setUTCFullYear(shiftedYear, month - 1, day);
  d.setUTCHours(hour, minute, second, 0);
  if (isNaN(d.getTime())) return undefined;

  // Format to parts using the shifted year
  const parts = _origFormatToParts.call(dtf, d);

  // Compute the correct weekday for the actual year
  const correctDow = _dayOfWeek(year, month, day);
  // Also compute the shifted year's weekday
  const shiftedDow = _dayOfWeek(shiftedYear, month, day);

  // Get weekday names if the format includes weekday and the DOW differs
  let weekdayMap = null;
  if (correctDow !== shiftedDow) {
    // Format all 7 days to get weekday names in the locale
    const resolved = dtf.resolvedOptions();
    if (resolved.weekday) {
      weekdayMap = {} as Record<number, string>;
      // Find a base Monday (Jan 1, 2024 was a Monday)
      for (let i = 0; i < 7; i++) {
        const wd = new Date(Date.UTC(2024, 0, i + 1, 12)); // Jan 1=Mon, Jan 7=Sun
        // DOW: Mon=1, Tue=2, ..., Sun=0
        const dow = (i + 1) % 7; // 1,2,3,4,5,6,0
        const wdParts = _origFormatToParts.call(dtf, wd);
        const wdPart = wdParts.find((p) => p.type === 'weekday');
        if (wdPart) weekdayMap[dow] = wdPart.value;
      }
    }
  }

  // Fix year and weekday parts
  const actualYearStr = String(year);

  const fixedParts = parts.map((p) => {
    if (p.type === 'year') {
      // Replace the shifted year with actual year
      // The value might be formatted (e.g., with numbering system)
      const resolved = dtf.resolvedOptions();
      if (resolved.numberingSystem && resolved.numberingSystem !== 'latn') {
        // Format the actual year using the same numbering system
        const nf = new Intl.NumberFormat(resolved.locale, {
          useGrouping: false,
          numberingSystem: resolved.numberingSystem,
        });
        return { ...p, value: nf.format(year) };
      }
      return { ...p, value: actualYearStr };
    }
    if (p.type === 'weekday' && weekdayMap && weekdayMap[correctDow] !== undefined) {
      return { ...p, value: weekdayMap[correctDow] };
    }
    return p;
  });

  return fixedParts;
}

// Format extreme Temporal as string
function _formatExtremeTemporal(dtf: Intl.DateTimeFormat, isoFields: ISOFields): string | undefined {
  const parts = _formatExtremeTemporalParts(dtf, isoFields);
  if (!parts) return undefined;
  return parts.map((p) => p.value).join('');
}

// Helper: convert a Temporal object to epoch milliseconds for Intl formatting
function _temporalToEpochMsLocal(temporalObj: any): number | undefined {
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
    d.setUTCFullYear(
      (inner as any).isoYear || inner.year,
      ((inner as any).isoMonth || inner.month) - 1,
      (inner as any).isoDay || inner.day,
    );
    d.setUTCHours(inner.hour, inner.minute, inner.second, inner.millisecond);
    return d.getTime();
  }
  if (inner instanceof NapiPlainDate) {
    const d = new Date(0);
    // Extract ISO fields from toString to get the actual ISO year/month/day
    const str = inner.toString();
    const m = str.match(/^(-?\d+|\+\d+)-(\d{2})-(\d{2})/);
    if (m) {
      d.setUTCFullYear(parseInt(m[1]!, 10), parseInt(m[2]!, 10) - 1, parseInt(m[3]!, 10));
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
      d.setUTCFullYear(parseInt(m3[1]!, 10), parseInt(m3[2]!, 10) - 1, parseInt(m3[3]!, 10));
      d.setUTCHours(12, 0, 0, 0);
      return d.getTime();
    }
    // Fallback: ISO calendar format "YYYY-MM" (no day)
    const m2 = str.match(/(-?\d+|\+\d+)-(\d{2})/);
    if (m2) {
      const d = new Date(0);
      d.setUTCFullYear(parseInt(m2[1]!, 10), parseInt(m2[2]!, 10) - 1, 1);
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
        d.setUTCFullYear(parseInt(m[1]!, 10), parseInt(m[2]!, 10) - 1, parseInt(m[3]!, 10));
      } else {
        d.setUTCFullYear(1972, parseInt(m[1]!, 10) - 1, parseInt(m[2]!, 10));
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
const _origFormatGetterLocal = _origFormatDesc && (_origFormatDesc.get as () => (date?: number | Date) => string);
const _origFormatToParts = Intl.DateTimeFormat.prototype.formatToParts;

// Helper: check if resolved DTF options indicate user-specified component options
// When no component options are specified, DateTimeFormat defaults to {year: "numeric", month: "numeric", day: "numeric"}
// We detect this default pattern and treat it as "no user options"
function _resolvedHasUserComponents(resolvedOpts: any): boolean {
  if (resolvedOpts.dateStyle || resolvedOpts.timeStyle) return true;
  if (
    resolvedOpts.hour ||
    resolvedOpts.minute ||
    resolvedOpts.second ||
    resolvedOpts.fractionalSecondDigits ||
    resolvedOpts.dayPeriod ||
    resolvedOpts.weekday
  )
    return true;
  // Check if it's not the default pattern (year+month+day only = defaults)
  // If year/month/day are present but nothing else, it's likely defaults
  if (resolvedOpts.year && resolvedOpts.month && resolvedOpts.day) return false;
  // If only some of year/month/day, user specified them
  if (resolvedOpts.year || resolvedOpts.month || resolvedOpts.day) return true;
  return false;
}

// Helper: create a UTC-forced DTF for "wall-clock" Temporal types (PlainDate, PlainDateTime, PlainTime)
// Also creates a DTF with defaults for Instant/wall-clock types when needed
function _getTemporalDtf(dtf: Intl.DateTimeFormat, temporalObj: any): Intl.DateTimeFormat {
  const inner = temporalObj._inner;
  const isWallClock =
    inner instanceof NapiPlainDate ||
    inner instanceof NapiPlainDateTime ||
    inner instanceof NapiPlainTime ||
    inner instanceof NapiPlainYearMonth ||
    inner instanceof NapiPlainMonthDay;
  if (isWallClock) {
    // Need a new DTF with UTC timezone to avoid timezone shifts
    const resolvedOpts = dtf.resolvedOptions();
    const opts: any = {};
    for (const key of [
      'locale',
      'calendar',
      'numberingSystem',
      'year',
      'month',
      'day',
      'hour',
      'minute',
      'second',
      'fractionalSecondDigits',
      'weekday',
      'era',
      'dayPeriod',
      'dateStyle',
      'timeStyle',
      'hour12',
      'hourCycle',
      'timeZoneName',
    ]) {
      if ((resolvedOpts as any)[key] !== undefined) opts[key] = (resolvedOpts as any)[key];
    }
    opts.timeZone = 'UTC';
    // Always filter out incompatible options for the Temporal type
    // All wall-clock types should strip timeZoneName (they have no timezone)
    if (isWallClock) {
      delete opts.timeZoneName;
    }
    if (inner instanceof NapiPlainDate) {
      delete opts.hour;
      delete opts.minute;
      delete opts.second;
      delete opts.fractionalSecondDigits;
      delete opts.dayPeriod;
      if (opts.timeStyle) {
        delete opts.timeStyle;
      }
    } else if (inner instanceof NapiPlainTime) {
      delete opts.year;
      delete opts.month;
      delete opts.day;
      delete opts.weekday;
      delete opts.era;
      if (opts.dateStyle) {
        delete opts.dateStyle;
      }
    } else if (inner instanceof NapiPlainYearMonth) {
      delete opts.day;
      delete opts.weekday;
      delete opts.hour;
      delete opts.minute;
      delete opts.second;
      delete opts.fractionalSecondDigits;
      delete opts.dayPeriod;
      if (opts.timeStyle) {
        delete opts.timeStyle;
      }
      // dateStyle includes day; convert to component options without day
      if (opts.dateStyle) {
        const ds = opts.dateStyle;
        delete opts.dateStyle;
        if (ds === 'full' || ds === 'long') {
          opts.month = 'long';
          opts.year = 'numeric';
        } else if (ds === 'medium') {
          opts.month = 'short';
          opts.year = 'numeric';
        } else if (ds === 'short') {
          opts.month = 'numeric';
          opts.year = '2-digit';
        }
      }
    } else if (inner instanceof NapiPlainMonthDay) {
      delete opts.year;
      delete opts.era;
      delete opts.weekday;
      delete opts.hour;
      delete opts.minute;
      delete opts.second;
      delete opts.fractionalSecondDigits;
      delete opts.dayPeriod;
      if (opts.timeStyle) {
        delete opts.timeStyle;
      }
      // dateStyle includes year; convert to component options without year
      if (opts.dateStyle) {
        const ds = opts.dateStyle;
        delete opts.dateStyle;
        if (ds === 'full' || ds === 'long') {
          opts.month = 'long';
          opts.day = 'numeric';
        } else if (ds === 'medium') {
          opts.month = 'short';
          opts.day = 'numeric';
        } else if (ds === 'short') {
          opts.month = 'numeric';
          opts.day = 'numeric';
        }
      }
    }
    // Add defaults based on type if no component options were specified
    if (!_resolvedHasUserComponents(resolvedOpts)) {
      if (inner instanceof NapiPlainDateTime) {
        opts.year = 'numeric';
        opts.month = 'numeric';
        opts.day = 'numeric';
        opts.hour = 'numeric';
        opts.minute = 'numeric';
        opts.second = 'numeric';
      } else if (inner instanceof NapiPlainDate) {
        opts.year = 'numeric';
        opts.month = 'numeric';
        opts.day = 'numeric';
      } else if (inner instanceof NapiPlainTime) {
        opts.hour = 'numeric';
        opts.minute = 'numeric';
        opts.second = 'numeric';
      } else if (inner instanceof NapiPlainYearMonth) {
        opts.year = 'numeric';
        opts.month = 'numeric';
      } else if (inner instanceof NapiPlainMonthDay) {
        opts.month = 'numeric';
        opts.day = 'numeric';
      }
    }
    return new Intl.DateTimeFormat(resolvedOpts.locale, opts);
  }
  // For Instant: if no date/time component options were specified, add defaults (date + time, no timeZoneName)
  if (inner instanceof NapiInstant) {
    const resolvedOpts = dtf.resolvedOptions();
    if (!_resolvedHasUserComponents(resolvedOpts)) {
      const opts = {};
      for (const key of [
        'locale',
        'calendar',
        'numberingSystem',
        'hour12',
        'hourCycle',
        'timeZone',
        'era',
        'timeZoneName',
      ]) {
        if ((resolvedOpts as any)[key] !== undefined) (opts as any)[key] = (resolvedOpts as any)[key];
      }
      (opts as any).year = 'numeric';
      (opts as any).month = 'numeric';
      (opts as any).day = 'numeric';
      (opts as any).hour = 'numeric';
      (opts as any).minute = 'numeric';
      (opts as any).second = 'numeric';
      return new Intl.DateTimeFormat((resolvedOpts as any).locale, opts);
    }
  }
  return dtf;
}

// Helper: format a Temporal object as string, handling extreme dates.
function _formatTemporalAsString(dtf: Intl.DateTimeFormat, temporalObj: any): string | undefined {
  const utcDtf = _getTemporalDtf(dtf, temporalObj);
  const isoFields = _temporalToISOFields(temporalObj);
  // Check if this is an extreme date outside Date range
  if (isoFields && _isExtremeYear(isoFields.year)) {
    return _formatExtremeTemporal(utcDtf, isoFields);
  }
  const ms = _temporalToEpochMsLocal(temporalObj);
  if (ms === undefined) return undefined;
  if (utcDtf !== dtf) {
    return _origFormatGetterLocal!.call(utcDtf)(ms);
  }
  return _origFormatGetterLocal!.call(dtf)(ms);
}

// Helper: formatToParts for a Temporal object, handling extreme dates
function _formatTemporalToParts(dtf: Intl.DateTimeFormat, temporalObj: any): any[] | undefined {
  const utcDtf = _getTemporalDtf(dtf, temporalObj);
  const isoFields = _temporalToISOFields(temporalObj);
  if (isoFields && _isExtremeYear(isoFields.year)) {
    return _formatExtremeTemporalParts(utcDtf, isoFields);
  }
  const ms = _temporalToEpochMsLocal(temporalObj);
  if (ms === undefined) return undefined;
  return _origFormatToParts.call(utcDtf, ms);
}

if (_origFormatGetterLocal) {
  Object.defineProperty(Intl.DateTimeFormat.prototype, 'format', {
    get() {
      const dtf = this as Intl.DateTimeFormat;
      const origFn = _origFormatGetterLocal.call(dtf);
      // Return a bound function that handles Temporal objects
      const fn = function (arg: any) {
        if (arg !== undefined && typeof arg === 'object' && arg !== null && '_inner' in arg) {
          _rejectUnsupportedTemporalDTF(arg, 'format', dtf);
          const result = _formatTemporalAsString(dtf, arg);
          if (result !== undefined) return result;
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
  Intl.DateTimeFormat.prototype.formatToParts = function formatToParts(this: Intl.DateTimeFormat, arg: any) {
    if (arg !== undefined && typeof arg === 'object' && arg !== null && '_inner' in arg) {
      _rejectUnsupportedTemporalDTF(arg, 'formatToParts', this);
      const parts = _formatTemporalToParts(this, arg);
      if (parts !== undefined) return parts;
    }
    return _origFormatToParts.call(this, arg);
  };
}

// Patch formatRange and formatRangeToParts
const _origFormatRange = (Intl.DateTimeFormat.prototype as any).formatRange as ((...args: any[]) => string) | undefined;
const _origFormatRangeToParts = (Intl.DateTimeFormat.prototype as any).formatRangeToParts as
  | ((...args: any[]) => any[])
  | undefined;

function _rejectUnsupportedTemporalDTF(arg: any, methodName: string, dtf?: Intl.DateTimeFormat): void {
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
      const hasTimeOpts = !!(
        resolved.hour ||
        resolved.minute ||
        resolved.second ||
        resolved.fractionalSecondDigits ||
        resolved.dayPeriod
      );
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

function _getTemporalTypeKey(obj: any): string | null {
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

// Per spec: ToDateTimeFormattable calls ToNumber on non-Temporal objects
function _toDateTimeFormattable(val: any): any {
  if (val !== undefined && typeof val === 'object' && val !== null && '_inner' in val) {
    return val; // IsTemporalObject -> return as-is
  }
  return Number(val); // ToNumber (calls valueOf)
}

// Helper: get epoch ms for a range argument, handling extreme dates.
// Returns { ms, isoFields, isTemporal } where ms may be undefined for extreme dates.
function _rangeArgToMs(arg: any): RangeInfo {
  const isTemporal = arg !== undefined && typeof arg === 'object' && arg !== null && '_inner' in arg;
  if (!isTemporal) return { ms: arg, isoFields: null, isTemporal: false };
  const isoFields = _temporalToISOFields(arg);
  if (isoFields && _isExtremeYear(isoFields.year)) {
    return { ms: undefined, isoFields, isTemporal: true };
  }
  const ms = _temporalToEpochMsLocal(arg);
  return { ms: ms !== undefined ? ms : arg, isoFields, isTemporal: true };
}

// Helper: format a range where one or both args may be extreme dates
// Falls back to formatting each side separately with " – " separator
function _formatExtremeRange(
  dtf: Intl.DateTimeFormat,
  a: any,
  b: any,
  aInfo: RangeInfo,
  bInfo: RangeInfo,
  toParts: boolean,
): any {
  const utcDtfA = aInfo.isTemporal ? _getTemporalDtf(dtf, a) : dtf;
  const utcDtfB = bInfo.isTemporal ? _getTemporalDtf(dtf, b) : dtf;

  // If neither has extreme dates, use original
  const aExtreme = aInfo.isoFields && _isExtremeYear(aInfo.isoFields.year);
  const bExtreme = bInfo.isoFields && _isExtremeYear(bInfo.isoFields.year);

  if (!aExtreme && !bExtreme) return undefined;

  // Format each side separately
  let partsA, partsB;
  if (aExtreme) {
    partsA = _formatExtremeTemporalParts(utcDtfA, aInfo.isoFields!);
  } else {
    partsA = _origFormatToParts.call(utcDtfA, aInfo.ms);
  }
  if (bExtreme) {
    partsB = _formatExtremeTemporalParts(utcDtfB, bInfo.isoFields!);
  } else {
    partsB = _origFormatToParts.call(utcDtfB, bInfo.ms);
  }
  if (!partsA || !partsB) return undefined;

  if (toParts) {
    // Return formatRangeToParts-style result with source annotations
    const result = [];
    for (const p of partsA) result.push({ type: p.type, value: p.value, source: 'startRange' });
    result.push({ type: 'literal', value: ' \u2013 ', source: 'shared' });
    for (const p of partsB) result.push({ type: p.type, value: p.value, source: 'endRange' });
    return result;
  } else {
    // Return formatted string
    const strA = partsA.map((p) => p.value).join('');
    const strB = partsB.map((p) => p.value).join('');
    return strA + ' \u2013 ' + strB;
  }
}

if (_origFormatRange) {
  (Intl.DateTimeFormat.prototype as any).formatRange = function formatRange(this: Intl.DateTimeFormat, a: any, b: any) {
    // Per spec: ToDateTimeFormattable is called on both args BEFORE type checking
    const aIsTemporal = a !== undefined && typeof a === 'object' && a !== null && '_inner' in a;
    const bIsTemporal = b !== undefined && typeof b === 'object' && b !== null && '_inner' in b;
    // Call ToNumber on non-Temporal args first (spec step 4-5: ToDateTimeFormattable)
    const fa = aIsTemporal ? a : _toDateTimeFormattable(a);
    const fb = bIsTemporal ? b : _toDateTimeFormattable(b);

    _rejectUnsupportedTemporalDTF(fa, 'formatRange', this);
    _rejectUnsupportedTemporalDTF(fb, 'formatRange', this);
    // Per spec: both args must be the same type (both Temporal same type, or both Date)
    const typeA = _getTemporalTypeKey(fa);
    const typeB = _getTemporalTypeKey(fb);
    // Different Temporal types or one Temporal + one non-Temporal
    if (typeA || typeB) {
      if (typeA !== typeB) {
        throw new TypeError(`formatRange requires both arguments to be the same type`);
      }
    }
    // Per spec: both Temporal objects must have the same calendar
    if (typeA && typeB && fa.calendarId !== undefined && fb.calendarId !== undefined) {
      if (fa.calendarId !== fb.calendarId) {
        throw new RangeError(`formatRange requires both arguments to have the same calendar`);
      }
    }
    const aInfo = _rangeArgToMs(fa);
    const bInfo = _rangeArgToMs(fb);

    // Handle extreme dates
    const extremeResult = _formatExtremeRange(this, fa, fb, aInfo, bInfo, false);
    if (extremeResult !== undefined) return extremeResult;

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let dtf = this;
    const msA = aInfo.ms,
      msB = bInfo.ms;
    if (aInfo.isTemporal) {
      dtf = _getTemporalDtf(this, fa);
    }
    return _origFormatRange.call(dtf, msA, msB);
  };
}

if (_origFormatRangeToParts) {
  (Intl.DateTimeFormat.prototype as any).formatRangeToParts = function formatRangeToParts(
    this: Intl.DateTimeFormat,
    a: any,
    b: any,
  ) {
    // Per spec: ToDateTimeFormattable is called on both args BEFORE type checking
    const aIsTemporal = a !== undefined && typeof a === 'object' && a !== null && '_inner' in a;
    const bIsTemporal = b !== undefined && typeof b === 'object' && b !== null && '_inner' in b;
    const fa = aIsTemporal ? a : _toDateTimeFormattable(a);
    const fb = bIsTemporal ? b : _toDateTimeFormattable(b);

    _rejectUnsupportedTemporalDTF(fa, 'formatRangeToParts', this);
    _rejectUnsupportedTemporalDTF(fb, 'formatRangeToParts', this);
    const typeA2 = _getTemporalTypeKey(fa);
    const typeB2 = _getTemporalTypeKey(fb);
    if (typeA2 || typeB2) {
      if (typeA2 !== typeB2) {
        throw new TypeError(`formatRangeToParts requires both arguments to be the same type`);
      }
    }
    // Per spec: both Temporal objects must have the same calendar
    if (typeA2 && typeB2 && fa.calendarId !== undefined && fb.calendarId !== undefined) {
      if (fa.calendarId !== fb.calendarId) {
        throw new RangeError(`formatRangeToParts requires both arguments to have the same calendar`);
      }
    }
    const aInfo = _rangeArgToMs(fa);
    const bInfo = _rangeArgToMs(fb);

    // Handle extreme dates
    const extremeResult = _formatExtremeRange(this, fa, fb, aInfo, bInfo, true);
    if (extremeResult !== undefined) return extremeResult;

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let dtf = this;
    const msA = aInfo.ms,
      msB = bInfo.ms;
    if (aInfo.isTemporal) {
      dtf = _getTemporalDtf(this, fa);
    }
    return _origFormatRangeToParts.call(dtf, msA, msB);
  };
}

// ═══════════════════════════════════════════════════════════════
//  Intl.DurationFormat patching for Temporal Duration objects
// ═══════════════════════════════════════════════════════════════

if (typeof Intl !== 'undefined' && typeof Intl.DurationFormat === 'function') {
  // Extract duration fields from a Temporal Duration using internal slots
  // (not prototype getters), matching spec requirement that tainted getters
  // don't affect formatting.
  function _extractDurationRecord(arg: any): Record<string, number> | null {
    // Check if it's a Temporal.Duration wrapper
    if (_isTemporalDuration(arg)) {
      // Read from _inner (NAPI object) directly, bypassing prototype getters
      const inner = arg._inner;
      return {
        years: inner.years,
        months: inner.months,
        weeks: inner.weeks,
        days: inner.days,
        hours: inner.hours,
        minutes: inner.minutes,
        seconds: inner.seconds,
        milliseconds: inner.milliseconds,
        microseconds: inner.microseconds,
        nanoseconds: inner.nanoseconds,
      };
    }
    // Check if it's a raw NAPI Duration
    if (arg instanceof NapiDuration) {
      return {
        years: arg.years,
        months: arg.months,
        weeks: arg.weeks,
        days: arg.days,
        hours: arg.hours,
        minutes: arg.minutes,
        seconds: arg.seconds,
        milliseconds: arg.milliseconds,
        microseconds: arg.microseconds,
        nanoseconds: arg.nanoseconds,
      };
    }
    return null;
  }

  // Parse an ISO 8601 duration string into a duration-like record
  function _parseDurationString(str: string): Record<string, number> | null {
    try {
      const d = Duration.from(str);
      return _extractDurationRecord(d);
    } catch {
      return null;
    }
  }

  const _origDFFormat = (Intl as any).DurationFormat.prototype.format as (...args: any[]) => string;
  const _origDFFormatToParts = (Intl as any).DurationFormat.prototype.formatToParts as (...args: any[]) => any[];

  (Intl as any).DurationFormat.prototype.format = function format(duration: any) {
    const rec = _extractDurationRecord(duration);
    if (rec) return _origDFFormat.call(this, rec);
    if (typeof duration === 'string') {
      const parsed = _parseDurationString(duration);
      if (parsed) return _origDFFormat.call(this, parsed);
    }
    return _origDFFormat.call(this, duration);
  };

  (Intl as any).DurationFormat.prototype.formatToParts = function formatToParts(duration: any) {
    const rec = _extractDurationRecord(duration);
    if (rec) return _origDFFormatToParts.call(this, rec);
    if (typeof duration === 'string') {
      const parsed = _parseDurationString(duration);
      if (parsed) return _origDFFormatToParts.call(this, parsed);
    }
    return _origDFFormatToParts.call(this, duration);
  };
}

// Exports used by class toLocaleString() methods
export {
  _hasDateTimeOptionsLocal as _hasDateTimeOptions,
  _origFormatGetterLocal as _origFormatGetter,
  _temporalToEpochMsLocal as _temporalToEpochMs,
};
