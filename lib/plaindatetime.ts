import { NapiPlainDate, NapiPlainDateTime, NapiZonedDateTime, NapiDuration, type NapiPlainDateTimeT } from './binding';

import {
  call,
  _wrapperSet,
  _isTemporalPlainDateTime,
  _isTemporalPlainDate,
  _isTemporalZonedDateTime,
  toIntegerWithTruncation,
  toInteger,
  requireBranding,
  validateOptions,
  validateWithFields,
  wrapPlainDateTime,
  wrapPlainDate,
  wrapPlainTime,
  wrapDuration,
  wrapZonedDateTime,
  toPrimitiveAndRequireString,
  validateMonthCodeSyntax,
  rejectPropertyBagInfinity,
  addWithOverflow,
  _trunc,
  _classes,
  getRealCalendarId,
  resolveEraForCalendar,
  extractOverflow,
  rejectInfinity,
  rejectTooManyFractionalSeconds,
  validateOverflowReject,
  rejectISODateRange,
  toStringOption,
} from './helpers';

import {
  toNapiCalendar,
  toNapiDuration,
  toNapiPlainDateTime,
  toNapiPlainTime,
  toNapiTimeZone,
  convertDifferenceSettings,
  convertRoundingOptions,
  convertToStringOptions,
} from './convert';

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
  ISO_MONTH_ALIGNED_CALENDARS,
  _getMaxMonthForCalendarYear,
  monthCodeToMonth,
  calendarDateDifference,
} from './calendar';

import { _extractISOFromNapiDT, _resolveLocalToEpochMs, bigintNsToZdtString } from './timezone';

import { _hasDateTimeOptions, _origFormatGetter } from './intl';
import { DISAMBIGUATION_MAP } from './enums';

// ═══════════════════════════════════════════════════════════════
//  PlainDateTime
// ═══════════════════════════════════════════════════════════════

