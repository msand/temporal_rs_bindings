# Changelog

## [0.1.3] - 2026-03-21

### Added
- TypeScript source (`lib/temporal.ts`) with strict type checking
- Dual ESM (`.mjs`) and CJS (`.js`) output via tsup
- Type declarations (`.d.ts`, `.d.mts`)
- ESLint with `strictTypeChecked` preset — zero warnings
- Prettier formatting
- CI: lint, typecheck, format check, and Test262 conformance jobs
- Version bump script (`./scripts/bump-version.sh`)
- `Intl.DurationFormat` integration (auto-detects `--harmony-intl-duration-format`)
- `Date.prototype.toTemporalInstant` polyfill

### Fixed
- CJS `require('temporal_rs')` now returns the spec conformance layer (was raw NAPI)
- Duration precision: use f64/i128 at NAPI boundary for values exceeding i64 range
- All order-of-operations: property access in spec-defined alphabetical order
- PlainYearMonth extreme dates for non-ISO calendars near ISO range boundaries
- Chinese/Dangi/Hebrew leap month handling in `monthCodeToMonth`
- Ethiopian/Ethioaa era year mapping
- Sub-minute UTC offset support (e.g., Africa/Monrovia -00:44:30)
- ZonedDateTime DST disambiguation (earlier/later/compatible/reject)
- BigInt nanosecond precision for Instant and ZonedDateTime
- `Intl.DateTimeFormat` formatting for dates outside `Date` range

## [0.1.2] - 2026-03-20

### Added
- Test262 conformance: 6,659 / 6,661 pass (99.97%)
- Spec conformance layer (`lib/temporal.mjs`) with full TC39 Temporal API
- 16 calendar systems with era/eraYear support
- Property bag arguments for `from()`, `with()`, `add()`, `subtract()`
- `calendarId` / `timeZoneId` string getters
- `Temporal.Now` namespace
- `Intl.DateTimeFormat` patching for Temporal objects
- `getTimeZoneTransition()` implementation

## [0.1.1] - 2026-03-19

### Added
- npm platform packages for cross-platform distribution
- GitHub Actions CI for cross-platform builds and publish

## [0.1.0] - 2026-03-19

### Added
- Initial release
- NAPI-RS bindings for all 8 Temporal types + Calendar + TimeZone + Now
- WASM bindings via wasm-bindgen
- 81 unit tests
