import {
  NapiPlainDate,
  NapiPlainDateTime,
  NapiZonedDateTime,
  NapiDuration,
  NapiPlainYearMonth,
  NapiPlainMonthDay,
  type NapiPlainDateT,
} from './binding';
import {
  call,
  _wrapperSet,
  _isTemporalPlainDate,
  _isTemporalPlainDateTime,
  _isTemporalZonedDateTime,
  toIntegerWithTruncation,
  toInteger,
  rejectISODateRange,
  rejectTooManyFractionalSeconds,
  rejectPropertyBagInfinity,
  requireBranding,
  validateOptions,
  validateWithFields,
  wrapPlainDate,
  wrapDuration,
  toPrimitiveAndRequireString,
  validateMonthCodeSyntax,
  validateOverflowReject,
  addWithOverflow,
  _trunc,
  _classes,
  getRealCalendarId,
  resolveEraForCalendar,
  extractOverflow,
  rejectInfinity,
  _isoDaysInMonth,
  wrapPlainMonthDay,
  wrapPlainDateTime,
  wrapPlainYearMonth,
  wrapZonedDateTime,
} from './helpers';
import { _hasDateTimeOptions, _origFormatGetter } from './intl';
import { mapDisplayCalendar } from './enums';
import {
  toNapiCalendar,
  toNapiDuration,
  toNapiPlainDate,
  toNapiPlainTime,
  toNapiTimeZone,
  convertDifferenceSettings,
} from './convert';
import { _extractISOFromNapiDT } from './timezone';
import {
  canonicalizeCalendarId,
  rejectISOStringAsCalendar,
  getCalendarId,
  VALID_ERAS,
  resolveMonth,
  resolveEraYear,
  calendarDateToISO,
  isMonthCodeValidForYear,
  calendarDaysInMonth,
  calendarDateDifference,
  _getMaxMonthForCalendarYear,
  _getMonthCodeForOrdinal,
  THIRTEEN_MONTH_CALENDARS,
  ISO_MONTH_ALIGNED_CALENDARS,
  monthCodeToMonth,
} from './calendar';
import { PlainMonthDay } from './plainmonthday';
import type { Duration } from './duration';
import type { PlainDateTime } from './plaindatetime';
import type { ZonedDateTime } from './zoneddatetime';

