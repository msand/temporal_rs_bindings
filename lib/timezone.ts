import {
  NapiInstant,
  NapiZonedDateTime,
  type NapiZonedDateTimeT,
  type LocalParts,
  type ZdtStringParts,
} from './binding';
import { call, computeEpochNanoseconds, isoDateToEpochDays, epochDaysToISO } from './helpers';

// Late-bound class reference to break circular dependency
export const _tzClasses: Record<string, any> = {};

// Helper: compute local date/time parts from BigInt nanoseconds (for extreme values).
// NOTE: `fractionalSecond` only captures millisecond precision; microsecond and
// nanosecond precision is lost because the sub-second remainder is truncated to
// whole milliseconds when converting from BigInt nanoseconds.
export function _computeLocalPartsFromBigInt(epochNs: bigint, offsetNs: bigint): LocalParts {
  const localNs = epochNs + offsetNs;
  const NS_PER_DAY = 86400000000000n;

  // For the date part, use a reference: we know the exact day count from epoch
  // Total days from Unix epoch (day 0 = 1970-01-01)
  // Use floored division for BigInt: totalDays = floor(localNs / NS_PER_DAY)
  let totalDaysBig;
  if (localNs >= 0n) {
    totalDaysBig = localNs / NS_PER_DAY;
  } else {
    totalDaysBig = (localNs - NS_PER_DAY + 1n) / NS_PER_DAY;
  }
  const totalDays = Number(totalDaysBig);
  const dayOfDayNs = localNs - BigInt(totalDays) * NS_PER_DAY;

  // Convert totalDays to a date using a civil calendar algorithm
  // Algorithm from https://howardhinnant.github.io/date_algorithms.html
  // Note: uses C++ truncation-towards-zero division, NOT Math.floor
  const z = totalDays + 719468;
  const era = Math.trunc((z >= 0 ? z : z - 146096) / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const year = m <= 2 ? y + 1 : y;

  // Time of day from remaining nanoseconds
  const todNs = Number(dayOfDayNs);
  const hour = Math.floor(todNs / 3600000000000);
  const minute = Math.floor((todNs % 3600000000000) / 60000000000);
  const second = Math.floor((todNs % 60000000000) / 1000000000);
  const ms = Math.floor((todNs % 1000000000) / 1000000);

  return {
    year: String(Math.abs(year)),
    month: String(m).padStart(2, '0'),
    day: String(d).padStart(2, '0'),
    hour: String(hour).padStart(2, '0'),
    minute: String(minute).padStart(2, '0'),
    second: String(second).padStart(2, '0'),
    fractionalSecond: String(ms).padStart(3, '0'),
    _fullYear: year,
  };
}

// ─── Helper: compute local time in a timezone from epoch ms ────

export const _CACHE_MAX = 100;
export const _CACHE_EVICT = 20; // evict oldest entries when cache is full
export const _dtfCache = new Map<string, Intl.DateTimeFormat>();
export const _napiZdtCache = new Map<string, NapiZonedDateTimeT>();
export const _canonicalTzCache = new Map<string, string>();

// Evict the oldest entries from a Map when it exceeds the size limit.
// Uses Map insertion order (oldest first) to approximate LRU eviction.
export function _evictOldest<K, V>(cache: Map<K, V>, count: number): void {
  let i = 0;
  for (const key of cache.keys()) {
    if (i >= count) break;
    cache.delete(key);
    i++;
  }
}

export function _canonicalTzId(tzId: string): string {
  let canon = _canonicalTzCache.get(tzId);
  if (canon !== undefined) return canon;
  try {
    canon = new Intl.DateTimeFormat(undefined, { timeZone: tzId }).resolvedOptions().timeZone;
  } catch {
    canon = tzId;
  }
  if (_canonicalTzCache.size >= _CACHE_MAX) _evictOldest(_canonicalTzCache, _CACHE_EVICT);
  _canonicalTzCache.set(tzId, canon);
  return canon;
}

export function getLocalPartsFromEpoch(epochMs: number, tzId: string): LocalParts {
  if (tzId === 'UTC') {
    const d = new Date(epochMs);
    // Use Date.getUTC* for UTC to correctly handle negative years
    return {
      year: String(Math.abs(d.getUTCFullYear())),
      month: String(d.getUTCMonth() + 1).padStart(2, '0'),
      day: String(d.getUTCDate()).padStart(2, '0'),
      hour: String(d.getUTCHours()).padStart(2, '0'),
      minute: String(d.getUTCMinutes()).padStart(2, '0'),
      second: String(d.getUTCSeconds()).padStart(2, '0'),
      fractionalSecond: String(d.getUTCMilliseconds()).padStart(3, '0'),
      _fullYear: d.getUTCFullYear(),
    };
  }
  // For fixed-offset timezones, compute local time using BigInt arithmetic
  // to handle cases where local ms is outside Date's valid range
  if (/^[+-]\d{2}:\d{2}(:\d{2})?$/.test(tzId)) {
    const sign = tzId[0] === '+' ? 1 : -1;
    const h = parseInt(tzId.substring(1, 3), 10);
    const m = parseInt(tzId.substring(4, 6), 10);
    const s = tzId.length > 6 ? parseInt(tzId.substring(7, 9), 10) : 0;
    const offsetMs = sign * (h * 3600000 + m * 60000 + s * 1000);
    const localMs = epochMs + offsetMs;
    // If localMs is within Date range, use Date for formatting
    if (localMs >= -8640000000000000 && localMs <= 8640000000000000) {
      const d = new Date(localMs);
      return {
        year: String(Math.abs(d.getUTCFullYear())),
        month: String(d.getUTCMonth() + 1).padStart(2, '0'),
        day: String(d.getUTCDate()).padStart(2, '0'),
        hour: String(d.getUTCHours()).padStart(2, '0'),
        minute: String(d.getUTCMinutes()).padStart(2, '0'),
        second: String(d.getUTCSeconds()).padStart(2, '0'),
        fractionalSecond: String(d.getUTCMilliseconds()).padStart(3, '0'),
        _fullYear: d.getUTCFullYear(),
      };
    }
    // Out of Date range: compute using BigInt arithmetic
    // First get the UTC date parts at the epochMs, then add the offset
    return _computeLocalPartsFromBigInt(BigInt(Math.trunc(epochMs)) * 1000000n, BigInt(offsetMs) * 1000000n);
  }
  const d = new Date(epochMs);
  let fmt = _dtfCache.get(tzId);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tzId,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      era: 'short',
      fractionalSecondDigits: 3,
    });
    if (_dtfCache.size >= _CACHE_MAX) _evictOldest(_dtfCache, _CACHE_EVICT);
    _dtfCache.set(tzId, fmt);
  }
  const parts: LocalParts = {} as LocalParts;
  for (const { type, value } of fmt.formatToParts(d)) {
    (parts as any)[type] = value;
  }
  // Convert era-based year to astronomical year
  const eraYear = parseInt(parts.year, 10);
  const era = parts['era'];
  if (
    era &&
    (era === 'BC' ||
      era === 'B' ||
      era === 'v. Chr.' ||
      era === 'av. J.-C.' ||
      era === 'a.C.' ||
      era.toLowerCase() === 'bce' ||
      era.toLowerCase() === 'bc')
  ) {
    // BC year: 1 BC = year 0, 2 BC = year -1, etc.
    parts._fullYear = -(eraYear - 1);
  } else {
    parts._fullYear = eraYear;
  }
  return parts;
}

