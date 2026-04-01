// Type definitions for temporal_rs
// Aligned with TypeScript's lib/esnext.temporal.d.ts

// ═══════════════════════════════════════════════════════════════
//  Type aliases
// ═══════════════════════════════════════════════════════════════

export type CalendarLike = PlainDate | PlainDateTime | PlainMonthDay | PlainYearMonth | ZonedDateTime | string;
export type DurationLike = Duration | DurationLikeObject | string;
export type InstantLike = Instant | ZonedDateTime | string;
export type PlainDateLike = PlainDate | ZonedDateTime | PlainDateTime | DateLikeObject | string;
export type PlainDateTimeLike = PlainDateTime | ZonedDateTime | PlainDate | DateTimeLikeObject | string;
export type PlainMonthDayLike = PlainMonthDay | DateLikeObject | string;
export type PlainTimeLike = PlainTime | PlainDateTime | ZonedDateTime | TimeLikeObject | string;
export type PlainYearMonthLike = PlainYearMonth | YearMonthLikeObject | string;
export type TimeZoneLike = ZonedDateTime | string;
export type ZonedDateTimeLike = ZonedDateTime | ZonedDateTimeLikeObject | string;

export type PartialTemporalLike<T extends object> = {
  [P in Exclude<keyof T, 'calendar' | 'timeZone'>]?: T[P] | undefined;
};

// ═══════════════════════════════════════════════════════════════
//  Like-object interfaces
// ═══════════════════════════════════════════════════════════════

export interface DateLikeObject {
  year?: number | undefined;
  era?: string | undefined;
  eraYear?: number | undefined;
  month?: number | undefined;
  monthCode?: string | undefined;
  day: number;
  calendar?: string | undefined;
}

export interface DateTimeLikeObject extends DateLikeObject, TimeLikeObject {}

export interface DurationLikeObject {
  years?: number | undefined;
  months?: number | undefined;
  weeks?: number | undefined;
  days?: number | undefined;
  hours?: number | undefined;
  minutes?: number | undefined;
  seconds?: number | undefined;
  milliseconds?: number | undefined;
  microseconds?: number | undefined;
  nanoseconds?: number | undefined;
}

export interface TimeLikeObject {
  hour?: number | undefined;
  minute?: number | undefined;
  second?: number | undefined;
  millisecond?: number | undefined;
  microsecond?: number | undefined;
  nanosecond?: number | undefined;
}

export interface YearMonthLikeObject extends Omit<DateLikeObject, 'day'> {}

export interface ZonedDateTimeLikeObject extends DateTimeLikeObject {
  timeZone: TimeZoneLike;
  offset?: string | undefined;
}

// ═══════════════════════════════════════════════════════════════
//  Unit types
// ═══════════════════════════════════════════════════════════════

export type DateUnit = 'year' | 'month' | 'week' | 'day';
export type TimeUnit = 'hour' | 'minute' | 'second' | 'millisecond' | 'microsecond' | 'nanosecond';
export type PluralizeUnit<T extends DateUnit | TimeUnit> =
  | T
  | {
      year: 'years';
      month: 'months';
      week: 'weeks';
      day: 'days';
      hour: 'hours';
      minute: 'minutes';
      second: 'seconds';
      millisecond: 'milliseconds';
      microsecond: 'microseconds';
      nanosecond: 'nanoseconds';
    }[T];

// ═══════════════════════════════════════════════════════════════
//  Options interfaces
// ═══════════════════════════════════════════════════════════════

export interface DisambiguationOptions {
  disambiguation?: 'compatible' | 'earlier' | 'later' | 'reject' | undefined;
}

export interface OverflowOptions {
  overflow?: 'constrain' | 'reject' | undefined;
}

export interface TransitionOptions {
  direction: 'next' | 'previous';
}

export interface RoundingOptions<Units extends DateUnit | TimeUnit> {
  smallestUnit?: PluralizeUnit<Units> | undefined;
  roundingIncrement?: number | undefined;
  roundingMode?:
    | 'ceil'
    | 'floor'
    | 'expand'
    | 'trunc'
    | 'halfCeil'
    | 'halfFloor'
    | 'halfExpand'
    | 'halfTrunc'
    | 'halfEven'
    | undefined;
}

