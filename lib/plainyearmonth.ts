// PlainYearMonth class extracted from temporal.ts

import { NapiPlainDate, NapiPlainYearMonth, NapiDuration, type NapiPlainYearMonthT } from './binding';
import {
  call,
  _wrapperSet,
  _isTemporalPlainYearMonth,
  toIntegerWithTruncation,
  toInteger,
  requireBranding,
  validateOptions,
  validateWithFields,
  wrapPlainYearMonth,
  wrapDuration,
  wrapPlainDate,
  toPrimitiveAndRequireString,
  validateMonthCodeSyntax,
  rejectPropertyBagInfinity,
  _trunc,
  _classes,
  getRealCalendarId,
  resolveEraForCalendar,
  extractOverflow,
  rejectInfinity,
  rejectTooManyFractionalSeconds,
  rejectISODateRange,
} from './helpers';
import { _hasDateTimeOptions, _temporalToEpochMs, _origFormatGetter } from './intl';
import { mapDisplayCalendar } from './enums';
import { toNapiCalendar, toNapiDuration, toNapiPlainYearMonth, convertDifferenceSettings } from './convert';
import {
  canonicalizeCalendarId,
  rejectISOStringAsCalendar,
  getCalendarId,
  VALID_ERAS,
  resolveMonth,
  resolveEraYear,
  calendarDateToISO,
  isMonthCodeValidForYear,
  _getMaxMonthForCalendarYear,
  _getMonthCodeForOrdinal,
  calendarDateDifference,
  _ymInnerToPlainDate,
  THIRTEEN_MONTH_CALENDARS,
  isHebrewLeapYear,
  getChineseDangiLeapMonth,
  CALENDAR_ISO_OFFSETS,
  ISO_MONTH_ALIGNED_CALENDARS,
  monthCodeToMonth,
} from './calendar';

import type { Duration } from './duration';
import type { PlainDate } from './plaindate';

class PlainYearMonth {
  _inner!: NapiPlainYearMonthT;
  _calId?: string;
  constructor(year: any, month?: any, calendar?: any, referenceDay?: any) {
    if (year instanceof NapiPlainYearMonth) {
      this._inner = year;
    } else {
      const y = toIntegerWithTruncation(year);
      const m = toIntegerWithTruncation(month);
      // Per spec: validate calendar BEFORE coercing referenceDay
      rejectISOStringAsCalendar(calendar);
      const cal = toNapiCalendar(calendar);
      const rd = referenceDay !== undefined ? toIntegerWithTruncation(referenceDay) : referenceDay;
      // Per spec: constructor always rejects out-of-range ISO values
      if (rd !== undefined) rejectISODateRange(y, m, rd);
      else if (m < 1 || m > 12) throw new RangeError('Month out of range');
      this._inner = call(() => new NapiPlainYearMonth(y, m, cal, rd));
      if (typeof calendar === 'string') this._calId = canonicalizeCalendarId(calendar);
    }
    _wrapperSet.add(this);
  }