export function getUtcOffsetString(epochMs: number, tzId: string): string {
  if (tzId === 'UTC') return '+00:00';
  return _formatOffsetMs(_getOffsetMs(epochMs, tzId));
}

// Helper: resolve a local datetime to an epoch ms in a given timezone with disambiguation
// Returns { epochMs, offsetStr } or throws for 'reject' mode
export function _resolveLocalToEpochMs(
  isoYear: number,
  isoMonth: number,
  isoDay: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  tzId: string,
  disambiguation: string,
): { epochMs: number; offsetStr: string } {
  if (tzId === 'UTC' || /^[+-]\d{2}:\d{2}(:\d{2})?$/.test(tzId)) {
    const d = new Date(0);
    d.setUTCFullYear(isoYear, isoMonth - 1, isoDay);
    d.setUTCHours(hour, minute, second, ms);
    let localAsUtcMs = d.getTime();
    // For extreme dates beyond JS Date range, use pure arithmetic
    if (isNaN(localAsUtcMs)) {
      const epochDays = isoDateToEpochDays(isoYear, isoMonth, isoDay);
      localAsUtcMs = epochDays * 86400000 + hour * 3600000 + minute * 60000 + second * 1000 + (ms || 0);
    }
    if (tzId === 'UTC') {
      return { epochMs: localAsUtcMs, offsetStr: '+00:00' };
    }
    // Fixed-offset timezone
    const sign = tzId[0] === '+' ? 1 : -1;
    const tzH = parseInt(tzId.substring(1, 3), 10);
    const tzM = parseInt(tzId.substring(4, 6), 10);
    const tzS = tzId.length > 6 ? parseInt(tzId.substring(7, 9), 10) : 0;
    const offsetMs = sign * (tzH * 3600000 + tzM * 60000 + tzS * 1000);
    return { epochMs: localAsUtcMs - offsetMs, offsetStr: tzId };
  }

  // localTimeAsUtcMs: interpret the local time as if it were UTC
  const guess = new Date(0);
  guess.setUTCFullYear(isoYear, isoMonth - 1, isoDay);
  guess.setUTCHours(hour, minute, second, ms);
  const localAsUtcMs = guess.getTime();

  // Candidate 1: use the offset at (localAsUtcMs - estimated_offset)
  const estOffset = _getOffsetMs(localAsUtcMs, tzId);
  const candidate1 = localAsUtcMs - estOffset;
  const offset1 = _getOffsetMs(candidate1, tzId);
  const local1 = candidate1 + offset1;

  // Candidate 2: try with the offset at candidate1
  const candidate2 = localAsUtcMs - offset1;
  const offset2 = _getOffsetMs(candidate2, tzId);
  const local2 = candidate2 + offset2;

  // Collect valid candidates (those whose local time matches)
  const candidates = [];
  if (local1 === localAsUtcMs) candidates.push({ epochMs: candidate1, offset: offset1 });
  if (local2 === localAsUtcMs && candidate2 !== candidate1) candidates.push({ epochMs: candidate2, offset: offset2 });

  // Also check with various offsets to handle DST overlaps (including non-standard transitions)
  for (const delta of [-7200000, -3600000, -1800000, 1800000, 3600000, 7200000]) {
    const probeEpoch = candidate1 + delta;
    const probeOffset = _getOffsetMs(probeEpoch, tzId);
    const probeLocal = probeEpoch + probeOffset;
    if (probeLocal === localAsUtcMs && !candidates.some((c) => c.epochMs === probeEpoch)) {
      candidates.push({ epochMs: probeEpoch, offset: probeOffset });
    }
  }

  if (candidates.length === 0) {
    // DST gap: local time doesn't exist
    if (disambiguation === 'reject') {
      throw new RangeError('Invalid local time (falls in DST gap); use disambiguation option');
    }
    // For gap: find the transition boundary
    // The gap is between two offsets.
    // "earlier" -> use pre-gap offset (local time maps before the gap, i.e. earlier UTC time)
    // "compatible"/"later" -> use post-gap offset (local time maps after the gap, i.e. later UTC time)
    // Actually spec says: earlier = clamp to pre-transition wall-clock, compatible/later = clamp to post-transition
    // With the pre-gap offset, epochMs = localAsUtcMs - preGapOffset
    // With the post-gap offset, epochMs = localAsUtcMs - postGapOffset
    // The pre-gap offset is larger (more positive / less negative), so the epoch is smaller (earlier in UTC)
    // The post-gap offset is smaller, so the epoch is larger
    // "earlier" wants the pre-transition instant, "later"/"compatible" wants the post-transition instant

    // Find pre-gap and post-gap offsets more robustly
    // Look at a range around the target time
    const before = _getOffsetMs(localAsUtcMs - estOffset - 86400000, tzId); // 1 day before
    const after = _getOffsetMs(localAsUtcMs - estOffset + 86400000, tzId); // 1 day after

    let preGapOffset, postGapOffset;
    if (before > after || (before === after && estOffset > offset1)) {
      // Clock sprang forward: before offset is "bigger" (more ahead of UTC or less behind)
      // Wait, this is confusing. Let's think differently.
      // In a spring-forward gap at America/Vancouver:
      // Before gap: offset -08:00 (PST), After gap: offset -07:00 (PDT)
      // -07:00 > -08:00 in terms of milliseconds (-7*3600000 > -8*3600000)
      // So after > before
      preGapOffset = before; // -08:00 = -28800000
      postGapOffset = after; // -07:00 = -25200000
    } else {
      preGapOffset = after;
      postGapOffset = before;
    }

    if (disambiguation === 'earlier') {
      // Use pre-gap offset: the latest instant before the gap
      const epochMs = localAsUtcMs - preGapOffset;
      return { epochMs, offsetStr: _formatOffsetMs(preGapOffset) };
    }
    // compatible/later: use post-gap offset: the earliest instant after the gap
    const epochMs = localAsUtcMs - postGapOffset;
    return { epochMs, offsetStr: _formatOffsetMs(postGapOffset) };
  }

  if (candidates.length === 1) {
    // Unambiguous
    const c = candidates[0]!;
    return { epochMs: c.epochMs, offsetStr: _formatOffsetMs(c.offset) };
  }

  // DST overlap: ambiguous time (multiple valid instants)
  if (disambiguation === 'reject') {
    throw new RangeError('Ambiguous local time; use disambiguation option');
  }

  // Sort by epoch time (earlier first)
  candidates.sort((a, b) => a.epochMs - b.epochMs);

  if (disambiguation === 'later') {
    const c = candidates[candidates.length - 1]!;
    return { epochMs: c.epochMs, offsetStr: _formatOffsetMs(c.offset) };
  }
  // compatible/earlier: use the earlier instant
  const c = candidates[0]!;
  return { epochMs: c.epochMs, offsetStr: _formatOffsetMs(c.offset) };
}

