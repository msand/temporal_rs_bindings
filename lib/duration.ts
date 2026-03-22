import { NapiDuration, type NapiDurationT } from './binding';
import {
  call,
  _wrapperSet,
  _isTemporalDuration,
  toIntegerIfIntegral,
  wrapDuration,
  requireBranding,
  validateOptions,
  _classes,
  DIGIT_ROUND,
  DURATION_TOSTRING_UNITS,
  formatDurationString,
  roundDurationSubSeconds,
  resolveFractionalSecondDigits,
  coerceRoundingIncrement,
  _roundToIncrement,
  toStringOption,
  wrapError,
} from './helpers';
import { mapUnit, mapRoundingMode } from './enums';
import { toNapiDuration, extractRelativeTo, _parseDurationForInstant } from './convert';

// ═══════════════════════════════════════════════════════════════
//  Duration
// ═══════════════════════════════════════════════════════════════

const DURATION_FIELDS_CHECK = [
  'years',
  'months',
  'weeks',
  'days',
  'hours',
  'minutes',
  'seconds',
  'milliseconds',
  'microseconds',
  'nanoseconds',
];

class Duration {
  _inner!: NapiDurationT;
  constructor(
    years?: any,
    months?: any,
    weeks?: any,
    days?: any,
    hours?: any,
    minutes?: any,
    seconds?: any,
    milliseconds?: any,
    microseconds?: any,
    nanoseconds?: any,
  ) {
    if (years instanceof NapiDuration) {
      this._inner = years;
    } else if (years === undefined || (years === null && months === undefined)) {
      this._inner = call(() => new NapiDuration());
    } else {
      // Constructor signature: new Duration(years, months, weeks, days, hours, minutes, seconds, ms, us, ns)
      const y = toIntegerIfIntegral(years);
      const mo = toIntegerIfIntegral(months);
      const w = toIntegerIfIntegral(weeks);
      const d = toIntegerIfIntegral(days);
      const h = toIntegerIfIntegral(hours);
      const min = toIntegerIfIntegral(minutes);
      const s = toIntegerIfIntegral(seconds);
      const ms = toIntegerIfIntegral(milliseconds);
      const us = toIntegerIfIntegral(microseconds);
      const ns = toIntegerIfIntegral(nanoseconds);
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

  static from(arg: any): Duration {
    if (_isTemporalDuration(arg)) return new Duration(arg._inner);
    if (arg instanceof NapiDuration) return new Duration(arg);
    if (typeof arg === 'string') return new Duration(call(() => NapiDuration.from(arg)));
    if (typeof arg === 'object' && arg !== null) {
      return new Duration(toNapiDuration(arg));
    }
    throw new TypeError('Invalid duration argument');
  }

  static compare(one: any, two: any, options?: any): number {
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
    } catch (e: any) {
      throw wrapError(e);
    }
  }

  get years() {
    requireBranding(this, NapiDuration, 'Temporal.Duration');
    return this._inner.years;
  }
  get months() {
    requireBranding(this, NapiDuration, 'Temporal.Duration');
    return this._inner.months;
  }
  get weeks() {
    requireBranding(this, NapiDuration, 'Temporal.Duration');
    return this._inner.weeks;
  }
  get days() {
    requireBranding(this, NapiDuration, 'Temporal.Duration');
    return this._inner.days;
  }
  get hours() {
    requireBranding(this, NapiDuration, 'Temporal.Duration');
    return this._inner.hours;
  }
  get minutes() {
    requireBranding(this, NapiDuration, 'Temporal.Duration');
    return this._inner.minutes;
  }
  get seconds() {
    requireBranding(this, NapiDuration, 'Temporal.Duration');
    return this._inner.seconds;
  }
  get milliseconds() {
    requireBranding(this, NapiDuration, 'Temporal.Duration');
    return this._inner.milliseconds;
  }
  get microseconds() {
    requireBranding(this, NapiDuration, 'Temporal.Duration');
    return this._inner.microseconds;
  }
  get nanoseconds() {
    requireBranding(this, NapiDuration, 'Temporal.Duration');
    return this._inner.nanoseconds;
  }
  get sign() {
    requireBranding(this, NapiDuration, 'Temporal.Duration');
    return this._inner.sign;
  }
  get blank() {
    requireBranding(this, NapiDuration, 'Temporal.Duration');
    return this._inner.isZero;
  }

  negated() {
    requireBranding(this, NapiDuration, 'Temporal.Duration');
    return wrapDuration(this._inner.negated());
  }
  abs() {
    requireBranding(this, NapiDuration, 'Temporal.Duration');
    return wrapDuration(this._inner.abs());
  }

  add(other: any, options?: any): Duration {
    requireBranding(this, NapiDuration, 'Temporal.Duration');
    const dur = toNapiDuration(other);
    if (options !== undefined) {
      validateOptions(options);
      // Per spec: read relativeTo to trigger observable property accesses
      const _rtRaw = options.relativeTo;
      extractRelativeTo(_rtRaw);
    }
    return wrapDuration(call(() => this._inner.add(dur)));
  }

  subtract(other: any, options?: any): Duration {
    requireBranding(this, NapiDuration, 'Temporal.Duration');
    const dur = toNapiDuration(other);
    if (options !== undefined) {
      validateOptions(options);
      // Per spec: read relativeTo to trigger observable property accesses
      const _rtRaw = options.relativeTo;
      extractRelativeTo(_rtRaw);
    }
    return wrapDuration(call(() => this._inner.subtract(dur)));
  }

  with(temporalDurationLike: any): Duration {
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
      throw new TypeError('At least one recognized duration property must be provided');
    }
    return new Duration(
      call(
        () =>
          new NapiDuration(
            years,
            months,
            weeks,
            days,
            hours,
            minutes,
            seconds,
            milliseconds,
            microseconds,
            nanoseconds,
          ),
      ),
    );
  }