  static from(arg: any, options?: any): any {
    if (typeof arg === 'string') {
      rejectTooManyFractionalSeconds(arg);
      const inner = call(() => NapiPlainYearMonth.from(arg));
      if (options !== undefined) {
        validateOptions(options);
        extractOverflow(options);
      }
      const r = new PlainYearMonth(inner);
      const calMatch = arg.match(/\[u-ca=([^\]]+)\]/);
      if (calMatch) r._calId = canonicalizeCalendarId(calMatch[1]);
      return r;
    }
    validateOptions(options);
    if (_isTemporalPlainYearMonth(arg)) {
      if (options !== undefined) extractOverflow(options);
      const r = new PlainYearMonth(arg._inner);
      if (arg._calId) r._calId = arg._calId;
      return r;
    }
    if (arg instanceof NapiPlainYearMonth) {
      if (options !== undefined) extractOverflow(options);
      return new PlainYearMonth(arg);
    }
    if (typeof arg === 'object' && arg !== null) {
      // Per spec: read fields in ALPHABETICAL order, coercing each immediately
      const _calendar = arg.calendar;
      const calId = getCalendarId(_calendar);
      const cal = toNapiCalendar(_calendar);
      const _month = arg.month;
      const rawMonth = toInteger(_month);
      const _monthCode = arg.monthCode;
      const rawMonthCode = _monthCode !== undefined ? toPrimitiveAndRequireString(_monthCode, 'monthCode') : undefined;
      // Per spec: validate monthCode syntax immediately after coercing, before reading subsequent fields
      if (rawMonthCode !== undefined) validateMonthCodeSyntax(rawMonthCode);
      const _year = arg.year;
      const yearVal = toInteger(_year);
      // Read overflow AFTER fields
      const overflow = extractOverflow(options);
      // Resolve era/eraYear for calendars that support them
      let resolvedYear = yearVal;
      const _calValidErasYMF = VALID_ERAS[calId];
      if (_calValidErasYMF && _calValidErasYMF.size > 0) {
        const eraFields: any = { year: yearVal, era: arg.era, eraYear: toInteger(arg.eraYear) };
        resolveEraYear(eraFields, calId);
        resolvedYear = eraFields.year;
      }
      if (resolvedYear === undefined) throw new TypeError('Required property year is missing or undefined');
      const month = resolveMonth({ month: rawMonth, monthCode: rawMonthCode }, calId, resolvedYear);
      if (month === undefined && rawMonthCode === undefined)
        throw new TypeError('Required property month or monthCode is missing');
      rejectPropertyBagInfinity({ year: resolvedYear, month }, 'year', 'month');
      // Validate month range (0 is always out of range regardless of overflow)
      if (month !== undefined) {
        const m = _trunc(month);
        if (m < 1) throw new RangeError(`month ${m} out of range`);
        // In reject mode, validate month upper bound
        if (overflow === 'Reject') {
          const maxMonth = THIRTEEN_MONTH_CALENDARS.has(calId) ? 13 : 12;
          if (m > maxMonth) throw new RangeError(`month ${m} out of range for ${calId} calendar`);
        }
      }
      // In reject mode, validate that monthCode is valid for the target year
      if (overflow === 'Reject' && rawMonthCode !== undefined) {
        if (!isMonthCodeValidForYear(rawMonthCode, calId, resolvedYear)) {
          throw new RangeError(
            `monthCode ${rawMonthCode} does not exist in year ${resolvedYear} for ${calId} calendar`,
          );
        }
        // Also reject month > monthsInYear for the target year
        if (calId === 'hebrew' && !isHebrewLeapYear(resolvedYear) && rawMonth !== undefined && _trunc(rawMonth) > 12) {
          throw new RangeError(`month ${rawMonth} out of range for non-leap year ${resolvedYear}`);
        }
      }
      // In reject mode, reject month 13 in non-leap Hebrew year
      if (overflow === 'Reject' && calId === 'hebrew' && rawMonth !== undefined && rawMonthCode === undefined) {
        if (!isHebrewLeapYear(resolvedYear) && _trunc(rawMonth) > 12) {
          throw new RangeError(`month ${rawMonth} out of range for non-leap Hebrew year ${resolvedYear}`);
        }
      }
      // Per spec: PlainYearMonth.from always sets day to 1 for ISO calendar
      if (calId === 'iso8601' || !calId) {
        let m = _trunc(month);
        if (overflow === 'Reject') {
          if (m > 12) throw new RangeError(`month ${m} out of range`);
        } else {
          // Constrain month to 1-12
          m = Math.max(1, Math.min(m, 12));
        }
        return new PlainYearMonth(call(() => new NapiPlainYearMonth(_trunc(resolvedYear), m, cal, 1)));
      }
      // Per spec: day is NOT validated for PlainYearMonth - only year and month matter
      // Constrain month to the actual number of months in the target year
      let constrainedMonth = _trunc(month);
      if (overflow !== 'Reject') {
        // Determine max months for this calendar year
        if (calId === 'hebrew') {
          const maxM = isHebrewLeapYear(resolvedYear) ? 13 : 12;
          constrainedMonth = Math.max(1, Math.min(constrainedMonth, maxM));
        } else if (calId === 'chinese' || calId === 'dangi') {
          const leapBase = getChineseDangiLeapMonth(resolvedYear, calId);
          const maxM = leapBase > 0 ? 13 : 12;
          constrainedMonth = Math.max(1, Math.min(constrainedMonth, maxM));
        } else if (THIRTEEN_MONTH_CALENDARS.has(calId)) {
          constrainedMonth = Math.max(1, Math.min(constrainedMonth, 13));
        } else {
          constrainedMonth = Math.max(1, Math.min(constrainedMonth, 12));
        }
      }
      // Helper: verify that a PlainYearMonth represents a valid calendar month
      // whose first day is within the representable ISO date range.
      function validateYearMonthRange(ymResult: any): void {
        const ymStr = ymResult.toString();
        const m = ymStr.match(/^([+-]?\d{4,6})-(\d{2})-(\d{2})/);
        if (!m) return;
        const rY = parseInt(m[1], 10),
          rM = parseInt(m[2], 10),
          rD = parseInt(m[3], 10);
        // Try to create a PlainDate at the reference ISO date
        try {
          const check = new NapiPlainDate(rY, rM, rD, cal);
          // If the calendar day is not 1, it means the first day of the calendar
          // month is before the minimum representable ISO date
          if (check.day !== 1) {
            throw new RangeError('PlainYearMonth outside representable range');
          }
        } catch {
          // PlainDate creation failed — reference date is outside PlainDate range.
          // This is OK for the MAX boundary (PlainYearMonth has wider range than PlainDate)
          // but NOT OK for the MIN boundary (day 1 must be representable).
          // Check: is the reference date BEFORE the min or AFTER the max?
          if (rY < -271821 || (rY === -271821 && (rM < 4 || (rM === 4 && rD < 19)))) {
            throw new RangeError('PlainYearMonth outside representable range');
          }
          // For dates after max PlainDate: this is fine for PlainYearMonth
        }
      }

      const calYear = _trunc(resolvedYear);

      // Early boundary check at MIN: verify day 1 of the calendar month is not
      // before the minimum representable ISO date. Only check near the min boundary.
      if (calId !== 'iso8601') {
        try {
          const day1Iso = calendarDateToISO(calYear, constrainedMonth, 1, calId);
          // Only reject if day 1 is BEFORE the minimum ISO date
          if (
            day1Iso.isoYear < -271821 ||
            (day1Iso.isoYear === -271821 && (day1Iso.isoMonth < 4 || (day1Iso.isoMonth === 4 && day1Iso.isoDay < 19)))
          ) {
            throw new RangeError('PlainYearMonth outside representable range');
          }
          // Also verify via PlainDate that the ISO coords map to calendar day 1
          try {
            const day1Check = new NapiPlainDate(day1Iso.isoYear, day1Iso.isoMonth, day1Iso.isoDay, cal);
            if (day1Check.day !== 1 || day1Check.month !== constrainedMonth || day1Check.year !== calYear) {
              // Wrong mapping — but only reject if it's a MIN boundary issue
              if (day1Iso.isoYear <= -271820) {
                throw new RangeError('PlainYearMonth outside representable range');
              }
            }
          } catch {
            // PlainDate creation failed. Only reject for MIN boundary.
            if (day1Iso.isoYear <= -271820) {
              throw new RangeError('PlainYearMonth outside representable range');
            }
          }
        } catch (outerErr) {
          if (outerErr instanceof RangeError && outerErr.message === 'PlainYearMonth outside representable range')
            throw outerErr;
          // calendarDateToISO failed — might be MAX boundary, which is OK for PlainYearMonth
        }
      }

      // Use day 1 as the reference day, convert to ISO
      const iso = calendarDateToISO(calYear, constrainedMonth, 1, calId);
      try {
        const ymInner = call(() => new NapiPlainYearMonth(iso.isoYear, iso.isoMonth, cal, iso.isoDay));
        // Verify the result has the correct calendar year+month (calendarDateToISO may
        // return wrong ISO coordinates at extreme dates near the boundary)
        if (ymInner.month !== constrainedMonth || ymInner.year !== calYear) {
          throw new RangeError('boundary mismatch');
        }
        if (calId !== 'iso8601') validateYearMonthRange(ymInner);
        const ymR = new PlainYearMonth(ymInner);
        ymR._calId = calId;
        return ymR;
      } catch (e: any) {
        if (e instanceof RangeError && (e as any).message === 'PlainYearMonth outside representable range') throw e;
        if (!(e instanceof RangeError)) throw e;
        // At extreme date ranges, calendarDateToISO may fail or return wrong
        // coordinates. Fall back: scan valid ISO dates to find one where NAPI
        // returns the target calendar year+month, then construct via IXDTF string
        // (PlainYearMonth uses ISOYearMonthWithinLimits, more relaxed than PlainDate).
        //
        // Determine scan range: always include boundary years and estimated range
        const scanYears = new Set();
        scanYears.add(275760);
        scanYears.add(275759);
        scanYears.add(-271821);
        scanYears.add(-271820);
        const calOffset = CALENDAR_ISO_OFFSETS[calId] || 0;
        for (let delta = -15; delta <= 15; delta++) {
          const est = calYear + calOffset + delta;
          if (est >= -271821 && est <= 275760) scanYears.add(est);
        }
        for (const iy of scanYears) {
          const minM = iy === -271821 ? 4 : 1;
          const maxM = iy === 275760 ? 9 : 12;
          for (let im = minM; im <= maxM; im++) {
            // Try days using NapiPlainYearMonth directly (more relaxed range than
            // PlainDate). Scan from day 1 upward to find the first ISO day that maps
            // to the target calendar month.
            for (let id = 1; id <= 28; id++) {
              try {
                const probe = new NapiPlainYearMonth(iy as number, im, cal, id);
                if (probe.year === calYear && probe.month === constrainedMonth) {
                  // Verify: at the MIN boundary, check that we're at the actual
                  // start of the calendar month (day 1). If the NapiPlainYearMonth's
                  // toString shows a reference ISO date where the calendar day > 1,
                  // it means the calendar month started before the ISO min.
                  if (iy === -271821) {
                    const probeStr = probe.toString();
                    const pmatch = probeStr.match(/^[+-]?\d{4,6}-\d{2}-(\d{2})/);
                    if (pmatch && parseInt(pmatch[1]!, 10) !== id) {
                      // The reference day in the output doesn't match what we requested,
                      // meaning it was clamped — calendar month started before ISO min
                      // Actually just check: try creating a PlainDate at the probe's reference
                      try {
                        const dayCheck = new NapiPlainDate(iy, im, id, cal);
                        if (dayCheck.day !== 1) continue; // Not at calendar day 1 — month started earlier
                      } catch {
                        continue;
                      }
                    }
                  }
                  // Similarly at MAX boundary, verify the reference ISO date is valid
                  if (iy === 275760) {
                    try {
                      new NapiPlainDate(iy, im, id, cal);
                      // For max boundary: we just need ANY day in the month to be valid
                      // (the month's first day is representable somewhere in the ISO range)
                    } catch {
                      /* day beyond PlainDate range but ok for PlainYearMonth */
                    }
                  }
                  try {
                    validateYearMonthRange(probe);
                  } catch {
                    continue;
                  }
                  const ymR = new PlainYearMonth(probe);
                  ymR._calId = calId;
                  return ymR;
                }
              } catch {
                /* skip invalid dates */
              }
            }
          }
        }
        throw new RangeError('Exceeded valid range.');
      }
    }
    throw new TypeError('Invalid argument for PlainYearMonth.from()');
  }

  static compare(one: any, two: any): number {
    const a = toNapiPlainYearMonth(one);
    const b = toNapiPlainYearMonth(two);
    return NapiPlainYearMonth.compare(a, b);
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
  get era() {
    const calId = getRealCalendarId(this);
    const v = this._inner.era;
    if (v === null) return undefined;
    return resolveEraForCalendar(
      calId,
      this._inner.year,
      v,
      this._inner.eraYear,
      this._inner.month,
      (this._inner as any).day,
    ).era;
  }
  get eraYear() {
    const calId = getRealCalendarId(this);
    const v = this._inner.eraYear;
    if (v === null) return undefined;
    return resolveEraForCalendar(
      calId,
      this._inner.year,
      this._inner.era,
      v,
      this._inner.month,
      (this._inner as any).day,
    ).eraYear;
  }
  get daysInYear() {
    return this._inner.daysInYear;
  }
  get daysInMonth() {
    return this._inner.daysInMonth;
  }
  get monthsInYear() {
    return this._inner.monthsInYear;
  }
  get inLeapYear() {
    return this._inner.inLeapYear;
  }
  get calendarId() {
    return getRealCalendarId(this);
  }
  get calendar() {
    return getRealCalendarId(this);
  }

  with(fields: any, options?: any): any {
    requireBranding(this, NapiPlainYearMonth, 'Temporal.PlainYearMonth');
    validateWithFields(fields, null, 'PlainYearMonth');
    const calId = getRealCalendarId(this);
    const calValidEras = VALID_ERAS[calId];
    const calSupportsEras = calValidEras && calValidEras.size > 0;
    // Per spec: read fields in ALPHABETICAL order, each once, coercing immediately
    const _month = fields.month;
    const monthRaw = _month !== undefined ? toInteger(_month) : undefined;
    const _monthCode = fields.monthCode;
    const monthCodeStr = _monthCode !== undefined ? toPrimitiveAndRequireString(_monthCode, 'monthCode') : undefined;
    const _year = fields.year;
    const yearRaw = _year !== undefined ? toInteger(_year) : undefined;
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
    if (_month === undefined && _monthCode === undefined && _year === undefined && !_hasEra && !_hasEraYear) {
      throw new TypeError('At least one recognized property must be provided');
    }
    // Reject Infinity in year/month fields
    if (year !== undefined) rejectInfinity(year, 'year');
    if (eraYear !== undefined) rejectInfinity(eraYear, 'eraYear');
    // Per spec: validate basic field values BEFORE options are read
    if (monthRaw !== undefined && _trunc(monthRaw) < 1) throw new RangeError(`month ${_trunc(monthRaw)} out of range`);
    // Per spec: read overflow option AFTER basic field validation, BEFORE algorithmic validation
    const overflow = extractOverflow(options);
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
      month = monthCodeToMonth(this.monthCode, calId, targetYear);
    }
    // Determine which monthCode is in effect for leap-month validation
    const effectiveMonthCodeYM =
      _monthCode !== undefined ? monthCodeStr : _month === undefined ? this.monthCode : undefined;
    // Per spec: validate field values after reading options
    const tm = _trunc(month);
    if (tm < 1) throw new RangeError(`month ${tm} out of range`);
    // In reject mode, a leap monthCode in a non-leap year is an error
    if (
      overflow === 'Reject' &&
      effectiveMonthCodeYM &&
      !isMonthCodeValidForYear(effectiveMonthCodeYM, calId, targetYear)
    ) {
      throw new RangeError(
        `monthCode ${effectiveMonthCodeYM} is not valid for year ${targetYear} in ${calId} calendar`,
      );
    }
    // For reject mode, validate month is within monthsInYear
    if (overflow === 'Reject') {
      const maxMonth = THIRTEEN_MONTH_CALENDARS.has(calId) ? 13 : 12;
      if (tm > maxMonth) throw new RangeError(`month ${tm} out of range for ${calId} calendar (max ${maxMonth})`);
    } else {
      // Constrain month
      const maxMonth = THIRTEEN_MONTH_CALENDARS.has(calId) ? 13 : 12;
      if (tm > maxMonth) month = maxMonth;
    }
    const cal = toNapiCalendar(calId);
    const iso = calendarDateToISO(targetYear, _trunc(month), 1, calId);
    const ymW = new PlainYearMonth(call(() => new NapiPlainYearMonth(iso.isoYear, iso.isoMonth, cal, iso.isoDay)));
    ymW._calId = calId;
    return ymW;
  }

  add(durationArg: any, options?: any): any {
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    const calId = getRealCalendarId(this);
    return wrapPlainYearMonth(
      call(() => this._inner.add(dur, overflow)),
      calId,
    );
  }

  subtract(durationArg: any, options?: any): any {
    const dur = toNapiDuration(durationArg);
    const overflow = extractOverflow(options);
    const calId = getRealCalendarId(this);
    return wrapPlainYearMonth(
      call(() => this._inner.subtract(dur, overflow)),
      calId,
    );
  }

  until(other: any, options?: any): Duration {
    const otherInner = toNapiPlainYearMonth(other);
    const settings = convertDifferenceSettings(options);
    const calId = getRealCalendarId(this);
    const lu = settings && settings.largestUnit ? settings.largestUnit : 'Month';
    // PlainYearMonth difference uses day 1 for both dates
    if ((lu === 'Year' || lu === 'Month') && !ISO_MONTH_ALIGNED_CALENDARS.has(calId)) {
      // Create PlainDate with day 1 for both by extracting ISO from the inner's toString()
      try {
        const startDate = _ymInnerToPlainDate(this._inner);
        const endDate = _ymInnerToPlainDate(otherInner);
        const dateDiff = calendarDateDifference(startDate, endDate, lu, calId);
        if (dateDiff) {
          return wrapDuration(call(() => new NapiDuration(dateDiff.years, dateDiff.months, 0, 0, 0, 0, 0, 0, 0, 0)));
        }
      } catch {
        /* fallthrough to NAPI */
      }
    }
    return wrapDuration(call(() => this._inner.until(otherInner, settings)));
  }

  since(other: any, options?: any): Duration {
    const otherInner = toNapiPlainYearMonth(other);
    const settings = convertDifferenceSettings(options);
    const calId = getRealCalendarId(this);
    const lu = settings && settings.largestUnit ? settings.largestUnit : 'Month';
    if ((lu === 'Year' || lu === 'Month') && !ISO_MONTH_ALIGNED_CALENDARS.has(calId)) {
      try {
        const startDate = _ymInnerToPlainDate(this._inner);
        const endDate = _ymInnerToPlainDate(otherInner);
        const dateDiff = calendarDateDifference(startDate, endDate, lu, calId);
        if (dateDiff) {
          return wrapDuration(call(() => new NapiDuration(-dateDiff.years, -dateDiff.months, 0, 0, 0, 0, 0, 0, 0, 0)));
        }
      } catch {
        /* fallthrough to NAPI */
      }
    }
    return wrapDuration(call(() => this._inner.since(otherInner, settings)));
  }

  equals(other: any): boolean {
    const otherInner = toNapiPlainYearMonth(other);
    return this._inner.equals(otherInner);
  }

  toPlainDate(fields: any): PlainDate {
    requireBranding(this, NapiPlainYearMonth, 'Temporal.PlainYearMonth');
    if (typeof fields !== 'object' || fields === null) {
      throw new TypeError('day is required');
    }
    const _day = fields.day;
    if (_day === undefined) {
      throw new TypeError('day is required');
    }
    const dayVal = toIntegerWithTruncation(_day);
    rejectInfinity(dayVal, 'day');
    const calId = getRealCalendarId(this);
    const cal = toNapiCalendar(calId);
    const iso = calendarDateToISO(this.year, this.month, dayVal, calId);
    return wrapPlainDate(
      call(() => new NapiPlainDate(iso.isoYear, iso.isoMonth, iso.isoDay, cal)),
      calId,
    );
  }

  toString(options?: any): string {
    if (options !== undefined) validateOptions(options);
    const dc = options ? mapDisplayCalendar(options.calendarName) : undefined;
    return this._inner.toString(dc);
  }

  toJSON() {
    requireBranding(this, NapiPlainYearMonth, 'Temporal.PlainYearMonth');
    return this.toString();
  }
  toLocaleString(locales?: any, options?: any): string {
    requireBranding(this, NapiPlainYearMonth, 'Temporal.PlainYearMonth');
    if (options !== undefined && options !== null && typeof options === 'object') {
      if (options.timeStyle !== undefined) {
        throw new TypeError('timeStyle option is not allowed for PlainYearMonth.toLocaleString()');
      }
    }
    // Per spec: calendar mismatch check (PlainYearMonth: ISO calendar also mismatches)
    const calId = this.calendarId;
    // Resolve the effective calendar from locale + options
    const resolvedCal = new Intl.DateTimeFormat(
      locales,
      options && typeof options === 'object' ? { calendar: options.calendar } : undefined,
    ).resolvedOptions().calendar;
    if (calId !== resolvedCal && calId !== 'iso8601') {
      throw new RangeError(`Calendar ${calId} does not match locale calendar ${resolvedCal}`);
    }
    if (calId === 'iso8601' && resolvedCal !== 'iso8601') {
      throw new RangeError(`ISO 8601 calendar does not match locale calendar ${resolvedCal}`);
    }
    const ms = _temporalToEpochMs(this);
    if (ms !== undefined) {
      let opts: any;
      if (options !== undefined && options !== null && typeof options === 'object') {
        opts = Object.assign({}, options);
      } else {
        opts = {};
      }
      opts.timeZone = 'UTC';
      // Per spec: PlainYearMonth must not display the reference day.
      // Convert dateStyle to equivalent year+month component options,
      // but only if no conflicting component options are present (let Intl throw TypeError for conflicts).
      if (opts.dateStyle !== undefined) {
        const hasConflict =
          opts.month !== undefined ||
          opts.day !== undefined ||
          opts.year !== undefined ||
          opts.weekday !== undefined ||
          opts.hour !== undefined ||
          opts.minute !== undefined ||
          opts.second !== undefined ||
          opts.era !== undefined;
        if (!hasConflict) {
          const style = opts.dateStyle;
          delete opts.dateStyle;
          if (style === 'full' || style === 'long' || style === 'medium') {
            opts.year = 'numeric';
            opts.month = 'long';
          } else {
            opts.year = 'numeric';
            opts.month = 'numeric';
          }
        }
      }
      // Per spec: if no date/time component options, add year+month defaults for PlainYearMonth
      if (!_hasDateTimeOptions(opts)) {
        opts.year = 'numeric';
        opts.month = 'numeric';
      }
      const dtf = new Intl.DateTimeFormat(locales, opts);
      if (_origFormatGetter) {
        return _origFormatGetter.call(dtf)(ms);
      }
      return dtf.format(ms);
    }
    return this.toString();
  }

  valueOf() {
    throw new TypeError('Use Temporal.PlainYearMonth.compare() to compare Temporal.PlainYearMonth');
  }

  // Symbol.toStringTag defined as data property below

  static [Symbol.hasInstance](v: any): boolean {
    return (
      v !== null && v !== undefined && typeof v === 'object' && '_inner' in v && v._inner instanceof NapiPlainYearMonth
    );
  }
}

_classes['PlainYearMonth'] = PlainYearMonth;

export { PlainYearMonth };
