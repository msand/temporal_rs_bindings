// Calendar-related logic extracted from temporal.ts.
// Contains calendar ID validation, month code parsing, era resolution,
// calendar-to-ISO conversion, and calendar date difference calculations.

import { NapiPlainDate, NapiDuration, type NapiPlainDateT, type NapiPlainYearMonthT } from './binding';
import {
  _trunc,
  toInteger,
  rejectInfinity,
  isoDateToEpochDays,
  epochDaysToISO,
  validateMonthCodeSyntax,
} from './helpers';
import type { CalendarISOResult, CalendarDateDiffResult } from './binding';

// Lazy import to break circular dependency with convert.ts
let _toNapiCalendar: ((cal: any) => any) | null = null;
export function _setToNapiCalendar(fn: (cal: any) => any) {
  _toNapiCalendar = fn;
}
function toNapiCalendar(cal: any): any {
  return _toNapiCalendar!(cal);
}

export const VALID_CALENDAR_IDS = new Set([
  'iso8601',
  'gregory',
  'japanese',
  'buddhist',
  'chinese',
  'coptic',
  'dangi',
  'ethiopian',
  'ethioaa',
  'ethiopic',
  'hebrew',
  'indian',
  'islamic-civil',
  'islamic-tbla',
  'islamic-umalqura',
  'persian',
  'roc',
]);

// Calendar IDs that should throw in Temporal (only supported in Intl.DateTimeFormat)
export const REJECTED_CALENDAR_IDS = new Set(['islamic', 'islamic-rgsa']);

// Calendar ID canonicalization per CLDR
export const CALENDAR_ALIASES: Record<string, string> = {
  islamicc: 'islamic-civil',
  'ethiopic-amete-alem': 'ethioaa',
};

export function canonicalizeCalendarId(id: any): string {
  const lower = typeof id === 'string' ? id.toLowerCase() : id;
  return CALENDAR_ALIASES[lower] || lower;
}

// Per spec: reject strings that are ISO date/time strings when used as constructor calendar arg
export function rejectISOStringAsCalendar(cal: any): void {
  if (typeof cal === 'string' && cal.length > 0) {
    // Reject ISO-like strings: dates, compact dates, strings with brackets
    if (
      /\[/.test(cal) ||
      /^\d{4}-\d{2}/.test(cal) ||
      /^[+-]\d{6}/.test(cal) ||
      /^\d{8}$/.test(cal) ||
      /^\d{2}-\d{2}/.test(cal)
    ) {
      throw new RangeError(`Invalid calendar: ${cal}`);
    }
  }
}

// ─── Helper: parse monthCode to month number ─────────────────

export const THIRTEEN_MONTH_CALENDARS = new Set([
  'hebrew',
  'chinese',
  'dangi',
  'ethiopian',
  'ethioaa',
  'ethiopic',
  'coptic',
]);

// Approximate offsets: isoYear ≈ calendarYear + offset
export const CALENDAR_ISO_OFFSETS: Record<string, number> = {
  buddhist: -543,
  roc: 1911,
  japanese: 0,
  gregory: 0,
  iso8601: 0,
  coptic: 284,
  ethiopic: 8,
  ethioaa: -5492,
  indian: 78,
  persian: 621,
  hebrew: -3760,
  'islamic-civil': 579,
  'islamic-tbla': 579,
  'islamic-umalqura': 579,
  chinese: 0,
  dangi: 0,
};

// Hebrew leap years follow a 19-year cycle: years 3, 6, 8, 11, 14, 17, 19
export function isHebrewLeapYear(hebrewYear: number): boolean {
  const mod = ((hebrewYear % 19) + 19) % 19; // ensure positive mod
  return mod === 0 || mod === 3 || mod === 6 || mod === 8 || mod === 11 || mod === 14 || mod === 17;
}

// For Chinese/Dangi: find which month code has the leap month in a given year.
// Returns the base month number N such that M{N}L exists, or 0 if no leap month.
// Intentionally unbounded — entries are tiny (string + number) and bounded by the
// practical range of Chinese/Dangi years. A size cap causes severe cache thrashing
// in PlainMonthDay reference year scanning.
export const _chineseDangiLeapMonthCache = new Map<string, number>();

function _evictLeapMonthCache(): void {
  if (_chineseDangiLeapMonthCache.size > 10000) {
    // Evict oldest ~20% to avoid thrashing
    const evictCount = Math.floor(_chineseDangiLeapMonthCache.size * 0.2);
    let i = 0;
    for (const key of _chineseDangiLeapMonthCache.keys()) {
      if (i >= evictCount) break;
      _chineseDangiLeapMonthCache.delete(key);
      i++;
    }
  }
}

export function getChineseDangiLeapMonth(calYear: number, calId: string): number {
  const cacheKey = `${calId}:${calYear}`;
  if (_chineseDangiLeapMonthCache.has(cacheKey)) return _chineseDangiLeapMonthCache.get(cacheKey)!;
  try {
    const cal = toNapiCalendar(calId);
    // First find approximate ISO year
    let isoYear = calYear - (calId === 'chinese' ? 2637 : 2333);
    try {
      let d = new NapiPlainDate(isoYear, 6, 15, cal);
      let diff = calYear - d.year;
      for (let i = 0; i < 5 && diff !== 0; i++) {
        isoYear += diff;
        try {
          d = new NapiPlainDate(isoYear, 6, 15, cal);
        } catch {
          d = new NapiPlainDate(isoYear, 1, 1, cal);
        }
        diff = calYear - d.year;
      }
    } catch {
      /* use estimate */
    }
    // Check if this year has 13 months
    let probe;
    try {
      probe = new NapiPlainDate(isoYear, 6, 15, cal);
    } catch {
      probe = new NapiPlainDate(isoYear, 1, 1, cal);
    }
    if (probe.year !== calYear) {
      // Try adjusting
      for (let off = -1; off <= 1; off++) {
        try {
          const p = new NapiPlainDate(isoYear + off, 6, 15, cal);
          if (p.year === calYear) {
            probe = p;
            isoYear = isoYear + off;
            break;
          }
        } catch {}
      }
    }
    if (probe.monthsInYear !== 13) {
      _evictLeapMonthCache();
      _chineseDangiLeapMonthCache.set(cacheKey, 0);
      return 0;
    }
    // Scan through the year to find which month code has 'L'
    // Start from approximate beginning of the Chinese year
    const startMs = Date.UTC(isoYear, 0, 20);
    let lastMonth = 0;
    for (let day = 0; day < 400; day++) {
      const d = new Date(startMs + day * 86400000);
      try {
        const pd = new NapiPlainDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), cal);
        if (pd.year === calYear && pd.month !== lastMonth) {
          lastMonth = pd.month;
          if (pd.monthCode.endsWith('L')) {
            const base = parseInt(pd.monthCode.slice(1, 3), 10);
            _evictLeapMonthCache();
            _chineseDangiLeapMonthCache.set(cacheKey, base);
            return base;
          }
        }
        if (pd.year > calYear && pd.month >= 2) break;
      } catch {}
    }
    _evictLeapMonthCache();
    _chineseDangiLeapMonthCache.set(cacheKey, 0);
    return 0;
  } catch {
    _evictLeapMonthCache();
    _chineseDangiLeapMonthCache.set(cacheKey, 0);
    return 0;
  }
}

