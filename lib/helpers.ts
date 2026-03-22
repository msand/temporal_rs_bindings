// Pure utility functions extracted from temporal.ts.
// These have no dependency on the wrapper classes (Duration, PlainDate, etc.)
// except through the late-bound `_classes` record.

import {
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
} from './binding';
import { mapOverflow } from './enums';

// Common regex for fixed-offset timezone IDs with optional fractional seconds
const OFFSET_TZ_WITH_FRAC_RE = /^[+-]\d{2}(:\d{2}(:\d{2}(\.\d{1,9})?)?)?$/;

// ─── Late-bound class constructors ────────────────────────────
// Set by the class modules after they're defined.
// This breaks the circular dependency between helpers and class definitions.
export const _classes: Record<string, any> = {};

// ─── Helper: wrap NAPI errors ─────────────────────────────────

export function wrapError(e: any): TypeError | RangeError {
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

export function call<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e: any) {
    throw wrapError(e);
  }
}

// ─── Helper: WeakSet for wrapper type checks ──────────────────

export const _wrapperSet = new WeakSet();

// ─── Helpers: type-check Temporal wrapper objects WITHOUT triggering Proxy traps ───
// These use _wrapperSet (a WeakSet populated in constructors) so that property bag
// Proxies (like test262's TemporalHelpers.propertyBagObserver) don't get spurious
// "has _inner" / "get _inner" trap calls.
export function _isTemporalDuration(arg: any): arg is { _inner: NapiDurationT } {
  return arg != null && typeof arg === 'object' && _wrapperSet.has(arg) && arg._inner instanceof NapiDuration;
}
export function _isTemporalPlainDate(arg: any): arg is { _inner: NapiPlainDateT; _calId?: string } {
  return arg != null && typeof arg === 'object' && _wrapperSet.has(arg) && arg._inner instanceof NapiPlainDate;
}
export function _isTemporalPlainTime(arg: any): arg is { _inner: NapiPlainTimeT } {
  return arg != null && typeof arg === 'object' && _wrapperSet.has(arg) && arg._inner instanceof NapiPlainTime;
}
export function _isTemporalPlainDateTime(arg: any): arg is { _inner: NapiPlainDateTimeT; _calId?: string } {
  return arg != null && typeof arg === 'object' && _wrapperSet.has(arg) && arg._inner instanceof NapiPlainDateTime;
}
export function _isTemporalZonedDateTime(arg: any): arg is { _inner: NapiZonedDateTimeT; _calId?: string } {
  return arg != null && typeof arg === 'object' && _wrapperSet.has(arg) && arg._inner instanceof NapiZonedDateTime;
}
export function _isTemporalInstant(arg: any): arg is { _inner: NapiInstantT } {
  return arg != null && typeof arg === 'object' && _wrapperSet.has(arg) && arg._inner instanceof NapiInstant;
}
export function _isTemporalPlainYearMonth(arg: any): arg is { _inner: NapiPlainYearMonthT; _calId?: string } {
  return arg != null && typeof arg === 'object' && _wrapperSet.has(arg) && arg._inner instanceof NapiPlainYearMonth;
}
export function _isTemporalPlainMonthDay(arg: any): arg is { _inner: NapiPlainMonthDayT; _calId?: string } {
  return arg != null && typeof arg === 'object' && _wrapperSet.has(arg) && arg._inner instanceof NapiPlainMonthDay;
}

// ─── Helper: round a value to a given increment with rounding mode ──

