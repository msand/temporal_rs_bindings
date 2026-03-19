# temporal_rs Node.js + WASM Bindings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a Node.js module (NAPI-RS) and browser module (wasm-bindgen) exposing temporal_rs — the Rust implementation of TC39 Temporal.

**Architecture:** Cargo workspace with two binding crates (`temporal-napi` and `temporal-wasm`). Each wraps temporal_rs types with the respective proc macros. A shared `temporal-common` crate provides enum/option conversion helpers to avoid duplication. NAPI builds produce platform-specific native addons; WASM builds produce a `.wasm` + JS glue.

**Tech Stack:** Rust, napi-rs (v2), wasm-bindgen, wasm-pack, temporal_rs, Node.js, TypeScript

---

## Project Structure

```
temporal_rs_node_js/
├── Cargo.toml                    # workspace root
├── package.json                  # main npm package (NAPI)
├── index.js                      # NAPI binding loader (generated)
├── index.d.ts                    # TypeScript defs (generated)
├── build.rs                      # napi build script
├── crates/
│   ├── temporal-napi/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── options.rs        # enum/options wrappers
│   │       ├── calendar.rs
│   │       ├── time_zone.rs
│   │       ├── plain_date.rs
│   │       ├── plain_time.rs
│   │       ├── plain_date_time.rs
│   │       ├── zoned_date_time.rs
│   │       ├── instant.rs
│   │       ├── duration.rs
│   │       ├── plain_year_month.rs
│   │       ├── plain_month_day.rs
│   │       └── now.rs
│   └── temporal-wasm/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs
│           ├── options.rs
│           ├── calendar.rs
│           ├── time_zone.rs
│           ├── plain_date.rs
│           ├── plain_time.rs
│           ├── plain_date_time.rs
│           ├── zoned_date_time.rs
│           ├── instant.rs
│           ├── duration.rs
│           ├── plain_year_month.rs
│           ├── plain_month_day.rs
│           └── now.rs
├── __test__/
│   └── index.spec.ts
├── wasm-pkg/                     # wasm-pack output
└── npm/                          # NAPI platform packages
    ├── darwin-arm64/
    ├── darwin-x64/
    ├── linux-x64-gnu/
    ├── linux-x64-musl/
    ├── linux-arm64-gnu/
    ├── win32-x64-msvc/
    └── win32-arm64-msvc/
```

---

## Task 1: Workspace Scaffolding

**Files:**
- Create: `Cargo.toml` (workspace root)
- Create: `crates/temporal-napi/Cargo.toml`
- Create: `crates/temporal-napi/src/lib.rs` (empty module declarations)
- Create: `crates/temporal-wasm/Cargo.toml`
- Create: `crates/temporal-wasm/src/lib.rs` (empty module declarations)
- Create: `package.json`
- Create: `.cargo/config.toml`

**Step 1: Create workspace Cargo.toml**

```toml
[workspace]
resolver = "2"
members = ["crates/temporal-napi", "crates/temporal-wasm"]

[workspace.package]
edition = "2021"
version = "0.1.0"
license = "MIT"

[workspace.dependencies]
temporal_rs = { git = "https://github.com/boa-dev/temporal.git", features = ["sys-local", "float64_representable_durations"] }
timezone_provider = { git = "https://github.com/boa-dev/temporal.git" }
```

**Step 2: Create NAPI crate Cargo.toml**

```toml
[package]
name = "temporal-napi"
version.workspace = true
edition.workspace = true
license.workspace = true

[lib]
crate-type = ["cdylib"]

[dependencies]
temporal_rs = { workspace = true }
timezone_provider = { workspace = true, features = ["zoneinfo64"] }
napi = { version = "2", features = ["napi9", "serde-json"] }
napi-derive = "2"

[build-dependencies]
napi-build = "2"
```

**Step 3: Create WASM crate Cargo.toml**

