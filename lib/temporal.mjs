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
  if (val === undefined || val === null) return undefined;
  const mapped = UNIT_MAP[val];
  if (!mapped) throw new RangeError(`Invalid unit: ${val}`);
  return mapped;
}

function mapRoundingMode(val) {
  if (val === undefined || val === null) return undefined;
  const mapped = ROUNDING_MODE_MAP[val];
  if (!mapped) throw new RangeError(`Invalid rounding mode: ${val}`);
  return mapped;
}

function mapOverflow(val) {
  if (val === undefined || val === null) return undefined;
  const mapped = OVERFLOW_MAP[val];
  if (!mapped) throw new RangeError(`Invalid overflow: ${val}`);
  return mapped;
}

function mapDisplayCalendar(val) {
  if (val === undefined || val === null) return undefined;
  const mapped = DISPLAY_CALENDAR_MAP[val];
  if (!mapped) throw new RangeError(`Invalid calendarName option: ${val}`);
  return mapped;
}

function mapDisplayTimeZone(val) {
  if (val === undefined || val === null) return undefined;
  const mapped = DISPLAY_TIMEZONE_MAP[val];
  if (!mapped) throw new RangeError(`Invalid timeZoneName option: ${val}`);
  return mapped;
}

function mapDisplayOffset(val) {
  if (val === undefined || val === null) return undefined;
  const mapped = DISPLAY_OFFSET_MAP[val];
  if (!mapped) throw new RangeError(`Invalid offset option: ${val}`);
  return mapped;
}

// ─── Helper: wrap NAPI errors ─────────────────────────────────