export function _formatOffsetMs(offsetMs: number): string {
  const totalSeconds = Math.round(offsetMs / 1000);
  const sign = totalSeconds >= 0 ? '+' : '-';
  const absSeconds = Math.abs(totalSeconds);
  const offHr = String(Math.floor(absSeconds / 3600)).padStart(2, '0');
  const offMn = String(Math.floor((absSeconds % 3600) / 60)).padStart(2, '0');
  const offSc = absSeconds % 60;
  if (offSc !== 0) {
    return sign + offHr + ':' + offMn + ':' + String(offSc).padStart(2, '0');
  }
  return sign + offHr + ':' + offMn;
}

// Helper: get UTC offset in milliseconds for a timezone at a given epoch
export function _getOffsetMs(epochMs: number, tzId: string): number {
  if (tzId === 'UTC') return 0;
  const parts = getLocalPartsFromEpoch(epochMs, tzId);
  const localYear = parts._fullYear;
  const localMonth = parseInt(parts.month, 10) - 1;
  const localDay = parseInt(parts.day, 10);
  const localHour = parseInt(parts.hour, 10);
  const localMinute = parseInt(parts.minute, 10);
  const localSecond = parseInt(parts.second, 10);
  // Leave localHour as-is (may be 24); setUTCHours(24,...) correctly rolls to next day
  const localAsUtcDate = new Date(0);
  localAsUtcDate.setUTCFullYear(localYear, localMonth, localDay);
  localAsUtcDate.setUTCHours(localHour, localMinute, localSecond, 0);
  const localMs = localAsUtcDate.getTime();
  // If the local time exceeds JS Date range (extreme boundaries), compute offset
  // using pure arithmetic via epoch days
  if (isNaN(localMs)) {
    const localEpochDays = isoDateToEpochDays(localYear, localMonth + 1, localDay);
    const localTotalMs = localEpochDays * 86400000 + localHour * 3600000 + localMinute * 60000 + localSecond * 1000;
    return localTotalMs - Math.floor(epochMs / 1000) * 1000;
  }
  return localMs - Math.floor(epochMs / 1000) * 1000;
}