```toml
[package]
name = "temporal-wasm"
version.workspace = true
edition.workspace = true
license.workspace = true

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
temporal_rs = { workspace = true }
timezone_provider = { workspace = true, features = ["zoneinfo64"] }
wasm-bindgen = "0.2"
js-sys = "0.3"
serde = { version = "1", features = ["derive"] }
serde-wasm-bindgen = "0.6"

[profile.release]
opt-level = "s"
lto = true
```

**Step 4: Create stub lib.rs files for both crates**

NAPI `src/lib.rs`:
```rust
#[macro_use]
extern crate napi_derive;

mod options;
mod calendar;
mod time_zone;
mod plain_date;
mod plain_time;
mod plain_date_time;
mod zoned_date_time;
mod instant;
mod duration;
mod plain_year_month;
mod plain_month_day;
mod now;
```

WASM `src/lib.rs`:
```rust
use wasm_bindgen::prelude::*;

mod options;
mod calendar;
mod time_zone;
mod plain_date;
mod plain_time;
mod plain_date_time;
mod zoned_date_time;
mod instant;
mod duration;
mod plain_year_month;
mod plain_month_day;
mod now;
```

**Step 5: Create NAPI build.rs**

```rust
extern crate napi_build;
fn main() { napi_build::setup(); }
```

**Step 6: Create package.json**

```json
{
  "name": "@anthropic/temporal",
  "version": "0.1.0",
  "main": "index.js",
  "types": "index.d.ts",
  "napi": {
    "name": "temporal",
    "triples": {
      "defaults": true,
      "additional": ["aarch64-apple-darwin"]
    }
  },
  "scripts": {
    "build": "napi build --platform --release",
    "build:debug": "napi build --platform",
    "build:wasm": "wasm-pack build crates/temporal-wasm --target bundler --out-dir ../../wasm-pkg",
    "test": "vitest run"
  },
  "devDependencies": {
    "@napi-rs/cli": "^2",
    "vitest": "^1"
  }
}
```

**Step 7: Create .cargo/config.toml for NAPI**

```toml
# needed for napi-rs on macOS
[target.x86_64-apple-darwin]
rustflags = ["-C", "link-arg=-undefined", "-C", "link-arg=dynamic_lookup"]

[target.aarch64-apple-darwin]
rustflags = ["-C", "link-arg=-undefined", "-C", "link-arg=dynamic_lookup"]
```

**Step 8: Verify compilation**

Run: `cargo check --workspace`
Expected: Compiles (with empty modules stubbed)

**Step 9: Commit**

```bash
git init && git add -A
git commit -m "chore: scaffold workspace with napi and wasm crates"
```

---

## Task 2: Options and Enum Wrappers (NAPI)

**Files:**
- Create: `crates/temporal-napi/src/options.rs`

This task establishes the pattern for mapping temporal_rs enums to NAPI-exposed enums. All option types go in one file since they're small.

**Step 1: Implement options.rs**

