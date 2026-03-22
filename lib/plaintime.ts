import { NapiPlainTime, type NapiPlainTimeT } from './binding';
import {
  call,
  _wrapperSet,
  _isTemporalPlainTime,
  _isTemporalPlainDateTime,
  _isTemporalPlainDate,
  _isTemporalPlainMonthDay,
  _isTemporalPlainYearMonth,
  _isTemporalDuration,
  _isTemporalZonedDateTime,
  toIntegerWithTruncation,
  requireBranding,
  validateOptions,
  validateWithFields,
  extractOverflow,
  resolveFractionalSecondDigits,
  wrapPlainTime,
  wrapDuration,
  _classes,
  rejectTooManyFractionalSeconds,
} from './helpers';
import { _hasDateTimeOptions, _origFormatGetter } from './intl';
import { mapUnit, mapRoundingMode } from './enums';
import { toNapiDuration, toNapiPlainTime, convertDifferenceSettings, convertRoundingOptions } from './convert';

import type { Duration } from './duration';

class PlainTime {
  _inner!: NapiPlainTimeT;
  constructor(hour?: any, minute?: any, second?: any, millisecond?: any, microsecond?: any, nanosecond?: any) {
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
      if (
        h < 0 ||
        h > 23 ||
        mi < 0 ||
        mi > 59 ||
        s < 0 ||
        s > 59 ||
        ms < 0 ||
        ms > 999 ||
        us < 0 ||
        us > 999 ||
        ns < 0 ||
        ns > 999
      ) {
        throw new RangeError('Time value out of range');
      }
      this._inner = call(() => new NapiPlainTime(h, mi, s, ms, us, ns));
    }
    _wrapperSet.add(this);
  }

  static from(arg: any, options?: any): any {
    if (typeof arg === 'string') {
      rejectTooManyFractionalSeconds(arg);
      const inner = call(() => NapiPlainTime.from(arg));
      if (options !== undefined) {
        validateOptions(options);
        extractOverflow(options);
      }
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
      return new PlainTime(
        call(() => new NapiPlainTime(dt.hour, dt.minute, dt.second, dt.millisecond, dt.microsecond, dt.nanosecond)),
      );
    }
    if (_isTemporalZonedDateTime(arg)) {
      if (options !== undefined) extractOverflow(options);
      return new PlainTime(arg._inner.toPlainTime());
    }
    if (typeof arg === 'object' && arg !== null) {
      // Reject known Temporal objects that are not PlainTime-like
      if (
        _isTemporalPlainDate(arg) ||
        _isTemporalPlainYearMonth(arg) ||
        _isTemporalPlainMonthDay(arg) ||
        _isTemporalDuration(arg)
      ) {
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
      if (
        _hour === undefined &&
        _microsecond === undefined &&
        _millisecond === undefined &&
        _minute === undefined &&
        _nanosecond === undefined &&
        _second === undefined
      ) {
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
        if (
          h < 0 ||
          h > 23 ||
          mi < 0 ||
          mi > 59 ||
          s < 0 ||
          s > 59 ||
          ms < 0 ||
          ms > 999 ||
          us < 0 ||
          us > 999 ||
          ns < 0 ||
          ns > 999
        ) {
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

  static compare(one: any, two: any): number {
    const a = toNapiPlainTime(one);
    const b = toNapiPlainTime(two);
    const fields = ['hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond'] as const;
    for (const f of fields) {
      if (a[f] < b[f]) return -1;
      if (a[f] > b[f]) return 1;
    }
    return 0;
  }

  get hour() {
    requireBranding(this, NapiPlainTime, 'Temporal.PlainTime');
    return this._inner.hour;
  }
  get minute() {
    requireBranding(this, NapiPlainTime, 'Temporal.PlainTime');
    return this._inner.minute;
  }
  get second() {
    requireBranding(this, NapiPlainTime, 'Temporal.PlainTime');
    return this._inner.second;
  }
  get millisecond() {
    requireBranding(this, NapiPlainTime, 'Temporal.PlainTime');
    return this._inner.millisecond;
  }
  get microsecond() {
    requireBranding(this, NapiPlainTime, 'Temporal.PlainTime');
    return this._inner.microsecond;
  }
  get nanosecond() {
    requireBranding(this, NapiPlainTime, 'Temporal.PlainTime');
    return this._inner.nanosecond;
  }

  with(fields: any, options?: any): any {
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
    if (
      _hour === undefined &&
      _microsecond === undefined &&
      _millisecond === undefined &&
      _minute === undefined &&
      _nanosecond === undefined &&
      _second === undefined
    ) {
      throw new TypeError('At least one recognized property must be provided');
    }
    const overflow = extractOverflow(options);
    if (overflow === 'Reject') {
      if (
        h < 0 ||
        h > 23 ||
        mi < 0 ||
        mi > 59 ||
        s < 0 ||
        s > 59 ||
        ms < 0 ||
        ms > 999 ||
        us < 0 ||
        us > 999 ||
        ns < 0 ||
        ns > 999
      ) {
        throw new RangeError('Time field value out of range with overflow: reject');
      }
    }
    return new PlainTime(call(() => new NapiPlainTime(h, mi, s, ms, us, ns)));
  }

  add(durationArg: any): any {
    requireBranding(this, NapiPlainTime, 'Temporal.PlainTime');
    const dur = toNapiDuration(durationArg);
    return wrapPlainTime(call(() => this._inner.add(dur)));
  }

  subtract(durationArg: any): any {
    requireBranding(this, NapiPlainTime, 'Temporal.PlainTime');
    const dur = toNapiDuration(durationArg);
    return wrapPlainTime(call(() => this._inner.subtract(dur)));
  }

  until(other: any, options?: any): Duration {
    requireBranding(this, NapiPlainTime, 'Temporal.PlainTime');
    const otherInner = toNapiPlainTime(other);
    const settings = convertDifferenceSettings(options);
    return wrapDuration(call(() => this._inner.until(otherInner, settings)));
  }

  since(other: any, options?: any): Duration {
    requireBranding(this, NapiPlainTime, 'Temporal.PlainTime');
    const otherInner = toNapiPlainTime(other);
    const settings = convertDifferenceSettings(options);
    return wrapDuration(call(() => this._inner.since(otherInner, settings)));
  }

  round(options: any): any {
    requireBranding(this, NapiPlainTime, 'Temporal.PlainTime');
    if (options === undefined) throw new TypeError('options parameter is required');
    const opts = convertRoundingOptions(options, { includeLargestUnit: false });
    return wrapPlainTime(call(() => this._inner.round(opts)));
  }

  equals(other: any): boolean {
    requireBranding(this, NapiPlainTime, 'Temporal.PlainTime');
    const otherInner = toNapiPlainTime(other);
    return this._inner.equals(otherInner);
  }

  toString(options?: any): string {
    requireBranding(this, NapiPlainTime, 'Temporal.PlainTime');
    if (options === undefined) return call(() => this._inner.toString());
    validateOptions(options);
    // Per spec: read options in alphabetical order (no calendarName for PlainTime)
    // fractionalSecondDigits, roundingMode, smallestUnit
    const roundingOptions: any = {};
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

  toJSON() {
    requireBranding(this, NapiPlainTime, 'Temporal.PlainTime');
    return this.toString();
  }
  toLocaleString(locales?: any, options?: any): string {
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
    let opts: any;
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
    delete opts.year;
    delete opts.month;
    delete opts.day;
    delete opts.weekday;
    delete opts.era;
    delete opts.timeZoneName;
    const dtf = new Intl.DateTimeFormat(locales, opts);
    if (_origFormatGetter) {
      return _origFormatGetter.call(dtf)(d.getTime());
    }
    return dtf.format(d.getTime());
  }

  valueOf() {
    throw new TypeError('Use Temporal.PlainTime.compare() to compare Temporal.PlainTime');
  }

  // Symbol.toStringTag defined as data property below

  static [Symbol.hasInstance](v: any): boolean {
    return v !== null && v !== undefined && typeof v === 'object' && '_inner' in v && v._inner instanceof NapiPlainTime;
  }
}

_classes['PlainTime'] = PlainTime;

export { PlainTime };