// Helper: find the next or previous timezone transition via binary search
export function _findTimeZoneTransition(zdt: any, dir: string): any {
  const tzId = zdt.timeZoneId;
  if (tzId === 'UTC') return null; // UTC has no transitions
  // Fixed-offset timezones have no transitions
  if (/^[+-]\d{2}:\d{2}(:\d{2})?$/.test(tzId) || /^Etc\/GMT[+-]\d+$/.test(tzId)) return null;

  const epochNs = zdt.epochNanoseconds;
  const epochMs = Number(epochNs / 1000000n);

  // Max representable range in epoch ms
  const MIN_EPOCH_MS = -8640000000000000;
  const MAX_EPOCH_MS = 8640000000000000;

  if (dir === 'next') {
    // Search forward for the NEAREST transition after the current instant.
    // Handle sub-ms nanosecond precision: if we have fractional ns within the ms,
    // check if the ms boundary itself is a transition point. If the offset at
    // (epochMs - 1) differs from the offset at epochMs, the transition IS at epochMs,
    // and since our actual position is epochMs + subMsNs (past the ms boundary by < 1ms
    // but at the same ms in integer terms), the transition at epochMs is the "next" one
    // only if subMsNs < 0 (i.e., we're actually before the ms boundary).
    const subMsNs = epochNs - BigInt(epochMs) * 1000000n;
    const clampedStart = Math.min(Math.max(epochMs, MIN_EPOCH_MS), MAX_EPOCH_MS);
    if (clampedStart >= MAX_EPOCH_MS) return null;

    // For negative sub-ms nanoseconds (or exact 0), check if we're right before a transition
    if (subMsNs < 0n && clampedStart > MIN_EPOCH_MS) {
      // subMsNs < 0 means epochNs / 1000000n truncated away from zero, so epochMs is 1 past
      // the actual ms. Check epochMs-1 vs epochMs.
      const beforeOffset = _getOffsetMs(clampedStart - 1, tzId);
      const atOffset = _getOffsetMs(clampedStart, tzId);
      if (beforeOffset !== atOffset) {
        // Transition at clampedStart ms - return it
        const transitionNs = BigInt(clampedStart) * 1000000n;
        const isoStr = bigintNsToZdtString(transitionNs, tzId, zdt.calendarId);
        return call(() => {
          const inner = NapiZonedDateTime.from(isoStr);
          return new _tzClasses['ZonedDateTime'](inner);
        });
      }
    }

    let prevMs = clampedStart;
    let prevOffset = _getOffsetMs(clampedStart, tzId);

    // Max search range: ~200 years
    const maxMs = Math.min(clampedStart + 200 * 365.25 * 86400000, MAX_EPOCH_MS);
    const tier1End = Math.min(clampedStart + 2 * 365.25 * 86400000, maxMs);

    let lo = -1,
      hi = -1;
    // Tier 1: 6-day steps for first 2 years
    let probeMs = clampedStart + 6 * 86400000;
    while (probeMs <= tier1End) {
      const probeOffset = _getOffsetMs(probeMs, tzId);
      if (probeOffset !== prevOffset) {
        lo = prevMs;
        hi = probeMs;
        break;
      }
      prevMs = probeMs;
      prevOffset = probeOffset;
      probeMs += 6 * 86400000;
    }
    // Tier 2: 90-day steps for remaining range
    if (lo === -1) {
      if (probeMs > tier1End) probeMs = tier1End;
      prevMs = probeMs - 6 * 86400000;
      prevOffset = _getOffsetMs(prevMs, tzId);
      probeMs = prevMs + 90 * 86400000;
      while (probeMs <= maxMs) {
        const probeOffset = _getOffsetMs(probeMs, tzId);
        if (probeOffset !== prevOffset) {
          lo = prevMs;
          hi = probeMs;
          break;
        }
        prevMs = probeMs;
        prevOffset = probeOffset;
        probeMs += 90 * 86400000;
      }
    }
    // Check the very end of the range
    if (lo === -1 && maxMs > prevMs) {
      const endOffset = _getOffsetMs(Math.floor(maxMs), tzId);
      if (endOffset !== prevOffset) {
        lo = prevMs;
        hi = Math.floor(maxMs);
      }
    }
    if (lo === -1) return null; // No transition found

    // Binary search between lo and hi to find exact transition point
    const loOffset = _getOffsetMs(lo, tzId);
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      const midOffset = _getOffsetMs(mid, tzId);
      if (midOffset === loOffset) {
        lo = mid;
        // loOffset stays the same since midOffset === loOffset
      } else {
        hi = mid;
      }
    }
    // hi is the first millisecond with the new offset
    const transitionNs = BigInt(hi) * 1000000n;
    // Clamp to representable range
    if (transitionNs > 8640000000000000000000n || transitionNs < -8640000000000000000000n) return null;
    const isoStr = bigintNsToZdtString(transitionNs, tzId, zdt.calendarId);
    return call(() => {
      const inner = NapiZonedDateTime.from(isoStr);
      return new _tzClasses['ZonedDateTime'](inner);
    });
  } else {
    // Search backward: find the most recent transition BEFORE the current instant
    // Handle nanosecond precision
    const subMsNs = epochNs - BigInt(epochMs) * 1000000n;
    let searchFromMs;
    let searchFromOffset;

    // Clamp epochMs to valid Date range for offset computation
    const clampedEpochMs = Math.max(epochMs, MIN_EPOCH_MS);
    const currentOffset = _getOffsetMs(clampedEpochMs, tzId);
    if (clampedEpochMs <= MIN_EPOCH_MS) {
      // At or below minimum epoch: no previous transitions possible
      return null;
    }
    if (subMsNs > 0n) {
      const prevMsOffset = _getOffsetMs(clampedEpochMs - 1, tzId);
      if (prevMsOffset !== currentOffset) {
        // Transition at this exact ms boundary
        const transitionNs = BigInt(clampedEpochMs) * 1000000n;
        const isoStr = bigintNsToZdtString(transitionNs, tzId, zdt.calendarId);
        return call(() => {
          const inner = NapiZonedDateTime.from(isoStr);
          return new _tzClasses['ZonedDateTime'](inner);
        });
      }
      searchFromMs = clampedEpochMs - 1;
      searchFromOffset = prevMsOffset;
    } else {
      searchFromMs = clampedEpochMs - 1;
      searchFromOffset = _getOffsetMs(searchFromMs, tzId);
    }

    // Sweep backward: tiered 6-day then 90-day steps
    const minMs = Math.max(searchFromMs - 200 * 365.25 * 86400000, MIN_EPOCH_MS);
    const tier1End = Math.max(searchFromMs - 2 * 365.25 * 86400000, minMs);
    let prevMs = searchFromMs;
    let prevOffset = searchFromOffset;
    let lo = -1,
      hi = -1;
    // Tier 1: 6-day steps for first 2 years back
    let probeMs = searchFromMs - 6 * 86400000;
    while (probeMs >= tier1End) {
      const probeOffset = _getOffsetMs(probeMs, tzId);
      if (probeOffset !== prevOffset) {
        lo = probeMs;
        hi = prevMs;
        break;
      }
      prevMs = probeMs;
      prevOffset = probeOffset;
      probeMs -= 6 * 86400000;
    }
    // Tier 2: 90-day steps for remaining range
    if (lo === -1) {
      probeMs = prevMs - 90 * 86400000;
      while (probeMs >= minMs) {
        const probeOffset = _getOffsetMs(probeMs, tzId);
        if (probeOffset !== prevOffset) {
          lo = probeMs;
          hi = prevMs;
          break;
        }
        prevMs = probeMs;
        prevOffset = probeOffset;
        probeMs -= 90 * 86400000;
      }
    }
    // Check the very start of the range
    if (lo === -1 && prevMs > minMs) {
      const startOffset = _getOffsetMs(Math.ceil(minMs), tzId);
      if (startOffset !== prevOffset) {
        lo = Math.ceil(minMs);
        hi = prevMs;
      }
    }
    if (lo === -1) return null; // No transition found

    // Binary search: lo has different offset from hi
    // We want to find the boundary: the earliest ms with same offset as searchFromOffset
    // (which equals the offset at hi)
    const hiOffset = _getOffsetMs(hi, tzId);
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      const midOffset = _getOffsetMs(mid, tzId);
      if (midOffset === hiOffset) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    // hi is the first ms with the current period's offset; the transition is at hi
    const transitionNs = BigInt(hi) * 1000000n;
    if (transitionNs > 8640000000000000000000n || transitionNs < -8640000000000000000000n) return null;
    const isoStr = bigintNsToZdtString(transitionNs, tzId, zdt.calendarId);
    return call(() => {
      const inner = NapiZonedDateTime.from(isoStr);
      return new _tzClasses['ZonedDateTime'](inner);
    });
  }
}