```rust
use napi::bindgen_prelude::*;
use napi_derive::napi;

/// Maps JS string -> temporal_rs enum with error handling.
/// Pattern: accept &str in JS, parse to Rust enum.

#[napi(string_enum)]
pub enum Overflow {
    Constrain,
    Reject,
}

impl From<Overflow> for temporal_rs::options::Overflow {
    fn from(o: Overflow) -> Self {
        match o {
            Overflow::Constrain => temporal_rs::options::Overflow::Constrain,
            Overflow::Reject => temporal_rs::options::Overflow::Reject,
        }
    }
}

#[napi(string_enum)]
pub enum Disambiguation {
    Compatible,
    Earlier,
    Later,
    Reject,
}
// + From impl

#[napi(string_enum)]
pub enum OffsetDisambiguation {
    Use,
    Prefer,
    Ignore,
    Reject,
}
// + From impl

#[napi(string_enum)]
pub enum RoundingMode {
    Ceil,
    Floor,
    Expand,
    Trunc,
    HalfCeil,
    HalfFloor,
    HalfExpand,
    HalfTrunc,
    HalfEven,
}
// + From impl

#[napi(string_enum)]
pub enum Unit {
    Auto,
    Nanosecond,
    Microsecond,
    Millisecond,
    Second,
    Minute,
    Hour,
    Day,
    Week,
    Month,
    Year,
}
// + From impl

#[napi(string_enum)]
pub enum DisplayCalendar {
    Auto,
    Always,
    Never,
    Critical,
}
// + From impl

#[napi(string_enum)]
pub enum DisplayOffset {
    Auto,
    Never,
}
// + From impl

#[napi(string_enum)]
pub enum DisplayTimeZone {
    Auto,
    Never,
    Critical,
}
// + From impl

#[napi(object)]
pub struct DifferenceSettings {
    pub largest_unit: Option<Unit>,
    pub smallest_unit: Option<Unit>,
    pub rounding_mode: Option<RoundingMode>,
    pub rounding_increment: Option<u32>,
}

impl From<DifferenceSettings> for temporal_rs::options::DifferenceSettings {
    fn from(s: DifferenceSettings) -> Self {
        temporal_rs::options::DifferenceSettings {
            largest_unit: s.largest_unit.map(Into::into),
            smallest_unit: s.smallest_unit.map(Into::into),
            rounding_mode: s.rounding_mode.map(Into::into),
            increment: s.rounding_increment.and_then(|i| {
                temporal_rs::options::RoundingIncrement::try_new(i).ok()
            }),
        }
    }
}

#[napi(object)]
pub struct RoundingOptions {
    pub largest_unit: Option<Unit>,
    pub smallest_unit: Option<Unit>,
    pub rounding_mode: Option<RoundingMode>,
    pub rounding_increment: Option<u32>,
}
// + From impl -> temporal_rs::options::RoundingOptions

// Helper: convert temporal_rs::TemporalError -> napi::Error
pub(crate) fn to_napi_error(e: temporal_rs::TemporalError) -> napi::Error {
    napi::Error::from_reason(format!("{e}"))
}
```

**Step 2: Verify compilation**

Run: `cargo check -p temporal-napi`
Expected: Compiles

**Step 3: Commit**

```bash
git add crates/temporal-napi/src/options.rs
git commit -m "feat(napi): add options and enum wrappers"
```

---

## Task 3: Calendar Wrapper (NAPI)

**Files:**
- Create: `crates/temporal-napi/src/calendar.rs`

**Step 1: Implement calendar.rs**

```rust
use napi::bindgen_prelude::*;
use napi_derive::napi;
use crate::options::to_napi_error;

#[napi]
pub struct Calendar {
    pub(crate) inner: temporal_rs::Calendar,
}

#[napi]
impl Calendar {
    #[napi(constructor)]
    pub fn new(id: String) -> napi::Result<Self> {
        let cal = temporal_rs::Calendar::try_from_utf8(id.as_bytes()).map_err(to_napi_error)?;
        Ok(Self { inner: cal })
    }

    #[napi(factory)]
    pub fn iso() -> Self { Self { inner: temporal_rs::Calendar::ISO } }

    #[napi(factory)]
    pub fn gregorian() -> Self { Self { inner: temporal_rs::Calendar::GREGORIAN } }
    // ... other calendar constants as factory methods

    #[napi(getter)]
    pub fn id(&self) -> &str { self.inner.identifier() }

    #[napi(getter)]
    pub fn is_iso(&self) -> bool { self.inner.is_iso() }

    #[napi]
    pub fn to_string(&self) -> &str { self.inner.identifier() }
}
```

**Step 2: Verify compilation**

Run: `cargo check -p temporal-napi`

**Step 3: Commit**

---

## Task 4: TimeZone Wrapper (NAPI)

**Files:**
- Create: `crates/temporal-napi/src/time_zone.rs`

**Step 1: Implement time_zone.rs**