export function monthCodeToMonth(monthCode: any, calendarId?: string, targetYear?: number): any {
  if (monthCode === undefined) return undefined;
  // Use validateMonthCodeSyntax to parse and validate the monthCode format
  const { monthNum, isLeap } = validateMonthCodeSyntax(monthCode);
  const str = typeof monthCode === 'string' ? monthCode : String(monthCode);
  // For non-13-month calendars, month must be <= 12 and no leap suffix
  if (calendarId && !THIRTEEN_MONTH_CALENDARS.has(calendarId)) {
    if (monthNum > 12) throw new RangeError(`Invalid monthCode for ${calendarId} calendar: ${str}`);
    if (isLeap) throw new RangeError(`Invalid monthCode for ${calendarId} calendar: ${str}`);
  } else if (calendarId === 'hebrew') {
    // Hebrew uses M01-M12 and M05L (leap month Adar I). M13 is never valid.
    if (monthNum > 12) throw new RangeError(`Invalid monthCode for hebrew calendar: ${str}`);
    if (isLeap && monthNum !== 5) throw new RangeError(`Invalid monthCode for hebrew calendar: ${str}`);
  } else if (
    calendarId === 'coptic' ||
    calendarId === 'ethiopic' ||
    calendarId === 'ethioaa' ||
    calendarId === 'ethiopian'
  ) {
    // These calendars have M01-M13, no leap months
    if (monthNum > 13) throw new RangeError(`Invalid monthCode for ${calendarId} calendar: ${str}`);
    if (isLeap) throw new RangeError(`Invalid monthCode for ${calendarId} calendar: ${str}`);
  } else if (calendarId === 'chinese' || calendarId === 'dangi') {
    // Chinese/Dangi have M01-M12 plus one leap month (any month can be leap)
    if (monthNum > 12) throw new RangeError(`Invalid monthCode for ${calendarId} calendar: ${str}`);
  } else {
    // For other 13-month calendars
    if (monthNum > 13) throw new RangeError(`Invalid monthCode: ${str}`);
  }

  // ── Hebrew calendar: month numbers shift in leap years ──
  // In leap years: M01→1..M05→5, M05L→6, M06→7..M12→13
  // In non-leap years: M01→1..M12→12, M05L constrains to M06=6
  if (calendarId === 'hebrew') {
    const leapYear = targetYear !== undefined ? isHebrewLeapYear(targetYear) : false;
    if (isLeap) {
      if (!leapYear && targetYear !== undefined) {
        // M05L in non-leap year: constrain to M06 = month 6
        // Callers that need reject mode should check separately
        return monthNum + 1;
      }
      // M05L → month 6
      return monthNum + 1;
    }
    if (leapYear && monthNum >= 6) {
      // In a leap year, M06→7, M07→8, ..., M12→13
      return monthNum + 1;
    }
    return monthNum;
  }

  // ── Chinese/Dangi: leap month can be any month ──
  // If the year has a leap month after base month N (M{N}L), then:
  //   M{N}L → N+1, M{N+1} → N+2, ..., M12 → 13
  if (calendarId === 'chinese' || calendarId === 'dangi') {
    if (isLeap) {
      if (targetYear !== undefined) {
        const leapBase = getChineseDangiLeapMonth(targetYear, calendarId);
        if (leapBase === monthNum) {
          // The leap month exists in this year, M{N}L → N+1
          return monthNum + 1;
        }
        // Constrain: leap month doesn't exist in this year
        // Map to the base month M{N} → use the month number for M{N} in the target year
        if (leapBase > 0 && monthNum > leapBase) {
          // Target year has a different leap month before this month
          return monthNum + 1;
        }
        return monthNum;
      }
      // No target year: M{N}L → N+1
      return monthNum + 1;
    }
    if (targetYear !== undefined) {
      const leapBase = getChineseDangiLeapMonth(targetYear, calendarId);
      if (leapBase > 0 && monthNum > leapBase) {
        // Months after the leap month shift by +1
        return monthNum + 1;
      }
    }
    return monthNum;
  }

  return monthNum;
}

