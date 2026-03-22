// PlainMonthDay class extracted from temporal.ts

import { NapiPlainDate, NapiPlainMonthDay, type NapiPlainMonthDayT } from './binding';
import {
  call,
  _wrapperSet,
  _isTemporalPlainMonthDay,
  toIntegerWithTruncation,
  toInteger,
  requireBranding,
  validateOptions,
  validateWithFields,
  wrapPlainDate,
  toPrimitiveAndRequireString,
  validateMonthCodeSyntax,
  _trunc,
  _classes,
  getRealCalendarId,
  extractOverflow,
  rejectInfinity,
  rejectTooManyFractionalSeconds,
  rejectISODateRange,
} from './helpers';
import { _hasDateTimeOptions, _temporalToEpochMs, _origFormatGetter } from './intl';
import { mapDisplayCalendar } from './enums';
import { toNapiCalendar, toNapiPlainMonthDay, _convertClasses } from './convert';
import {
  canonicalizeCalendarId,
  rejectISOStringAsCalendar,
  getCalendarId,
  VALID_ERAS,
  resolveEraYear,
  calendarDateToISO,
  calendarDaysInMonth,
  _getMaxMonthForCalendarYear,
  _getMonthCodeForOrdinal,
  isHebrewLeapYear,
  getChineseDangiLeapMonth,
  ISO_MONTH_ALIGNED_CALENDARS,
  _defaultCalendarRefYear,
  monthCodeToMonth,
} from './calendar';

import type { PlainDate } from './plaindate';

class PlainMonthDay {
  _inner!: NapiPlainMonthDayT;
  _calId?: string;
  constructor(month: any, day?: any, calendar?: any, referenceYear?: any) {
    if (month instanceof NapiPlainMonthDay) {
      this._inner = month;
    } else {
      const m = toIntegerWithTruncation(month);
      const d = toIntegerWithTruncation(day);
      // Per spec: validate calendar BEFORE coercing referenceYear
      rejectISOStringAsCalendar(calendar);
      const cal = toNapiCalendar(calendar);
      const ry = referenceYear !== undefined ? toIntegerWithTruncation(referenceYear) : referenceYear;
      // Per spec: constructor always rejects out-of-range ISO values
      if (ry !== undefined) rejectISODateRange(ry, m, d);
      else if (m < 1 || m > 12 || d < 1 || d > 31) throw new RangeError('Month/day out of range');
      this._inner = call(() => new NapiPlainMonthDay(m, d, cal, ry));
      if (typeof calendar === 'string') this._calId = canonicalizeCalendarId(calendar);
    }
    _wrapperSet.add(this);
  }