```rust
use napi_derive::napi;
use crate::options::to_napi_error;

#[napi]
pub struct TimeZone {
    pub(crate) inner: temporal_rs::TimeZone,
}

#[napi]
impl TimeZone {
    #[napi(constructor)]
    pub fn new(identifier: String) -> napi::Result<Self> {
        let tz = temporal_rs::TimeZone::try_from_str(&identifier).map_err(to_napi_error)?;
        Ok(Self { inner: tz })
    }

    #[napi(factory)]
    pub fn utc() -> Self { Self { inner: temporal_rs::TimeZone::utc() } }

    #[napi(getter)]
    pub fn id(&self) -> napi::Result<String> {
        self.inner.identifier().map_err(to_napi_error)
    }
}
```

**Step 2: Verify, commit**

---

## Task 5: PlainDate (NAPI) — Reference Pattern

**Files:**
- Create: `crates/temporal-napi/src/plain_date.rs`
- Create: `__test__/plain_date.spec.ts`

This is the reference implementation. All subsequent types follow this exact pattern.

**Step 1: Implement plain_date.rs**

```rust
use napi::bindgen_prelude::*;
use napi_derive::napi;
use crate::calendar::Calendar;
use crate::duration::Duration;
use crate::options::*;
use crate::plain_time::PlainTime;
use crate::plain_date_time::PlainDateTime;
use crate::plain_year_month::PlainYearMonth;
use crate::plain_month_day::PlainMonthDay;

#[napi]
pub struct PlainDate {
    pub(crate) inner: temporal_rs::PlainDate,
}

#[napi]
impl PlainDate {
    /// Create from year, month, day with optional calendar (defaults to ISO).
    #[napi(constructor)]
    pub fn new(year: i32, month: u8, day: u8, calendar: Option<&Calendar>) -> napi::Result<Self> {
        let cal = calendar.map(|c| c.inner.clone()).unwrap_or_default();
        temporal_rs::PlainDate::new(year, month, day, cal)
            .map(|d| Self { inner: d })
            .map_err(to_napi_error)
    }

    /// Parse from ISO 8601 / IXDTF string.
    #[napi(factory)]
    pub fn from(s: String) -> napi::Result<Self> {
        temporal_rs::PlainDate::from_utf8(s.as_bytes())
            .map(|d| Self { inner: d })
            .map_err(to_napi_error)
    }

    // --- Getters ---
    #[napi(getter)] pub fn year(&self) -> i32 { self.inner.year() }
    #[napi(getter)] pub fn month(&self) -> u8 { self.inner.month() }
    #[napi(getter)] pub fn month_code(&self) -> String { self.inner.month_code().to_string() }
    #[napi(getter)] pub fn day(&self) -> u8 { self.inner.day() }
    #[napi(getter)] pub fn day_of_week(&self) -> u16 { self.inner.day_of_week() }
    #[napi(getter)] pub fn day_of_year(&self) -> u16 { self.inner.day_of_year() }
    #[napi(getter)] pub fn week_of_year(&self) -> Option<u8> { self.inner.week_of_year() }
    #[napi(getter)] pub fn year_of_week(&self) -> Option<i32> { self.inner.year_of_week() }
    #[napi(getter)] pub fn days_in_week(&self) -> u16 { self.inner.days_in_week() }
    #[napi(getter)] pub fn days_in_month(&self) -> u16 { self.inner.days_in_month() }
    #[napi(getter)] pub fn days_in_year(&self) -> u16 { self.inner.days_in_year() }
    #[napi(getter)] pub fn months_in_year(&self) -> u16 { self.inner.months_in_year() }
    #[napi(getter)] pub fn in_leap_year(&self) -> bool { self.inner.in_leap_year() }
    #[napi(getter)] pub fn era(&self) -> Option<String> { self.inner.era().map(|e| e.to_string()) }
    #[napi(getter)] pub fn era_year(&self) -> Option<i32> { self.inner.era_year() }

    #[napi(getter)]
    pub fn calendar(&self) -> Calendar {
        Calendar { inner: self.inner.calendar().clone() }
    }

    // --- Arithmetic ---
    #[napi]
    pub fn add(&self, duration: &Duration, overflow: Option<Overflow>) -> napi::Result<PlainDate> {
        self.inner.add(&duration.inner, overflow.map(Into::into))
            .map(|d| PlainDate { inner: d })
            .map_err(to_napi_error)
    }

    #[napi]
    pub fn subtract(&self, duration: &Duration, overflow: Option<Overflow>) -> napi::Result<PlainDate> {
        self.inner.subtract(&duration.inner, overflow.map(Into::into))
            .map(|d| PlainDate { inner: d })
            .map_err(to_napi_error)
    }

    #[napi]
    pub fn until(&self, other: &PlainDate, settings: Option<DifferenceSettings>) -> napi::Result<Duration> {
        self.inner.until(&other.inner, settings.unwrap_or_default().into())
            .map(|d| Duration { inner: d })
            .map_err(to_napi_error)
    }

    #[napi]
    pub fn since(&self, other: &PlainDate, settings: Option<DifferenceSettings>) -> napi::Result<Duration> {
        self.inner.since(&other.inner, settings.unwrap_or_default().into())
            .map(|d| Duration { inner: d })
            .map_err(to_napi_error)
    }

    // --- Comparison ---
    #[napi]
    pub fn equals(&self, other: &PlainDate) -> bool { self.inner == other.inner }

    #[napi]
    pub fn compare(one: &PlainDate, two: &PlainDate) -> i32 {
        one.inner.compare_iso(&two.inner) as i32
    }

    // --- Conversions ---
    #[napi]
    pub fn to_plain_date_time(&self, time: Option<&PlainTime>) -> napi::Result<PlainDateTime> {
        self.inner.to_plain_date_time(time.map(|t| t.inner))
            .map(|dt| PlainDateTime { inner: dt })
            .map_err(to_napi_error)
    }

    #[napi]
    pub fn to_plain_year_month(&self) -> napi::Result<PlainYearMonth> {
        self.inner.to_plain_year_month()
            .map(|ym| PlainYearMonth { inner: ym })
            .map_err(to_napi_error)
    }

    #[napi]
    pub fn to_plain_month_day(&self) -> napi::Result<PlainMonthDay> {
        self.inner.to_plain_month_day()
            .map(|md| PlainMonthDay { inner: md })
            .map_err(to_napi_error)
    }

    #[napi]
    pub fn to_string(&self, display_calendar: Option<DisplayCalendar>) -> String {
        self.inner.to_ixdtf_string(display_calendar.unwrap_or(DisplayCalendar::Auto).into())
    }

    #[napi]
    pub fn with_calendar(&self, calendar: &Calendar) -> PlainDate {
        PlainDate { inner: self.inner.with_calendar(calendar.inner.clone()) }
    }

    #[napi]
    pub fn to_json(&self) -> String {
        self.inner.to_ixdtf_string(temporal_rs::options::DisplayCalendar::Auto)
    }

    #[napi]
    pub fn value_of(&self) -> napi::Result<()> {
        Err(napi::Error::from_reason("Use compare() or equals() instead"))
    }
}
```