// Helper: check if a monthCode is valid for a given calendar year (for reject mode)
export function isMonthCodeValidForYear(
  monthCode: string | undefined,
  calendarId: string,
  targetYear: number | undefined,
): boolean {
  if (!monthCode || targetYear === undefined) return true;
  const m = monthCode.match(/^M(\d{2})(L?)$/);
  if (!m) return false;
  const monthNum = parseInt(m[1]!, 10);
  const isLeap = m[2] === 'L';
  if (!isLeap) return true; // non-leap month codes are always valid
  if (calendarId === 'hebrew') {
    return isHebrewLeapYear(targetYear);
  }
  if (calendarId === 'chinese' || calendarId === 'dangi') {
    const leapBase = getChineseDangiLeapMonth(targetYear, calendarId);
    return leapBase === monthNum;
  }
  return true;
}

// ─── Helper: resolve month from month/monthCode ───────────────

export function resolveMonth(bag: any, calendarId: string, targetYear?: number): any {
  let month = toInteger(bag.month);
  // Per spec: reject Infinity/-Infinity
  if (month !== undefined) rejectInfinity(month, 'month');
  // Per spec, month is truncated to integer (ToPositiveIntegerWithTruncation)
  if (month !== undefined) month = _trunc(month);
  const { monthCode } = bag;
  if (month !== undefined && monthCode !== undefined) {
    const fromCode = monthCodeToMonth(monthCode, calendarId, targetYear);
    if (fromCode !== month) {
      throw new RangeError(`month ${month} and monthCode ${monthCode} do not agree`);
    }
    return month;
  }
  if (month !== undefined) return month;
  if (monthCode !== undefined) return monthCodeToMonth(monthCode, calendarId, targetYear);
  return undefined;
}

// ─── Helper: valid era names per calendar ──────────────────────
export const VALID_ERAS: Record<string, Set<string>> = {
  gregory: new Set(['ce', 'bce', 'ad', 'bc']),
  iso8601: new Set([]),
  buddhist: new Set(['be']),
  japanese: new Set(['meiji', 'taisho', 'showa', 'heisei', 'reiwa', 'ce', 'bce', 'ad', 'bc']),
  roc: new Set(['roc', 'broc', 'minguo', 'before-roc']),
  coptic: new Set(['coptic', 'coptic-inverse', 'era1', 'era0', 'am']),
  ethiopic: new Set(['ethiopic', 'ethioaa', 'am', 'aa']),
  ethioaa: new Set(['aa', 'ethioaa']),
  hebrew: new Set(['am']),
  indian: new Set(['saka', 'shaka']),
  persian: new Set(['ap']),
  islamic: new Set(['ah', 'islamic', 'bh']),
  'islamic-civil': new Set(['ah', 'islamic', 'bh']),
  'islamic-tbla': new Set(['ah', 'islamic', 'bh']),
  'islamic-umalqura': new Set(['ah', 'islamic', 'bh']),
  'islamic-rgsa': new Set(['ah', 'islamic', 'bh']),
  chinese: new Set([]),
  dangi: new Set([]),
};

// ─── Helper: resolve era/eraYear to year ──────────────────────

export function resolveEraYear(fields: any, calendarId: string): any {
  const validEras = VALID_ERAS[calendarId];
  const calendarHasEras = validEras && validEras.size > 0;
  // For calendars without eras, silently ignore era/eraYear (per spec)
  if (!calendarHasEras) {
    fields.era = undefined;
    fields.eraYear = undefined;
    return fields;
  }
  // For calendars with eras, era and eraYear must come together
  if ((fields.era !== undefined) !== (fields.eraYear !== undefined)) {
    throw new TypeError('era and eraYear must be provided together');
  }
  if (fields.era !== undefined && fields.eraYear !== undefined) {
    // Validate era name for the calendar
    if (calendarHasEras && !validEras.has(fields.era)) {
      throw new RangeError(`Invalid era '${fields.era}' for calendar '${calendarId}'`);
    }
    if (fields.year === undefined) {
      if (calendarId === 'gregory' || calendarId === 'iso8601') {
        if (fields.era === 'ce' || fields.era === 'ad') {
          fields.year = fields.eraYear;
        } else if (fields.era === 'bce' || fields.era === 'bc') {
          fields.year = 1 - fields.eraYear;
        }
      } else if (calendarId === 'japanese') {
        // Japanese calendar eras start at specific years
        const japaneseEraStarts: Record<string, number | null> = {
          reiwa: 2019, // Reiwa 1 = 2019
          heisei: 1989, // Heisei 1 = 1989
          showa: 1926, // Showa 1 = 1926
          taisho: 1912, // Taisho 1 = 1912
          meiji: 1868, // Meiji 1 = 1868
          ce: null,
          ad: null, // CE/AD: year = eraYear directly
          bce: null,
          bc: null, // BCE/BC: year = 1 - eraYear
        };
        const start = japaneseEraStarts[fields.era];
        if (start !== undefined && start !== null) {
          fields.year = start + (fields.eraYear as number) - 1;
        } else if (fields.era === 'bce' || fields.era === 'bc') {
          fields.year = 1 - fields.eraYear;
        } else {
          fields.year = fields.eraYear;
        }
      } else if (calendarId === 'roc') {
        // ROC calendar: era "roc"/"minguo" -> year = eraYear, era "broc"/"before-roc" -> year = 1 - eraYear
        if (fields.era === 'roc' || fields.era === 'minguo') {
          fields.year = fields.eraYear;
        } else if (fields.era === 'broc' || fields.era === 'before-roc') {
          fields.year = 1 - fields.eraYear;
        } else {
          fields.year = fields.eraYear;
        }
      } else if (calendarId === 'ethiopian' || calendarId === 'ethioaa' || calendarId === 'ethiopic') {
        // For ethiopic/ethioaa/ethiopian calendars:
        // era "ethiopic"/"am" → year = eraYear (Amete Mihret)
        // era "ethioaa"/"aa" → year = eraYear - 5500 for the ethiopic calendar year numbering
        if (fields.era === 'ethioaa' || fields.era === 'aa') {
          if (calendarId === 'ethioaa') {
            // For ethioaa calendar, year IS the AA eraYear
            fields.year = fields.eraYear;
          } else {
            // ethioaa era in ethiopic calendar: AM year = AA year - 5500
            fields.year = fields.eraYear - 5500;
          }
        } else {
          // era "ethiopic"/"am"
          if (calendarId === 'ethioaa') {
            // AM eraYear → AA year = eraYear + 5500
            fields.year = (fields.eraYear as number) + 5500;
          } else {
            fields.year = fields.eraYear;
          }
        }
      } else if (calendarId === 'coptic') {
        if (fields.era === 'era1' || fields.era === 'coptic') {
          fields.year = fields.eraYear;
        } else if (fields.era === 'era0' || fields.era === 'coptic-inverse') {
          fields.year = 1 - fields.eraYear;
        } else {
          fields.year = fields.eraYear;
        }
      } else if (calendarId === 'buddhist') {
        if (fields.era === 'be') {
          fields.year = fields.eraYear;
        } else {
          fields.year = 1 - fields.eraYear;
        }
      } else if (
        calendarId === 'islamic' ||
        calendarId === 'islamic-civil' ||
        calendarId === 'islamic-tbla' ||
        calendarId === 'islamic-umalqura' ||
        calendarId === 'islamic-rgsa'
      ) {
        if (fields.era === 'ah' || fields.era === 'islamic') {
          fields.year = fields.eraYear;
        } else if (fields.era === 'bh') {
          // BH era counts backwards: eraYear 1 = year 0, eraYear 2 = year -1
          fields.year = 1 - fields.eraYear;
        } else {
          fields.year = fields.eraYear;
        }
      } else if (calendarId === 'persian') {
        if (fields.era === 'ap') {
          fields.year = fields.eraYear;
        } else {
          fields.year = fields.eraYear;
        }
      } else if (calendarId === 'indian') {
        if (fields.era === 'saka') {
          fields.year = fields.eraYear;
        } else {
          fields.year = fields.eraYear;
        }
      } else {
        // For other calendars, just use eraYear as year
        fields.year = fields.eraYear;
      }
    }
  }
  // Per spec, if only one of era/eraYear is present, ignore them and use year
  // Do NOT throw - just silently ignore the incomplete era pair
  return fields;
}