  static from(arg: any, options?: any): any {
    if (typeof arg === 'string') {
      rejectTooManyFractionalSeconds(arg);
      const inner = call(() => NapiPlainMonthDay.from(arg));
      if (options !== undefined) {
        validateOptions(options);
        extractOverflow(options);
      }
      return new PlainMonthDay(inner);
    }
    validateOptions(options);
    if (_isTemporalPlainMonthDay(arg)) {
      if (options !== undefined) extractOverflow(options);
      return new PlainMonthDay(arg._inner);
    }
    if (typeof arg === 'object' && arg !== null) {
      // Per spec: read calendar first
      const _calRaw = arg.calendar;
      const mdFromCalId = getCalendarId(_calRaw);
      const cal = toNapiCalendar(_calRaw);
      // Per spec: read fields in ALPHABETICAL order, each once, coercing immediately
      const _day = arg.day;
      const dayVal = _day !== undefined ? toIntegerWithTruncation(_day) : undefined;
      const _month = arg.month;
      const monthVal = _month !== undefined ? toIntegerWithTruncation(_month) : undefined;
      const _monthCode = arg.monthCode;
      const monthCodeStr = _monthCode !== undefined ? toPrimitiveAndRequireString(_monthCode, 'monthCode') : undefined;
      // Per spec: validate monthCode syntax BEFORE subsequent field reads
      const hasMonthCode = monthCodeStr !== undefined;
      if (hasMonthCode) {
        validateMonthCodeSyntax(monthCodeStr);
      }
      const _year = arg.year;
      const yearVal = _year !== undefined ? toIntegerWithTruncation(_year) : undefined;
      // Per spec: read options AFTER fields
      const overflow = extractOverflow(options);
      if (dayVal === undefined) throw new TypeError('Required property day is missing or undefined');
      if (_month === undefined && !hasMonthCode) throw new TypeError('Required property monthCode is missing');
      if (yearVal !== undefined) rejectInfinity(yearVal, 'year');
      // Per spec: era and eraYear must come together for calendars that support eras
      const calValidErasForMD = VALID_ERAS[mdFromCalId];
      const calSupportsErasForMD = calValidErasForMD && calValidErasForMD.size > 0;
      if (calSupportsErasForMD && (arg.era !== undefined) !== (arg.eraYear !== undefined)) {
        throw new TypeError('era and eraYear must be provided together');
      }
      // Resolve era/eraYear to year, and check for conflicts
      if (calSupportsErasForMD && arg.era !== undefined && arg.eraYear !== undefined) {
        const eraYearNum = toInteger(arg.eraYear);
        if (eraYearNum !== undefined) rejectInfinity(eraYearNum, 'eraYear');
        const eraOnlyFields: any = { era: arg.era, eraYear: eraYearNum };
        resolveEraYear(eraOnlyFields, mdFromCalId);
        if (yearVal !== undefined && eraOnlyFields.year !== undefined && _trunc(yearVal) !== eraOnlyFields.year) {
          throw new RangeError(
            `year ${yearVal} does not match era ${arg.era} eraYear ${arg.eraYear} (expected ${eraOnlyFields.year})`,
          );
        }
      }
      let month = monthVal;
      if (month !== undefined) rejectInfinity(month, 'month');
      const day = dayVal;
      if (day !== undefined) rejectInfinity(day, 'day');
      // Per spec: for Chinese/Dangi/Hebrew/Islamic, year is required in specific cases:
      // - When month is provided without monthCode, year is needed to resolve the ordinal month
      // - When month and monthCode both provided, year is needed to check if they agree
      // Missing year TypeError must come before month/monthCode conflict RangeError
      const YEAR_REQUIRED_CALENDARS = new Set([
        'chinese',
        'dangi',
        'hebrew',
        'islamic-civil',
        'islamic-tbla',
        'islamic-umalqura',
        'islamic-rgsa',
      ]);
      if (YEAR_REQUIRED_CALENDARS.has(mdFromCalId) && yearVal === undefined && month !== undefined && hasMonthCode) {
        // Both month and monthCode provided but no year - year is needed to check agreement
        throw new TypeError(`year is required for PlainMonthDay with calendar '${mdFromCalId}'`);
      }
      // Per spec: for non-ISO calendars, need either monthCode OR month+year
      if (mdFromCalId && mdFromCalId !== 'iso8601' && !hasMonthCode) {
        if (_month === undefined || yearVal === undefined) {
          throw new TypeError(
            `monthCode is required for PlainMonthDay with calendar '${mdFromCalId}' (or provide month and year)`,
          );
        }
      }
      // Determine the effective monthCode for reference year searching
      let effectiveMonthCode;
      if (hasMonthCode) {
        effectiveMonthCode = monthCodeStr;
        // For PlainMonthDay, resolve monthCode using the reference year context
        const mcRefYear =
          yearVal !== undefined
            ? _trunc(yearVal)
            : mdFromCalId && mdFromCalId !== 'iso8601' && !ISO_MONTH_ALIGNED_CALENDARS.has(mdFromCalId)
              ? _defaultCalendarRefYear(mdFromCalId)
              : undefined;
        const fromCode = monthCodeToMonth(monthCodeStr, mdFromCalId, mcRefYear);
        if (month !== undefined && _trunc(month) !== fromCode) {
          throw new RangeError(`month ${month} and monthCode ${monthCodeStr} do not agree`);
        }
        month = fromCode;
        // Per spec: when year is provided and monthCode is a leap month that doesn't exist
        // in that year, reject mode should throw and constrain mode should use the base month.
        if (yearVal !== undefined && monthCodeStr.endsWith('L')) {
          const mcMonth = parseInt(monthCodeStr.slice(1, 3), 10);
          let yearHasLeap = false;
          if (mdFromCalId === 'chinese' || mdFromCalId === 'dangi') {
            const leapBase = getChineseDangiLeapMonth(_trunc(yearVal), mdFromCalId);
            yearHasLeap = leapBase === mcMonth;
          } else if (mdFromCalId === 'hebrew') {
            yearHasLeap = isHebrewLeapYear(_trunc(yearVal)) && mcMonth === 5;
          }
          if (!yearHasLeap) {
            if (overflow === 'Reject') {
              throw new RangeError(
                `monthCode ${monthCodeStr} does not exist in year ${yearVal} for ${mdFromCalId} calendar`,
              );
            }
            // Constrain: use the non-leap base month
            effectiveMonthCode = monthCodeStr.slice(0, -1); // "M01L" -> "M01"
          }
        }
      } else if (
        yearVal !== undefined &&
        month !== undefined &&
        mdFromCalId &&
        mdFromCalId !== 'iso8601' &&
        !ISO_MONTH_ALIGNED_CALENDARS.has(mdFromCalId)
      ) {
        // When month+year is provided without monthCode for non-aligned calendars,
        // determine the actual monthCode from the (year, ordinal month) pair
        effectiveMonthCode = _getMonthCodeForOrdinal(_trunc(yearVal), _trunc(month), mdFromCalId);
      }
      // Per spec: for ISO calendar, validate day range using the provided year (or 1972)
      // but always store referenceISOYear as 1972
      if (mdFromCalId === 'iso8601' || !mdFromCalId) {
        const checkYear = yearVal !== undefined ? _trunc(yearVal) : 1972;
        let checkMonth = _trunc(month);
        let checkDay = _trunc(day);
        // Per spec: month ≤ 0 and day ≤ 0 always reject regardless of overflow
        if (checkMonth < 1) throw new RangeError(`month ${checkMonth} out of range`);
        if (checkDay < 1) throw new RangeError(`day ${checkDay} out of range`);
        if (overflow === 'Reject') {
          // Validate that the day is valid for the month
          rejectISODateRange(checkYear, checkMonth, checkDay);
        } else {
          // Constrain: clamp month and day to valid range using the provided year
          if (checkMonth > 12) checkMonth = 12;
          const daysInMonth = [
            31,
            checkYear % 4 === 0 && (checkYear % 100 !== 0 || checkYear % 400 === 0) ? 29 : 28,
            31,
            30,
            31,
            30,
            31,
            31,
            30,
            31,
            30,
            31,
          ];
          if (checkDay > daysInMonth[checkMonth - 1]!) checkDay = daysInMonth[checkMonth - 1]!;
        }
        // Always use 1972 as reference year for ISO calendar
        return new PlainMonthDay(call(() => new NapiPlainMonthDay(checkMonth, checkDay, cal, 1972)));
      }
      // Non-ISO calendars: convert calendar coords to ISO
      let calDay = _trunc(day);
      let calMonth = _trunc(month);
      if (calDay < 1) throw new RangeError(`day ${calDay} out of range`);
      if (calMonth < 1) throw new RangeError(`month ${calMonth} out of range`);
      // Use year for reference if provided
      const refCalYear = yearVal !== undefined ? _trunc(yearVal) : undefined;
      // Per spec: if the provided year converts to an ISO year outside the representable
      // range, throw RangeError immediately (don't try to find a reference year)
      if (refCalYear !== undefined) {
        // Estimate the ISO year using known calendar offsets
        let estimatedIsoYear = refCalYear;
        if (mdFromCalId === 'buddhist') estimatedIsoYear = refCalYear - 543;
        else if (mdFromCalId === 'roc') estimatedIsoYear = refCalYear + 1911;
        else if (mdFromCalId === 'coptic') estimatedIsoYear = refCalYear + 284;
        else if (mdFromCalId === 'ethioaa') estimatedIsoYear = refCalYear - 5492;
        else if (mdFromCalId === 'ethiopic' || mdFromCalId === 'ethiopian') estimatedIsoYear = refCalYear + 8;
        else if (mdFromCalId === 'indian') estimatedIsoYear = refCalYear + 78;
        else if (mdFromCalId === 'persian') estimatedIsoYear = refCalYear + 621;
        else if (mdFromCalId === 'hebrew') estimatedIsoYear = refCalYear - 3760;
        else if (
          mdFromCalId === 'islamic-civil' ||
          mdFromCalId === 'islamic-tbla' ||
          mdFromCalId === 'islamic-umalqura' ||
          mdFromCalId === 'islamic-rgsa'
        ) {
          estimatedIsoYear = Math.round(622 + (refCalYear * 354) / 365);
        }
        // Use a generous margin (±100 years) to avoid false positives for calendars
        // where the offset estimate is approximate
        if (estimatedIsoYear < -272000 || estimatedIsoYear > 276000) {
          throw new RangeError(`year ${refCalYear} is out of range for ${mdFromCalId} calendar`);
        }
      }
      // Also check era/eraYear-resolved year for out-of-range
      if (refCalYear === undefined && calSupportsErasForMD && arg.era !== undefined && arg.eraYear !== undefined) {
        const eraFields: any = { era: arg.era, eraYear: toInteger(arg.eraYear) };
        resolveEraYear(eraFields, mdFromCalId);
        if (eraFields.year !== undefined) {
          let estimatedIsoEra = eraFields.year;
          if (mdFromCalId === 'buddhist') estimatedIsoEra = (eraFields.year as number) - 543;
          else if (mdFromCalId === 'roc') estimatedIsoEra = (eraFields.year as number) + 1911;
          else if (mdFromCalId === 'coptic') estimatedIsoEra = (eraFields.year as number) + 284;
          else if (mdFromCalId === 'ethioaa') estimatedIsoEra = (eraFields.year as number) - 5492;
          else if (mdFromCalId === 'ethiopic' || mdFromCalId === 'ethiopian')
            estimatedIsoEra = (eraFields.year as number) + 8;
          else if (mdFromCalId === 'indian') estimatedIsoEra = (eraFields.year as number) + 78;
          else if (mdFromCalId === 'persian') estimatedIsoEra = (eraFields.year as number) + 621;
          else if (mdFromCalId === 'hebrew') estimatedIsoEra = eraFields.year - 3760;
          else if (
            mdFromCalId === 'islamic-civil' ||
            mdFromCalId === 'islamic-tbla' ||
            mdFromCalId === 'islamic-umalqura' ||
            mdFromCalId === 'islamic-rgsa'
          ) {
            estimatedIsoEra = Math.round(622 + (eraFields.year * 354) / 365);
          }
          if (estimatedIsoEra < -272000 || estimatedIsoEra > 276000) {
            throw new RangeError(`eraYear ${arg.eraYear} era ${arg.era} is out of range for ${mdFromCalId} calendar`);
          }
        }
      }
      // Constrain or reject month based on the year's monthsInYear
      if (refCalYear !== undefined) {
        const maxMonth = _getMaxMonthForCalendarYear(mdFromCalId, refCalYear);
        if (calMonth > maxMonth) {
          if (overflow === 'Reject') {
            throw new RangeError(
              `month ${calMonth} out of range for ${mdFromCalId} calendar year ${refCalYear} (max ${maxMonth})`,
            );
          }
          calMonth = maxMonth;
          // Recompute effectiveMonthCode after constraining
          effectiveMonthCode = _getMonthCodeForOrdinal(refCalYear, calMonth, mdFromCalId);
        }
      }
      // Determine daysInMonth for overflow handling using the provided year
      if (refCalYear !== undefined) {
        const dim = calendarDaysInMonth(refCalYear, calMonth, mdFromCalId);
        if (dim !== undefined) {
          if (overflow === 'Reject' && calDay > dim) {
            throw new RangeError(`day ${calDay} out of range for month ${calMonth} (max ${dim})`);
          }
          calDay = Math.min(calDay, dim);
        }
        // Per spec: year is only used for validation; reference ISO year should still be ~1972
        // Fall through to the no-year path to pick the best reference year
      }
      // No year provided: use a default reference year for conversion and validation
      if (ISO_MONTH_ALIGNED_CALENDARS.has(mdFromCalId)) {
        // For month-aligned calendars, ISO month = calendar month, use 1972 as ref
        const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        const maxDay = calMonth >= 1 && calMonth <= 12 ? daysInMonth[calMonth - 1]! : 31;
        if (overflow === 'Reject' && calDay > maxDay) {
          throw new RangeError(`day ${calDay} out of range for month ${calMonth} (max ${maxDay})`);
        }
        calDay = Math.min(calDay, maxDay);
        return new PlainMonthDay(call(() => new NapiPlainMonthDay(calMonth, calDay, cal, 1972)));
      }
      // For non-aligned calendars, we must convert through calendarDateToISO
      // Per spec: reference ISO year should be the latest ISO year ≤ 1972 where the date exists
      // For leap month codes (e.g. M05L), we need to find a year where that monthCode exists
      let targetMonthCode = effectiveMonthCode || (hasMonthCode ? arg.monthCode : undefined);
      let isLeapMonthCode = targetMonthCode && targetMonthCode.endsWith('L');

      // Per spec Table 6: Chinese/Dangi leap month constraining
      // Only M03L, M04L, M05L, M06L, M07L can have day 30.
      // M01L, M02L, M08L-M12L never have day 30 in the reference range.
      // M01L and M12L never occur at all in the accurate calculation range.
      if (isLeapMonthCode && (mdFromCalId === 'chinese' || mdFromCalId === 'dangi')) {
        const leapMonthNum = parseInt(targetMonthCode.slice(1, 3), 10);
        const LEAP_MONTHS_WITH_30_DAYS = new Set([3, 4, 5, 6, 7]);
        const NONEXISTENT_LEAP_MONTHS = new Set([1, 12]); // never occur in accurate range
        if (NONEXISTENT_LEAP_MONTHS.has(leapMonthNum)) {
          // Per spec: M01L and M12L never occur. Constrain to non-leap, or reject.
          if (overflow === 'Reject') {
            throw new RangeError(`monthCode ${targetMonthCode} does not exist for ${mdFromCalId} calendar`);
          }
          targetMonthCode = targetMonthCode.slice(0, -1); // M01L -> M01
          isLeapMonthCode = false;
          effectiveMonthCode = targetMonthCode;
        } else if (!LEAP_MONTHS_WITH_30_DAYS.has(leapMonthNum) && calDay >= 30) {
          // This leap month never has 30 days in the reference range.
          // Constrain day >= 30 to day 30 of the non-leap month, or reject.
          if (overflow === 'Reject') {
            throw new RangeError(`day ${calDay} out of range for ${targetMonthCode} (max 29)`);
          }
          targetMonthCode = targetMonthCode.slice(0, -1); // M08L -> M08
          isLeapMonthCode = false;
          effectiveMonthCode = targetMonthCode;
          calDay = 30;
          // Recompute month for the non-leap monthCode
          month = monthCodeToMonth(targetMonthCode, mdFromCalId, _defaultCalendarRefYear(mdFromCalId));
        }
      }
      const baseRefYear = _defaultCalendarRefYear(mdFromCalId, calMonth);
      // Try multiple calendar years around the base to find the best match:
      // - ISO year ≤ 1972 (required by spec)
      // - Day must fit (calDay <= daysInMonth)
      // - Latest ISO year (closest to 1972) among years where day fits
      // - For leap month codes, the year must actually have that leap month
      // Track max daysInMonth across ALL candidate years for overflow validation
      // Collect all candidate calendar years, their daysInMonth, and ISO dates
      const candidates = [];
      let maxDim = 0;
      // Chinese/Dangi leap months can be rare (e.g. M02L occurs every ~19+ years)
      // Need wide search range to find the latest ISO year <= 1972 with the given monthCode
      // Regular months can also vary in daysInMonth, so use wider range for those too
      const searchRange =
        mdFromCalId === 'chinese' || mdFromCalId === 'dangi' ? (isLeapMonthCode ? 80 : 15) : isLeapMonthCode ? 40 : 5;
      for (let yOff = -searchRange; yOff <= searchRange; yOff++) {
        const tryCalYear = baseRefYear + yOff;
        // For leap month codes, check that this year actually has the leap month
        if (isLeapMonthCode) {
          if (mdFromCalId === 'hebrew') {
            if (!isHebrewLeapYear(tryCalYear)) continue;
          } else if (mdFromCalId === 'chinese' || mdFromCalId === 'dangi') {
            const leapBase = getChineseDangiLeapMonth(tryCalYear, mdFromCalId);
            const mcMonthNum = parseInt(targetMonthCode.slice(1, 3), 10);
            if (leapBase !== mcMonthNum) continue;
          }
        }
        // Compute the month number for this specific year
        const yearMonth = targetMonthCode ? monthCodeToMonth(targetMonthCode, mdFromCalId, tryCalYear) : calMonth;
        const dim = calendarDaysInMonth(tryCalYear, yearMonth, mdFromCalId);
        if (dim === undefined) continue;
        if (dim > maxDim) maxDim = dim;
        candidates.push({ tryCalYear, yearMonth, dim });
      }
      // Constrain day to max possible for this monthCode across all years
      const constrainedDay = Math.min(calDay, maxDim || calDay);
      // Overflow check
      if (overflow === 'Reject' && calDay > maxDim) {
        throw new RangeError(`day ${calDay} out of range for month ${calMonth} (max ${maxDim})`);
      }
      // Leap month constraining: if a leap month code doesn't have enough days
      // (e.g. M02L max is 29 but day=30), and the base month (M02) can hold the day,
      // constrain to the base month. This only applies when the base month has more days
      // than the leap month for the requested day.
      if (isLeapMonthCode && overflow !== 'Reject' && calDay > maxDim && maxDim > 0) {
        const baseMonthCode = targetMonthCode.slice(0, 3); // e.g. "M02L" -> "M02"
        // Check if the base month can hold the requested day (or at least more than maxDim)
        // Find max days in base month across candidate years
        let baseMaxDim = 0;
        for (let yOff = -searchRange; yOff <= searchRange; yOff++) {
          const tryCalYear = baseRefYear + yOff;
          const yearMonth = monthCodeToMonth(baseMonthCode, mdFromCalId, tryCalYear);
          const dim = calendarDaysInMonth(tryCalYear, yearMonth, mdFromCalId);
          if (dim !== undefined && dim > baseMaxDim) baseMaxDim = dim;
        }
        if (baseMaxDim > maxDim) {
          // Base month has more days — fall back to base month with the requested day
          return PlainMonthDay.from(
            { calendar: mdFromCalId, monthCode: baseMonthCode, day: calDay },
            { overflow: 'constrain' },
          );
        }
        // Otherwise, stay in the leap month and constrain day within it
      }
      // Now find the latest ISO year <= 1972 where (monthCode, constrainedDay) exists
      // If no such year exists (rare leap months), find the earliest ISO year > 1972
      let bestIso = null;
      let bestIsoAfter1972 = null; // earliest ISO year > 1972 as fallback
      for (const c of candidates) {
        if (constrainedDay > c.dim) continue; // day doesn't fit in this year
        const tryIso = calendarDateToISO(c.tryCalYear, c.yearMonth, constrainedDay, mdFromCalId);
        // Verify monthCode
        if (targetMonthCode) {
          try {
            const verifyDate = new NapiPlainDate(tryIso.isoYear, tryIso.isoMonth, tryIso.isoDay, cal);
            if (verifyDate.monthCode !== targetMonthCode) continue;
          } catch {
            continue;
          }
        }
        if (tryIso.isoYear <= 1972) {
          if (
            !bestIso ||
            tryIso.isoYear > bestIso.isoYear ||
            (tryIso.isoYear === bestIso.isoYear &&
              (tryIso.isoMonth > bestIso.isoMonth ||
                (tryIso.isoMonth === bestIso.isoMonth && tryIso.isoDay > bestIso.isoDay)))
          ) {
            bestIso = { ...tryIso, calYear: c.tryCalYear, dim: c.dim, yearMonth: c.yearMonth };
          }
        } else {
          // Track earliest year after 1972 as fallback for rare leap months
          if (
            !bestIsoAfter1972 ||
            tryIso.isoYear < bestIsoAfter1972.isoYear ||
            (tryIso.isoYear === bestIsoAfter1972.isoYear &&
              (tryIso.isoMonth < bestIsoAfter1972.isoMonth ||
                (tryIso.isoMonth === bestIsoAfter1972.isoMonth && tryIso.isoDay < bestIsoAfter1972.isoDay)))
          ) {
            bestIsoAfter1972 = { ...tryIso, calYear: c.tryCalYear, dim: c.dim, yearMonth: c.yearMonth };
          }
        }
      }
      // If no year <= 1972 found, use earliest year > 1972 (for rare leap months like M09L, M10L, M11L)
      if (!bestIso && bestIsoAfter1972) {
        bestIso = bestIsoAfter1972;
      }
      if (!bestIso) {
        // Fallback: find any candidate even if day doesn't fit perfectly
        for (const c of candidates) {
          const tryDay = Math.min(constrainedDay, c.dim);
          const tryIso = calendarDateToISO(c.tryCalYear, c.yearMonth, tryDay, mdFromCalId);
          if (!bestIso || tryIso.isoYear <= 1972) {
            bestIso = { ...tryIso, calYear: c.tryCalYear, dim: c.dim, yearMonth: c.yearMonth };
            if (tryIso.isoYear <= 1972) break;
          }
        }
        if (!bestIso) {
          // Last resort fallback
          const dim0 = calendarDaysInMonth(baseRefYear, calMonth, mdFromCalId) || 31;
          const clampedDay0 = Math.min(constrainedDay, dim0);
          const fallback = calendarDateToISO(baseRefYear, calMonth, clampedDay0, mdFromCalId);
          bestIso = { ...fallback, calYear: baseRefYear, dim: dim0, yearMonth: calMonth };
        }
      }
      return new PlainMonthDay(
        call(() => new NapiPlainMonthDay(bestIso.isoMonth, bestIso.isoDay, cal, bestIso.isoYear)),
      );
    }
    throw new TypeError('Invalid argument for PlainMonthDay.from()');
  }