function wrapError(e) {
  if (e instanceof TypeError || e instanceof RangeError) return e;
  const msg = e?.message || String(e);
  // temporal_rs errors are generally RangeError (out-of-range values, invalid inputs)
  if (msg.includes('type') || msg.includes('Type') || msg.includes('not a') || msg.includes('expected')) {
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
  if (cal === undefined || cal === null) return undefined;
  if (cal instanceof NapiCalendar) return cal;
  if (typeof cal === 'string') return new NapiCalendar(cal);
  if (cal && typeof cal === 'object' && cal.id) return new NapiCalendar(cal.id);
  throw new TypeError('Invalid calendar');
}

// ─── Helper: convert to NAPI TimeZone ─────────────────────────

function toNapiTimeZone(tz) {
  if (tz === undefined || tz === null) return undefined;
  if (tz instanceof NapiTimeZone) return tz;
  if (typeof tz === 'string') return new NapiTimeZone(tz);
  if (tz && typeof tz === 'object' && tz._inner instanceof NapiTimeZone) return tz._inner;
  if (tz && typeof tz === 'object' && tz.id) return new NapiTimeZone(tz.id);
  throw new TypeError('Invalid time zone');
}

// ─── Helper: convert to NAPI Duration ─────────────────────────

function toNapiDuration(arg) {
  if (arg instanceof NapiDuration) return arg;
  if (arg && arg._inner instanceof NapiDuration) return arg._inner;
  if (typeof arg === 'string') return call(() => NapiDuration.from(arg));
  if (typeof arg === 'object' && arg !== null) {
    // Check if it has any duration-like property
    const { years, months, weeks, days, hours, minutes, seconds, milliseconds, microseconds, nanoseconds } = arg;
    return call(() => new NapiDuration(
      years !== undefined ? Number(years) : undefined,
      months !== undefined ? Number(months) : undefined,
      weeks !== undefined ? Number(weeks) : undefined,
      days !== undefined ? Number(days) : undefined,
      hours !== undefined ? Number(hours) : undefined,
      minutes !== undefined ? Number(minutes) : undefined,
      seconds !== undefined ? Number(seconds) : undefined,
      milliseconds !== undefined ? Number(milliseconds) : undefined,
      microseconds !== undefined ? Number(microseconds) : undefined,
      nanoseconds !== undefined ? Number(nanoseconds) : undefined,
    ));
  }
  throw new TypeError('Invalid duration-like argument');
}

// ─── Helper: parse monthCode to month number ─────────────────

function monthCodeToMonth(monthCode) {
  if (!monthCode || typeof monthCode !== 'string') return undefined;
  const m = monthCode.match(/^M(\d{2})L?$/);
  if (!m) throw new RangeError(`Invalid monthCode: ${monthCode}`);
  return parseInt(m[1], 10);
}

// ─── Helper: resolve month from month/monthCode ───────────────

function resolveMonth(bag) {
  const { month, monthCode } = bag;
  if (month !== undefined && monthCode !== undefined) {
    const fromCode = monthCodeToMonth(monthCode);
    if (fromCode !== month) {
      throw new RangeError(`month ${month} and monthCode ${monthCode} do not agree`);
    }
    return month;
  }
  if (month !== undefined) return month;
  if (monthCode !== undefined) return monthCodeToMonth(monthCode);
  return undefined;
}

// ─── Helper: convert to NAPI PlainDate ────────────────────────

function toNapiPlainDate(arg) {
  if (arg instanceof NapiPlainDate) return arg;
  if (arg && arg._inner instanceof NapiPlainDate) return arg._inner;
  if (typeof arg === 'string') return call(() => NapiPlainDate.from(arg));
  if (typeof arg === 'object' && arg !== null) {
    // Accept PlainDateTime-like objects too (they have year/month/day)
    if (arg._inner instanceof NapiPlainDateTime) {
      const dt = arg._inner;
      return call(() => new NapiPlainDate(dt.year, dt.month, dt.day, dt.calendar));
    }
    const cal = toNapiCalendar(arg.calendar);
    const year = arg.year;
    const day = arg.day;
    const month = resolveMonth(arg);
    if (year !== undefined && month !== undefined && day !== undefined) {
      return call(() => new NapiPlainDate(year, month, day, cal));
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
  if (typeof arg === 'string') return call(() => NapiPlainTime.from(arg));
  if (typeof arg === 'object' && arg !== null) {
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
  if (typeof arg === 'string') return call(() => NapiPlainDateTime.from(arg));
  if (typeof arg === 'object' && arg !== null) {
    if (arg._inner instanceof NapiPlainDate) {
      const d = arg._inner;
      return call(() => new NapiPlainDateTime(d.year, d.month, d.day, 0, 0, 0, 0, 0, 0, d.calendar));
    }
    const cal = toNapiCalendar(arg.calendar);
    const month = resolveMonth(arg);
    return call(() => new NapiPlainDateTime(
      arg.year, month, arg.day,
      arg.hour, arg.minute, arg.second,
      arg.millisecond, arg.microsecond, arg.nanosecond,
      cal,
    ));
  }
  throw new TypeError('Invalid PlainDateTime argument');
}

// ─── Helper: convert to NAPI ZonedDateTime ────────────────────

function toNapiZonedDateTime(arg) {
  if (arg instanceof NapiZonedDateTime) return arg;
  if (arg && arg._inner instanceof NapiZonedDateTime) return arg._inner;
  if (typeof arg === 'string') return call(() => NapiZonedDateTime.from(arg));
  throw new TypeError('Invalid ZonedDateTime argument');
}

// ─── Helper: convert to NAPI Instant ──────────────────────────

function toNapiInstant(arg) {
  if (arg instanceof NapiInstant) return arg;
  if (arg && arg._inner instanceof NapiInstant) return arg._inner;
  if (typeof arg === 'string') return call(() => NapiInstant.from(arg));
  throw new TypeError('Invalid Instant argument');
}

// ─── Helper: convert to NAPI PlainYearMonth ───────────────────

function toNapiPlainYearMonth(arg) {
  if (arg instanceof NapiPlainYearMonth) return arg;
  if (arg && arg._inner instanceof NapiPlainYearMonth) return arg._inner;
  if (typeof arg === 'string') return call(() => NapiPlainYearMonth.from(arg));
  if (typeof arg === 'object' && arg !== null) {
    const cal = toNapiCalendar(arg.calendar);
    return call(() => new NapiPlainYearMonth(arg.year, arg.month, cal, arg.day));
  }
  throw new TypeError('Invalid PlainYearMonth argument');
}

// ─── Helper: convert to NAPI PlainMonthDay ────────────────────

function toNapiPlainMonthDay(arg) {
  if (arg instanceof NapiPlainMonthDay) return arg;
  if (arg && arg._inner instanceof NapiPlainMonthDay) return arg._inner;
  if (typeof arg === 'string') return call(() => NapiPlainMonthDay.from(arg));
  if (typeof arg === 'object' && arg !== null) {
    const cal = toNapiCalendar(arg.calendar);
    return call(() => new NapiPlainMonthDay(arg.monthCode ? undefined : arg.month, arg.day, cal, arg.year));
  }
  throw new TypeError('Invalid PlainMonthDay argument');
}

// ─── Helper: convert DifferenceSettings ───────────────────────

function convertDifferenceSettings(options) {
  if (!options) return undefined;
  if (typeof options === 'string') {
    // shorthand: just the largestUnit
    return { largestUnit: mapUnit(options) };
  }
  const result = {};
  if (options.largestUnit !== undefined) result.largestUnit = mapUnit(options.largestUnit);
  if (options.smallestUnit !== undefined) result.smallestUnit = mapUnit(options.smallestUnit);
  if (options.roundingMode !== undefined) result.roundingMode = mapRoundingMode(options.roundingMode);
  if (options.roundingIncrement !== undefined) result.roundingIncrement = options.roundingIncrement;
  return result;
}

// ─── Helper: convert RoundingOptions ──────────────────────────

function convertRoundingOptions(options) {
  if (!options) return { smallestUnit: undefined };
  if (typeof options === 'string') {
    // shorthand: just the smallestUnit
    return { smallestUnit: mapUnit(options) };
  }
  const result = {};
  if (options.largestUnit !== undefined) result.largestUnit = mapUnit(options.largestUnit);
  if (options.smallestUnit !== undefined) result.smallestUnit = mapUnit(options.smallestUnit);
  if (options.roundingMode !== undefined) result.roundingMode = mapRoundingMode(options.roundingMode);
  if (options.roundingIncrement !== undefined) result.roundingIncrement = options.roundingIncrement;
  return result;
}

// ─── Helper: convert ToStringRoundingOptions for PlainTime/PlainDateTime ──

function convertToStringOptions(options) {
  if (!options) return { roundingOptions: undefined, displayCalendar: undefined };
  const roundingOptions = {};
  let fractionalSecondDigits = options.fractionalSecondDigits;
  if (fractionalSecondDigits !== undefined && fractionalSecondDigits !== 'auto') {
    roundingOptions.precision = Number(fractionalSecondDigits);
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

// ─── Helper: wrap NAPI result back into wrapper ───────────────

function wrapDuration(napi) { return napi ? new Duration(napi) : napi; }
function wrapPlainDate(napi) { return napi ? new PlainDate(napi) : napi; }
function wrapPlainTime(napi) { return napi ? new PlainTime(napi) : napi; }
function wrapPlainDateTime(napi) { return napi ? new PlainDateTime(napi) : napi; }
function wrapZonedDateTime(napi) { return napi ? new ZonedDateTime(napi) : napi; }
function wrapInstant(napi) { return napi ? new Instant(napi) : napi; }
function wrapPlainYearMonth(napi) { return napi ? new PlainYearMonth(napi) : napi; }
function wrapPlainMonthDay(napi) { return napi ? new PlainMonthDay(napi) : napi; }

// ─── Helper: extract overflow from options ────────────────────

function extractOverflow(options) {
  if (!options) return undefined;
  return mapOverflow(options.overflow);
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
      this._inner = call(() => new NapiDuration(
        args[0] !== undefined ? Number(args[0]) : undefined,
        args[1] !== undefined ? Number(args[1]) : undefined,
        args[2] !== undefined ? Number(args[2]) : undefined,
        args[3] !== undefined ? Number(args[3]) : undefined,
        args[4] !== undefined ? Number(args[4]) : undefined,
        args[5] !== undefined ? Number(args[5]) : undefined,
        args[6] !== undefined ? Number(args[6]) : undefined,
        args[7] !== undefined ? Number(args[7]) : undefined,
        args[8] !== undefined ? Number(args[8]) : undefined,
        args[9] !== undefined ? Number(args[9]) : undefined,
      ));
    }
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
    // The spec says Duration.compare needs a relativeTo, but for basic comparison
    // we convert both to NAPI Duration
    const a = toNapiDuration(one);
    const b = toNapiDuration(two);
    // Duration doesn't have a compare in NAPI; compare component by component
    // following the spec: compare by total nanoseconds (only works without relativeTo for time-only)
    const aStr = a.toString();
    const bStr = b.toString();
    if (aStr === bStr) return 0;
    // Use sign of (a - b) where possible
    try {
      const diff = a.subtract(b);
      return diff.sign;
    } catch {
      return 0;
    }
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

  round(options) {
    // Duration.round requires relativeTo in the spec for calendar units
    // The NAPI binding doesn't support round on Duration directly
    // For now, delegate if available
    throw new RangeError('Duration.prototype.round is not yet supported');
  }

  total(options) {
    // Duration.total also requires relativeTo
    throw new RangeError('Duration.prototype.total is not yet supported');
  }

  toString() { return this._inner.toString(); }
  toJSON() { return this.toString(); }
  toLocaleString(...args) { return this.toString(); }

  valueOf() {
    throw new TypeError('Use Temporal.Duration.compare() to compare Temporal.Duration');
  }

  get [Symbol.toStringTag]() { return 'Temporal.Duration'; }

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
      const cal = toNapiCalendar(calendar);
      this._inner = call(() => new NapiPlainDate(year, month, day, cal));
    }
  }

  static from(arg, options) {
    if (typeof arg === 'string') {
      const inner = call(() => NapiPlainDate.from(arg));
      return new PlainDate(inner);
    }
    if (arg instanceof PlainDate) {
      return new PlainDate(arg._inner);
    }
    if (arg && arg._inner instanceof NapiPlainDate) {
      return new PlainDate(arg._inner);
    }
    if (arg instanceof PlainDateTime || (arg && arg._inner instanceof NapiPlainDateTime)) {
      const inner = arg._inner || arg;
      const dt = inner instanceof NapiPlainDateTime ? inner : arg._inner;
      return new PlainDate(call(() => new NapiPlainDate(dt.year, dt.month, dt.day, dt.calendar)));
    }
    if (arg instanceof ZonedDateTime || (arg && arg._inner instanceof NapiZonedDateTime)) {
      const inner = arg._inner || arg;
      const zdt = inner instanceof NapiZonedDateTime ? inner : arg._inner;
      return new PlainDate(zdt.toPlainDate());
    }
    if (typeof arg === 'object' && arg !== null) {
      const overflow = extractOverflow(options);
      const cal = toNapiCalendar(arg.calendar);
      const year = arg.year;
      const day = arg.day;
      const month = resolveMonth(arg);
      if (year === undefined) throw new TypeError('Required property year is missing or undefined');
      if (month === undefined) throw new TypeError('Required property month or monthCode is missing');
      if (day === undefined) throw new TypeError('Required property day is missing or undefined');
      const inner = call(() => new NapiPlainDate(year, month, day, cal));
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
  get weekOfYear() { return this._inner.weekOfYear; }
  get yearOfWeek() { return this._inner.yearOfWeek; }
  get daysInWeek() { return this._inner.daysInWeek; }
  get daysInMonth() { return this._inner.daysInMonth; }
  get daysInYear() { return this._inner.daysInYear; }
  get monthsInYear() { return this._inner.monthsInYear; }
  get inLeapYear() { return this._inner.inLeapYear; }
  get era() { return this._inner.era; }
  get eraYear() { return this._inner.eraYear; }
  get calendarId() { return this._inner.calendar.id; }
  get calendar() { return this._inner.calendar.id; }

  with(fields, options) {
    if (typeof fields !== 'object' || fields === null) {
      throw new TypeError('Invalid fields argument');
    }
    const overflow = extractOverflow(options);
    const merged = {
      year: fields.year !== undefined ? fields.year : this.year,
      month: fields.month !== undefined ? fields.month : this.month,
      day: fields.day !== undefined ? fields.day : this.day,
    };
    const cal = toNapiCalendar(fields.calendar || this.calendarId);
    return new PlainDate(call(() => new NapiPlainDate(merged.year, merged.month, merged.day, cal)));
  }

  withCalendar(calendar) {
    const cal = toNapiCalendar(calendar);
    return new PlainDate(this._inner.withCalendar(cal));
  }

  add(durationArg, options) {
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    return wrapPlainDate(call(() => this._inner.add(dur, overflow)));
  }

  subtract(durationArg, options) {
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    return wrapPlainDate(call(() => this._inner.subtract(dur, overflow)));
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
    if (time === undefined || time === null) {
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
    if (typeof item === 'string') {
      const tz = toNapiTimeZone(item);
      const dtStr = this.toString() + 'T00:00:00';
      const zdt = call(() => NapiZonedDateTime.from(dtStr + '[' + tz.id + ']'));
      return wrapZonedDateTime(zdt);
    }
    if (typeof item === 'object' && item !== null) {
      const tz = toNapiTimeZone(item.timeZone);
      let timeStr = 'T00:00:00';
      if (item.plainTime) {
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
    const cal = toNapiCalendar(this.calendarId);
    return wrapPlainYearMonth(call(() => new NapiPlainYearMonth(this.year, this.month, cal)));
  }

  toPlainMonthDay() {
    const cal = toNapiCalendar(this.calendarId);
    return wrapPlainMonthDay(call(() => new NapiPlainMonthDay(this.month, this.day, cal)));
  }

  toString(options) {
    const dc = options ? mapDisplayCalendar(options.calendarName) : undefined;
    return this._inner.toString(dc);
  }

  toJSON() { return this.toString(); }
  toLocaleString(...args) { return this.toString(); }

  valueOf() {
    throw new TypeError('Use Temporal.PlainDate.compare() to compare Temporal.PlainDate');
  }

  get [Symbol.toStringTag]() { return 'Temporal.PlainDate'; }

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
      this._inner = call(() => new NapiPlainTime(
        hour || 0, minute || 0, second || 0,
        millisecond, microsecond, nanosecond,
      ));
    }
  }

  static from(arg, options) {
    if (typeof arg === 'string') {
      return new PlainTime(call(() => NapiPlainTime.from(arg)));
    }
    if (arg instanceof PlainTime) {
      return new PlainTime(arg._inner);
    }
    if (arg && arg._inner instanceof NapiPlainTime) {
      return new PlainTime(arg._inner);
    }
    if (typeof arg === 'object' && arg !== null) {
      const overflow = extractOverflow(options);
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
    // PlainTime doesn't have compare in NAPI; do manual comparison
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
    if (typeof fields !== 'object' || fields === null) {
      throw new TypeError('Invalid fields argument');
    }
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
    const opts = convertRoundingOptions(options);
    return wrapPlainTime(call(() => this._inner.round(opts)));
  }

  equals(other) {
    const otherInner = toNapiPlainTime(other);
    return this._inner.equals(otherInner);
  }

  toPlainDateTime(date) {
    const d = toNapiPlainDate(date);
    const dt = call(() => new NapiPlainDateTime(
      d.year, d.month, d.day,
      this.hour, this.minute, this.second,
      this.millisecond, this.microsecond, this.nanosecond,
      d.calendar ? d.calendar : undefined,
    ));
    return wrapPlainDateTime(dt);
  }

  toZonedDateTime(item) {
    if (typeof item !== 'object' || item === null) {
      throw new TypeError('Expected object with timeZone and plainDate');
    }
    const tz = toNapiTimeZone(item.timeZone);
    const d = toNapiPlainDate(item.plainDate);
    const pad2 = n => String(n).padStart(2, '0');
    const pad3 = n => String(n).padStart(3, '0');
    let dateStr = `${String(d.year).padStart(4, '0')}-${pad2(d.month)}-${pad2(d.day)}`;
    let timeStr = `T${pad2(this.hour)}:${pad2(this.minute)}:${pad2(this.second)}`;
    if (this.millisecond || this.microsecond || this.nanosecond) {
      const frac = pad3(this.millisecond) + pad3(this.microsecond) + pad3(this.nanosecond);
      timeStr += '.' + frac.replace(/0+$/, '');
    }
    const zdt = call(() => NapiZonedDateTime.from(dateStr + timeStr + '[' + tz.id + ']'));
    return wrapZonedDateTime(zdt);
  }

  toString(options) {
    const opts = convertToStringOptions(options);
    return call(() => this._inner.toString(opts.roundingOptions));
  }

  toJSON() { return this.toString(); }
  toLocaleString(...args) { return this.toString(); }

  valueOf() {
    throw new TypeError('Use Temporal.PlainTime.compare() to compare Temporal.PlainTime');
  }

  get [Symbol.toStringTag]() { return 'Temporal.PlainTime'; }

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
      const cal = toNapiCalendar(calendar);
      this._inner = call(() => new NapiPlainDateTime(
        year, month, day,
        hour, minute, second,
        millisecond, microsecond, nanosecond,
        cal,
      ));
    }
  }

  static from(arg, options) {
    if (typeof arg === 'string') {
      return new PlainDateTime(call(() => NapiPlainDateTime.from(arg)));
    }
    if (arg instanceof PlainDateTime) {
      return new PlainDateTime(arg._inner);
    }
    if (arg && arg._inner instanceof NapiPlainDateTime) {
      return new PlainDateTime(arg._inner);
    }
    if (arg instanceof PlainDate || (arg && arg._inner instanceof NapiPlainDate)) {
      const inner = arg._inner || arg;
      const d = inner instanceof NapiPlainDate ? inner : arg._inner;
      return new PlainDateTime(call(() => new NapiPlainDateTime(d.year, d.month, d.day, 0, 0, 0, 0, 0, 0, d.calendar)));
    }
    if (arg instanceof ZonedDateTime || (arg && arg._inner instanceof NapiZonedDateTime)) {
      const inner = arg._inner || arg;
      const zdt = inner instanceof NapiZonedDateTime ? inner : arg._inner;
      return new PlainDateTime(zdt.toPlainDateTime());
    }
    if (typeof arg === 'object' && arg !== null) {
      const overflow = extractOverflow(options);
      const cal = toNapiCalendar(arg.calendar);
      const month = resolveMonth(arg);
      return new PlainDateTime(call(() => new NapiPlainDateTime(
        arg.year, month, arg.day,
        arg.hour, arg.minute, arg.second,
        arg.millisecond, arg.microsecond, arg.nanosecond,
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
  get weekOfYear() { return this._inner.weekOfYear; }
  get yearOfWeek() { return this._inner.yearOfWeek; }
  get daysInWeek() { return this._inner.daysInWeek; }
  get daysInMonth() { return this._inner.daysInMonth; }
  get daysInYear() { return this._inner.daysInYear; }
  get monthsInYear() { return this._inner.monthsInYear; }
  get inLeapYear() { return this._inner.inLeapYear; }
  get era() { return this._inner.era; }
  get eraYear() { return this._inner.eraYear; }
  get hour() { return this._inner.hour; }
  get minute() { return this._inner.minute; }
  get second() { return this._inner.second; }
  get millisecond() { return this._inner.millisecond; }
  get microsecond() { return this._inner.microsecond; }
  get nanosecond() { return this._inner.nanosecond; }
  get calendarId() { return this._inner.calendar.id; }
  get calendar() { return this._inner.calendar.id; }

  with(fields, options) {
    if (typeof fields !== 'object' || fields === null) {
      throw new TypeError('Invalid fields argument');
    }
    const overflow = extractOverflow(options);
    const cal = toNapiCalendar(fields.calendar || this.calendarId);
    return new PlainDateTime(call(() => new NapiPlainDateTime(
      fields.year !== undefined ? fields.year : this.year,
      fields.month !== undefined ? fields.month : this.month,
      fields.day !== undefined ? fields.day : this.day,
      fields.hour !== undefined ? fields.hour : this.hour,
      fields.minute !== undefined ? fields.minute : this.minute,
      fields.second !== undefined ? fields.second : this.second,
      fields.millisecond !== undefined ? fields.millisecond : this.millisecond,
      fields.microsecond !== undefined ? fields.microsecond : this.microsecond,
      fields.nanosecond !== undefined ? fields.nanosecond : this.nanosecond,
      cal,
    )));
  }

  withCalendar(calendar) {
    const cal = toNapiCalendar(calendar);
    return new PlainDateTime(this._inner.withCalendar(cal));
  }

  withPlainTime(time) {
    if (time === undefined || time === null) {
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
    return wrapPlainDateTime(call(() => this._inner.add(dur, overflow)));
  }

  subtract(durationArg, options) {
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    return wrapPlainDateTime(call(() => this._inner.subtract(dur, overflow)));
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
    if (options && options.disambiguation) {
      disambiguation = options.disambiguation;
    }
    const str = this.toString() + '[' + tz.id + ']';
    return wrapZonedDateTime(call(() => NapiZonedDateTime.from(str)));
  }

  toPlainYearMonth() {
    const cal = toNapiCalendar(this.calendarId);
    return wrapPlainYearMonth(call(() => new NapiPlainYearMonth(this.year, this.month, cal)));
  }

  toPlainMonthDay() {
    const cal = toNapiCalendar(this.calendarId);
    return wrapPlainMonthDay(call(() => new NapiPlainMonthDay(this.month, this.day, cal)));
  }

  toString(options) {
    const opts = convertToStringOptions(options);
    return call(() => this._inner.toString(opts.roundingOptions, opts.displayCalendar));
  }

  toJSON() { return this.toString(); }
  toLocaleString(...args) { return this.toString(); }

  valueOf() {
    throw new TypeError('Use Temporal.PlainDateTime.compare() to compare Temporal.PlainDateTime');
  }

  get [Symbol.toStringTag]() { return 'Temporal.PlainDateTime'; }

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
      const tz = toNapiTimeZone(timeZone);
      const cal = toNapiCalendar(calendar);
      // epochNanoseconds can be BigInt or number
      const ns = typeof epochNanoseconds === 'bigint' ? Number(epochNanoseconds) : epochNanoseconds;
      this._inner = call(() => new NapiZonedDateTime(ns, tz, cal));
    }
  }

  static from(arg, options) {
    if (typeof arg === 'string') {
      return new ZonedDateTime(call(() => NapiZonedDateTime.from(arg)));
    }
    if (arg instanceof ZonedDateTime) {
      return new ZonedDateTime(arg._inner);
    }
    if (arg && arg._inner instanceof NapiZonedDateTime) {
      return new ZonedDateTime(arg._inner);
    }
    if (typeof arg === 'object' && arg !== null) {
      // Property bag with timeZone required
      if (arg.timeZone === undefined) {
        throw new TypeError('Missing timeZone in ZonedDateTime property bag');
      }
      // Build an ISO string and parse it
      const tz = toNapiTimeZone(arg.timeZone);
      const year = arg.year || 0;
      const month = arg.month || 1;
      const day = arg.day || 1;
      const hour = arg.hour || 0;
      const minute = arg.minute || 0;
      const second = arg.second || 0;
      const pad2 = n => String(n).padStart(2, '0');
      const pad4 = n => {
        const s = String(Math.abs(n)).padStart(4, '0');
        return n < 0 ? '-' + s : s;
      };
      let str = `${pad4(year)}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
      if (arg.millisecond || arg.microsecond || arg.nanosecond) {
        const pad3 = n => String(n || 0).padStart(3, '0');
        const frac = pad3(arg.millisecond) + pad3(arg.microsecond) + pad3(arg.nanosecond);
        str += '.' + frac.replace(/0+$/, '');
      }
      str += '[' + tz.id + ']';
      return new ZonedDateTime(call(() => NapiZonedDateTime.from(str)));
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
  get weekOfYear() { return this._inner.weekOfYear; }
  get yearOfWeek() { return this._inner.yearOfWeek; }
  get daysInWeek() { return this._inner.daysInWeek; }
  get daysInMonth() { return this._inner.daysInMonth; }
  get daysInYear() { return this._inner.daysInYear; }
  get monthsInYear() { return this._inner.monthsInYear; }
  get inLeapYear() { return this._inner.inLeapYear; }
  get era() { return this._inner.era; }
  get eraYear() { return this._inner.eraYear; }
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
  get epochNanoseconds() { return BigInt(this._inner.epochNanoseconds); }
  get hoursInDay() { return this._inner.hoursInDay; }

  with(fields, options) {
    if (typeof fields !== 'object' || fields === null) {
      throw new TypeError('Invalid fields argument');
    }
    // Rebuild via property bag
    const merged = {
      year: fields.year !== undefined ? fields.year : this.year,
      month: fields.month !== undefined ? fields.month : this.month,
      day: fields.day !== undefined ? fields.day : this.day,
      hour: fields.hour !== undefined ? fields.hour : this.hour,
      minute: fields.minute !== undefined ? fields.minute : this.minute,
      second: fields.second !== undefined ? fields.second : this.second,
      millisecond: fields.millisecond !== undefined ? fields.millisecond : this.millisecond,
      microsecond: fields.microsecond !== undefined ? fields.microsecond : this.microsecond,
      nanosecond: fields.nanosecond !== undefined ? fields.nanosecond : this.nanosecond,
      timeZone: this.timeZoneId,
      calendar: this.calendarId,
    };
    return ZonedDateTime.from(merged, options);
  }

  withCalendar(calendar) {
    const cal = toNapiCalendar(calendar);
    return new ZonedDateTime(this._inner.withCalendar(cal));
  }

  withTimeZone(timeZone) {
    const tz = toNapiTimeZone(timeZone);
    return new ZonedDateTime(call(() => this._inner.withTimeZone(tz)));
  }

  withPlainTime(time) {
    if (time === undefined || time === null) {
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
    return wrapZonedDateTime(call(() => this._inner.add(dur, overflow)));
  }

  subtract(durationArg, options) {
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    return wrapZonedDateTime(call(() => this._inner.subtract(dur, overflow)));
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

  toPlainYearMonth() {
    const cal = toNapiCalendar(this.calendarId);
    return wrapPlainYearMonth(call(() => new NapiPlainYearMonth(this.year, this.month, cal)));
  }

  toPlainMonthDay() {
    const cal = toNapiCalendar(this.calendarId);
    return wrapPlainMonthDay(call(() => new NapiPlainMonthDay(this.month, this.day, cal)));
  }

  getTimeZoneTransition(direction) {
    // Not supported by the NAPI binding yet
    return null;
  }

  toString(options) {
    // ZonedDateTime toString in NAPI doesn't take options yet
    return call(() => this._inner.toString());
  }

  toJSON() { return this.toString(); }
  toLocaleString(...args) { return this.toString(); }

  valueOf() {
    throw new TypeError('Use Temporal.ZonedDateTime.compare() to compare Temporal.ZonedDateTime');
  }

  get [Symbol.toStringTag]() { return 'Temporal.ZonedDateTime'; }

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
      // epochNanoseconds should be BigInt per spec
      const ns = typeof epochNanoseconds === 'bigint' ? Number(epochNanoseconds) : epochNanoseconds;
      this._inner = call(() => new NapiInstant(ns));
    }
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
    throw new TypeError('Invalid argument for Instant.from()');
  }

  static fromEpochMilliseconds(ms) {
    return new Instant(call(() => NapiInstant.fromEpochMilliseconds(Number(ms))));
  }

  static fromEpochNanoseconds(ns) {
    const n = typeof ns === 'bigint' ? Number(ns) : ns;
    return new Instant(call(() => new NapiInstant(n)));
  }

  static fromEpochSeconds(s) {
    return Instant.fromEpochMilliseconds(Number(s) * 1000);
  }

  static fromEpochMicroseconds(us) {
    const n = typeof us === 'bigint' ? Number(us) * 1000 : us * 1000;
    return new Instant(call(() => new NapiInstant(n)));
  }

  static compare(one, two) {
    const a = toNapiInstant(one);
    const b = toNapiInstant(two);
    return NapiInstant.compare(a, b);
  }

  get epochMilliseconds() { return this._inner.epochMilliseconds; }
  get epochNanoseconds() { return BigInt(this._inner.epochNanoseconds); }
  get epochSeconds() { return Math.trunc(this._inner.epochMilliseconds / 1000); }
  get epochMicroseconds() { return BigInt(this._inner.epochNanoseconds) / 1000n; }

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
    const opts = convertRoundingOptions(options);
    return wrapInstant(call(() => this._inner.round(opts)));
  }

  equals(other) {
    const otherInner = toNapiInstant(other);
    return this._inner.equals(otherInner);
  }

  toZonedDateTimeISO(timeZone) {
    const tz = toNapiTimeZone(timeZone);
    const zdt = call(() => NapiZonedDateTime.fromEpochMilliseconds(this.epochMilliseconds, tz));
    return wrapZonedDateTime(zdt);
  }

  toZonedDateTime(options) {
    if (typeof options !== 'object' || options === null) {
      throw new TypeError('Expected options object with timeZone and calendar');
    }
    const tz = toNapiTimeZone(options.timeZone);
    const cal = toNapiCalendar(options.calendar);
    const zdt = call(() => NapiZonedDateTime.fromEpochMilliseconds(this.epochMilliseconds, tz, cal));
    return wrapZonedDateTime(zdt);
  }

  toString(options) {
    return call(() => this._inner.toString());
  }

  toJSON() { return this.toString(); }
  toLocaleString(...args) { return this.toString(); }

  valueOf() {
    throw new TypeError('Use Temporal.Instant.compare() to compare Temporal.Instant');
  }

  get [Symbol.toStringTag]() { return 'Temporal.Instant'; }

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
      const cal = toNapiCalendar(calendar);
      this._inner = call(() => new NapiPlainYearMonth(year, month, cal, referenceDay));
    }
  }

  static from(arg, options) {
    if (typeof arg === 'string') {
      return new PlainYearMonth(call(() => NapiPlainYearMonth.from(arg)));
    }
    if (arg instanceof PlainYearMonth) {
      return new PlainYearMonth(arg._inner);
    }
    if (arg && arg._inner instanceof NapiPlainYearMonth) {
      return new PlainYearMonth(arg._inner);
    }
    if (typeof arg === 'object' && arg !== null) {
      const overflow = extractOverflow(options);
      const cal = toNapiCalendar(arg.calendar);
      const month = resolveMonth(arg);
      return new PlainYearMonth(call(() => new NapiPlainYearMonth(arg.year, month, cal, arg.day)));
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
  get era() { return this._inner.era; }
  get eraYear() { return this._inner.eraYear; }
  get daysInYear() { return this._inner.daysInYear; }
  get daysInMonth() { return this._inner.daysInMonth; }
  get monthsInYear() { return this._inner.monthsInYear; }
  get inLeapYear() { return this._inner.inLeapYear; }
  get calendarId() { return this._inner.calendar.id; }
  get calendar() { return this._inner.calendar.id; }

  with(fields, options) {
    if (typeof fields !== 'object' || fields === null) {
      throw new TypeError('Invalid fields argument');
    }
    const overflow = extractOverflow(options);
    const cal = toNapiCalendar(fields.calendar || this.calendarId);
    return new PlainYearMonth(call(() => new NapiPlainYearMonth(
      fields.year !== undefined ? fields.year : this.year,
      fields.month !== undefined ? fields.month : this.month,
      cal,
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
    if (typeof fields !== 'object' || fields === null || fields.day === undefined) {
      throw new TypeError('day is required');
    }
    const cal = toNapiCalendar(this.calendarId);
    return wrapPlainDate(call(() => new NapiPlainDate(this.year, this.month, fields.day, cal)));
  }

  toString(options) {
    const dc = options ? mapDisplayCalendar(options.calendarName) : undefined;
    return this._inner.toString(dc);
  }

  toJSON() { return this.toString(); }
  toLocaleString(...args) { return this.toString(); }

  valueOf() {
    throw new TypeError('Use Temporal.PlainYearMonth.compare() to compare Temporal.PlainYearMonth');
  }

  get [Symbol.toStringTag]() { return 'Temporal.PlainYearMonth'; }

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
      const cal = toNapiCalendar(calendar);
      this._inner = call(() => new NapiPlainMonthDay(month, day, cal, referenceYear));
    }
  }

  static from(arg, options) {
    if (typeof arg === 'string') {
      return new PlainMonthDay(call(() => NapiPlainMonthDay.from(arg)));
    }
    if (arg instanceof PlainMonthDay) {
      return new PlainMonthDay(arg._inner);
    }
    if (arg && arg._inner instanceof NapiPlainMonthDay) {
      return new PlainMonthDay(arg._inner);
    }
    if (typeof arg === 'object' && arg !== null) {
      const overflow = extractOverflow(options);
      const cal = toNapiCalendar(arg.calendar);
      return new PlainMonthDay(call(() => new NapiPlainMonthDay(arg.month || undefined, arg.day, cal, arg.year)));
    }
    throw new TypeError('Invalid argument for PlainMonthDay.from()');
  }

  get monthCode() { return this._inner.monthCode; }
  get day() { return this._inner.day; }
  get calendarId() { return this._inner.calendar.id; }
  get calendar() { return this._inner.calendar.id; }

  with(fields, options) {
    if (typeof fields !== 'object' || fields === null) {
      throw new TypeError('Invalid fields argument');
    }
    const overflow = extractOverflow(options);
    const cal = toNapiCalendar(fields.calendar || this.calendarId);
    // Get existing month from monthCode since PlainMonthDay doesn't expose month directly
    // We need to figure out month from monthCode
    let month = fields.month;
    if (month === undefined) {
      // Parse month from monthCode like "M01", "M02", etc.
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
    const cal = toNapiCalendar(this.calendarId);
    return wrapPlainDate(call(() => new NapiPlainDate(fields.year, month, this.day, cal)));
  }

  toString(options) {
    const dc = options ? mapDisplayCalendar(options.calendarName) : undefined;
    return this._inner.toString(dc);
  }

  toJSON() { return this.toString(); }
  toLocaleString(...args) { return this.toString(); }

  valueOf() {
    throw new TypeError('Use equals() to compare Temporal.PlainMonthDay');
  }

  get [Symbol.toStringTag]() { return 'Temporal.PlainMonthDay'; }

  static [Symbol.hasInstance](v) {
    return v !== null && v !== undefined && typeof v === 'object' && '_inner' in v && v._inner instanceof NapiPlainMonthDay;
  }
}

// ═══════════════════════════════════════════════════════════════
//  Temporal.Now
// ═══════════════════════════════════════════════════════════════

const Now = {
  instant() {
    return wrapInstant(binding.nowInstant());
  },
  timeZoneId() {
    return binding.nowTimeZone().id;
  },
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
  [Symbol.toStringTag]: 'Temporal.Now',
};

Object.freeze(Now);

// ═══════════════════════════════════════════════════════════════
//  Temporal namespace
// ═══════════════════════════════════════════════════════════════

export const Temporal = {
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

Object.freeze(Temporal);

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