// ─── Helper: get calendar ID from various sources ─────────────

export function getCalendarId(calArg: any): string {
  if (calArg === undefined || calArg === null) return 'iso8601';
  if (typeof calArg === 'string') {
    const canonCal = canonicalizeCalendarId(calArg);
    if (VALID_CALENDAR_IDS.has(canonCal)) return canonCal;
    // Extract calendar from annotation in ISO-like strings
    const match = calArg.match(/\[u-ca=([^\]]+)\]/);
    if (match) return canonicalizeCalendarId(match[1]);
    // If it looks like an ISO string, return iso8601
    if (
      /^\d{4}-\d{2}/.test(calArg) ||
      /^[+-]\d{6}/.test(calArg) ||
      /^\+\d{4}/.test(calArg) ||
      /^\d{2}-\d{2}/.test(calArg)
    ) {
      return 'iso8601';
    }
    // Check if it looks like a time string (e.g. "15:23", "152330", "T15:23:30", "15")
    const timeStr = calArg.startsWith('T') || calArg.startsWith('t') ? calArg.substring(1) : calArg;
    if (
      /^\d{2}(:\d{2}(:\d{2})?)?/.test(timeStr) ||
      /^\d{6}/.test(timeStr) ||
      /^\d{4}$/.test(timeStr) ||
      /^\d{2}$/.test(timeStr)
    ) {
      return 'iso8601';
    }
    // Validate that the string looks like a valid calendar identifier (lowercase ASCII, hyphens, digits)
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(calArg)) {
      throw new RangeError(`${calArg} is not a valid calendar identifier`);
    }
    return calArg;
  }
  if (calArg && typeof calArg === 'object' && calArg.id) return calArg.id;
  return 'iso8601';
}

// ─── Calendars where months align with ISO months ─────────────
// These calendars only differ from ISO in the year offset; months are the same.
export const ISO_MONTH_ALIGNED_CALENDARS = new Set(['iso8601', 'gregory', 'buddhist', 'roc', 'japanese']);

// Calendars known to have NAPI arithmetic issues for date difference calculations
export const USE_JS_DIFF_CALENDARS = new Set([
  'chinese',
  'dangi',
  'hebrew',
  'coptic',
  'ethiopic',
  'ethioaa',
  'ethiopian',
  'islamic-civil',
  'islamic-tbla',
  'islamic-umalqura',
  'indian',
  'persian',
]);

// ─── Helper: convert calendar date fields to ISO date fields ──
// For non-ISO calendars, the "year", "month", "day" in a property bag are
// calendar values, but the NAPI constructors expect ISO year/month/day.
// This function converts (calYear, calMonth, calDay, calId) → {isoYear, isoMonth, isoDay}.