  get monthCode() {
    return this._inner.monthCode;
  }
  get day() {
    return this._inner.day;
  }
  get calendarId() {
    return getRealCalendarId(this);
  }
  get calendar() {
    return getRealCalendarId(this);
  }

  with(fields: any, options?: any): any {
    requireBranding(this, NapiPlainMonthDay, 'Temporal.PlainMonthDay');
    validateWithFields(fields, null, 'PlainMonthDay');
    const calId = getRealCalendarId(this);
    const cal = toNapiCalendar(calId);
    // Per spec: read fields in ALPHABETICAL order, each once, coercing immediately
    const _day = fields.day;
    const day = _day !== undefined ? toInteger(_day) : this.day;
    const _month = fields.month;
    let month = _month !== undefined ? toInteger(_month) : undefined;
    const _monthCode = fields.monthCode;
    const monthCodeStr = _monthCode !== undefined ? toPrimitiveAndRequireString(_monthCode, 'monthCode') : undefined;
    const _year = fields.year;
    const _yearNum = _year !== undefined ? toInteger(_year) : undefined;
    if (_yearNum !== undefined) rejectInfinity(_yearNum, 'year');
    // Check at least one recognized field was provided
    if (_day === undefined && _month === undefined && _monthCode === undefined && _year === undefined) {
      throw new TypeError('At least one recognized property must be provided');
    }
    if (month !== undefined) rejectInfinity(month, 'month');
    rejectInfinity(day, 'day');
    // Per spec: validate basic field values BEFORE options are read
    const td = _trunc(day);
    if (td < 1) throw new RangeError(`day ${td} out of range`);
    if (month !== undefined && _trunc(month) < 1) throw new RangeError(`month ${_trunc(month)} out of range`);
    // Per spec: read overflow option AFTER basic field validation, BEFORE algorithmic validation
    const overflow = extractOverflow(options);
    // Per spec: for non-ISO calendars, month alone is insufficient - need monthCode
    if (calId !== 'iso8601' && calId) {
      if (month !== undefined && _monthCode === undefined) {
        throw new TypeError(
          `monthCode is required for PlainMonthDay.with() with calendar '${calId}' (month alone is insufficient)`,
        );
      }
    }
    let effectiveMonthCode;
    if (_monthCode !== undefined) {
      effectiveMonthCode = monthCodeStr;
      const fromCode = monthCodeToMonth(monthCodeStr, calId);
      if (month !== undefined && _trunc(month) !== fromCode) {
        throw new RangeError(`month ${month} and monthCode ${monthCodeStr} do not agree`);
      }
      month = fromCode;
    }
    if (month === undefined) {
      effectiveMonthCode = this.monthCode;
      const code = this.monthCode;
      const m = code.match(/^M(\d{2})L?$/);
      if (m) month = parseInt(m[1]!, 10);
    }
    if (effectiveMonthCode === undefined) effectiveMonthCode = this.monthCode;
    // For ISO calendar, apply overflow using year (if provided) to constrain day
    if (calId === 'iso8601' || !calId) {
      const yearForOverflow = _yearNum !== undefined ? _trunc(_yearNum) : 1972;
      let constrainedMonth = _trunc(month);
      let constrainedDay = _trunc(day);
      if (overflow === 'Reject') {
        rejectISODateRange(yearForOverflow, constrainedMonth, constrainedDay);
      } else {
        if (constrainedMonth > 12) constrainedMonth = 12;
        const daysInMonth = [
          31,
          yearForOverflow % 4 === 0 && (yearForOverflow % 100 !== 0 || yearForOverflow % 400 === 0) ? 29 : 28,
          31,
          30,
          31,
          30,
          31,
          31,
          30,
          31,
          30,
          31,
        ];
        if (constrainedDay > daysInMonth[constrainedMonth - 1]!) constrainedDay = daysInMonth[constrainedMonth - 1]!;
      }
      return new PlainMonthDay(call(() => new NapiPlainMonthDay(constrainedMonth, constrainedDay, cal, 1972)));
    }
    // Non-ISO calendars: use PlainMonthDay.from to properly resolve reference year
    return PlainMonthDay.from(
      { monthCode: effectiveMonthCode, day: td, calendar: calId },
      { overflow: overflow === 'Reject' ? 'reject' : 'constrain' },
    );
  }