**Step 2: Write integration test**

`__test__/plain_date.spec.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { PlainDate, Duration } from '../index.js'

describe('PlainDate', () => {
  it('creates from components', () => {
    const d = new PlainDate(2024, 3, 15)
    expect(d.year).toBe(2024)
    expect(d.month).toBe(3)
    expect(d.day).toBe(15)
  })

  it('parses from string', () => {
    const d = PlainDate.from('2024-03-15')
    expect(d.year).toBe(2024)
    expect(d.month).toBe(3)
    expect(d.day).toBe(15)
  })

  it('provides calendar properties', () => {
    const d = new PlainDate(2024, 3, 15)
    expect(d.dayOfWeek).toBe(5) // Friday
    expect(d.dayOfYear).toBe(75)
    expect(d.daysInMonth).toBe(31)
    expect(d.daysInYear).toBe(366)
    expect(d.inLeapYear).toBe(true)
  })

  it('adds duration', () => {
    const d = new PlainDate(2024, 1, 1)
    const dur = Duration.from('P1M')
    const result = d.add(dur)
    expect(result.month).toBe(2)
  })

  it('computes difference', () => {
    const d1 = PlainDate.from('2024-01-01')
    const d2 = PlainDate.from('2024-03-01')
    const diff = d1.until(d2)
    expect(diff.days).toBe(60)
  })

  it('converts to string', () => {
    const d = new PlainDate(2024, 3, 15)
    expect(d.toString()).toBe('2024-03-15')
  })

  it('compares dates', () => {
    const d1 = new PlainDate(2024, 1, 1)
    const d2 = new PlainDate(2024, 12, 31)
    expect(PlainDate.compare(d1, d2)).toBeLessThan(0)
    expect(d1.equals(d1)).toBe(true)
  })
})
```