export function calendarDateToISO(
  targetCalYear: number,
  calMonth: number | undefined,
  calDay: number | undefined,
  calId: string,
): CalendarISOResult {
  // ISO and Gregorian: no conversion needed
  if (calId === 'iso8601' || calId === 'gregory') {
    return {
      isoYear: targetCalYear,
      isoMonth: calMonth as number,
      isoDay: calDay as number,
    };
  }

  // The NAPI handles ethioaa years directly (no conversion needed)

  const cal = toNapiCalendar(calId);

  // For month-aligned calendars (buddhist, roc, japanese), only the year differs
  if (ISO_MONTH_ALIGNED_CALENDARS.has(calId)) {
    let isoYear = targetCalYear;
    // For calendars with known fixed offsets, compute directly to avoid NAPI range issues
    if (calId === 'buddhist') {
      isoYear = targetCalYear - 543;
    } else if (calId === 'roc') {
      isoYear = targetCalYear + 1911;
    } else {
      try {
        let d = new NapiPlainDate(isoYear, calMonth || 6, calDay || 15, cal);
        let diff = targetCalYear - d.year;
        for (let i = 0; i < 10 && diff !== 0; i++) {
          isoYear += diff;
          try {
            d = new NapiPlainDate(isoYear, calMonth || 6, calDay || 15, cal);
          } catch {
            try {
              d = new NapiPlainDate(isoYear, 1, 1, cal);
            } catch {
              break;
            }
          }
          diff = targetCalYear - d.year;
        }
      } catch {
        // Fallback: return as-is
      }
    }
    return {
      isoYear,
      isoMonth: calMonth as number,
      isoDay: calDay as number,
    };
  }

  // For all other calendars (indian, persian, coptic, ethiopic, ethioaa, hebrew,
  // islamic-*, chinese, dangi), months don't align with ISO months.
  // Strategy: find the ISO date that corresponds to (calYear, calMonth, calDay).
  // 1. Find approximate ISO year via mid-year probe
  // 2. Then scan for the exact date by iterating ISO dates and checking calendar fields

  // Estimate the initial ISO year based on known calendar offsets to avoid NAPI range errors
  let isoYear = targetCalYear;
  if (calId === 'coptic') {
    isoYear = targetCalYear + 284; // Coptic year 1 ≈ 284 CE
  } else if (calId === 'ethiopic' || calId === 'ethioaa' || calId === 'ethiopian') {
    isoYear = targetCalYear + 8; // Ethiopian year 1 ≈ 8 CE (ethioaa: year 1 ≈ 5493 BCE)
    if (calId === 'ethioaa') {
      isoYear = targetCalYear - 5492; // ethioaa epoch is ~5493 BCE
    }
  } else if (calId === 'indian') {
    isoYear = targetCalYear + 78; // Indian national calendar epoch
  } else if (calId === 'persian') {
    isoYear = targetCalYear + 621; // Persian calendar epoch
  } else if (calId === 'hebrew') {
    isoYear = targetCalYear - 3760; // Hebrew calendar epoch
  } else if (
    calId === 'islamic-civil' ||
    calId === 'islamic-tbla' ||
    calId === 'islamic-umalqura' ||
    calId === 'islamic-rgsa'
  ) {
    // Islamic year ~354 days, so: ISO ≈ 622 + calYear * 354/365
    isoYear = Math.round(622 + (targetCalYear * 354) / 365);
  }
  try {
    // Step 1: Refine ISO year estimate via mid-year probe
    // Clamp to valid ISO range to avoid NAPI errors at boundaries
    isoYear = Math.max(-271821, Math.min(275760, isoYear));
    let d = new NapiPlainDate(isoYear, 6, 15, cal);
    let diff = targetCalYear - d.year;
    for (let i = 0; i < 15 && diff !== 0; i++) {
      isoYear = Math.max(-271821, Math.min(275760, isoYear + diff));
      try {
        d = new NapiPlainDate(isoYear, 6, 15, cal);
      } catch {
        try {
          d = new NapiPlainDate(isoYear, 1, 1, cal);
        } catch {
          break;
        }
      }
      diff = targetCalYear - d.year;
    }

    // Step 2: Find the first day of the target calendar month in this ISO year range.
    // We need to scan ISO dates to find the one where calYear/calMonth/calDay match.
    // Start from beginning of the ISO year and scan forward.
    const targetMonth = calMonth || 1;
    const targetDay = calDay || 1;

    // Try each month in a range of ISO months around the expected area
    // For calendars with year start not in January, we may need to look in isoYear-1 or isoYear+1
    // Probe more densely (every ~7 days) to catch short months like coptic month 13 (5-6 days)
    // Also include boundary probe points for extreme ISO years (-271821-04-19 and 275760-09-13)
    for (let yOff = -1; yOff <= 1; yOff++) {
      const tryIsoYear = isoYear + yOff;
      for (let m = 1; m <= 12; m++) {
        const probeDays = [1, 8, 15, 22, 28];
        // At ISO boundaries, add the exact boundary date as a probe point
        if (tryIsoYear === -271821 && m === 4) probeDays.push(19, 20);
        if (tryIsoYear === 275760 && m === 9) probeDays.push(13);
        for (const tryDay of probeDays) {
          try {
            const probe = new NapiPlainDate(tryIsoYear, m, tryDay, cal);
            if (probe.year === targetCalYear && probe.month === targetMonth) {
              // Found the right month. Now find the exact day.
              // Calculate day offset from probe
              const dayDiff = targetDay - probe.day;
              if (dayDiff === 0) {
                return { isoYear: tryIsoYear, isoMonth: m, isoDay: tryDay };
              }
              // Use epoch-based arithmetic to handle month boundaries
              const probeEpoch = isoDateToEpochDays(tryIsoYear, m, tryDay);
              const targetEpoch = probeEpoch + dayDiff;
              const result = epochDaysToISO(targetEpoch);
              try {
                const verify = new NapiPlainDate(result.year, result.month, result.day, cal);
                if (verify.year === targetCalYear && verify.month === targetMonth && verify.day === targetDay) {
                  return { isoYear: result.year, isoMonth: result.month, isoDay: result.day };
                }
                // If targetDay exceeds daysInMonth, constrain to last day of month
                if (targetDay > probe.daysInMonth) {
                  // The day overflows the month. Find the last day of the target month.
                  const lastDayDiff = probe.daysInMonth - probe.day;
                  const lastEpoch = probeEpoch + lastDayDiff;
                  const lastResult = epochDaysToISO(lastEpoch);
                  return { isoYear: lastResult.year, isoMonth: lastResult.month, isoDay: lastResult.day };
                }
              } catch {
                /* continue */
              }
            }
          } catch {
            /* out of range, continue */
          }
        }
      }
    }
  } catch {
    // Fallback
  }

  // Final fallback: return the year-only conversion (used by exotic calendars like ethiopic/coptic)
  return { isoYear: isoYear, isoMonth: calMonth as number, isoDay: calDay as number };
}