export interface RoundingOptionsWithLargestUnit<Units extends DateUnit | TimeUnit> extends RoundingOptions<Units> {
  largestUnit?: 'auto' | PluralizeUnit<Units> | undefined;
}

export interface ToStringRoundingOptions<Units extends DateUnit | TimeUnit> extends Pick<
  RoundingOptions<Units>,
  'smallestUnit' | 'roundingMode'
> {}

export interface ToStringRoundingOptionsWithFractionalSeconds<
  Units extends DateUnit | TimeUnit,
> extends ToStringRoundingOptions<Units> {
  fractionalSecondDigits?: 'auto' | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | undefined;
}

// ═══════════════════════════════════════════════════════════════
//  PlainDate
// ═══════════════════════════════════════════════════════════════

export interface PlainDateToStringOptions {
  calendarName?: 'auto' | 'always' | 'never' | 'critical' | undefined;
}

export interface PlainDateToZonedDateTimeOptions {
  plainTime?: PlainTimeLike | undefined;
  timeZone: TimeZoneLike;
}

export interface PlainDate {
  readonly calendarId: string;
  readonly era: string | undefined;
  readonly eraYear: number | undefined;
  readonly year: number;
  readonly month: number;
  readonly monthCode: string;
  readonly day: number;
  readonly dayOfWeek: number;
  readonly dayOfYear: number;
  readonly weekOfYear: number | undefined;
  readonly yearOfWeek: number | undefined;
  readonly daysInWeek: number;
  readonly daysInMonth: number;
  readonly daysInYear: number;
  readonly monthsInYear: number;
  readonly inLeapYear: boolean;
  toPlainYearMonth(): PlainYearMonth;
  toPlainMonthDay(): PlainMonthDay;
  add(duration: DurationLike, options?: OverflowOptions): PlainDate;
  subtract(duration: DurationLike, options?: OverflowOptions): PlainDate;
  with(dateLike: PartialTemporalLike<DateLikeObject>, options?: OverflowOptions): PlainDate;
  withCalendar(calendarLike: CalendarLike): PlainDate;
  until(other: PlainDateLike, options?: RoundingOptionsWithLargestUnit<DateUnit>): Duration;
  since(other: PlainDateLike, options?: RoundingOptionsWithLargestUnit<DateUnit>): Duration;
  equals(other: PlainDateLike): boolean;
  toPlainDateTime(time?: PlainTimeLike): PlainDateTime;
  toZonedDateTime(timeZone: TimeZoneLike): ZonedDateTime;
  toZonedDateTime(item: PlainDateToZonedDateTimeOptions): ZonedDateTime;
  toString(options?: PlainDateToStringOptions): string;
  toLocaleString(locales?: string | string[], options?: Intl.DateTimeFormatOptions): string;
  toJSON(): string;
  valueOf(): never;
  readonly [Symbol.toStringTag]: 'Temporal.PlainDate';
}

export interface PlainDateConstructor {
  new (isoYear: number, isoMonth: number, isoDay: number, calendar?: string): PlainDate;
  readonly prototype: PlainDate;
  from(item: PlainDateLike, options?: OverflowOptions): PlainDate;
  compare(one: PlainDateLike, two: PlainDateLike): number;
}
export declare const PlainDate: PlainDateConstructor;

// ═══════════════════════════════════════════════════════════════
//  PlainTime
// ═══════════════════════════════════════════════════════════════

export interface PlainTimeToStringOptions extends ToStringRoundingOptionsWithFractionalSeconds<
  Exclude<TimeUnit, 'hour'>
> {}