class PlainDateTime {
  _inner!: NapiPlainDateTimeT;
  _calId?: string;
  constructor(
    year: any,
    month?: any,
    day?: any,
    hour?: any,
    minute?: any,
    second?: any,
    millisecond?: any,
    microsecond?: any,
    nanosecond?: any,
    calendar?: any,
  ) {
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
      rejectISOStringAsCalendar(calendar);
      const cal = toNapiCalendar(calendar);
      this._inner = call(() => new NapiPlainDateTime(y, mo, d, h, mi, s, ms, us, ns, cal));
      if (typeof calendar === 'string') this._calId = canonicalizeCalendarId(calendar);
    }
    _wrapperSet.add(this);
  }

  static from(arg: any, options?: any): any {
    if (typeof arg === 'string') {
      rejectTooManyFractionalSeconds(arg);
      const inner = call(() => NapiPlainDateTime.from(arg));
      if (options !== undefined) {
        validateOptions(options);
        extractOverflow(options);
      }
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
      const r = new PlainDateTime(
        call(() => new NapiPlainDateTime(d.year, d.month, d.day, 0, 0, 0, 0, 0, 0, d.calendar)),
      );
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
      const monthCodeStr = _monthCode !== undefined ? toPrimitiveAndRequireString(_monthCode, 'monthCode') : undefined;
      // Per spec: validate monthCode syntax immediately after coercing, before reading subsequent fields
      if (monthCodeStr !== undefined) validateMonthCodeSyntax(monthCodeStr);
      const _nanosecond = arg.nanosecond;
      const nanosecond = toInteger(_nanosecond);
      const _second = arg.second;
      const second = toInteger(_second);
      const _year = arg.year;
      const yearVal = toInteger(_year);
      // Read overflow AFTER fields
      const overflow = extractOverflow(options);
      // Resolve era/eraYear for calendars that support them
      let resolvedYear = yearVal;
      const _calValidErasDTF = VALID_ERAS[calId];
      if (_calValidErasDTF && _calValidErasDTF.size > 0) {
        const eraFields: any = { year: yearVal, era: arg.era, eraYear: toInteger(arg.eraYear) };
        resolveEraYear(eraFields, calId);
        resolvedYear = eraFields.year;
      }
      // Per spec: validate required fields
      if (resolvedYear === undefined) throw new TypeError('Required property year is missing or undefined');
      if (_month === undefined && _monthCode === undefined)
        throw new TypeError('Required property month or monthCode is missing');
      if (day === undefined) throw new TypeError('Required property day is missing or undefined');
      const monthBag = { month: monthRaw, monthCode: monthCodeStr };
      const month = resolveMonth(monthBag, calId, resolvedYear);
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
      // In reject mode, validate monthCode
      if (overflow === 'Reject' && monthCodeStr !== undefined) {
        if (!isMonthCodeValidForYear(monthCodeStr, calId, resolvedYear)) {
          throw new RangeError(
            `monthCode ${monthCodeStr} does not exist in year ${resolvedYear} for ${calId} calendar`,
          );
        }
      }
      validateOverflowReject({ year: resolvedYear, month, day }, overflow, cal);
      // Handle leap second: second:60 should reject or constrain
      let s = second || 0;
      const h = hour || 0,
        mi = minute || 0;
      const ms = millisecond || 0,
        us = microsecond || 0,
        ns = nanosecond || 0;
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
        if (s === 60) s = 59;
      }
      // Constrain month for non-ISO calendars
      let constrainedMonth = month;
      if (overflow !== 'Reject' && !ISO_MONTH_ALIGNED_CALENDARS.has(calId)) {
        const maxM = _getMaxMonthForCalendarYear(calId, resolvedYear);
        constrainedMonth = Math.max(1, Math.min(month, maxM));
      }
      const iso = calendarDateToISO(resolvedYear, constrainedMonth, day, calId);
      const r = new PlainDateTime(
        call(() => new NapiPlainDateTime(iso.isoYear, iso.isoMonth, iso.isoDay, h, mi, s, ms, us, ns, cal)),
      );
      r._calId = calId;
      return r;
    }
    throw new TypeError('Invalid argument for PlainDateTime.from()');
  }

  static compare(one: any, two: any): number {
    const a = toNapiPlainDateTime(one);
    const b = toNapiPlainDateTime(two);
    return NapiPlainDateTime.compare(a, b);
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
  get eraYear() {
    const calId = getRealCalendarId(this);
    const v = this._inner.eraYear;
    if (v === null) return undefined;
    return resolveEraForCalendar(calId, this._inner.year, this._inner.era, v, this._inner.month, this._inner.day)
      .eraYear;
  }
  get hour() {
    return this._inner.hour;
  }
  get minute() {
    return this._inner.minute;
  }
  get second() {
    return this._inner.second;
  }
  get millisecond() {
    return this._inner.millisecond;
  }
  get microsecond() {
    return this._inner.microsecond;
  }
  get nanosecond() {
    return this._inner.nanosecond;
  }
  get calendarId() {
    return getRealCalendarId(this);
  }
  get calendar() {
    return getRealCalendarId(this);
  }

  with(fields: any, options?: any): any {
    requireBranding(this, NapiPlainDateTime, 'Temporal.PlainDateTime');
    validateWithFields(fields, null, 'PlainDateTime');
    const calId = this.calendarId;
    const calValidEras = VALID_ERAS[calId];
    const calSupportsEras = calValidEras && calValidEras.size > 0;
    // Per spec: read fields in ALPHABETICAL order, each once, coercing immediately
    const _day = fields.day;
    const day = _day !== undefined ? toInteger(_day) : this.day;
    const _hour = fields.hour;
    const hour = _hour !== undefined ? toInteger(_hour) : this.hour;
    const _microsecond = fields.microsecond;
    const microsecond = _microsecond !== undefined ? toInteger(_microsecond) : this.microsecond;
    const _millisecond = fields.millisecond;
    const millisecond = _millisecond !== undefined ? toInteger(_millisecond) : this.millisecond;
    const _minute = fields.minute;
    const minute = _minute !== undefined ? toInteger(_minute) : this.minute;
    const _month = fields.month;
    const monthRaw = _month !== undefined ? toInteger(_month) : undefined;
    const _monthCode = fields.monthCode;
    const monthCodeStr = _monthCode !== undefined ? toPrimitiveAndRequireString(_monthCode, 'monthCode') : undefined;
    const _nanosecond = fields.nanosecond;
    const nanosecond = _nanosecond !== undefined ? toInteger(_nanosecond) : this.nanosecond;
    const _second = fields.second;
    const second = _second !== undefined ? toInteger(_second) : this.second;
    const _year = fields.year;
    const yearRaw = _year !== undefined ? toInteger(_year) : undefined;
    // Read era/eraYear for calendars that support them (not part of alphabetical fields for ISO)
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
        eraYear = toInteger(_eraYear);
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
      _second === undefined &&
      _year === undefined &&
      !_hasEra &&
      !_hasEraYear
    ) {
      throw new TypeError('At least one recognized property must be provided');
    }
    // Per spec: validate field values
    rejectPropertyBagInfinity(
      { year: year || 0, day, hour, minute, second, millisecond, microsecond, nanosecond },
      'year',
      'day',
      'hour',
      'minute',
      'second',
      'millisecond',
      'microsecond',
      'nanosecond',
    );
    if (monthRaw !== undefined) rejectInfinity(monthRaw, 'month');
    const td = _trunc(day);
    if (td < 1) throw new RangeError(`day ${td} out of range`);
    // Per spec: read overflow option AFTER fields, BEFORE algorithmic validation
    const overflow = extractOverflow(options);
    // Resolve era/eraYear to year first
    const merged: any = { year, era, eraYear };
    resolveEraYear(merged, calId);
    const targetYear = merged.year;
    let month;
    if (monthRaw !== undefined && monthCodeStr !== undefined) {
      month = monthRaw;
      const fromCode = monthCodeToMonth(monthCodeStr, calId, targetYear);
      if (_trunc(month) !== fromCode) {
        throw new RangeError(`month ${month} and monthCode ${monthCodeStr} do not agree`);
      }
    } else if (_month !== undefined) {
      month = monthRaw;
    } else if (_monthCode !== undefined) {
      month = monthCodeToMonth(monthCodeStr, calId, targetYear);
    } else {
      month = monthCodeToMonth(this.monthCode, calId, targetYear);
    }
    // Determine which monthCode is in effect for leap-month validation
    const effectiveMonthCodeDT =
      _monthCode !== undefined ? monthCodeStr : _month === undefined ? this.monthCode : undefined;
    // In reject mode, a leap monthCode in a non-leap year is an error
    if (
      overflow === 'Reject' &&
      effectiveMonthCodeDT &&
      !isMonthCodeValidForYear(effectiveMonthCodeDT, calId, targetYear)
    ) {
      throw new RangeError(
        `monthCode ${effectiveMonthCodeDT} is not valid for year ${targetYear} in ${calId} calendar`,
      );
    }
    const cal = toNapiCalendar(calId);
    // For non-ISO calendars, constrain day to daysInMonth before converting
    let finalDay = _trunc(day);
    if (!ISO_MONTH_ALIGNED_CALENDARS.has(calId) || calId === 'japanese') {
      const dim = calendarDaysInMonth(targetYear, _trunc(month), calId);
      if (dim !== undefined) {
        if (overflow === 'Reject' && finalDay > dim) {
          throw new RangeError(
            `Date field values out of range: day ${finalDay} is not valid for month ${month} (max ${dim})`,
          );
        }
        finalDay = Math.min(finalDay, dim);
      }
    }
    const iso = calendarDateToISO(targetYear, _trunc(month), finalDay, calId);
    const result = call(
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

  withCalendar(calendar: any): any {
    if (calendar === undefined) throw new TypeError('calendar argument is required');
    const newCalId = getCalendarId(calendar);
    const cal = toNapiCalendar(calendar);
    const r = new PlainDateTime(this._inner.withCalendar(cal));
    r._calId = newCalId;
    return r;
  }

  withPlainTime(time: any) {
    requireBranding(this, NapiPlainDateTime, 'Temporal.PlainDateTime');
    const calId = getRealCalendarId(this);
    if (time === undefined) {
      const cal = toNapiCalendar(calId);
      // Extract ISO date from NAPI toString() to avoid calendar-year confusion
      const isoDate = _extractISOFromNapiDT(this._inner);
      const r = new PlainDateTime(
        call(() => new NapiPlainDateTime(isoDate.year, isoDate.month, isoDate.day, 0, 0, 0, 0, 0, 0, cal)),
      );
      r._calId = calId;
      return r;
    }
    const t = toNapiPlainTime(time);
    const cal = toNapiCalendar(calId);
    // Extract ISO date from NAPI toString() to avoid calendar-year confusion
    const isoDate = _extractISOFromNapiDT(this._inner);
    return wrapPlainDateTime(
      call(
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
            cal,
          ),
      ),
      calId,
    );
  }

  add(durationArg: any, options?: any): any {
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    const calId = getRealCalendarId(this);
    return addWithOverflow(this._inner, dur, overflow, 'add', (n) => wrapPlainDateTime(n, calId));
  }

  subtract(durationArg: any, options?: any): any {
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    const calId = getRealCalendarId(this);
    return addWithOverflow(this._inner, dur, overflow, 'subtract', (n) => wrapPlainDateTime(n, calId));
  }

  until(other: any, options?: any): any {
    const otherInner = toNapiPlainDateTime(other);
    const settings = convertDifferenceSettings(options);
    const calId = getRealCalendarId(this);
    const lu = settings && settings.largestUnit ? settings.largestUnit : 'Day';
    // For year/month largest units on non-ISO calendars, use JS implementation for date part
    if ((lu === 'Year' || lu === 'Month') && !ISO_MONTH_ALIGNED_CALENDARS.has(calId)) {
      // Get the date part difference using our calendar-aware algorithm
      const startDate = this._inner.toPlainDate
        ? this._inner.toPlainDate()
        : call(() => new NapiPlainDate(this._inner.year, this._inner.month, this._inner.day, this._inner.calendar));
      const endDate = otherInner.toPlainDate
        ? otherInner.toPlainDate()
        : call(() => new NapiPlainDate(otherInner.year, otherInner.month, otherInner.day, otherInner.calendar));
      const dateDiff = calendarDateDifference(startDate, endDate, lu, calId);
      if (dateDiff) {
        // Get time difference from NAPI for the remaining time component
        const napiDur = call(() => this._inner.until(otherInner, settings));
        // Use the calendar-correct date components but preserve time components from NAPI
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
    const otherInner = toNapiPlainDateTime(other);
    const settings = convertDifferenceSettings(options);
    const calId = getRealCalendarId(this);
    const lu = settings && settings.largestUnit ? settings.largestUnit : 'Day';
    if ((lu === 'Year' || lu === 'Month') && !ISO_MONTH_ALIGNED_CALENDARS.has(calId)) {
      const startDate = this._inner.toPlainDate
        ? this._inner.toPlainDate()
        : call(() => new NapiPlainDate(this._inner.year, this._inner.month, this._inner.day, this._inner.calendar));
      const endDate = otherInner.toPlainDate
        ? otherInner.toPlainDate()
        : call(() => new NapiPlainDate(otherInner.year, otherInner.month, otherInner.day, otherInner.calendar));
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
    if (options === undefined) throw new TypeError('options parameter is required');
    const opts = convertRoundingOptions(options, { includeLargestUnit: false });
    return wrapPlainDateTime(
      call(() => this._inner.round(opts)),
      getRealCalendarId(this),
    );
  }

  equals(other: any): boolean {
    const otherInner = toNapiPlainDateTime(other);
    return this._inner.equals(otherInner);
  }

  toPlainDate() {
    return wrapPlainDate(this._inner.toPlainDate(), getRealCalendarId(this));
  }

  toPlainTime() {
    return wrapPlainTime(this._inner.toPlainTime());
  }

  toZonedDateTime(timeZone: any, options: any) {
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
    if (options !== undefined) {
      const _d = options.disambiguation;
      if (_d !== undefined) disambiguation = _d;
    }
    // Validate disambiguation option
    let disambiguationStr = 'compatible';
    if (disambiguation !== undefined) {
      disambiguationStr = toStringOption(disambiguation);
      if (!DISAMBIGUATION_MAP[disambiguationStr])
        throw new RangeError(`Invalid disambiguation option: ${disambiguationStr}`);
    }
    // Use disambiguation to resolve ambiguous/gap local times
    const inner = this._inner;
    const isoYear = (inner as any).isoYear || inner.year;
    const isoMonth = (inner as any).isoMonth || inner.month;
    const isoDay = (inner as any).isoDay || inner.day;
    const resolved = _resolveLocalToEpochMs(
      isoYear,
      isoMonth,
      isoDay,
      inner.hour,
      inner.minute,
      inner.second,
      inner.millisecond,
      tz.id,
      disambiguationStr,
    );
    const epochNs = BigInt(resolved.epochMs) * 1000000n + BigInt(inner.microsecond) * 1000n + BigInt(inner.nanosecond);
    const zdtStr = bigintNsToZdtString(epochNs, tz.id, this.calendarId !== 'iso8601' ? this.calendarId : 'iso8601');
    return wrapZonedDateTime(
      call(() => NapiZonedDateTime.from(zdtStr)),
      getRealCalendarId(this),
    );
  }

  toString(options?: any): string {
    const opts = convertToStringOptions(options);
    return call(() => this._inner.toString(opts.roundingOptions as any, opts.displayCalendar as any));
  }

  toJSON() {
    requireBranding(this, NapiPlainDateTime, 'Temporal.PlainDateTime');
    return this.toString();
  }
  toLocaleString(locales?: any, options?: any): string {
    requireBranding(this, NapiPlainDateTime, 'Temporal.PlainDateTime');
    // Per spec: calendar mismatch check (ISO calendar is always OK for PlainDateTime)
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
    // Per spec: force timezone to UTC for PlainDateTime (wall-clock semantics)
    const inner = this._inner;
    const isoFields = _extractISOFromNapiDT(inner);
    const d = new Date(0);
    d.setUTCFullYear(isoFields.year, isoFields.month - 1, isoFields.day);
    d.setUTCHours(inner.hour, inner.minute, inner.second, inner.millisecond);
    let opts: any;
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
    return _origFormatGetter!.call(dtf)(d.getTime());
  }

  valueOf() {
    throw new TypeError('Use Temporal.PlainDateTime.compare() to compare Temporal.PlainDateTime');
  }

  // Symbol.toStringTag defined as data property below

  static [Symbol.hasInstance](v: any): boolean {
    return (
      v !== null && v !== undefined && typeof v === 'object' && '_inner' in v && v._inner instanceof NapiPlainDateTime
    );
  }
}

_classes.PlainDateTime = PlainDateTime;

export { PlainDateTime };