// Helper: validate a ZonedDateTime string for sub-minute offset and timezone validity
export function _validateZdtString(str: string): void {
  const tzMatch = str.match(/\[([^\]=]+)\]/);
  if (!tzMatch) return;
  const tzId = tzMatch[1]!;
  // Reject sub-minute timezone identifiers (e.g. -00:44:59)
  if (/^[+-]\d{2}:\d{2}:\d{2}/.test(tzId)) {
    throw new RangeError(`"${tzId}" is not a valid time zone identifier (sub-minute offsets not allowed)`);
  }
  // Extract the offset from the string
  const bracketIdx = str.indexOf('[');
  const dtOffsetStr = str.substring(0, bracketIdx);
  const offsetMatch = dtOffsetStr.match(/([+-])(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/);
  if (offsetMatch && /^[+-]\d{2}:\d{2}$/.test(tzId)) {
    // Fixed-offset timezone: the string offset must match exactly
    // The timezone is HH:MM, so the string offset must also have zero seconds
    const oS = offsetMatch[4]! ? parseInt(offsetMatch[4], 10) : 0;
    const oFrac = offsetMatch[5]! ? parseInt(offsetMatch[5], 10) : 0;
    if (oS !== 0 || oFrac !== 0) {
      // Check if the offset rounds to the timezone
      const sign = offsetMatch[1]! === '+' ? 1 : -1;
      const oH = parseInt(offsetMatch[2]!, 10);
      const oM = parseInt(offsetMatch[3]!, 10);
      const totalOffsetSeconds = sign * (oH * 3600 + oM * 60 + oS);
      const tzSign = tzId[0] === '+' ? 1 : -1;
      const tzH = parseInt(tzId.substring(1, 3), 10);
      const tzM = parseInt(tzId.substring(4, 6), 10);
      const tzTotalSeconds = tzSign * (tzH * 3600 + tzM * 60);
      if (totalOffsetSeconds !== tzTotalSeconds) {
        throw new RangeError(`Offset ${offsetMatch[0]} does not match time zone ${tzId}`);
      }
    }
  }
  // Check for IANA timezones with sub-minute offsets
  if (offsetMatch && !/^[+-]/.test(tzId)) {
    // Named timezone: the string has an explicit offset with seconds component
    // Per spec: for named timezones, the offset in the string must be within
    // the range that rounds to a valid offset for the timezone at that instant.
    // The NAPI handles this validation, but we need to check if the seconds
    // component of the offset is valid for this timezone.
    const oFrac = offsetMatch[5]! ? parseInt(offsetMatch[5], 10) : 0;
    if (oFrac !== 0) {
      // Sub-second offsets with non-zero fractional parts need exact match
      // The NAPI will handle this, but let's not interfere
    }
  }
}

