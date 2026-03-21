// TC39 Temporal spec conformance layer over temporal_rs NAPI bindings.
// Bridges the gap between the NAPI binding API and the TC39 Temporal specification.

import { createRequire } from 'node:module';

export type NapiTypes = typeof import('../index.js');
export type NapiCalendar = import('../index.js').Calendar;
export type NapiTimeZone = import('../index.js').TimeZone;
export type NapiPlainDateT = import('../index.js').PlainDate;
export type NapiPlainTimeT = import('../index.js').PlainTime;
export type NapiPlainDateTimeT = import('../index.js').PlainDateTime;
export type NapiZonedDateTimeT = import('../index.js').ZonedDateTime;
export type NapiInstantT = import('../index.js').Instant;
export type NapiDurationT = import('../index.js').Duration;
export type NapiPlainYearMonthT = import('../index.js').PlainYearMonth;
export type NapiPlainMonthDayT = import('../index.js').PlainMonthDay;
export type NapiToStringRoundingOptions = import('../index.js').ToStringRoundingOptions;

// Augment ImportMeta for Node.js ESM
declare global {
  interface ImportMeta {
    url: string;
  }
  // Intl.DurationFormat is not yet in TS libs
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Intl {
    class DurationFormat {
      constructor(locales?: string | string[], options?: Record<string, unknown>);
      format(duration: Record<string, unknown> | string): string;
      formatToParts(duration: Record<string, unknown> | string): Array<{ type: string; value: string }>;
      resolvedOptions(): Record<string, unknown>;
    }
  }
}

// Local date/time parts extracted from DateTimeFormat
export interface LocalParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
  fractionalSecond: string;
  _fullYear: number;
  [key: string]: string | number;
}

// ISO date fields
export interface ISOFields {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

// Calendar date to ISO result
export interface CalendarISOResult {
  isoYear: number;
  isoMonth: number;
  isoDay: number;
}

// Calendar date difference result
export interface CalendarDateDiffResult {
  years: number;
  months: number;
  weeks: number;
  days: number;
}

// Parsed ZDT string parts
export interface ZdtStringParts {
  isoYear: number;
  isoMonth: number;
  isoDay: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  microsecond: number;
  nanosecond: number;
  tzId: string;
}

// Range info for Intl formatting
export interface RangeInfo {
  ms: any;
  isoFields: ISOFields | null | undefined;
  isTemporal: boolean;
}

const require = createRequire(import.meta.url);
export const binding: NapiTypes = require('../index.js');

export const NapiCalendar = binding.Calendar;
export const NapiTimeZone = binding.TimeZone;
export const NapiPlainDate = binding.PlainDate;
export const NapiPlainTime = binding.PlainTime;
export const NapiPlainDateTime = binding.PlainDateTime;
export const NapiZonedDateTime = binding.ZonedDateTime;
export const NapiInstant = binding.Instant;
export const NapiDuration = binding.Duration;
export const NapiPlainYearMonth = binding.PlainYearMonth;
export const NapiPlainMonthDay = binding.PlainMonthDay;