export interface PlainTime {
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;
  readonly microsecond: number;
  readonly nanosecond: number;
  add(duration: DurationLike): PlainTime;
  subtract(duration: DurationLike): PlainTime;
  with(timeLike: PartialTemporalLike<TimeLikeObject>, options?: OverflowOptions): PlainTime;
  until(other: PlainTimeLike, options?: RoundingOptionsWithLargestUnit<TimeUnit>): Duration;
  since(other: PlainTimeLike, options?: RoundingOptionsWithLargestUnit<TimeUnit>): Duration;
  equals(other: PlainTimeLike): boolean;
  round(roundTo: PluralizeUnit<TimeUnit>): PlainTime;
  round(roundTo: RoundingOptions<TimeUnit>): PlainTime;
  toString(options?: PlainTimeToStringOptions): string;
  toLocaleString(locales?: string | string[], options?: Intl.DateTimeFormatOptions): string;
  toJSON(): string;
  valueOf(): never;
  readonly [Symbol.toStringTag]: 'Temporal.PlainTime';
}

export interface PlainTimeConstructor {
  new (
    hour?: number,
    minute?: number,
    second?: number,
    millisecond?: number,
    microsecond?: number,
    nanosecond?: number,
  ): PlainTime;
  readonly prototype: PlainTime;
  from(item: PlainTimeLike, options?: OverflowOptions): PlainTime;
  compare(one: PlainTimeLike, two: PlainTimeLike): number;
}
export declare const PlainTime: PlainTimeConstructor;

// ═══════════════════════════════════════════════════════════════
//  PlainDateTime
// ═══════════════════════════════════════════════════════════════

export interface PlainDateTimeToStringOptions extends PlainDateToStringOptions, PlainTimeToStringOptions {}

export interface PlainDateTime {
  readonly calendarId: string;
  readonly era: string | undefined;
  readonly eraYear: number | undefined;
  readonly year: number;
  readonly month: number;
  readonly monthCode: string;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;
  readonly microsecond: number;
  readonly nanosecond: number;
  readonly dayOfWeek: number;
  readonly dayOfYear: number;
  readonly weekOfYear: number | undefined;
  readonly yearOfWeek: number | undefined;
  readonly daysInWeek: number;
  readonly daysInMonth: number;
  readonly daysInYear: number;
  readonly monthsInYear: number;
  readonly inLeapYear: boolean;
  with(dateTimeLike: PartialTemporalLike<DateTimeLikeObject>, options?: OverflowOptions): PlainDateTime;
  withPlainTime(plainTime?: PlainTimeLike): PlainDateTime;
  withCalendar(calendar: CalendarLike): PlainDateTime;
  add(duration: DurationLike, options?: OverflowOptions): PlainDateTime;
  subtract(duration: DurationLike, options?: OverflowOptions): PlainDateTime;
  until(other: PlainDateTimeLike, options?: RoundingOptionsWithLargestUnit<DateUnit | TimeUnit>): Duration;
  since(other: PlainDateTimeLike, options?: RoundingOptionsWithLargestUnit<DateUnit | TimeUnit>): Duration;
  round(roundTo: PluralizeUnit<'day' | TimeUnit>): PlainDateTime;
  round(roundTo: RoundingOptions<'day' | TimeUnit>): PlainDateTime;
  equals(other: PlainDateTimeLike): boolean;
  toString(options?: PlainDateTimeToStringOptions): string;
  toLocaleString(locales?: string | string[], options?: Intl.DateTimeFormatOptions): string;
  toJSON(): string;
  valueOf(): never;
  toZonedDateTime(timeZone: TimeZoneLike, options?: DisambiguationOptions): ZonedDateTime;
  toPlainDate(): PlainDate;
  toPlainTime(): PlainTime;
  readonly [Symbol.toStringTag]: 'Temporal.PlainDateTime';
}

export interface PlainDateTimeConstructor {
  new (
    isoYear: number,
    isoMonth: number,
    isoDay: number,
    hour?: number,
    minute?: number,
    second?: number,
    millisecond?: number,
    microsecond?: number,
    nanosecond?: number,
    calendar?: string,
  ): PlainDateTime;
  readonly prototype: PlainDateTime;
  from(item: PlainDateTimeLike, options?: OverflowOptions): PlainDateTime;
  compare(one: PlainDateTimeLike, two: PlainDateTimeLike): number;
}
export declare const PlainDateTime: PlainDateTimeConstructor;

// ═══════════════════════════════════════════════════════════════
//  ZonedDateTime
// ═══════════════════════════════════════════════════════════════

