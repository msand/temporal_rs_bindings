// TC39 Temporal spec conformance layer over temporal_rs NAPI bindings.
// This is the entry point that imports all modules and constructs the Temporal namespace.

// Import class definitions (side-effect: registers each class with _classes and late-bound refs)
import { Duration } from './duration';
import { PlainDate } from './plaindate';
import { PlainTime } from './plaintime';
import { PlainDateTime } from './plaindatetime';
import { ZonedDateTime } from './zoneddatetime';
import { Instant } from './instant';
import { PlainYearMonth } from './plainyearmonth';
import { PlainMonthDay } from './plainmonthday';
import { Now } from './now';

// Import Intl patching (side-effect: patches DateTimeFormat, DurationFormat, Date.prototype)
import './intl';

// ═══════════════════════════════════════════════════════════════
//  Temporal namespace
// ═══════════════════════════════════════════════════════════════

export const Temporal: Record<string, any> = {};
for (const [name, value] of [
  ['Duration', Duration],
  ['Instant', Instant],
  ['Now', Now],
  ['PlainDate', PlainDate],
  ['PlainDateTime', PlainDateTime],
  ['PlainMonthDay', PlainMonthDay],
  ['PlainTime', PlainTime],
  ['PlainYearMonth', PlainYearMonth],
  ['ZonedDateTime', ZonedDateTime],
] as [string, any][]) {
  Object.defineProperty(Temporal, name, { value, writable: true, enumerable: false, configurable: true });
}
Object.defineProperty(Temporal, Symbol.toStringTag, {
  value: 'Temporal',
  writable: false,
  enumerable: false,
  configurable: true,
});

export { Duration, PlainDate, PlainTime, PlainDateTime, ZonedDateTime, Instant, PlainYearMonth, PlainMonthDay, Now };

export default Temporal;
