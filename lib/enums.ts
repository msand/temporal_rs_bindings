// ─── Enum mapping (spec lowercase → NAPI PascalCase) ─────────

export const UNIT_MAP: Record<string, string> = {
  auto: 'Auto',
  nanosecond: 'Nanosecond',
  nanoseconds: 'Nanosecond',
  microsecond: 'Microsecond',
  microseconds: 'Microsecond',
  millisecond: 'Millisecond',
  milliseconds: 'Millisecond',
  second: 'Second',
  seconds: 'Second',
  minute: 'Minute',
  minutes: 'Minute',
  hour: 'Hour',
  hours: 'Hour',
  day: 'Day',
  days: 'Day',
  week: 'Week',
  weeks: 'Week',
  month: 'Month',
  months: 'Month',
  year: 'Year',
  years: 'Year',
};

export const ROUNDING_MODE_MAP: Record<string, string> = {
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

export const OVERFLOW_MAP: Record<string, string> = {
  constrain: 'Constrain',
  reject: 'Reject',
};

export const DISAMBIGUATION_MAP: Record<string, string> = {
  compatible: 'Compatible',
  earlier: 'Earlier',
  later: 'Later',
  reject: 'Reject',
};

export const OFFSET_DISAMBIGUATION_MAP: Record<string, string> = {
  use: 'Use',
  prefer: 'Prefer',
  ignore: 'Ignore',
  reject: 'Reject',
};

export const DISPLAY_CALENDAR_MAP: Record<string, string> = {
  auto: 'Auto',
  always: 'Always',
  never: 'Never',
  critical: 'Critical',
};

export const DISPLAY_OFFSET_MAP: Record<string, string> = {
  auto: 'Auto',
  never: 'Never',
};

export const DISPLAY_TIMEZONE_MAP: Record<string, string> = {
  auto: 'Auto',
  never: 'Never',
  critical: 'Critical',
};

// ─── Helper: map enum with validation ─────────────────────────

export function mapUnit(val: any): any {
  if (val === undefined) return undefined;
  if (typeof val === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
  const str = String(val);
  const mapped = UNIT_MAP[str];
  if (!mapped) throw new RangeError(`Invalid unit: ${val}`);
  return mapped;
}

export function mapRoundingMode(val: any): any {
  if (val === undefined) return undefined;
  if (typeof val === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
  const str = String(val);
  const mapped = ROUNDING_MODE_MAP[str];
  if (!mapped) throw new RangeError(`Invalid rounding mode: ${val}`);
  return mapped;
}

export function mapOverflow(val: any): any {
  if (val === undefined) return undefined;
  if (typeof val === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
  const str = String(val);
  const mapped = OVERFLOW_MAP[str];
  if (!mapped) throw new RangeError(`Invalid overflow: ${val}`);
  return mapped;
}

export function mapDisplayCalendar(val: any): any {
  if (val === undefined) return undefined;
  if (typeof val === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
  const str = String(val);
  const mapped = DISPLAY_CALENDAR_MAP[str];
  if (!mapped) throw new RangeError(`Invalid calendarName option: ${val}`);
  return mapped;
}