export interface ZonedDateTimeToStringOptions extends PlainDateTimeToStringOptions {
  offset?: 'auto' | 'never' | undefined;
  timeZoneName?: 'auto' | 'never' | 'critical' | undefined;
}

export interface ZonedDateTimeFromOptions extends OverflowOptions, DisambiguationOptions {
  offset?: 'use' | 'ignore' | 'prefer' | 'reject' | undefined;
}

export interface ZonedDateTime {
  readonly calendarId: string;
  readonly timeZoneId: string;
  readonly era: string | undefined;
  readonly eraYear: number | undefined;
  readonly year: number;
  readonly month: number;
  readonly monthCode: string;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;
  readonly microsecond: number;
  readonly nanosecond: number;
  readonly epochMilliseconds: number;
  readonly epochNanoseconds: bigint;
  readonly dayOfWeek: number;
  readonly dayOfYear: number;
  readonly weekOfYear: number | undefined;
  readonly yearOfWeek: number | undefined;
  readonly hoursInDay: number;
  readonly daysInWeek: number;
  readonly daysInMonth: number;
  readonly daysInYear: number;
  readonly monthsInYear: number;
  readonly inLeapYear: boolean;
  readonly offsetNanoseconds: number;
  readonly offset: string;
  with(
    zonedDateTimeLike: PartialTemporalLike<ZonedDateTimeLikeObject>,
    options?: ZonedDateTimeFromOptions,
  ): ZonedDateTime;
  withPlainTime(plainTime?: PlainTimeLike): ZonedDateTime;
  withTimeZone(timeZone: TimeZoneLike): ZonedDateTime;
  withCalendar(calendar: CalendarLike): ZonedDateTime;
  add(duration: DurationLike, options?: OverflowOptions): ZonedDateTime;
  subtract(duration: DurationLike, options?: OverflowOptions): ZonedDateTime;
  until(other: ZonedDateTimeLike, options?: RoundingOptionsWithLargestUnit<DateUnit | TimeUnit>): Duration;
  since(other: ZonedDateTimeLike, options?: RoundingOptionsWithLargestUnit<DateUnit | TimeUnit>): Duration;
  round(roundTo: PluralizeUnit<'day' | TimeUnit>): ZonedDateTime;
  round(roundTo: RoundingOptions<'day' | TimeUnit>): ZonedDateTime;
  equals(other: ZonedDateTimeLike): boolean;
  toString(options?: ZonedDateTimeToStringOptions): string;
  toLocaleString(locales?: string | string[], options?: Intl.DateTimeFormatOptions): string;
  toJSON(): string;
  valueOf(): never;
  startOfDay(): ZonedDateTime;
  getTimeZoneTransition(direction: 'next' | 'previous'): ZonedDateTime | null;
  getTimeZoneTransition(direction: TransitionOptions): ZonedDateTime | null;
  toInstant(): Instant;
  toPlainDate(): PlainDate;
  toPlainTime(): PlainTime;
  toPlainDateTime(): PlainDateTime;
  readonly [Symbol.toStringTag]: 'Temporal.ZonedDateTime';
}

export interface ZonedDateTimeConstructor {
  new (epochNanoseconds: bigint, timeZone: string, calendar?: string): ZonedDateTime;
  readonly prototype: ZonedDateTime;
  from(item: ZonedDateTimeLike, options?: ZonedDateTimeFromOptions): ZonedDateTime;
  compare(one: ZonedDateTimeLike, two: ZonedDateTimeLike): number;
}
export declare const ZonedDateTime: ZonedDateTimeConstructor;

// ═══════════════════════════════════════════════════════════════
//  Duration
// ═══════════════════════════════════════════════════════════════

export interface DurationRelativeToOptions {
  relativeTo?: ZonedDateTimeLike | PlainDateLike | undefined;
}

export interface DurationRoundingOptions
  extends DurationRelativeToOptions, RoundingOptionsWithLargestUnit<DateUnit | TimeUnit> {}