// Helper: validate that a ZDT string's date/time components are within representable range
export function _validateZdtStringLimits(str: string): void {
  const bracketIdx = str.indexOf('[');
  if (bracketIdx === -1) return;
  const dtOffsetStr = str.substring(0, bracketIdx);
  // Extract year
  const yearMatch = dtOffsetStr.match(/^([+-]?\d{4,6})/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1]!, 10);
    if (year === -271821) {
      // Check if this might be out of range
      const monthMatch = dtOffsetStr.match(/^[+-]?\d{4,6}-(\d{2})-(\d{2})/);
      if (monthMatch) {
        const month = parseInt(monthMatch[1]!, 10);
        const day = parseInt(monthMatch[2]!, 10);
        if (month < 4 || (month === 4 && day < 20)) {
          throw new RangeError(`"${str}" is outside the representable range for a relativeTo parameter`);
        }
      }
    } else if (year === 275760) {
      const monthMatch = dtOffsetStr.match(/^[+-]?\d{4,6}-(\d{2})-(\d{2})/);
      if (monthMatch) {
        const month = parseInt(monthMatch[1]!, 10);
        const day = parseInt(monthMatch[2]!, 10);
        if (month > 9 || (month === 9 && day > 13)) {
          throw new RangeError(`"${str}" is outside the representable range for a relativeTo parameter`);
        }
      }
    } else if (year < -271821 || year > 275760) {
      throw new RangeError(`"${str}" is outside the representable range for a relativeTo parameter`);
    }
  }
}

// Helper: extract ISO date components from a NAPI PlainDateTime/PlainDate toString()
export function _extractISOFromNapiDT(inner: any): { year: number; month: number; day: number } {
  const str = inner.toString();
  const m = str.match(/^(-?\d+|\+\d+)-(\d{2})-(\d{2})/);
  if (!m) return { year: inner.year, month: inner.month, day: inner.day };
  return { year: parseInt(m[1], 10), month: parseInt(m[2], 10), day: parseInt(m[3], 10) };
}