export function _roundToIncrement(value: number, increment: number, mode: string): number {
  if (increment === 0) throw new RangeError('roundingIncrement must not be zero');
  const quotient = value / increment;
  let rounded;
  switch (mode) {
    case 'ceil':
      rounded = Math.ceil(quotient);
      break;
    case 'floor':
      rounded = Math.floor(quotient);
      break;
    case 'trunc':
      rounded = Math.trunc(quotient);
      break;
    case 'expand':
      rounded = quotient >= 0 ? Math.ceil(quotient) : Math.floor(quotient);
      break;
    case 'halfExpand':
      rounded = quotient >= 0 ? Math.floor(quotient + 0.5) : Math.ceil(quotient - 0.5);
      break;
    case 'halfTrunc':
      rounded =
        quotient >= 0
          ? quotient % 1 > 0.5
            ? Math.ceil(quotient)
            : Math.floor(quotient)
          : quotient % 1 < -0.5
            ? Math.floor(quotient)
            : Math.ceil(quotient);
      break;
    case 'halfCeil':
      // Round ties toward +infinity
      rounded = Math.floor(quotient + 0.5);
      break;
    case 'halfFloor':
      // Round ties toward -infinity
      rounded = Math.ceil(quotient - 0.5);
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
    default:
      throw new RangeError(`Invalid rounding mode: ${mode}`);
  }
  return rounded * increment;
}

// ─── Helper: branding check for prototype methods ─────────────

export function requireBranding(thisObj: any, NapiClass: any, typeName: string): void {
  if (!thisObj || typeof thisObj !== 'object' || !(thisObj._inner instanceof NapiClass)) {
    throw new TypeError(`${typeName} expected`);
  }
}

// ─── Wrap functions (use late-bound _classes) ─────────────────

export function wrapDuration(napi: any): any {
  return napi ? new _classes['Duration'](napi) : napi;
}
export function wrapPlainDate(napi: any, calId?: string): any {
  if (!napi) return napi;
  const r = new _classes['PlainDate'](napi);
  if (calId) r._calId = calId;
  return r;
}
export function wrapPlainTime(napi: any): any {
  return napi ? new _classes['PlainTime'](napi) : napi;
}
export function wrapPlainDateTime(napi: any, calId?: string): any {
  if (!napi) return napi;
  const r = new _classes['PlainDateTime'](napi);
  if (calId) r._calId = calId;
  return r;
}
export function wrapZonedDateTime(napi: any, calId?: string): any {
  if (!napi) return napi;
  const r = new _classes['ZonedDateTime'](napi);
  if (calId) r._calId = calId;
  return r;
}
export function wrapInstant(napi: any): any {
  return napi ? new _classes['Instant'](napi) : napi;
}
export function wrapPlainYearMonth(napi: any, calId?: string): any {
  if (!napi) return napi;
  const r = new _classes['PlainYearMonth'](napi);
  if (calId) r._calId = calId;
  return r;
}
export function wrapPlainMonthDay(napi: any, calId?: string): any {
  if (!napi) return napi;
  const r = new _classes['PlainMonthDay'](napi);
  if (calId) r._calId = calId;
  return r;
}

// ─── Helper: get the real calendar ID for a wrapper object ────
// NAPI normalizes ethioaa to ethiopic, so we track the original calendar ID
export function getRealCalendarId(wrapper: any): string {
  return wrapper._calId || wrapper._inner.calendar.id;
}