// Helper: pick the default reference calendar year for PlainMonthDay.
// Per spec, the reference ISO year should be 1972 (or the latest ISO year ≤ 1972
// that has the month/day). We find the calendar year that contains mid-1972.
export const _defaultRefYearCache: Record<string, number> = {};
export function _defaultCalendarRefYear(calId: string, _calMonth?: number): number {
  const cacheKey = calId;
  if (_defaultRefYearCache[cacheKey] !== undefined) return _defaultRefYearCache[cacheKey];
  try {
    const cal = toNapiCalendar(calId);
    // Probe ISO 1972-06-15 to find the calendar year active mid-1972
    const probe = new NapiPlainDate(1972, 6, 15, cal);
    _defaultRefYearCache[cacheKey] = probe.year;
    return probe.year;
  } catch {
    /* fallback */
  }
  return 1;
}

// Helper: get the maximum month number for a calendar year
export function _getMaxMonthForCalendarYear(calId: string, calYear: number): number {
  if (THIRTEEN_MONTH_CALENDARS.has(calId)) {
    if (calId === 'chinese' || calId === 'dangi') {
      const leapBase = getChineseDangiLeapMonth(calYear, calId);
      return leapBase > 0 ? 13 : 12;
    }
    if (calId === 'hebrew') {
      return isHebrewLeapYear(calYear) ? 13 : 12;
    }
    // Coptic, ethiopic, ethioaa always have 13 months
    return 13;
  }
  return 12;
}

export function calendarDaysInMonth(calYear: number, calMonth: any, calId: string): any {
  if (calId === 'iso8601' || calId === 'gregory') {
    const isLeap = calYear % 4 === 0 && (calYear % 100 !== 0 || calYear % 400 === 0);
    const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return daysInMonth[calMonth - 1]!;
  }
  // Navigate to the target month in the calendar using calendarDateToISO with day=1
  try {
    const iso = calendarDateToISO(calYear, calMonth, 1, calId);
    const cal = toNapiCalendar(calId);
    const probe = new NapiPlainDate(iso.isoYear, iso.isoMonth, iso.isoDay, cal);
    if (probe.year === calYear && probe.month === calMonth) {
      return probe.daysInMonth;
    }
  } catch {
    /* fallback */
  }
  return undefined;
}

// Helper: get the monthCode for a given ordinal month in a calendar year
export function _getMonthCodeForOrdinal(calYear: number, ordinalMonth: number, calId: string): string {
  if (calId === 'iso8601' || calId === 'gregory' || ISO_MONTH_ALIGNED_CALENDARS.has(calId)) {
    return 'M' + String(ordinalMonth).padStart(2, '0');
  }
  try {
    const iso = calendarDateToISO(calYear, ordinalMonth, 1, calId);
    const cal = toNapiCalendar(calId);
    const probe = new NapiPlainDate(iso.isoYear, iso.isoMonth, iso.isoDay, cal);
    if (probe.year === calYear && probe.month === ordinalMonth) {
      return probe.monthCode;
    }
  } catch {
    /* fallback */
  }
  // Fallback: simple mapping
  if (calId === 'hebrew') {
    if (isHebrewLeapYear(calYear)) {
      if (ordinalMonth === 6) return 'M05L';
      if (ordinalMonth > 6) return 'M' + String(ordinalMonth - 1).padStart(2, '0');
    }
    return 'M' + String(ordinalMonth).padStart(2, '0');
  }
  if (calId === 'chinese' || calId === 'dangi') {
    const leapBase = getChineseDangiLeapMonth(calYear, calId);
    if (leapBase > 0 && ordinalMonth === leapBase + 1) {
      return 'M' + String(leapBase).padStart(2, '0') + 'L';
    }
    if (leapBase > 0 && ordinalMonth > leapBase + 1) {
      return 'M' + String(ordinalMonth - 1).padStart(2, '0');
    }
  }
  return 'M' + String(ordinalMonth).padStart(2, '0');
}

// ─── Helper: calendar-aware date difference ─────────────────
// Implements CalendarDateUntil for non-ISO calendars.
// The NAPI until/since doesn't properly handle lunisolar calendar arithmetic,
// so we implement it here in JavaScript.
// Helper: convert a PlainYearMonth inner to a PlainDate at day 1
// by extracting ISO values from its toString() output
export function _ymInnerToPlainDate(ymInner: NapiPlainYearMonthT): NapiPlainDateT {
  const s = ymInner.toString();
  const m = s.match(/^([+-]?\d+)-(\d{2})-(\d{2})/);
  if (!m) throw new RangeError('Failed to extract ISO date from PlainYearMonth');
  return new NapiPlainDate(parseInt(m[1]!, 10), parseInt(m[2]!, 10), parseInt(m[3]!, 10), ymInner.calendar);
}