// Helper: parse a ZDT string into its component parts
export function _parseZdtStringParts(str: string): ZdtStringParts | null {
  const tzMatch = str.match(/\[([^\]=]+)\]/);
  if (!tzMatch) return null;
  const tzId = tzMatch[1];
  const bracketIdx = str.indexOf('[');
  let dtStr = str.substring(0, bracketIdx);
  // Strip offset if present
  const offsetMatch = dtStr.match(/([+-])(\d{2}):?(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/);
  if (offsetMatch) dtStr = dtStr.substring(0, offsetMatch.index);
  else if (dtStr.endsWith('Z')) dtStr = dtStr.slice(0, -1);
  // Parse ISO date-time
  const m = dtStr.match(/^([+-]?\d{4,6})-(\d{2})-(\d{2})(?:T(\d{2}):?(\d{2}):?(\d{2})?(?:\.(\d+))?)?$/);
  if (!m) {
    // Try compact form
    const m2 = dtStr.match(/^([+-]?\d{4,6})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(?:\.(\d+))?)?$/);
    if (!m2) return null;
    const frac = m2[7]! || '';
    const fracPad = (frac + '000000000').substring(0, 9);
    return {
      isoYear: parseInt(m2[1]!, 10),
      isoMonth: parseInt(m2[2]!, 10),
      isoDay: parseInt(m2[3]!, 10),
      hour: parseInt(m2[4] || '0', 10),
      minute: parseInt(m2[5] || '0', 10),
      second: parseInt(m2[6] || '0', 10),
      millisecond: parseInt(fracPad.substring(0, 3), 10),
      microsecond: parseInt(fracPad.substring(3, 6), 10),
      nanosecond: parseInt(fracPad.substring(6, 9), 10),
      tzId: tzId!,
    };
  }
  const frac = m[7]! || '';
  const fracPad = (frac + '000000000').substring(0, 9);
  return {
    isoYear: parseInt(m[1]!, 10),
    isoMonth: parseInt(m[2]!, 10),
    isoDay: parseInt(m[3]!, 10),
    hour: parseInt(m[4] || '0', 10),
    minute: parseInt(m[5] || '0', 10),
    second: parseInt(m[6] || '0', 10),
    millisecond: parseInt(fracPad.substring(0, 3), 10),
    microsecond: parseInt(fracPad.substring(3, 6), 10),
    nanosecond: parseInt(fracPad.substring(6, 9), 10),
    tzId: tzId!,
  };
}

// Helper: parse a ZDT string and use the offset to compute the exact instant
export function _zdtFromStringWithOffset(str: string): any {
  // Parse: dateT time offset [timezone] [u-ca=calendar]
  // Extract the offset and timezone
  const tzMatch = str.match(/\[([^\]=]+)\]/);
  if (!tzMatch) throw new RangeError('Missing timezone annotation');
  const tzId = tzMatch[1];
  const calMatch = str.match(/\[u-ca=([^\]]+)\]/);
  const calId = calMatch ? calMatch[1] : 'iso8601';

  // Extract the ISO datetime and offset parts
  // Split at the first bracket to get datetime+offset
  const bracketIdx = str.indexOf('[');
  const dtOffsetStr = str.substring(0, bracketIdx);

  // Parse offset from the datetime+offset string
  const offsetMatch = dtOffsetStr.match(/([+-])(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/);
  const isZ = dtOffsetStr.endsWith('Z') && !offsetMatch;

  if (!offsetMatch && !isZ) {
    // No offset found, try NAPI directly
    return new _tzClasses['ZonedDateTime'](call(() => NapiZonedDateTime.from(str)));
  }

  let offsetNs = 0n;
  if (isZ) {
    offsetNs = 0n;
  } else {
    const sign = offsetMatch![1]! === '+' ? 1n : -1n;
    const oH = BigInt(offsetMatch![2]!);
    const oM = BigInt(offsetMatch![3]!);
    const oS = offsetMatch![4]! ? BigInt(offsetMatch![4]) : 0n;
    let oSubS = 0n;
    if (offsetMatch![5]!) {
      const frac = (offsetMatch![5] + '000000000').substring(0, 9);
      oSubS = BigInt(frac);
    }
    offsetNs = sign * (oH * 3600000000000n + oM * 60000000000n + oS * 1000000000n + oSubS);
  }

  // Parse the datetime portion (before the offset)
  const dtStr = isZ ? dtOffsetStr.slice(0, -1) : dtOffsetStr.substring(0, offsetMatch!.index);

  // Compute epoch nanoseconds from the local datetime string using pure arithmetic
  // to handle dates at the edges of the representable range (NapiInstant can't handle
  // local times beyond the instant range even if the result after offset would be in range)
  let instantEpochNs;
  const dtMatch = dtStr.match(/^([+-]?\d{4,6})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?$/);
  if (dtMatch) {
    const [, yr, mo, dy, hr, mi, se, frac] = dtMatch as string[];
    const epochDays = BigInt(isoDateToEpochDays(parseInt(yr!, 10), parseInt(mo!, 10), parseInt(dy!, 10)));
    const dayNs =
      BigInt(parseInt(hr!, 10)) * 3600000000000n +
      BigInt(parseInt(mi!, 10)) * 60000000000n +
      BigInt(parseInt(se || '0', 10)) * 1000000000n;
    let fracNs = 0n;
    if (frac) {
      fracNs = BigInt((frac + '000000000').substring(0, 9));
    }
    instantEpochNs = epochDays * 86400000000000n + dayNs + fracNs;
  } else {
    // Fallback: try NapiInstant
    const instant = call(() => NapiInstant.from(dtStr + 'Z'));
    instantEpochNs = computeEpochNanoseconds(instant);
  }
  // epochNs = datetime_as_utc - offsetNs (because datetime = UTC + offset, so UTC = datetime - offset)
  const epochNs = instantEpochNs - offsetNs;

  // Validate epoch nanoseconds range
  const limit = 8640000000000000000000n;
  if (epochNs < -limit || epochNs > limit) {
    throw new RangeError('Instant nanoseconds are not within a valid epoch range.');
  }

  // Create ZDT from epoch nanoseconds + timezone using the ZonedDateTime constructor
  // which handles extreme values with proper fallbacks
  return new _tzClasses['ZonedDateTime'](epochNs, tzId, calId !== 'iso8601' ? calId : undefined);
}