**Step 3: Build and run test**

Run: `npm run build && npm test`
Expected: All tests pass

**Step 4: Commit**

---

## Task 6: PlainTime (NAPI)

**Files:**
- Create: `crates/temporal-napi/src/plain_time.rs`

Follow PlainDate pattern. Key differences:
- Constructor: `new(hour, minute, second, millisecond?, microsecond?, nanosecond?)`
- Getters: `hour, minute, second, millisecond, microsecond, nanosecond`
- Has `round(options)` method
- No calendar properties
- `to_string` uses `ToStringRoundingOptions`

**Step 1: Implement, Step 2: Verify, Step 3: Commit**

---

## Task 7: PlainDateTime (NAPI)

**Files:**
- Create: `crates/temporal-napi/src/plain_date_time.rs`

Follow PlainDate pattern. Key differences:
- Constructor: all 9 components + optional calendar
- Has both date and time getters
- Has `round(options)` method
- `to_string` uses `ToStringRoundingOptions` + `DisplayCalendar`
- Conversion: `to_plain_date()`, `to_plain_time()`

**Step 1: Implement, Step 2: Verify, Step 3: Commit**

---

## Task 8: Instant (NAPI)

**Files:**
- Create: `crates/temporal-napi/src/instant.rs`

Key differences:
- Constructor from epoch nanoseconds (BigInt in JS -> i128)
- `from_epoch_milliseconds(ms: i64)`
- Getters: `epoch_milliseconds`, `epoch_nanoseconds` (BigInt)
- No calendar properties
- `to_zoned_date_time_iso(timezone)` needs provider

**Note on BigInt:** napi-rs supports `BigInt` type. Use for nanosecond epoch values.

**Step 1: Implement, Step 2: Verify, Step 3: Commit**

---

## Task 9: Duration (NAPI)

**Files:**
- Create: `crates/temporal-napi/src/duration.rs`

Key differences:
- Constructor: 10 components (years through nanoseconds)
- `from(s: String)` parses ISO 8601 duration
- Getters for all 10 components
- `sign()` returns -1, 0, or 1
- `is_zero()` returns bool
- `negated()`, `abs()` return new Duration
- `add(other)`, `subtract(other)` return new Duration
- `round()` and `total()` need RelativeTo + provider for calendar units

**Step 1: Implement, Step 2: Verify, Step 3: Commit**

---

## Task 10: ZonedDateTime (NAPI)

**Files:**
- Create: `crates/temporal-napi/src/zoned_date_time.rs`

Most complex type. Key differences:
- All construction and most methods require `_with_provider`
- Create a module-level helper to get the compiled provider
- Has both date and time getters + timezone info
- `offset()` returns string, `offset_nanoseconds()` returns i64
- `hours_in_day()`, `start_of_day()`, `get_time_zone_transition()`
- All arithmetic methods need provider
- `to_instant()`, `to_plain_date()`, `to_plain_time()`, `to_plain_date_time()`

**Provider pattern:**
```rust
use temporal_rs::provider::COMPILED_TZ_PROVIDER;

// In every _with_provider call:
self.inner.add_with_provider(&duration.inner, overflow, &*COMPILED_TZ_PROVIDER)
```

**Step 1: Implement, Step 2: Verify, Step 3: Commit**

---