export interface DurationToStringOptions extends ToStringRoundingOptionsWithFractionalSeconds<
  Exclude<TimeUnit, 'hour' | 'minute'>
> {}

export interface DurationTotalOptions extends DurationRelativeToOptions {
  unit: PluralizeUnit<DateUnit | TimeUnit>;
}

export interface Duration {
  readonly years: number;
  readonly months: number;
  readonly weeks: number;
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
  readonly milliseconds: number;
  readonly microseconds: number;
  readonly nanoseconds: number;
  readonly sign: number;
  readonly blank: boolean;
  with(durationLike: PartialTemporalLike<DurationLikeObject>): Duration;
  negated(): Duration;
  abs(): Duration;
  add(other: DurationLike): Duration;
  subtract(other: DurationLike): Duration;
  round(roundTo: PluralizeUnit<'day' | TimeUnit>): Duration;
  round(roundTo: DurationRoundingOptions): Duration;
  total(totalOf: PluralizeUnit<'day' | TimeUnit>): number;
  total(totalOf: DurationTotalOptions): number;
  toString(options?: DurationToStringOptions): string;
  toLocaleString(locales?: string | string[], options?: Intl.DateTimeFormatOptions): string;
  toJSON(): string;
  valueOf(): never;
  readonly [Symbol.toStringTag]: 'Temporal.Duration';
}

export interface DurationConstructor {
  new (
    years?: number,
    months?: number,
    weeks?: number,
    days?: number,
    hours?: number,
    minutes?: number,
    seconds?: number,
    milliseconds?: number,
    microseconds?: number,
    nanoseconds?: number,
  ): Duration;
  readonly prototype: Duration;
  from(item: DurationLike): Duration;
  compare(one: DurationLike, two: DurationLike, options?: DurationRelativeToOptions): number;
}
export declare const Duration: DurationConstructor;

// ═══════════════════════════════════════════════════════════════
//  Instant
// ═══════════════════════════════════════════════════════════════

export interface InstantToStringOptions extends PlainTimeToStringOptions {
  timeZone?: TimeZoneLike | undefined;
}

export interface Instant {
  readonly epochMilliseconds: number;
  readonly epochNanoseconds: bigint;
  add(duration: DurationLike): Instant;
  subtract(duration: DurationLike): Instant;
  until(other: InstantLike, options?: RoundingOptionsWithLargestUnit<TimeUnit>): Duration;
  since(other: InstantLike, options?: RoundingOptionsWithLargestUnit<TimeUnit>): Duration;
  round(roundTo: PluralizeUnit<TimeUnit>): Instant;
  round(roundTo: RoundingOptions<TimeUnit>): Instant;
  equals(other: InstantLike): boolean;
  toString(options?: InstantToStringOptions): string;
  toLocaleString(locales?: string | string[], options?: Intl.DateTimeFormatOptions): string;
  toJSON(): string;
  valueOf(): never;
  toZonedDateTimeISO(timeZone: TimeZoneLike): ZonedDateTime;
  readonly [Symbol.toStringTag]: 'Temporal.Instant';
}

export interface InstantConstructor {
  new (epochNanoseconds: bigint): Instant;
  readonly prototype: Instant;
  from(item: InstantLike): Instant;
  fromEpochMilliseconds(epochMilliseconds: number): Instant;
  fromEpochNanoseconds(epochNanoseconds: bigint): Instant;
  compare(one: InstantLike, two: InstantLike): number;
}
export declare const Instant: InstantConstructor;

// ═══════════════════════════════════════════════════════════════
//  PlainYearMonth
// ═══════════════════════════════════════════════════════════════

export interface PlainYearMonthToPlainDateOptions {
  day: number;
}