export function calendarDateDifference(
  startInner: NapiPlainDateT,
  endInner: NapiPlainDateT,
  largestUnit: string,
  calId: string,
): CalendarDateDiffResult | null {
  // For ISO-aligned calendars and calendars where NAPI handles arithmetic correctly,
  // fall back to NAPI
  if (ISO_MONTH_ALIGNED_CALENDARS.has(calId) && calId !== 'japanese') {
    return null; // signal to use NAPI
  }
  // Only use JS implementation for calendars known to have NAPI arithmetic issues
  if (!USE_JS_DIFF_CALENDARS.has(calId)) {
    return null; // signal to use NAPI
  }

  const sign = NapiPlainDate.compare(endInner, startInner);
  if (sign === 0) return { years: 0, months: 0, weeks: 0, days: 0 };

  // Get calendar fields
  const startY = startInner.year,
    startM = startInner.month,
    startD = startInner.day;
  const startMC = startInner.monthCode;
  const endY = endInner.year,
    endM = endInner.month;

  // Compute epoch days for start and end
  const startStr = startInner.toString();
  const endStr = endInner.toString();
  const startMatch = startStr.match(/^([+-]?\d+)-(\d{2})-(\d{2})/)!;
  const startEpoch = isoDateToEpochDays(Number(startMatch[1]), Number(startMatch[2]), Number(startMatch[3]));
  const endMatch = endStr.match(/^([+-]?\d+)-(\d{2})-(\d{2})/)!;
  const endEpoch = isoDateToEpochDays(Number(endMatch[1]), Number(endMatch[2]), Number(endMatch[3]));
  const totalDays = endEpoch - startEpoch;

  if (largestUnit === 'Day' || largestUnit === 'days') {
    return { years: 0, months: 0, weeks: 0, days: totalDays };
  }
  if (largestUnit === 'Week' || largestUnit === 'weeks') {
    const weeks = Math.trunc(totalDays / 7);
    const days = totalDays - weeks * 7;
    return { years: 0, months: 0, weeks, days };
  }

  // Helper: add months to a date by converting to calendar, adjusting month, converting back
  function addMonthsToDate(inner: NapiPlainDateT, months: number): NapiPlainDateT | null {
    try {
      const dur = new NapiDuration(0, months, 0, 0, 0, 0, 0, 0, 0, 0);
      if (months >= 0) {
        return inner.add(dur, 'Constrain' as any);
      } else {
        return inner.subtract(new NapiDuration(0, -months, 0, 0, 0, 0, 0, 0, 0, 0), 'Constrain' as any);
      }
    } catch {
      return null;
    }
  }

  // Check if adding N months to start overshoots end.
  // This accounts for day-constraining: if start.day doesn't fit in the result month,
  // the addition "used up" a partial month, so we should consider it an overshoot.
  function monthAddOvershots(
    fromDate: NapiPlainDateT,
    addResult: NapiPlainDateT | null,
    endDate: NapiPlainDateT,
    forward: boolean,
  ): boolean {
    if (!addResult) return true;
    if (forward) {
      // Forward: overshoot if result > end, OR result == end but day was constrained downward
      const cmp = dateCompare(addResult, endDate);
      if (cmp > 0) return true;
      if (cmp === 0 && fromDate.day > addResult.day && fromDate.day > addResult.daysInMonth) return true;
      return false;
    } else {
      // Backward: overshoot if result < end
      const cmp = dateCompare(addResult, endDate);
      if (cmp < 0) return true;
      // In the backward direction, if we've reached exactly the end date, it's not an overshoot
      // even if the day was constrained (the constraining just means we covered a full period)
      return false;
    }
  }

  function addYearsToDate(inner: NapiPlainDateT, years: number): NapiPlainDateT | null {
    try {
      const dur = new NapiDuration(years, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      if (years >= 0) {
        return inner.add(dur, 'Constrain' as any);
      } else {
        return inner.subtract(new NapiDuration(-years, 0, 0, 0, 0, 0, 0, 0, 0, 0), 'Constrain' as any);
      }
    } catch {
      return null;
    }
  }

  // Helper: add combined years+months using a single duration to match spec behavior
  // This differs from addYearsToDate then addMonthsToDate because constraining
  // happens after the combined year+month addition, not after each step
  function addYearsMonthsToDate(inner: NapiPlainDateT, years: number, months: number): NapiPlainDateT | null {
    try {
      const absY = Math.abs(years);
      const absM = Math.abs(months);
      if (years >= 0 && months >= 0) {
        return inner.add(new NapiDuration(absY, absM, 0, 0, 0, 0, 0, 0, 0, 0), 'Constrain' as any);
      } else if (years <= 0 && months <= 0) {
        return inner.subtract(new NapiDuration(absY, absM, 0, 0, 0, 0, 0, 0, 0, 0), 'Constrain' as any);
      } else {
        // Mixed signs: add years first, then months
        const afterY = addYearsToDate(inner, years);
        if (!afterY) return null;
        return addMonthsToDate(afterY, months);
      }
    } catch {
      return null;
    }
  }

  function epochDaysOf(inner: NapiPlainDateT): number {
    const s = inner.toString();
    const m = s.match(/^([+-]?\d+)-(\d{2})-(\d{2})/)!;
    return isoDateToEpochDays(parseInt(m[1]!), parseInt(m[2]!), parseInt(m[3]!));
  }

  function dateCompare(a: NapiPlainDateT, b: NapiPlainDateT): number {
    return NapiPlainDate.compare(a, b);
  }

  if (largestUnit === 'Month' || largestUnit === 'months') {
    // Find the number of whole months using binary search then linear refinement
    let months = 0;
    const avgMonthsPerYear = THIRTEEN_MONTH_CALENDARS.has(calId) ? 12.37 : 12;
    if (sign > 0) {
      let estimate = Math.floor((endY - startY) * avgMonthsPerYear + (endM - startM));
      if (estimate < 0) estimate = 0;
      let mid = estimate > 0 ? addMonthsToDate(startInner, estimate) : startInner;
      if (monthAddOvershots(startInner, mid, endInner, true)) {
        while (estimate > 0) {
          estimate--;
          mid = addMonthsToDate(startInner, estimate);
          if (!monthAddOvershots(startInner, mid, endInner, true)) break;
        }
      }
      while (true) {
        const next = addMonthsToDate(startInner, estimate + 1);
        if (monthAddOvershots(startInner, next, endInner, true)) break;
        estimate++;
      }
      months = estimate;
    } else {
      let estimate = Math.ceil((endY - startY) * avgMonthsPerYear + (endM - startM));
      if (estimate > 0) estimate = 0;
      let mid = estimate < 0 ? addMonthsToDate(startInner, estimate) : startInner;
      if (monthAddOvershots(startInner, mid, endInner, false)) {
        while (estimate < 0) {
          estimate++;
          mid = addMonthsToDate(startInner, estimate);
          if (!monthAddOvershots(startInner, mid, endInner, false)) break;
        }
      }
      while (true) {
        const next = addMonthsToDate(startInner, estimate - 1);
        if (monthAddOvershots(startInner, next, endInner, false)) break;
        estimate--;
      }
      months = estimate;
    }
    const intermediate = months !== 0 ? addMonthsToDate(startInner, months) : startInner;
    const remainDays = intermediate ? epochDaysOf(endInner) - epochDaysOf(intermediate) : totalDays;
    return { years: 0, months, weeks: 0, days: remainDays };
  }

  // largestUnit === 'Year' or 'years'
  // Helper: check if year addition overshoots
  function yearOvershots(
    from: NapiPlainDateT,
    result: NapiPlainDateT | null,
    end: NapiPlainDateT,
    forward: boolean,
  ): boolean {
    if (!result) return true;
    const cmp = dateCompare(result, end);
    if (forward) {
      if (cmp > 0) return true;
      if (cmp === 0 && from.day > result.day && from.day > result.daysInMonth) return true;
      // Leap month check: if start is in a leap month and the result lands on the
      // SAME base month (e.g., M04L→M04), it's not a full year.
      // But if it constrains to a DIFFERENT month (e.g., Hebrew M05L→M06), it IS a year.
      if (cmp === 0 && startMC.endsWith('L') && result.monthCode === startMC.slice(0, -1)) return true;
      return false;
    } else {
      if (cmp < 0) return true;
      // In the backward direction, if we've reached exactly the end date, it's not an overshoot
      // even if the day was constrained
      // Leap month check: if start is in a leap month and the result monthCode is NOT
      // the base version of the start monthCode (e.g., Hebrew M05L→M06), it's an overshoot.
      // But if result IS the base version (e.g., Chinese M04L→M04), it's NOT an overshoot.
      if (cmp === 0 && startMC.endsWith('L') && result.monthCode !== startMC.slice(0, -1)) return true;
      return false;
    }
  }

  let years = 0;
  if (sign > 0) {
    let yearEstimate = endY - startY;
    if (yearEstimate > 0) {
      let mid = addYearsToDate(startInner, yearEstimate);
      if (yearOvershots(startInner, mid, endInner, true)) {
        yearEstimate--;
        while (yearEstimate > 0) {
          mid = addYearsToDate(startInner, yearEstimate);
          if (!yearOvershots(startInner, mid, endInner, true)) break;
          yearEstimate--;
        }
      } else {
        while (true) {
          const next = addYearsToDate(startInner, yearEstimate + 1);
          if (yearOvershots(startInner, next, endInner, true)) break;
          yearEstimate++;
        }
      }
      years = yearEstimate;
    }
  } else {
    let yearEstimate = endY - startY;
    if (yearEstimate < 0) {
      let mid = addYearsToDate(startInner, yearEstimate);
      if (yearOvershots(startInner, mid, endInner, false)) {
        yearEstimate++;
        while (yearEstimate < 0) {
          mid = addYearsToDate(startInner, yearEstimate);
          if (!yearOvershots(startInner, mid, endInner, false)) break;
          yearEstimate++;
        }
      } else {
        while (true) {
          const next = addYearsToDate(startInner, yearEstimate - 1);
          if (yearOvershots(startInner, next, endInner, false)) break;
          yearEstimate--;
        }
      }
      years = yearEstimate;
    }
  }

  // After years, find remaining months and days
  // Use addYearsMonthsToDate from start to match spec behavior (combined year+month addition)
  const afterYears = years !== 0 ? addYearsMonthsToDate(startInner, years, 0) : startInner;
  if (!afterYears) return null; // fallback to NAPI

  // Helper: check months using combined year+month addition from start
  // Per spec: if the result's day was constrained (start.day > daysInMonth), it's an overshoot
  function ymOvershots(testMonths: number, forward: boolean): boolean {
    const result = addYearsMonthsToDate(startInner, years, testMonths);
    if (!result) return true;
    const cmp = dateCompare(result, endInner);
    if (forward) {
      if (cmp > 0) return true;
      // Day constraining check: if result day was constrained, treat as overshoot
      if (cmp === 0 && startD > result.day && startD > result.daysInMonth) return true;
      return false;
    } else {
      if (cmp < 0) return true;
      return false;
    }
  }

  // Now find months from afterYears to endInner
  let months = 0;
  const afterSign = dateCompare(endInner, afterYears);
  if (afterSign !== 0) {
    const ayY = afterYears.year,
      ayM = afterYears.month;
    const eY = endInner.year,
      eM = endInner.month;
    const avgMonthsPerYearInner = THIRTEEN_MONTH_CALENDARS.has(calId) ? 12.37 : 12;
    if (afterSign > 0) {
      let mEstimate = Math.floor((eY - ayY) * avgMonthsPerYearInner + (eM - ayM));
      if (mEstimate < 0) mEstimate = 0;
      if (ymOvershots(mEstimate, true)) {
        while (mEstimate > 0) {
          mEstimate--;
          if (!ymOvershots(mEstimate, true)) break;
        }
      }
      while (true) {
        if (ymOvershots(mEstimate + 1, true)) break;
        mEstimate++;
      }
      months = mEstimate;
    } else {
      let mEstimate = Math.ceil((eY - ayY) * avgMonthsPerYearInner + (eM - ayM));
      if (mEstimate > 0) mEstimate = 0;
      if (ymOvershots(mEstimate, false)) {
        while (mEstimate < 0) {
          mEstimate++;
          if (!ymOvershots(mEstimate, false)) break;
        }
      }
      while (true) {
        if (ymOvershots(mEstimate - 1, false)) break;
        mEstimate--;
      }
      months = mEstimate;
    }
  }

  const afterMonths = months !== 0 ? addYearsMonthsToDate(startInner, years, months) : afterYears;
  const remainDays = afterMonths ? epochDaysOf(endInner) - epochDaysOf(afterMonths) : 0;

  return { years, months, weeks: 0, days: remainDays };
}