// ─── Helper: resolve era/eraYear for ethioaa calendar ────
// For ethioaa, era is always "aa" and the NAPI already returns correct AA year values.
// For ethiopic, NAPI returns correct era names and eraYear values.
// Japanese era boundaries: [isoYearStart, isoYearEnd (exclusive), eraName, baseYear]
// The spec uses only reiwa/heisei/showa/taisho + ce/bce for japanese calendar output.
// Meiji and earlier are returned as "ce".
export function resolveEraForCalendar(
  calId: string,
  napiYear: number,
  napiEra: any,
  napiEraYear: any,
  isoMonth?: number,
  isoDay?: number,
): { era: any; eraYear: any } {
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
      { era: 'reiwa', start: [2019, 5, 1], base: 2019 },
      { era: 'heisei', start: [1989, 1, 8], base: 1989 },
      { era: 'showa', start: [1926, 12, 25], base: 1926 },
      { era: 'taisho', start: [1912, 7, 30], base: 1912 },
      { era: 'meiji', start: [1873, 1, 1], base: 1868 },
    ];
    const m = isoMonth || 1;
    const d = isoDay || 1;
    for (const { era, start, base } of ERAS) {
      const [sy, sm, sd] = start as [number, number, number];
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
export function addWithOverflow(
  inner: any,
  dur: NapiDurationT,
  overflow: string | undefined,
  op: string,
  wrapFn: (n: any) => any,
): any {
  if (overflow === 'Reject') {
    const hasYearMonth = dur.years !== 0 || dur.months !== 0;
    if (hasYearMonth) {
      // Per spec: add date portion (years/months/weeks) first, check intermediate result,
      // then add time portion. Create intermediate duration with only date components.
      const sign = op === 'subtract' ? -1 : 1;
      const dateOnlyDur = call(
        () => new NapiDuration(sign * dur.years, sign * dur.months, sign * dur.weeks, 0, 0, 0, 0, 0, 0, 0),
      );
      // Add date-only portion with Constrain
      const intermediate = call(() => inner.add(dateOnlyDur, 'Constrain' as any));
      // Check if the day was constrained by comparing inner.day to daysInMonth of intermediate
      if (inner.day > intermediate.daysInMonth) {
        throw new RangeError(`Day ${inner.day} out of range for resulting month with ${intermediate.daysInMonth} days`);
      }
      // Check if the monthCode was constrained
      const origMonthCode = inner.monthCode;
      const resultMonthCode = intermediate.monthCode;
      if (origMonthCode && origMonthCode.endsWith('L')) {
        if (resultMonthCode !== origMonthCode) {
          throw new RangeError(`Leap monthCode ${origMonthCode} does not exist in the resulting year`);
        }
      }
    }
    // Do the full operation with Constrain (since NAPI doesn't support Reject)
    const result = call(() => inner[op](dur, 'Constrain'));
    return wrapFn(result);
  }
  return wrapFn(call(() => inner[op](dur, overflow)));
}

// ─── Helper: validate options argument per spec ───────────────

export function validateOptions(options: any): any {
  if (options === undefined) return undefined;
  if (options === null || (typeof options !== 'object' && typeof options !== 'function')) {
    throw new TypeError('Options must be an object or undefined');
  }
  return options;
}

// Per spec GetOption: converts value to string, throwing TypeError for Symbol
export function toStringOption(val: any): string {
  if (typeof val === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
  return String(val);
}

// Per spec ToPrimitiveAndRequireString: used for monthCode and offset fields.
// 1. If already a string, return it.
// 2. If an object/function, call ToPrimitive(hint:string), then require string result.
// 3. For other types (number, boolean, null, bigint, symbol), throw TypeError.
export function toPrimitiveAndRequireString(val: any, name: string): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
  if (typeof val === 'bigint') throw new TypeError('Cannot convert a BigInt value to a string');
  if (val === null) throw new TypeError(`${name} must be a string, got null`);
  if (typeof val === 'object' || typeof val === 'function') {
    // ToPrimitive with string hint per spec:
    // 1. Check @@toPrimitive
    const toPrim = val[Symbol.toPrimitive];
    if (toPrim !== undefined && toPrim !== null) {
      const prim = toPrim.call(val, 'string');
      if (typeof prim !== 'string') throw new TypeError(`${name} must be a string`);
      return prim;
    }
    // 2. OrdinaryToPrimitive with hint "string": try toString, then valueOf
    const toStr = val.toString;
    if (typeof toStr === 'function') {
      const prim = toStr.call(val);
      if (typeof prim !== 'object' && typeof prim !== 'function') {
        if (typeof prim !== 'string') throw new TypeError(`${name} must be a string`);
        return prim;
      }
    }
    const valOf = val.valueOf;
    if (typeof valOf === 'function') {
      const prim = valOf.call(val);
      if (typeof prim !== 'object' && typeof prim !== 'function') {
        if (typeof prim !== 'string') throw new TypeError(`${name} must be a string`);
        return prim;
      }
    }
    throw new TypeError(`Cannot convert ${name} to a primitive value`);
  }
  // number, boolean — ToPrimitive is identity, result is not string → TypeError
  throw new TypeError(`${name} must be a string`);
}

// Validate UTC offset string per spec: +/-HH:MM or +/-HH:MM:SS or +/-HH:MM:SS.fffffffff
export function isValidOffsetString(str: any): boolean {
  if (typeof str !== 'string') return false;
  return /^[+-]\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?$/.test(str);
}

// Parse offset string to total nanoseconds (for sub-minute offset comparison)
export function parseOffsetStringToNs(str: string): any {
  const m = str.match(/^([+-])(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?$/);
  if (!m) return undefined;
  const sign = m[1] === '+' ? 1n : -1n;
  const h = BigInt(m[2]!);
  const min = BigInt(m[3]!);
  const sec = m[4] ? BigInt(m[4]) : 0n;
  let frac = 0n;
  if (m[5]) {
    const fracStr = (m[5] + '000000000').substring(0, 9);
    frac = BigInt(fracStr);
  }
  return sign * (h * 3600000000000n + min * 60000000000n + sec * 1000000000n + frac);
}

// Normalize a fixed-offset timezone ID to colon-separated form for parsing
function _normalizeOffsetTz(tzId: string): string {
  if (tzId.includes(':')) return tzId;
  const sign = tzId.substring(0, 1);
  const rest = tzId.substring(1);
  if (rest.length <= 2) return sign + rest + ':00';
  if (rest.length <= 4) return sign + rest.substring(0, 2) + ':' + rest.substring(2);
  // +HHMMSS or +HHMMSS.fffffffff
  return sign + rest.substring(0, 2) + ':' + rest.substring(2, 4) + ':' + rest.substring(4);
}

// Parse a fixed-offset timezone ID (e.g. "+05:30", "+05:30:00") to milliseconds
export function parseOffsetTzToMs(tzId: string): number {
  const ns = parseOffsetStringToNs(_normalizeOffsetTz(tzId));
  if (ns === undefined) throw new RangeError(`Invalid offset timezone: ${tzId}`);
  return Number(ns / 1000000n);
}

// Parse a fixed-offset timezone ID to BigInt nanoseconds
export function parseOffsetTzToNs(tzId: string): bigint {
  const ns = parseOffsetStringToNs(_normalizeOffsetTz(tzId));
  if (ns === undefined) throw new RangeError(`Invalid offset timezone: ${tzId}`);
  return ns;
}

// Get the actual UTC offset in nanoseconds for a timezone at a given epoch ms
export function _getOffsetNsAtEpoch(epochMs: number, tzId: string): bigint {
  if (tzId === 'UTC') return 0n;
  if (OFFSET_TZ_WITH_FRAC_RE.test(tzId)) {
    return parseOffsetTzToNs(tzId);
  }
  const offsetStr = getUtcOffsetString(epochMs, tzId);
  return parseOffsetStringToNs(offsetStr) || 0n;
}

// Validate monthCode syntax only (not calendar-specific validity)
// Checks that the format is M01-M99 or M01L-M99L (L suffix for leap months)
// Returns the parsed month number and isLeap flag for callers that need them.
export function validateMonthCodeSyntax(monthCode: string): { monthNum: number; isLeap: boolean } {
  if (!monthCode) throw new RangeError('Invalid monthCode: empty string');
  const m = monthCode.match(/^M(\d{2})(L?)$/);
  if (!m) throw new RangeError(`Invalid monthCode: ${monthCode}`);
  const monthNum = parseInt(m[1]!, 10);
  const isLeap = m[2] === 'L';
  if (monthNum < 1) throw new RangeError(`Invalid monthCode: ${monthCode}`);
  return { monthNum, isLeap };
}

// ─── Helper: extract overflow from options ────────────────────

export function extractOverflow(options: any): any {
  if (options === undefined) return undefined;
  validateOptions(options);
  return mapOverflow(options.overflow);
}

// ─── Helper: reject Infinity values per spec ─────────────────

export function rejectInfinity(value: any, name: string): void {
  if (value === Infinity || value === -Infinity) {
    throw new RangeError(`${name} property cannot be Infinity`);
  }
}

// ISO date range validation for constructors (always reject mode)
export function rejectISODateRange(year: number, month: number, day: number): void {
  if (month < 1 || month > 12) throw new RangeError(`Invalid month: ${month}`);
  if (day < 1) throw new RangeError(`Invalid day: ${day}`);
  const maxDay = _isoDaysInMonth(year, month);
  if (day > maxDay) throw new RangeError(`Invalid day ${day} for month ${month}`);
}

// Uses arguments internally to avoid Array.prototype[Symbol.iterator]
// which test262 tests monkey-patch to throw.
export function rejectPropertyBagInfinity(
  bag: any,
  ..._fields: string[] // declared for type checking, accessed via arguments
): void {
  /* eslint-disable prefer-rest-params */
  for (let i = 1; i < arguments.length; i++) {
    const f = (arguments as unknown as string[])[i]!;
    /* eslint-enable prefer-rest-params */
    if (bag[f] !== undefined) rejectInfinity(bag[f], f);
  }
}

// ─── Helper: coerce property bag values to numbers ────────────

export function toInteger(val: any): any {
  if (val === undefined) return undefined;
  if (typeof val === 'bigint') throw new TypeError('Cannot convert a BigInt value to a number');
  if (typeof val === 'symbol') throw new TypeError('Cannot convert a Symbol value to a number');
  const n = +val;
  if (n !== n) throw new RangeError('NaN is not a valid integer'); // reject NaN
  if (!_isFinite(n)) throw new RangeError(`${n} is not a finite number`);
  return _trunc(n);
}

// ToIntegerIfIntegral per spec: rejects BigInt, Symbol, and non-integral numbers
// NOTE: Use cached intrinsics to avoid test262 monkey-patching detection
export const _isFinite = Number.isFinite;
export const _trunc = Math.trunc;
export function toIntegerIfIntegral(val: any): any {
  if (val === undefined) return undefined;
  if (typeof val === 'bigint') throw new TypeError('Cannot convert a BigInt value to a number');
  if (typeof val === 'symbol') throw new TypeError('Cannot convert a Symbol value to a number');
  const n = +val; // ToNumber abstract operation
  if (!_isFinite(n)) throw new RangeError(`${n} is not a finite number`);
  if (n !== _trunc(n)) throw new RangeError(`${n} is not an integer`);
  return n;
}

// ToIntegerWithTruncation per spec: converts to number and truncates
export function toIntegerWithTruncation(val: any): any {
  if (val === undefined) return undefined;
  if (typeof val === 'bigint') throw new TypeError('Cannot convert a BigInt value to a number');
  if (typeof val === 'symbol') throw new TypeError('Cannot convert a Symbol value to a number');
  const n = +val;
  if (n !== n) throw new RangeError('NaN is not a valid integer');
  if (!_isFinite(n)) throw new RangeError(`${n} is not a finite number`);
  return _trunc(n);
}

// ─── Helper: validate fields for with() methods ──────────────

export function validateWithFields(fields: any, recognizedFields: string[] | null, typeName: string): void {
  if (typeof fields !== 'object' || fields === null) {
    throw new TypeError('Invalid fields argument');
  }
  // Per spec, RejectObjectWithCalendarOrTimeZone: reject Temporal objects
  // Use _isTemporalX helpers to avoid triggering Proxy traps
  if (
    _isTemporalPlainDate(fields) ||
    _isTemporalPlainDateTime(fields) ||
    _isTemporalPlainMonthDay(fields) ||
    _isTemporalPlainYearMonth(fields) ||
    _isTemporalPlainTime(fields) ||
    _isTemporalZonedDateTime(fields)
  ) {
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

export function rejectTooManyFractionalSeconds(str: any): void {
  if (typeof str !== 'string') return;
  // Check for fractional seconds with more than 9 digits in time portion
  // Match patterns like :SS.dddddddddd or :SS,dddddddddd (separated)
  // and HHMMSS.dddddddddd (unseparated)
  if (/:\d{2}[.,]\d{10,}/.test(str) || /T?\d{6}[.,]\d{10,}/.test(str)) {
    throw new RangeError('no more than 9 decimal places are allowed');
  }
}

// ─── Helper: validate property bag ranges for overflow: reject ─

export function validateOverflowReject(bag: any, overflow: string | undefined, cal: any): void {
  if (overflow === 'Reject') {
    const month =
      bag.month !== undefined ? bag.month : bag.monthCode !== undefined ? monthCodeToMonth(bag.monthCode) : undefined;
    if (month !== undefined && (month < 1 || month > 13)) {
      throw new RangeError('month out of range');
    }
    if (bag.day !== undefined && (bag.day < 1 || bag.day > 31)) {
      throw new RangeError('day out of range');
    }
    const calId = cal ? cal.id || 'iso8601' : 'iso8601';
    if (calId === 'iso8601' && bag.year !== undefined && month !== undefined && bag.day !== undefined) {
      // For ISO calendar, verify date is actually valid
      try {
        const pd = new NapiPlainDate(bag.year, month, bag.day, cal);
        if (pd.day !== bag.day || pd.month !== month) {
          throw new RangeError(`date component out of range: ${bag.year}-${month}-${bag.day}`);
        }
      } catch (e: any) {
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

export function formatFractionalSeconds(str: string, precision: number): string {
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

export function formatDurationString(dur: any, precision: any): string {
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

  // Build the seconds + fractional part (use BigInt to avoid precision loss for large values)
  const totalNs = Number(BigInt(milliseconds) * 1000000n + BigInt(microseconds) * 1000n + BigInt(nanoseconds));
  const hasFrac = totalNs > 0;

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
    return 'PT0S'; // Zero duration has no sign per spec
  }
  if (timePart) {
    return `${sign}P${datePart}T${timePart}`;
  }
  return `${sign}P${datePart}`;
}

// ─── Helper: round duration sub-second components manually ────

export function roundDurationSubSeconds(dur: any, precision: number, roundingMode: string): any {
  // Get total nanoseconds in sub-second portion
  const ms = Math.abs(dur.milliseconds);
  const us = Math.abs(dur.microseconds);
  const ns = Math.abs(dur.nanoseconds);
  let totalNs = Number(BigInt(ms) * 1000000n + BigInt(us) * 1000n + BigInt(ns));
  const sign = dur.sign;

  // Compute the rounding increment in nanoseconds
  const INCREMENTS: number[] = [1000000000, 100000000, 10000000, 1000000, 100000, 10000, 1000, 100, 10];
  if (precision < 0 || precision >= INCREMENTS.length) return dur;
  const increment = INCREMENTS[precision]!;

  // Apply rounding
  const remainder = totalNs % increment;
  if (remainder === 0) {
    return dur; // no rounding needed
  }

  const RM: Record<string, () => number> = {
    Trunc: () => totalNs - remainder,
    Floor: () => (sign < 0 ? totalNs - remainder + increment : totalNs - remainder),
    Ceil: () => (sign < 0 ? totalNs - remainder : totalNs - remainder + increment),
    Expand: () => totalNs - remainder + increment,
    HalfExpand: () => (remainder * 2 >= increment ? totalNs - remainder + increment : totalNs - remainder),
    HalfTrunc: () => (remainder * 2 > increment ? totalNs - remainder + increment : totalNs - remainder),
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
      return Math.trunc(lower / increment) % 2 === 0 ? lower : upper;
    },
  };

  totalNs = (RM[roundingMode] || RM['Trunc'])!();
  // Handle carry into seconds
  const extraSeconds = Math.floor(totalNs / 1000000000);
  totalNs = totalNs % 1000000000;

  // Build result with adjusted sub-second components
  const newMs = Math.floor(totalNs / 1000000);
  const newUs = Math.floor((totalNs % 1000000) / 1000);
  const newNs = totalNs % 1000;
  // Per spec: carry rounding overflow up to days, but only into units that are already present.
  // E.g., PT59.9S rounded to PT60S stays (minutes not present), but PT1M59.9S → PT2M0S.
  let newSec = Math.abs(dur.seconds) + extraSeconds;
  let min = Math.abs(dur.minutes);
  let h = Math.abs(dur.hours);
  let d = Math.abs(dur.days);
  if (newSec >= 60 && (min || h || d)) {
    min += Math.floor(newSec / 60);
    newSec = newSec % 60;
  }
  if (min >= 60 && (h || d)) {
    h += Math.floor(min / 60);
    min = min % 60;
  }
  if (h >= 24 && d) {
    d += Math.floor(h / 24);
    h = h % 24;
  }

  // Create new duration string and parse
  const s = sign < 0 ? '-' : '';
  const y = Math.abs(dur.years);
  const mo = Math.abs(dur.months);
  const w = Math.abs(dur.weeks);
  let datePart = '';
  if (y) datePart += `${y}Y`;
  if (mo) datePart += `${mo}M`;
  if (w) datePart += `${w}W`;
  if (d) datePart += `${d}D`;
  let timePart = '';
  if (h) timePart += `${h}H`;
  if (min) timePart += `${min}M`;
  const fracNs = newMs * 1000000 + newUs * 1000 + newNs;
  if (newSec || fracNs || !datePart) {
    if (fracNs) {
      const fracStr = String(fracNs).padStart(9, '0').replace(/0+$/, '');
      timePart += `${newSec}.${fracStr}S`;
    } else {
      timePart += `${newSec}S`;
    }
  }
  const isoStr = s + 'P' + datePart + (timePart ? 'T' + timePart : '');
  try {
    return new _classes['Duration'](call(() => NapiDuration.from(isoStr)));
  } catch (e: any) {
    // Only fall back for NAPI ISO string parse errors; rethrow genuine validation errors
    const msg = e && e.message ? e.message : '';
    if (
      e instanceof RangeError &&
      (msg.includes('parse') || msg.includes('Parse') || msg.includes('invalid') || msg.includes('Invalid'))
    )
      return dur;
    throw e;
  }
}

// ─── Helper: BigInt epoch nanoseconds to ISO 8601 UTC string ──

export function bigintNsToISOString(epochNs: bigint): string {
  const NS_PER_SEC = 1000000000n;
  // Floor division towards -Infinity for seconds
  let epochSec = epochNs / NS_PER_SEC;
  let subSecNs = epochNs % NS_PER_SEC;
  if (subSecNs < 0n) {
    subSecNs += NS_PER_SEC;
    epochSec -= 1n;
  }
  // Convert epoch seconds to days + time-of-day
  const SEC_PER_DAY = 86400n;
  let epochDays = epochSec / SEC_PER_DAY;
  let daySeconds = epochSec % SEC_PER_DAY;
  if (daySeconds < 0n) {
    daySeconds += SEC_PER_DAY;
    epochDays -= 1n;
  }
  const secNum = Number(daySeconds);
  const hour = Math.floor(secNum / 3600);
  const minute = Math.floor((secNum % 3600) / 60);
  const second = secNum % 60;
  // Use pure-arithmetic algorithm for date (handles extreme years)
  const iso = epochDaysToISO(Number(epochDays));
  const year = iso.year;
  let yearStr;
  if (year < 0 || year >= 10000) {
    const s = String(Math.abs(year)).padStart(6, '0');
    yearStr = (year < 0 ? '-' : '+') + s;
  } else {
    yearStr = String(year).padStart(4, '0');
  }
  const milli = String(Number(subSecNs / 1000000n)).padStart(3, '0');
  const micro = String(Number((subSecNs / 1000n) % 1000n)).padStart(3, '0');
  const nano = String(Number(subSecNs % 1000n)).padStart(3, '0');
  let frac = milli + micro + nano;
  frac = frac.replace(/0+$/, '');
  const fracPart = frac ? '.' + frac : '';
  return (
    yearStr +
    '-' +
    String(iso.month).padStart(2, '0') +
    '-' +
    String(iso.day).padStart(2, '0') +
    'T' +
    String(hour).padStart(2, '0') +
    ':' +
    String(minute).padStart(2, '0') +
    ':' +
    String(second).padStart(2, '0') +
    fracPart +
    'Z'
  );
}

// ─── Helper: compute epoch nanoseconds BigInt from NAPI inner ──

export function computeEpochNanoseconds(inner: NapiInstantT | NapiZonedDateTimeT): bigint {
  // The NAPI epochNanoseconds getter now returns BigInt (i128) directly,
  // preserving full nanosecond precision without string-parsing workarounds.
  return inner.epochNanoseconds;
}

// Howard Hinnant's days_from_civil algorithm for extreme values
// Reference: https://howardhinnant.github.io/date_algorithms.html#days_from_civil
export function isoDateToEpochDays(year: number, month: number, day: number): number {
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
export function epochDaysToISO(epochDays: number): { year: number; month: number; day: number } {
  // For values within JS Date range, use Date for speed
  if (epochDays > -100000000 && epochDays < 100000000) {
    const ms = epochDays * 86400000;
    const d = new Date(ms);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }
  // Pure arithmetic for extreme values (Howard Hinnant's civil_from_days algorithm)
  // Reference: https://howardhinnant.github.io/date_algorithms.html#civil_from_days
  const z = epochDays + 719468; // days from year 0 (March 1 epoch)
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

// Helper: get daysInMonth for a given calendar (year, month)
// Returns daysInMonth, or undefined if the month cannot be found.
export function _isoDaysInMonth(year: number, month: number): number {
  const isLeap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const result = daysInMonth[month - 1];
  if (result === undefined) throw new RangeError(`Invalid month: ${month}`);
  return result;
}

// Mapping from fractional-second digit count to rounding unit and increment
export const DIGIT_ROUND: ReadonlyArray<{ unit: string; increment: number }> = [
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

// Valid smallestUnit values for Duration.toString()
export const DURATION_TOSTRING_UNITS: Record<string, string> = {
  second: 'second',
  seconds: 'second',
  millisecond: 'millisecond',
  milliseconds: 'millisecond',
  microsecond: 'microsecond',
  microseconds: 'microsecond',
  nanosecond: 'nanosecond',
  nanoseconds: 'nanosecond',
};

// ─── Helper: coerce roundingIncrement per spec ────────────────

export function coerceRoundingIncrement(value: any): number {
  if (typeof value === 'bigint') throw new TypeError('Cannot convert a BigInt to a Number');
  if (typeof value === 'symbol') throw new TypeError('Cannot convert a Symbol to a Number');
  const n = Number(value);
  if (n !== n || n < 1 || n === Infinity || n === -Infinity) {
    throw new RangeError('roundingIncrement must be a positive finite number');
  }
  return Math.floor(n);
}

// ─── Helper: resolve fractionalSecondDigits per spec ──────────

export function resolveFractionalSecondDigits(fsd: any): any {
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

// ─── Forward-declared imports (resolved at runtime to break circular deps) ───
// These are imported lazily to avoid circular dependency issues.

let _getUtcOffsetString: ((epochMs: number, tzId: string) => string) | undefined;
let _calendarDaysInMonth: ((calYear: number, calMonth: any, calId: string) => any) | undefined;
let _monthCodeToMonth: ((monthCode: any, calendarId?: string, targetYear?: number) => any) | undefined;

// Lazy require() to break circular module dependency.
// These modules import from helpers.ts, so a static ESM import here would create a cycle
// that fails at module initialization time. Using require() defers the resolution.
function getUtcOffsetString(epochMs: number, tzId: string): string {
  if (!_getUtcOffsetString) {
    _getUtcOffsetString = require('./timezone').getUtcOffsetString;
  }
  return _getUtcOffsetString!(epochMs, tzId);
}

// Lazy require() to break circular module dependency.
// These modules import from helpers.ts, so a static ESM import here would create a cycle
// that fails at module initialization time. Using require() defers the resolution.
function calendarDaysInMonth(calYear: number, calMonth: any, calId: string): any {
  if (!_calendarDaysInMonth) {
    _calendarDaysInMonth = require('./calendar').calendarDaysInMonth;
  }
  return _calendarDaysInMonth!(calYear, calMonth, calId);
}

// Lazy require() to break circular module dependency.
// These modules import from helpers.ts, so a static ESM import here would create a cycle
// that fails at module initialization time. Using require() defers the resolution.
export function monthCodeToMonth(monthCode: any, calendarId?: string, targetYear?: number): any {
  if (!_monthCodeToMonth) {
    _monthCodeToMonth = require('./calendar').monthCodeToMonth;
  }
  return _monthCodeToMonth!(monthCode, calendarId, targetYear);
}