export interface PlainYearMonth {
  readonly calendarId: string;
  readonly era: string | undefined;
  readonly eraYear: number | undefined;
  readonly year: number;
  readonly month: number;
  readonly monthCode: string;
  readonly daysInYear: number;
  readonly daysInMonth: number;
  readonly monthsInYear: number;
  readonly inLeapYear: boolean;
  with(yearMonthLike: PartialTemporalLike<YearMonthLikeObject>, options?: OverflowOptions): PlainYearMonth;
  add(duration: DurationLike, options?: OverflowOptions): PlainYearMonth;
  subtract(duration: DurationLike, options?: OverflowOptions): PlainYearMonth;
  until(other: PlainYearMonthLike, options?: RoundingOptionsWithLargestUnit<'year' | 'month'>): Duration;
  since(other: PlainYearMonthLike, options?: RoundingOptionsWithLargestUnit<'year' | 'month'>): Duration;
  equals(other: PlainYearMonthLike): boolean;
  toString(options?: PlainDateToStringOptions): string;
  toLocaleString(locales?: string | string[], options?: Intl.DateTimeFormatOptions): string;
  toJSON(): string;
  valueOf(): never;
  toPlainDate(item: PlainYearMonthToPlainDateOptions): PlainDate;
  readonly [Symbol.toStringTag]: 'Temporal.PlainYearMonth';
}

export interface PlainYearMonthConstructor {
  new (isoYear: number, isoMonth: number, calendar?: string, referenceISODay?: number): PlainYearMonth;
  readonly prototype: PlainYearMonth;
  from(item: PlainYearMonthLike, options?: OverflowOptions): PlainYearMonth;
  compare(one: PlainYearMonthLike, two: PlainYearMonthLike): number;
}
export declare const PlainYearMonth: PlainYearMonthConstructor;

// ═══════════════════════════════════════════════════════════════
//  PlainMonthDay
// ═══════════════════════════════════════════════════════════════

export interface PlainMonthDayToPlainDateOptions {
  era?: string | undefined;
  eraYear?: number | undefined;
  year?: number | undefined;
}

export interface PlainMonthDay {
  readonly calendarId: string;
  readonly monthCode: string;
  readonly day: number;
  with(monthDayLike: PartialTemporalLike<DateLikeObject>, options?: OverflowOptions): PlainMonthDay;
  equals(other: PlainMonthDayLike): boolean;
  toString(options?: PlainDateToStringOptions): string;
  toLocaleString(locales?: string | string[], options?: Intl.DateTimeFormatOptions): string;
  toJSON(): string;
  valueOf(): never;
  toPlainDate(item: PlainMonthDayToPlainDateOptions): PlainDate;
  readonly [Symbol.toStringTag]: 'Temporal.PlainMonthDay';
}

export interface PlainMonthDayConstructor {
  new (isoMonth: number, isoDay: number, calendar?: string, referenceISOYear?: number): PlainMonthDay;
  readonly prototype: PlainMonthDay;
  from(item: PlainMonthDayLike, options?: OverflowOptions): PlainMonthDay;
}
export declare const PlainMonthDay: PlainMonthDayConstructor;

// ═══════════════════════════════════════════════════════════════
//  Temporal.Now
// ═══════════════════════════════════════════════════════════════

export interface TemporalNow {
  timeZoneId(): string;
  instant(): Instant;
  plainDateTimeISO(timeZone?: TimeZoneLike): PlainDateTime;
  zonedDateTimeISO(timeZone?: TimeZoneLike): ZonedDateTime;
  plainDateISO(timeZone?: TimeZoneLike): PlainDate;
  plainTimeISO(timeZone?: TimeZoneLike): PlainTime;
  readonly [Symbol.toStringTag]: 'Temporal.Now';
}
export declare const Now: TemporalNow;

// ═══════════════════════════════════════════════════════════════
//  Temporal namespace
// ═══════════════════════════════════════════════════════════════

export interface TemporalNamespace {
  readonly Duration: DurationConstructor;
  readonly Instant: InstantConstructor;
  readonly Now: TemporalNow;
  readonly PlainDate: PlainDateConstructor;
  readonly PlainDateTime: PlainDateTimeConstructor;
  readonly PlainMonthDay: PlainMonthDayConstructor;
  readonly PlainTime: PlainTimeConstructor;
  readonly PlainYearMonth: PlainYearMonthConstructor;
  readonly ZonedDateTime: ZonedDateTimeConstructor;
  readonly [Symbol.toStringTag]: 'Temporal';
}
export declare const Temporal: TemporalNamespace;

export default Temporal;
