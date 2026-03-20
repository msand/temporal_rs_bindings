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
import {
  PlainDate,
  PlainTime,
  PlainDateTime,
  ZonedDateTime,
  Instant,
  Duration,
  TimeZone,
  Calendar,
  nowInstant,
  nowPlainDateIso,
  nowZonedDateTimeIso,
  Unit,
} from 'temporal_rs'

// Current time
const now = nowInstant()
const today = nowPlainDateIso()
const zonedNow = nowZonedDateTimeIso()

// Dates
const date = new PlainDate(2024, 3, 15)
const parsed = PlainDate.from('2024-03-15')
console.log(date.dayOfWeek)  // 5 (Friday)
console.log(date.inLeapYear) // true

// Times
const time = new PlainTime(13, 30, 45)
const morning = PlainTime.from('09:00:00')

// Date + Time
const dt = new PlainDateTime(2024, 12, 31, 23, 59)

// Zoned (timezone-aware)
const zdt = ZonedDateTime.from('2024-03-15T12:00:00-04:00[America/New_York]')
console.log(zdt.offset)      // '-04:00'
console.log(zdt.hoursInDay)  // 24

// Instants (exact time)
const inst = Instant.fromEpochMilliseconds(Date.now())

// Durations
const dur = Duration.from('P1Y2M3DT4H5M6S')
console.log(dur.years)   // 1
console.log(dur.months)  // 2
```

## Arithmetic

```typescript
const date = PlainDate.from('2024-01-31')
const oneMonth = Duration.from('P1M')

const next = date.add(oneMonth)
console.log(next.toString()) // '2024-02-29' (constrained to valid date)

const diff = PlainDate.from('2024-01-01').until(PlainDate.from('2024-12-31'))
console.log(diff.days) // 365
```

## Timezone-aware Operations

```typescript
const tz = new TimeZone('America/New_York')
const zdt = ZonedDateTime.from('2024-03-09T12:00:00-05:00[America/New_York]')

// Adding 1 day across DST spring-forward
const nextDay = zdt.add(new Duration(0, 0, 0, 1))
console.log(nextDay.hour) // 12 (wall time preserved)

// Convert between timezones
const utc = zdt.withTimeZone(TimeZone.utc())
console.log(utc.epochMilliseconds === zdt.epochMilliseconds) // true (same instant)

// Start of day
const sod = zdt.startOfDay()
console.log(sod.hour) // 0
```

## Calendars

16 calendar systems are supported:

```typescript
const iso = Calendar.iso()           // ISO 8601 (default)
const greg = Calendar.gregorian()    // Gregorian
const japanese = Calendar.japanese()
const chinese = Calendar.chinese()
const hebrew = Calendar.hebrew()
// Also: buddhist, coptic, dangi, ethiopian, ethiopianAmeteAlem,
//       hijriTabularFriday, hijriTabularThursday, hijriUmmAlQura,
//       indian, persian, roc

const date = new PlainDate(2024, 3, 15, Calendar.gregorian())
console.log(date.era)     // 'ad'
console.log(date.eraYear) // 2024
```

## Rounding and Comparison

```typescript
import { RoundingMode } from 'temporal_rs'

// Round time
const time = new PlainTime(13, 45, 30)
const rounded = time.round({ smallestUnit: Unit.Hour, roundingMode: RoundingMode.HalfExpand })
console.log(rounded.hour)   // 14
console.log(rounded.minute) // 0

// Compare dates
const d1 = new PlainDate(2024, 1, 1)
const d2 = new PlainDate(2024, 12, 31)
console.log(PlainDate.compare(d1, d2)) // -1

// Compute difference with options
const diff = d1.until(d2, { largestUnit: Unit.Month })
console.log(diff.months) // 11
```

## Type Conversions

```typescript
// PlainDateTime -> PlainDate + PlainTime
const dt = PlainDateTime.from('2024-06-15T10:30:00')
const date = dt.toPlainDate()
const time = dt.toPlainTime()

