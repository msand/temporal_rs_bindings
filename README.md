# temporal_rs

Native Node.js and WASM bindings for [temporal_rs](https://github.com/boa-dev/temporal) — the Rust implementation of the [TC39 Temporal proposal](https://tc39.es/proposal-temporal/).

[![CI](https://github.com/msand/temporal_rs_bindings/actions/workflows/ci.yml/badge.svg)](https://github.com/msand/temporal_rs_bindings/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/temporal_rs)](https://www.npmjs.com/package/temporal_rs)

## Install

```bash
npm install temporal_rs
```

Prebuilt native binaries are available for:

| Platform        | Architecture |
|-----------------|-------------|
| macOS           | arm64, x64  |
| Linux (glibc)   | x64, arm64  |
| Linux (musl)    | x64         |
| Windows (MSVC)  | x64, arm64  |

## Quick Start

```typescript
import { Temporal } from 'temporal_rs'

// Current time
const now = Temporal.Now.instant()
const today = Temporal.Now.plainDateISO()
const zonedNow = Temporal.Now.zonedDateTimeISO()

// Dates
const date = new Temporal.PlainDate(2024, 3, 15)
const parsed = Temporal.PlainDate.from('2024-03-15')
console.log(date.dayOfWeek)  // 5 (Friday)
console.log(date.inLeapYear) // true

// Times
const time = new Temporal.PlainTime(13, 30, 45)
const morning = Temporal.PlainTime.from('09:00:00')

// Date + Time
const dt = new Temporal.PlainDateTime(2024, 12, 31, 23, 59)

// Zoned (timezone-aware)
const zdt = Temporal.ZonedDateTime.from('2024-03-15T12:00:00-04:00[America/New_York]')
console.log(zdt.offset)      // '-04:00'
console.log(zdt.hoursInDay)  // 24

// Instants (exact time)
const inst = Temporal.Instant.fromEpochMilliseconds(Date.now())

// Durations
const dur = Temporal.Duration.from('P1Y2M3DT4H5M6S')
console.log(dur.years)   // 1
console.log(dur.months)  // 2
```

## Arithmetic

```typescript
const { PlainDate, Duration } = Temporal

const date = PlainDate.from('2024-01-31')
const oneMonth = Duration.from('P1M')

const next = date.add(oneMonth)
console.log(next.toString()) // '2024-02-29' (constrained to valid date)

const diff = PlainDate.from('2024-01-01').until(PlainDate.from('2024-12-31'))
console.log(diff.days) // 365

// Property bag arguments
const result = date.add({ months: 1, days: 5 })
```

## Timezone-aware Operations

```typescript
const zdt = Temporal.ZonedDateTime.from('2024-03-09T12:00:00-05:00[America/New_York]')

// Adding 1 day across DST spring-forward
const nextDay = zdt.add({ days: 1 })
console.log(nextDay.hour) // 12 (wall time preserved)

// Convert between timezones
const utc = zdt.withTimeZone('UTC')
console.log(utc.epochMilliseconds === zdt.epochMilliseconds) // true (same instant)

// Start of day
const sod = zdt.startOfDay()
console.log(sod.hour) // 0

// Timezone transitions
const transition = zdt.getTimeZoneTransition('next')
```

## Calendars

16 calendar systems are supported:

```typescript
// ISO 8601 (default), Gregorian, Japanese, Buddhist, Chinese, Coptic,
// Dangi, Ethiopian, Ethiopic (Amete Alem), Hebrew, Indian,
// Islamic (civil, tabular, Umm al-Qura), Persian, ROC

const date = Temporal.PlainDate.from({
  year: 5784, monthCode: 'M01', day: 1, calendar: 'hebrew'
})
console.log(date.calendarId)  // 'hebrew'
console.log(date.era)         // 'am'
console.log(date.eraYear)     // 5784
```

## Rounding and Comparison

```typescript
// Round time
const time = new Temporal.PlainTime(13, 45, 30)
const rounded = time.round({ smallestUnit: 'hour', roundingMode: 'halfExpand' })
console.log(rounded.hour)   // 14
console.log(rounded.minute) // 0

// Compare dates
const d1 = new Temporal.PlainDate(2024, 1, 1)
const d2 = new Temporal.PlainDate(2024, 12, 31)
console.log(Temporal.PlainDate.compare(d1, d2)) // -1

// Compute difference with options
const diff = d1.until(d2, { largestUnit: 'month' })
console.log(diff.months) // 11
```

## Type Conversions

```typescript
// PlainDateTime -> PlainDate + PlainTime
const dt = Temporal.PlainDateTime.from('2024-06-15T10:30:00')
const date = dt.toPlainDate()
const time = dt.toPlainTime()

// ZonedDateTime -> Instant, PlainDate, PlainTime, PlainDateTime
const zdt = Temporal.ZonedDateTime.from('2024-06-15T10:30:00+02:00[Europe/Berlin]')
const instant = zdt.toInstant()
const plainDate = zdt.toPlainDate()
const plainTime = zdt.toPlainTime()
const plainDateTime = zdt.toPlainDateTime()

// PlainDate -> PlainDateTime (with optional time)
const dateOnly = new Temporal.PlainDate(2024, 6, 15)
const withTime = dateOnly.toPlainDateTime(new Temporal.PlainTime(10, 30))
```

## Now Functions

```typescript
const instant = Temporal.Now.instant()                  // Current Instant
const tz = Temporal.Now.timeZoneId()                    // System timezone ID
const date = Temporal.Now.plainDateISO()                // Current date (local tz)
const time = Temporal.Now.plainTimeISO()                // Current time (local tz)
const dateTime = Temporal.Now.plainDateTimeISO()        // Current date+time (local tz)
const zoned = Temporal.Now.zonedDateTimeISO()           // Current ZonedDateTime (local tz)

// With explicit timezone
const utcDate = Temporal.Now.plainDateISO('UTC')
```

## API Reference

### Types

| Class | Description |
|-------|-------------|
| `Temporal.PlainDate` | Calendar date (no time, no timezone) |
| `Temporal.PlainTime` | Wall-clock time (no date, no timezone) |
| `Temporal.PlainDateTime` | Calendar date + wall-clock time (no timezone) |
| `Temporal.ZonedDateTime` | Date + time with timezone (DST-aware) |
| `Temporal.Instant` | Exact point in time (epoch nanoseconds) |
| `Temporal.Duration` | ISO 8601 duration with arithmetic |
| `Temporal.PlainYearMonth` | Calendar year + month |
| `Temporal.PlainMonthDay` | Calendar month + day |
| `Temporal.Now` | Current time access |

### Imports

```typescript
// ESM — spec-conforming Temporal namespace (recommended)
import { Temporal } from 'temporal_rs'

// ESM — individual named exports
import { PlainDate, Duration, Instant } from 'temporal_rs'

// CJS — raw NAPI bindings (no spec conformance layer)
const { PlainDate, Duration } = require('temporal_rs')

// ESM — raw NAPI bindings
import { PlainDate } from 'temporal_rs/native'
```

## WASM (Browser)

A WASM build is also available for browser use:

```bash
npm run build:wasm
```

This produces a `wasm-pkg/` directory with ES module + TypeScript definitions usable via bundlers (webpack, vite, etc).

## Development

```bash
# Install dependencies
npm install

# Build native addon (debug)
npm run build:debug

# Build native addon (release)
npm run build

# Build WASM
npm run build:wasm

# Run unit tests
npm test

# Run TC39 Test262 Temporal compliance tests (requires test262 submodule)
git submodule update --init
npm run test262

# Run Test262 with filter
npm run test262 -- PlainDate

# Run Test262 verbose (show each test result)
npm run test262:verbose

# Run Test262 and write failure list
npm run test262 -- --write-failures
```

### Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) >= 20
- [wasm-pack](https://rustwasm.github.io/wasm-pack/) (for WASM builds)

## Test262 Compliance

This package includes a runner for the [TC39 Test262](https://github.com/tc39/test262) Temporal test suite (6,661 tests). The runner executes tests in Node.js `vm` contexts with the spec conformance layer injected as `globalThis.Temporal`.

Current results: **6,654 / 6,661 pass (99.9%)**

The 2 remaining failures are caused by inconsistencies between Node.js's ICU4C and temporal_rs's ICU4X implementations, not by the bindings themselves:

| Test | Root cause |
|------|-----------|
| `format/temporal-objects-resolved-time-zone` | Node.js v22 `format()` uses U+0020 before AM/PM but `formatToParts()` uses U+202F. Test compares them. |
| `formatToParts/compare-to-temporal-lunisolar` | ICU4C and ICU4X disagree on Chinese calendar new moon for 2030/M01 by 1 day (7 minutes past midnight Beijing time). ICU4X (temporal_rs) is correct per the Purple Mountain Observatory standard. |

## How It Works

This package wraps [temporal_rs](https://github.com/boa-dev/temporal) (the Rust implementation used by Boa, Kiesel, and V8) via two binding layers:

- **NAPI-RS** for native Node.js addons with auto-generated TypeScript definitions
- **wasm-bindgen** for browser-compatible WASM builds

A JavaScript spec conformance layer (`lib/temporal.mjs`) bridges the gap between the NAPI binding surface and the TC39 Temporal specification, providing:

- `Temporal` namespace with all types and `Temporal.Now`
- Property bag arguments for `from()`, `with()`, `add()`, `subtract()`
- `calendarId` / `timeZoneId` string getters
- Calendar year-to-ISO conversion for 16 calendar systems
- Era/eraYear resolution with calendar-specific epoch offsets
- Proper `TypeError` / `RangeError` error types
- `Symbol.toStringTag`, `Symbol.hasInstance`, `valueOf()` per spec
- `Intl.DateTimeFormat` and `Intl.DurationFormat` integration

Timezone data is embedded in the binary via the `zoneinfo64` provider, so no external timezone database is needed.

## License

MIT