  round(options: any): Duration {
    requireBranding(this, NapiDuration, 'Temporal.Duration');
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
      const _timeFields = [
        this.hours,
        this.minutes,
        this.seconds,
        this.milliseconds,
        this.microseconds,
        this.nanoseconds,
      ];
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
      const NAPI_CALENDAR_UNITS_MAP: Record<string, string> = {
        Day: 'days',
        Week: 'weeks',
        Month: 'months',
        Year: 'years',
      };
      if (_napiIncrement > 1 && _napiSmallestUnit && NAPI_CALENDAR_UNITS_MAP[_napiSmallestUnit]) {
        const fieldName = NAPI_CALENDAR_UNITS_MAP[_napiSmallestUnit];
        const napiVal = (result as any)[fieldName];
        // Re-round with increment=1 and compute expected result
        const napiOpts1 = Object.assign({}, napiOptions);
        napiOpts1.roundingIncrement = 1;
        const inner1 = this._inner.round(napiOpts1, relativeToDate, relativeToZdt);
        const dur1 = new Duration(inner1);
        const val = (dur1 as any)[fieldName];
        // Map NAPI rounding mode back to JS mode name for _roundToIncrement
        const MODE_MAP_REVERSE: Record<string, string> = {
          Ceil: 'ceil',
          Floor: 'floor',
          Expand: 'expand',
          Trunc: 'trunc',
          HalfCeil: 'halfCeil',
          HalfFloor: 'halfFloor',
          HalfExpand: 'halfExpand',
          HalfTrunc: 'halfTrunc',
          HalfEven: 'halfEven',
        };
        const mode = MODE_MAP_REVERSE[_napiRoundingMode] || 'halfExpand';
        const expected = _roundToIncrement(val, _napiIncrement, mode);
        // If NAPI gave a different result, use our computed one
        if (napiVal !== expected) {
          const resultFields = {
            years: 0,
            months: 0,
            weeks: 0,
            days: 0,
            hours: 0,
            minutes: 0,
            seconds: 0,
            milliseconds: 0,
            microseconds: 0,
            nanoseconds: 0,
          };
          if (_napiSmallestUnit === 'Day') {
            resultFields.years = dur1.years;
            resultFields.months = dur1.months;
            resultFields.weeks = dur1.weeks;
          }
          if (_napiSmallestUnit === 'Week') {
            resultFields.years = dur1.years;
            resultFields.months = dur1.months;
          }
          if (_napiSmallestUnit === 'Month') {
            resultFields.years = dur1.years;
          }
          (resultFields as any)[fieldName] = expected;
          return Duration.from(resultFields);
        }
      }
      return result;
    } catch (e: any) {
      throw wrapError(e);
    }
  }

  total(options: any): number {
    requireBranding(this, NapiDuration, 'Temporal.Duration');
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
    } catch (e: any) {
      throw wrapError(e);
    }
  }

  toString(options?: any): string {
    requireBranding(this, NapiDuration, 'Temporal.Duration');
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
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let dur = this;
    if (precision !== 'auto' && precision !== 9) {
      // Try NAPI round first (works for time-only durations)
      try {
        const entry = DIGIT_ROUND[precision as number];
        const unit = entry!.unit;
        const increment = entry!.increment;
        const napiOpts = Object.create(null);
        napiOpts.smallestUnit = unit;
        napiOpts.roundingMode = roundingMode;
        napiOpts.roundingIncrement = increment;
        const inner = this._inner.round(napiOpts, null, null);
        dur = new Duration(inner) as any;
      } catch (roundErr: any) {
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
    for (const field of DURATION_FIELDS_CHECK) {
      const v = (dur as any)[field];
      if (v > Number.MAX_SAFE_INTEGER || v < -Number.MAX_SAFE_INTEGER) {
        throw new RangeError('Rounded duration field exceeds safe integer range');
      }
    }

    // Format the duration string with proper precision
    return formatDurationString(dur, precision);
  }
  toJSON() {
    requireBranding(this, NapiDuration, 'Temporal.Duration');
    return this.toString();
  }
  toLocaleString(locales?: any, options?: any): string {
    requireBranding(this, NapiDuration, 'Temporal.Duration');
    if (typeof Intl !== 'undefined' && typeof (Intl as any).DurationFormat === 'function') {
      return new Intl.DurationFormat(locales, options).format(this as any);
    }
    return this.toString();
  }

  valueOf() {
    throw new TypeError('Use Temporal.Duration.compare() to compare Temporal.Duration');
  }

  // Symbol.toStringTag defined as data property below

  static [Symbol.hasInstance](v: any): boolean {
    return v !== null && v !== undefined && typeof v === 'object' && '_inner' in v && v._inner instanceof NapiDuration;
  }
}

export { Duration };

_classes['Duration'] = Duration;