  equals(other: any): boolean {
    const otherInner = toNapiPlainMonthDay(other);
    return this._inner.equals(otherInner);
  }

  toPlainDate(fields: any): PlainDate {
    requireBranding(this, NapiPlainMonthDay, 'Temporal.PlainMonthDay');
    if (typeof fields !== 'object' || fields === null) {
      throw new TypeError('year is required');
    }
    const calId = this.calendarId;
    const calValidEras = VALID_ERAS[calId];
    const calSupportsEras = calValidEras && calValidEras.size > 0;
    // Per spec: read fields once in alphabetical order
    const _year = fields.year;
    const yearCoerced = _year !== undefined ? toIntegerWithTruncation(_year) : undefined;
    // For calendars with eras, accept era+eraYear as alternative to year
    let _era, _eraYear;
    if (calSupportsEras) {
      _era = fields.era;
      _eraYear = fields.eraYear;
    }
    if (_year === undefined && !(calSupportsEras && _era !== undefined && _eraYear !== undefined)) {
      throw new TypeError('year is required');
    }
    // Handle era/eraYear
    const resolvedFields: any = { year: yearCoerced };
    if (calSupportsEras) {
      resolvedFields.era = _era;
      resolvedFields.eraYear = _eraYear !== undefined ? toIntegerWithTruncation(_eraYear) : undefined;
      if (resolvedFields.eraYear !== undefined) rejectInfinity(resolvedFields.eraYear, 'eraYear');
    }
    resolveEraYear(resolvedFields, calId);
    const yearVal = resolvedFields.year !== undefined ? resolvedFields.year : yearCoerced;
    rejectInfinity(yearVal, 'year');
    // Get month from monthCode, accounting for leap year shifts
    const code = this.monthCode;
    const month = monthCodeToMonth(code, calId, yearVal);
    const cal = toNapiCalendar(calId);
    const iso = calendarDateToISO(yearVal, month, this.day, calId);
    return wrapPlainDate(call(() => new NapiPlainDate(iso.isoYear, iso.isoMonth, iso.isoDay, cal)));
  }