class PlainDate {
  _inner!: NapiPlainDateT;
  _calId?: string;
  constructor(year: any, month?: any, day?: any, calendar?: any) {
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

  static from(arg: any, options?: any): any {
    if (typeof arg === 'string') {
      rejectTooManyFractionalSeconds(arg);
      const inner = call(() => NapiPlainDate.from(arg));
      if (options !== undefined) {
        validateOptions(options);
        extractOverflow(options);
      }
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
      const monthCodeStr = _monthCode !== undefined ? toPrimitiveAndRequireString(_monthCode, 'monthCode') : undefined;
      // Per spec: validate monthCode syntax immediately after coercing, before reading subsequent fields
      if (monthCodeStr !== undefined) validateMonthCodeSyntax(monthCodeStr);
      const _year = arg.year;
      const yearVal = toInteger(_year);
      // Read overflow AFTER fields per spec
      const overflow = extractOverflow(options);
      // Resolve era/eraYear for calendars that support them (don't read for ISO)
      let resolvedYear = yearVal;
      const calValidErasFrom = VALID_ERAS[calId];
      if (calValidErasFrom && calValidErasFrom.size > 0) {
        const eraFields: any = { year: yearVal, era: arg.era, eraYear: toInteger(arg.eraYear) };
        resolveEraYear(eraFields, calId);
        resolvedYear = eraFields.year;
      }
      // Per spec: validate required fields (TypeError) before monthCode semantics (RangeError)
      if (resolvedYear === undefined) throw new TypeError('Required property year is missing or undefined');
      if (_month === undefined && _monthCode === undefined)
        throw new TypeError('Required property month or monthCode is missing');
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

  static compare(one: any, two: any): number {
    const a = toNapiPlainDate(one);
    const b = toNapiPlainDate(two);
    return NapiPlainDate.compare(a, b);
  }

  get year() {
    return this._inner.year;
  }
  get month() {
    return this._inner.month;
  }
  get monthCode() {
    return this._inner.monthCode;
  }
  get day() {
    return this._inner.day;
  }
  get dayOfWeek() {
    return this._inner.dayOfWeek;
  }
  get dayOfYear() {
    return this._inner.dayOfYear;
  }
  get weekOfYear() {
    const v = this._inner.weekOfYear;
    return v === null ? undefined : v;
  }
  get yearOfWeek() {
    const v = this._inner.yearOfWeek;
    return v === null ? undefined : v;
  }
  get daysInWeek() {
    return this._inner.daysInWeek;
  }
  get daysInMonth() {
    return this._inner.daysInMonth;
  }
  get daysInYear() {
    return this._inner.daysInYear;
  }
  get monthsInYear() {
    return this._inner.monthsInYear;
  }
  get inLeapYear() {
    return this._inner.inLeapYear;
  }
  get era() {
    const calId = getRealCalendarId(this);
    const v = this._inner.era;
    if (v === null) return undefined;
    return resolveEraForCalendar(calId, this._inner.year, v, this._inner.eraYear, this._inner.month, this._inner.day)
      .era;
  }
  get eraYear(): number | undefined {
    const calId = getRealCalendarId(this);
    const v = this._inner.eraYear;
    if (v === null) return undefined;
    return resolveEraForCalendar(calId, this._inner.year, this._inner.era, v, this._inner.month, this._inner.day)
      .eraYear;
  }
  get calendarId() {
    return getRealCalendarId(this);
  }
  get calendar() {
    return getRealCalendarId(this);
  }

  with(fields: any, options?: any): any {
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
    const monthCodeStr = _monthCode !== undefined ? toPrimitiveAndRequireString(_monthCode, 'monthCode') : undefined;
    const _year = fields.year;
    const yearRaw = _year !== undefined ? toInteger(_year) : undefined;
    // Era handling (only for calendars that support eras, and only if era/eraYear explicitly provided)
    const calValidEras = VALID_ERAS[calId];
    const calSupportsEras = calValidEras && calValidEras.size > 0;
    let era, eraYear, year;
    let _hasEra = false,
      _hasEraYear = false;
    if (!calSupportsEras && calId !== 'iso8601') {
      const hasEra = fields.era !== undefined;
      const hasEraYear = fields.eraYear !== undefined;
      if (hasEra || hasEraYear) {
        throw new TypeError(`era and eraYear are not valid for the ${calId} calendar`);
      }
    }
    if (calSupportsEras) {
      const hasEra = fields.era !== undefined;
      const hasEraYear = fields.eraYear !== undefined;
      _hasEra = hasEra;
      _hasEraYear = hasEraYear;
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
    if (
      _day === undefined &&
      _month === undefined &&
      _monthCode === undefined &&
      _year === undefined &&
      !_hasEra &&
      !_hasEraYear
    ) {
      throw new TypeError('At least one recognized property must be provided');
    }
    rejectPropertyBagInfinity({ year: year || 0, day }, 'year', 'day');
    // Per spec: validate clearly invalid field values BEFORE options are read
    const td = _trunc(day);
    if (td < 1) throw new RangeError(`day ${td} out of range`);
    // Per spec: read overflow option AFTER basic field validation but BEFORE algorithmic validation
    const overflow = extractOverflow(options);
    // Resolve era/eraYear to year first so we know the target year for monthCode resolution
    const merged: any = { year, era, eraYear };
    resolveEraYear(merged, calId);
    const targetYear = merged.year;
    let month;
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
    const effectiveMonthCode =
      _monthCode !== undefined ? monthCodeStr : _month === undefined ? this.monthCode : undefined;
    merged.month = month;
    merged.day = day;
    const tm = _trunc(month);
    if (tm < 1) throw new RangeError(`month ${tm} out of range`);
    // In reject mode, a leap monthCode in a non-leap year is an error
    if (
      overflow === 'Reject' &&
      effectiveMonthCode &&
      !isMonthCodeValidForYear(effectiveMonthCode, calId, targetYear)
    ) {
      throw new RangeError(`monthCode ${effectiveMonthCode} is not valid for year ${targetYear} in ${calId} calendar`);
    }
    const cal = toNapiCalendar(calId);
    // For non-ISO calendars, constrain day to daysInMonth before converting
    let finalDay = _trunc(merged.day);
    if (!ISO_MONTH_ALIGNED_CALENDARS.has(calId) || calId === 'japanese') {
      const dim = calendarDaysInMonth(merged.year, _trunc(merged.month), calId);
      if (dim !== undefined) {
        if (overflow === 'Reject' && finalDay > dim) {
          throw new RangeError(
            `Date field values out of range: day ${finalDay} is not valid for month ${merged.month} (max ${dim})`,
          );
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

  withCalendar(calendar: any): any {
    if (calendar === undefined) throw new TypeError('calendar argument is required');
    const newCalId = getCalendarId(calendar);
    const cal = toNapiCalendar(calendar);
    const r = new PlainDate(this._inner.withCalendar(cal));
    r._calId = newCalId;
    return r;
  }

  add(durationArg: any, options?: any): any {
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    const calId = getRealCalendarId(this);
    return addWithOverflow(this._inner, dur, overflow, 'add', (n) => wrapPlainDate(n, calId));
  }

  subtract(durationArg: any, options?: any): any {
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    const calId = getRealCalendarId(this);
    return addWithOverflow(this._inner, dur, overflow, 'subtract', (n) => wrapPlainDate(n, calId));
  }

  until(other: any, options?: any): Duration {
    const otherInner = toNapiPlainDate(other);
    const settings = convertDifferenceSettings(options);
    const calId = getRealCalendarId(this);
    const lu = settings && settings.largestUnit ? settings.largestUnit : 'Day';
    const diff = calendarDateDifference(this._inner, otherInner, lu, calId);
    if (diff) {
      return wrapDuration(
        call(() => new NapiDuration(diff.years, diff.months, diff.weeks, diff.days, 0, 0, 0, 0, 0, 0)),
      );
    }
    return wrapDuration(call(() => this._inner.until(otherInner, settings)));
  }

  since(other: any, options?: any): Duration {
    const otherInner = toNapiPlainDate(other);
    const settings = convertDifferenceSettings(options);
    const calId = getRealCalendarId(this);
    const lu = settings && settings.largestUnit ? settings.largestUnit : 'Day';
    // since(other) = negate(until(other))
    const diff = calendarDateDifference(this._inner, otherInner, lu, calId);
    if (diff) {
      return wrapDuration(
        call(() => new NapiDuration(-diff.years, -diff.months, -diff.weeks, -diff.days, 0, 0, 0, 0, 0, 0)),
      );
    }
    return wrapDuration(call(() => this._inner.since(otherInner, settings)));
  }

  equals(other: any): boolean {
    const otherInner = toNapiPlainDate(other);
    return this._inner.equals(otherInner);
  }

  toPlainDateTime(time?: any): PlainDateTime {
    requireBranding(this, NapiPlainDate, 'Temporal.PlainDate');
    const calId = getRealCalendarId(this);
    // Use ISO date from toString() to avoid calendar-year confusion
    const isoDate = _extractISOFromNapiDT(this._inner);
    if (time === undefined) {
      const dt = call(
        () => new NapiPlainDateTime(isoDate.year, isoDate.month, isoDate.day, 0, 0, 0, 0, 0, 0, toNapiCalendar(calId)),
      );
      return wrapPlainDateTime(dt, calId);
    }
    const t = toNapiPlainTime(time);
    const dt = call(
      () =>
        new NapiPlainDateTime(
          isoDate.year,
          isoDate.month,
          isoDate.day,
          t.hour,
          t.minute,
          t.second,
          t.millisecond,
          t.microsecond,
          t.nanosecond,
          toNapiCalendar(calId),
        ),
    );
    return wrapPlainDateTime(dt, calId);
  }

  toZonedDateTime(item: any): ZonedDateTime {
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
      const _plainTime = item.plainTime;
      if (_plainTime === undefined) {
        // Per spec: omitted or undefined plainTime uses start-of-day semantics
        const zdtStr = baseStr + 'T12:00:00[' + tz.id + ']' + calAnnotation;
        const tempZdt = call(() => NapiZonedDateTime.from(zdtStr));
        const sod = call(() => tempZdt.startOfDay());
        return wrapZonedDateTime(sod, calId);
      }
      const t = toNapiPlainTime(_plainTime);
      const pad2 = (n: any) => String(n).padStart(2, '0');
      const pad3 = (n: any) => String(n).padStart(3, '0');
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
    return wrapPlainYearMonth(
      call(() => new NapiPlainYearMonth(isoDate.year, isoDate.month, cal, refDay)),
      calId,
    );
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

  toString(options?: any): string {
    if (options !== undefined) validateOptions(options);
    const dc = options ? mapDisplayCalendar(options.calendarName) : undefined;
    return this._inner.toString(dc);
  }

  toJSON() {
    requireBranding(this, NapiPlainDate, 'Temporal.PlainDate');
    return this.toString();
  }
  toLocaleString(locales?: any, options?: any): string {
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
      const resolvedCal = new Intl.DateTimeFormat(
        locales,
        options && typeof options === 'object' ? { calendar: options.calendar } : undefined,
      ).resolvedOptions().calendar;
      if (calId !== resolvedCal) {
        throw new RangeError(`Calendar ${calId} does not match locale calendar ${resolvedCal}`);
      }
    }
    // Per spec: force timezone to UTC for PlainDate (wall-clock semantics)
    const str = this._inner.toString();
    const m = str.match(/^(-?\d+|\+\d+)-(\d{2})-(\d{2})/);
    if (m) {
      const d = new Date(0);
      d.setUTCFullYear(parseInt(m[1]!, 10), parseInt(m[2]!, 10) - 1, parseInt(m[3]!, 10));
      d.setUTCHours(12, 0, 0, 0);
      let opts: any;
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
      delete opts.hour;
      delete opts.minute;
      delete opts.second;
      delete opts.fractionalSecondDigits;
      delete opts.dayPeriod;
      const dtf = new Intl.DateTimeFormat(locales, opts);
      return _origFormatGetter!.call(dtf)(d.getTime());
    }
    return this.toString();
  }

  valueOf() {
    throw new TypeError('Use Temporal.PlainDate.compare() to compare Temporal.PlainDate');
  }

  // Symbol.toStringTag defined as data property below

  static [Symbol.hasInstance](v: any): boolean {
    return v !== null && v !== undefined && typeof v === 'object' && '_inner' in v && v._inner instanceof NapiPlainDate;
  }
}

_classes['PlainDate'] = PlainDate;

export { PlainDate };