## Task 11: PlainYearMonth + PlainMonthDay (NAPI)

**Files:**
- Create: `crates/temporal-napi/src/plain_year_month.rs`
- Create: `crates/temporal-napi/src/plain_month_day.rs`

Simpler types following PlainDate pattern with fewer properties.

**Step 1: Implement both, Step 2: Verify, Step 3: Commit**

---

## Task 12: Now Module (NAPI)

**Files:**
- Create: `crates/temporal-napi/src/now.rs`

```rust
#[napi]
pub fn now_instant() -> napi::Result<Instant> { ... }
#[napi]
pub fn now_zoned_date_time_iso(time_zone: Option<&TimeZone>) -> napi::Result<ZonedDateTime> { ... }
#[napi]
pub fn now_plain_date_time_iso(time_zone: Option<&TimeZone>) -> napi::Result<PlainDateTime> { ... }
#[napi]
pub fn now_plain_date_iso(time_zone: Option<&TimeZone>) -> napi::Result<PlainDate> { ... }
#[napi]
pub fn now_plain_time_iso(time_zone: Option<&TimeZone>) -> napi::Result<PlainTime> { ... }
```

Uses `temporal_rs::sys::Temporal` for system clock access.

**Step 1: Implement, Step 2: Verify, Step 3: Commit**

---

## Task 13: WASM Bindings — All Types

**Files:**
- Create all files under `crates/temporal-wasm/src/`

Mirror the NAPI implementations but with `#[wasm_bindgen]` annotations instead of `#[napi]`.

Key differences from NAPI:
- Use `#[wasm_bindgen]` instead of `#[napi]`
- Return `Result<T, JsValue>` instead of `napi::Result<T>`
- Enums use `#[wasm_bindgen]` with string conversion methods
- No BigInt support by default — use `js_sys::BigInt` for epoch nanoseconds
- Option types need `#[wasm_bindgen(skip)]` and manual getter/setter
- Objects passed as `&JsValue` and deserialized via serde-wasm-bindgen

Error conversion:
```rust
fn to_js_error(e: temporal_rs::TemporalError) -> JsValue {
    JsValue::from_str(&format!("{e}"))
}
```

**Step 1: Implement all types following NAPI pattern**
**Step 2: Verify: `wasm-pack build crates/temporal-wasm --target bundler`**
**Step 3: Commit**

---

## Task 14: Integration Tests

**Files:**
- Create: `__test__/index.spec.ts` (comprehensive test suite)

Test all types with:
- Construction (constructor, from string, factory methods)
- Property access (all getters)
- Arithmetic (add, subtract, until, since)
- Comparison (equals, compare)
- Conversion (between types)
- String serialization
- Error handling (invalid inputs)
- Calendar support (non-ISO calendars)
- Timezone support (ZonedDateTime with named zones)

**Step 1: Write tests, Step 2: Run, Step 3: Commit**

---

## Task 15: npm Packaging and CI

**Files:**
- Create: `npm/darwin-arm64/package.json` (and other platforms)
- Create: `.github/workflows/ci.yml`
- Update: `package.json` with publish config

Generate platform packages using `napi create-npm-dirs`.
Set up GitHub Actions for cross-platform builds using `@napi-rs/cli`.

**Step 1: Generate npm dirs, Step 2: Create CI workflow, Step 3: Commit**

---

## Execution Notes

- **Provider strategy:** Use `compiled_data` feature for both NAPI and WASM. This embeds timezone data in the binary (~1.5MB). For WASM, this increases bundle size but avoids async provider loading.
- **Error mapping:** All `TemporalError` -> JS Error with descriptive message. Map `ErrorKind::Range` to `RangeError`, `ErrorKind::Type` to `TypeError` where possible.
- **BigInt:** Instant's epoch nanoseconds need BigInt support. NAPI-RS has native BigInt. For WASM, use `js_sys::BigInt`.
- **Circular references:** PlainDate.toPlainDateTime returns PlainDateTime which has toPlainDate. Rust modules handle this fine since they're in the same crate.