  toString(options?: any): string {
    if (options !== undefined) validateOptions(options);
    const dc = options ? mapDisplayCalendar(options.calendarName) : undefined;
    return this._inner.toString(dc);
  }

  toJSON() {
    requireBranding(this, NapiPlainMonthDay, 'Temporal.PlainMonthDay');
    return this.toString();
  }
  toLocaleString(locales?: any, options?: any): string {
    requireBranding(this, NapiPlainMonthDay, 'Temporal.PlainMonthDay');
    if (options !== undefined && options !== null && typeof options === 'object') {
      if (options.timeStyle !== undefined) {
        throw new TypeError('timeStyle option is not allowed for PlainMonthDay.toLocaleString()');
      }
    }
    // Per spec: calendar mismatch check (PlainMonthDay: ISO calendar also mismatches)
    const calId = this.calendarId;
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
      // Per spec: PlainMonthDay must not display the reference year.
      // Convert dateStyle to equivalent month+day component options,
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
            opts.month = 'long';
            opts.day = 'numeric';
          } else {
            opts.month = 'numeric';
            opts.day = 'numeric';
          }
        }
      }
      // Per spec: if no date/time component options, add month+day defaults for PlainMonthDay
      if (!_hasDateTimeOptions(opts)) {
        opts.month = 'numeric';
        opts.day = 'numeric';
      }
      const dtf = new Intl.DateTimeFormat(locales, opts);
      return _origFormatGetter!.call(dtf)(ms);
    }
    return this.toString();
  }

  valueOf() {
    throw new TypeError('Use equals() to compare Temporal.PlainMonthDay');
  }

  // Symbol.toStringTag defined as data property below

  static [Symbol.hasInstance](v: any): boolean {
    return (
      v !== null && v !== undefined && typeof v === 'object' && '_inner' in v && v._inner instanceof NapiPlainMonthDay
    );
  }
}

_classes.PlainMonthDay = PlainMonthDay;
// Register with convert.ts for toNapiPlainMonthDay
_convertClasses.PlainMonthDay = PlainMonthDay;

export { PlainMonthDay };
