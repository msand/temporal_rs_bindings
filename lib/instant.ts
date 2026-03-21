import { NapiInstant, type NapiInstantT, NapiZonedDateTime } from './binding';
import {
  call,
  _wrapperSet,
  _isTemporalInstant,
  _isTemporalZonedDateTime,
  bigintNsToISOString,
  computeEpochNanoseconds,
  requireBranding,
  validateOptions,
  wrapInstant,
  wrapDuration,
  _classes,
  formatFractionalSeconds,
  _roundToIncrement,
  wrapError,
  _isFinite,
  _trunc,
  wrapZonedDateTime,
  resolveFractionalSecondDigits,
  toStringOption,
  DIGIT_ROUND,
} from './helpers';
import { _temporalToEpochMs, _hasDateTimeOptions, _origFormatGetter } from './intl';
import { mapUnit, mapRoundingMode } from './enums';
import {
  toNapiInstant,
  convertDifferenceSettings,
  convertRoundingOptions,
  _parseDurationForInstant,
  toNapiTimeZone,
} from './convert';
import { bigintNsToZdtString } from './timezone';

// ═══════════════════════════════════════════════════════════════
//  Instant
// ═══════════════════════════════════════════════════════════════

class Instant {
  _inner!: NapiInstantT;
  _epochNs?: bigint;
  constructor(epochNanoseconds: any) {
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

  static from(arg: any) {
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
    if (_isTemporalZonedDateTime(arg) || (arg && arg._inner instanceof NapiZonedDateTime)) {
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

  static fromEpochMilliseconds(ms: any) {
    if (typeof ms === 'bigint') throw new TypeError('Cannot convert a BigInt value to a number');
    if (typeof ms === 'symbol') throw new TypeError('Cannot convert a Symbol value to a number');
    const n = Number(ms);
    if (!_isFinite(n) || n !== _trunc(n)) {
      throw new RangeError('fromEpochMilliseconds requires an integer number');
    }
    return new Instant(call(() => NapiInstant.fromEpochMilliseconds(n)));
  }

  static fromEpochNanoseconds(ns: any) {
    if (typeof ns !== 'bigint') throw new TypeError('fromEpochNanoseconds requires a BigInt');
    return new Instant(ns);
  }

  static compare(one: any, two: any): number {
    const a = toNapiInstant(one);
    const b = toNapiInstant(two);
    return NapiInstant.compare(a, b);
  }

  get epochMilliseconds() {
    return this._inner.epochMilliseconds;
  }
  get epochNanoseconds() {
    if (this._epochNs !== undefined) return this._epochNs;
    return computeEpochNanoseconds(this._inner);
  }

  add(durationArg: any): any {
    // Parse duration and compute total nanoseconds using BigInt for precision
    const { totalNs } = _parseDurationForInstant(durationArg);
    const currentNs = this.epochNanoseconds;
    const resultNs = currentNs + totalNs;
    return new Instant(resultNs);
  }

  subtract(durationArg: any): any {
    // Parse duration and compute total nanoseconds using BigInt for precision
    const { totalNs } = _parseDurationForInstant(durationArg);
    const currentNs = this.epochNanoseconds;
    const resultNs = currentNs - totalNs;
    return new Instant(resultNs);
  }

  until(other: any, options?: any): any {
    const otherInner = toNapiInstant(other);
    const settings = convertDifferenceSettings(options);
    return wrapDuration(call(() => this._inner.until(otherInner, settings)));
  }

  since(other: any, options?: any): any {
    const otherInner = toNapiInstant(other);
    const settings = convertDifferenceSettings(options);
    return wrapDuration(call(() => this._inner.since(otherInner, settings)));
  }

  round(options: any): any {
    if (options === undefined) throw new TypeError('options parameter is required');
    const opts = convertRoundingOptions(options, { includeLargestUnit: false });
    return wrapInstant(call(() => this._inner.round(opts)));
  }

  equals(other: any): boolean {
    const otherInner = toNapiInstant(other);
    return this._inner.equals(otherInner);
  }

  toZonedDateTimeISO(timeZone: any): any {
    requireBranding(this, NapiInstant, 'Temporal.Instant');
    if (timeZone === undefined) throw new TypeError('timeZone argument is required');
    const tz = toNapiTimeZone(timeZone);
    const tzId = tz ? tz.id : 'UTC';
    // Use string-based construction via bigintNsToZdtString to preserve precision
    const epochNs = this.epochNanoseconds;
    const zdtStr = bigintNsToZdtString(epochNs, tzId, 'iso8601');
    return wrapZonedDateTime(call(() => NapiZonedDateTime.from(zdtStr)));
  }

  toString(options?: any): string {
    if (options !== undefined) validateOptions(options);
    if (options === undefined) {
      return call(() => this._inner.toString());
    }
    // Per spec, read options in alphabetical order, each exactly once:
    // fractionalSecondDigits, roundingMode, smallestUnit, timeZone
    // Read ALL options first, then validate
    const _fsdRaw = options.fractionalSecondDigits;
    const fsd = resolveFractionalSecondDigits(_fsdRaw);
    const _rmRaw = options.roundingMode;
    const roundingMode = _rmRaw !== undefined ? mapRoundingMode(_rmRaw) : 'Trunc';
    const _suRaw = options.smallestUnit;
    let suStr;
    if (_suRaw !== undefined) {
      suStr = toStringOption(_suRaw);
    }
    const tzOpt = options.timeZone;

    // Now validate smallestUnit after all reads
    let smallestUnit;
    if (suStr !== undefined) {
      const UNIT_ALIAS = {
        minutes: 'minute',
        seconds: 'second',
        milliseconds: 'millisecond',
        microseconds: 'microsecond',
        nanoseconds: 'nanosecond',
      };
      const canonical = (UNIT_ALIAS as any)[suStr] || suStr;
      const INSTANT_TOSTRING_UNITS = new Set<string>(['minute', 'second', 'millisecond', 'microsecond', 'nanosecond']);
      if (!INSTANT_TOSTRING_UNITS.has(canonical)) {
        throw new RangeError(`Invalid smallestUnit for Instant.toString: ${suStr}`);
      }
      smallestUnit = canonical;
    }

    // Determine precision: smallestUnit overrides fractionalSecondDigits
    let precision: any = 'auto'; // default
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
      inner = call(() => this._inner.round(roundOpts as any));
    } else if (typeof precision === 'number' && precision < 9) {
      // Round to the given number of fractional second digits
      const { unit, increment } = DIGIT_ROUND[precision]!;
      const roundOpts = { smallestUnit: unit, roundingMode, roundingIncrement: increment };
      inner = call(() => this._inner.round(roundOpts as any));
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
        str = (parts[0] ?? '') + ':' + (parts[1] ?? '') + suffix;
      }
    } else if (typeof precision === 'number') {
      str = formatFractionalSeconds(str, precision);
    }
    // 'auto' precision: use the default string as-is
    return str;
  }

  toJSON() {
    requireBranding(this, NapiInstant, 'Temporal.Instant');
    return this.toString();
  }
  toLocaleString(locales?: any, options?: any): string {
    requireBranding(this, NapiInstant, 'Temporal.Instant');
    const ms = _temporalToEpochMs(this);
    if (ms !== undefined) {
      // Per spec: if no date/time component options and no dateStyle/timeStyle,
      // add defaults for Instant: date + time (but NOT timeZoneName)
      let opts: any;
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
      return _origFormatGetter!.call(dtf)(ms);
    }
    return this.toString();
  }

  valueOf() {
    throw new TypeError('Use Temporal.Instant.compare() to compare Temporal.Instant');
  }

  // Symbol.toStringTag defined as data property below

  static [Symbol.hasInstance](v: any): boolean {
    return v !== null && v !== undefined && typeof v === 'object' && '_inner' in v && v._inner instanceof NapiInstant;
  }
}

export { Instant };

_classes.Instant = Instant;