// ZonedDateTime -> Instant, PlainDate, PlainTime, PlainDateTime
const zdt = ZonedDateTime.from('2024-06-15T10:30:00+02:00[Europe/Berlin]')
const instant = zdt.toInstant()
const plainDate = zdt.toPlainDate()
const plainTime = zdt.toPlainTime()
const plainDateTime = zdt.toPlainDateTime()

// PlainDate -> PlainDateTime (with optional time)
const dateOnly = new PlainDate(2024, 6, 15)
// dateOnly.toPlainDateTime(new PlainTime(10, 30, 0))
```

## Now Functions

```typescript
import {
  nowInstant,
  nowTimeZone,
  nowPlainDateIso,
  nowPlainTimeIso,
  nowPlainDateTimeIso,
  nowZonedDateTimeIso,
} from 'temporal_rs'

const instant = nowInstant()                   // Current Instant
const tz = nowTimeZone()                       // System timezone
const date = nowPlainDateIso()                 // Current date (local tz)
const time = nowPlainTimeIso()                 // Current time (local tz)
const dateTime = nowPlainDateTimeIso()         // Current date+time (local tz)
const zoned = nowZonedDateTimeIso()            // Current ZonedDateTime (local tz)

// With explicit timezone
const utcDate = nowPlainDateIso(TimeZone.utc())
```

## API Reference

### Types

| Class | Description |
|-------|-------------|
| `PlainDate` | Calendar date (no time, no timezone) |
| `PlainTime` | Wall-clock time (no date, no timezone) |
| `PlainDateTime` | Calendar date + wall-clock time (no timezone) |
| `ZonedDateTime` | Date + time with timezone (DST-aware) |
| `Instant` | Exact point in time (epoch nanoseconds) |
| `Duration` | ISO 8601 duration with arithmetic |
| `PlainYearMonth` | Calendar year + month |
| `PlainMonthDay` | Calendar month + day |
| `Calendar` | Calendar system (16 supported) |
| `TimeZone` | IANA timezone or UTC offset |

### Enums

| Enum | Values |
|------|--------|
| `Overflow` | `Constrain`, `Reject` |
| `Disambiguation` | `Compatible`, `Earlier`, `Later`, `Reject` |
| `OffsetDisambiguation` | `Use`, `Prefer`, `Ignore`, `Reject` |
| `RoundingMode` | `Ceil`, `Floor`, `Expand`, `Trunc`, `HalfCeil`, `HalfFloor`, `HalfExpand`, `HalfTrunc`, `HalfEven` |
| `Unit` | `Auto`, `Nanosecond`, `Microsecond`, `Millisecond`, `Second`, `Minute`, `Hour`, `Day`, `Week`, `Month`, `Year` |
| `DisplayCalendar` | `Auto`, `Always`, `Never`, `Critical` |

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

Current results:
- **6,533 pass (98.2%)** across all 6,661 Temporal tests
- **123 fail** — all structurally unfixable from JavaScript (see below)
- **5 skip** — tests that crash the vm sandbox

The 123 remaining failures require changes outside the JS conformance layer:

| Category | Count | Root cause |
|----------|-------|------------|
| Order-of-operations | 87 | Tests verify exact property access order via Proxy — would need full spec-order reimplementation |
| `Intl.DateTimeFormat` | 15 | Requires V8-native Temporal support in `Intl.DateTimeFormat` |
| Duration precision | 10 | NAPI binding uses i64/f64 which can't represent the full spec range |
| `Intl.DurationFormat` | 7 | `Intl.DurationFormat` not available in Node.js |
| Calendar-invalid | 2 | Constructor property access ordering |
| PlainYearMonth extreme | 2 | Coptic calendar max dates exceed NAPI's ISO range |

## How It Works

This package wraps [temporal_rs](https://github.com/boa-dev/temporal) (the Rust implementation used by Boa, Kiesel, and V8) via two binding layers:

- **NAPI-RS** for native Node.js addons with auto-generated TypeScript definitions
- **wasm-bindgen** for browser-compatible WASM builds

Timezone data is embedded in the binary via the `zoneinfo64` provider, so no external timezone database is needed.

## License

MIT