export function bigintNsToZdtString(epochNs: bigint, tzId: string, calId?: string): string {
  const NS_PER_MS = 1000000n;
  let epochMs = epochNs / NS_PER_MS;
  let subMsNs = epochNs % NS_PER_MS;
  if (subMsNs < 0n) {
    subMsNs += NS_PER_MS;
    epochMs -= 1n;
  }
  const msNum = Number(epochMs);
  const parts = getLocalPartsFromEpoch(msNum, tzId);
  const micros = String(Number(subMsNs / 1000n)).padStart(3, '0');
  const nanos = String(Number(subMsNs % 1000n)).padStart(3, '0');
  let year = parts._fullYear;
  let month = parts.month;
  let day = parts.day;
  let hour = parseInt(parts.hour, 10);
  const minute = parts.minute;
  const second = parts.second;
  // Normalize hour 24 (some ICU implementations return 24 for midnight)
  if (hour === 24) {
    hour = 0;
    // Roll to next day using epoch arithmetic
    const nextDayEpoch = isoDateToEpochDays(year, parseInt(month, 10), parseInt(day, 10)) + 1;
    const nextDay = epochDaysToISO(nextDayEpoch);
    year = nextDay.year;
    month = String(nextDay.month).padStart(2, '0');
    day = String(nextDay.day).padStart(2, '0');
  }
  const ms = (parts.fractionalSecond || '000').padEnd(3, '0');
  let yearStr;
  if (year < 0 || year >= 10000) {
    const s = String(Math.abs(year)).padStart(6, '0');
    yearStr = (year < 0 ? '-' : '+') + s;
  } else {
    yearStr = String(year).padStart(4, '0');
  }
  let frac = ms + micros + nanos;
  frac = frac.replace(/0+$/, '');
  const fracPart = frac ? '.' + frac : '';
  // Compute offset inline to avoid redundant getLocalPartsFromEpoch call
  let offset;
  if (tzId === 'UTC') {
    offset = '+00:00';
  } else if (/^[+-]\d{2}:\d{2}(:\d{2})?$/.test(tzId)) {
    offset = tzId;
  } else {
    // Compute offset from local parts (already computed above)
    const localAsUtcDate = new Date(0);
    localAsUtcDate.setUTCFullYear(year, parseInt(month, 10) - 1, parseInt(day, 10));
    localAsUtcDate.setUTCHours(hour, parseInt(minute, 10), parseInt(second, 10), 0);
    const localAsUtc = localAsUtcDate.getTime();
    if (isNaN(localAsUtc)) {
      const localEpochDays = isoDateToEpochDays(year, parseInt(month, 10), parseInt(day, 10));
      const localTotalMs =
        localEpochDays * 86400000 + hour * 3600000 + parseInt(minute, 10) * 60000 + parseInt(second, 10) * 1000;
      offset = _formatOffsetMs(localTotalMs - Math.floor(msNum / 1000) * 1000);
    } else {
      offset = _formatOffsetMs(localAsUtc - Math.floor(msNum / 1000) * 1000);
    }
  }
  const calPart = calId && calId !== 'iso8601' ? '[u-ca=' + calId + ']' : '';
  return (
    yearStr +
    '-' +
    month +
    '-' +
    day +
    'T' +
    String(hour).padStart(2, '0') +
    ':' +
    minute +
    ':' +
    second +
    fracPart +
    offset +
    '[' +
    tzId +
    ']' +
    calPart
  );
}
