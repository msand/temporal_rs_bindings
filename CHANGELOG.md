# Changelog

## [Unreleased]

### Changed
- Split monolithic `lib/temporal.ts` (10k lines) into 17 focused modules
- Created shared `temporal-common` Rust crate to deduplicate code between NAPI and WASM
- NAPI `epochNanoseconds` constructor/getter now uses BigInt (was Number with precision loss)
- Timezone provider cached via `OnceLock` instead of created per-operation
- Cache eviction uses LRU-style partial eviction instead of full clear

### Fixed
- `f64_to_i64` now rejects values outside i64 range instead of silently saturating
- NAPI BigInt constructors now check `lossless` flag and reject overflows
- WASM Duration methods (`negated`, `abs`, `add`, `subtract`, `round`, `total`, `compare`) now have `#[wasm_bindgen]` attributes (were invisible to JS)
- WASM `from_epoch_milliseconds` now validates for NaN/Infinity
- Lint and format scripts now cover all 17 module files (were only targeting entry point)
- Removed ~100 lines of dead duplicate code from helpers.ts
- Removed unused imports across class files
- Pinned `temporal_rs` git dependency to exact commit rev

## [0.1.8] - 2026-04-01

### Fixed
- **TypeScript types** — replaced unusable `Record<string, any>` types for `Temporal` and `Now` with hand-crafted type definitions aligned with TypeScript's `esnext.temporal.d.ts`, providing full autocomplete and type safety for all classes, methods, and options interfaces
- Disabled tsup auto-generated `.d.ts` (now hand-crafted and version-controlled)

## [0.1.7] - 2026-03-31

### Fixed
- **Duration.add/subtract now supports relativeTo** — implemented full TC39 AddDurations (7.5.27) in NAPI with PlainDate and ZonedDateTime relativeTo paths, fixing calendar-unit duration arithmetic (+27 test262 tests, 6660/6662 passing)
- ZonedDateTime.from reject mode now validates gregory calendar day-of-month (was silently skipping)
- ZonedDateTime.with() offset coercion replaced hand-rolled logic with `toPrimitiveAndRequireString` for consistency with `from()`
- PlainMonthDay.from string path now preserves `[u-ca=...]` calendar annotation in `_calId`
- Intl.DateTimeFormat formatting null-safety guards for `_origFormatGetterLocal`
- timezone.ts type narrowing for era field (`toLowerCase` on potentially non-string type)
- DST gap disambiguation comments clarified (logic was already correct)

### Changed
- `./native` package.json export now includes `"import"` condition for ESM bundler compatibility
- ESLint ignores now include `lib/temporal.d.mts` (type declaration file)
- Rust doc comments improved for `cached_provider()` OnceLock semantics and precision clamping

## [0.1.6] - 2026-03-21

### Fixed
- Strip all IXDTF critical flags (`[!`) using global regex (was only stripping the first)
- Preserve sub-millisecond precision in IXDTF fallback path (was truncating to milliseconds)
- Actually removed `_chineseDangiLeapMonthCache` size cap (was lost in previous commit)

## [0.1.5] - 2026-03-21

### Fixed
- Downgraded napi 3 → 2 to fix 10x NAPI call overhead regression (30s vs 350s+ for full test262)
- Reverted @napi-rs/cli 3 → 2 and associated CLI flag changes
- Removed `_chineseDangiLeapMonthCache` size cap that caused cache thrashing
- Reduced test262 per-test timeout back to 30s
- Hoisted repeated allocations to module scope (USE_JS_DIFF_CALENDARS, DIGIT_ROUND, DURATION_TOSTRING_UNITS)
- Consolidated 4 offset formatting locations into `_formatOffsetMs` helper
- Fixed dead branch in PlainDate.with() era validation
- Fixed PlainMonthDay.valueOf() error message (no compare() exists)
- Removed unused `_mode` parameter from `_zdtFromStringWithOffset`

## [0.1.4] - 2026-03-21

### Added
- Conformance layer unit tests (36 tests via Vitest)
- CJS require test (`__test__/cjs.spec.ts`)
- WASM export path: `import from 'temporal_rs/wasm'`
- WASM package included in npm distribution
- WASM Duration: `round()`, `total()`, `compare()` methods
- WASM/NAPI PlainTime: `compare()` static method
- NAPI/WASM Duration: `toJSON()` and `valueOf()` methods
- LICENSE file
- CHANGELOG.md
- CI: dependency caching, lint/typecheck job, Test262 conformance job
- Dependabot for npm, cargo, and github-actions
- `prepublishOnly` script to ensure tsup build before publish
- `engines: { node: ">=20" }` in package.json
- Semver validation in version bump script

### Changed
- Converted conformance layer from JavaScript to TypeScript with strict type checking
- Dual ESM/CJS output via tsup with type declarations and sourcemaps
- Minified output (325KB to 151KB per file)
- ESLint upgraded to `strictTypeChecked` preset — zero warnings
- Version bump script with portable macOS/Linux `sed` support
- Upgraded napi 2 → 3, napi-derive 2 → 3, @napi-rs/cli 2 → 3
- Upgraded vitest 1 → 4, actions/cache v4 → v5
- Updated temporal_rs/timezone_provider to latest (rounding fix)
- Cargo.toml opt-level changed from "s" to 3 (performance over size)

### Fixed
- WASM: changed i64 to f64 in Duration, Instant, ZonedDateTime for JS compatibility
- WASM: added `#[wasm_bindgen]` on PlainTime.compare static method
- Clippy warnings fixed across both Rust crates (extracted `make_relative_to` helper)
- Restored arguments-based loop in `rejectPropertyBagInfinity` (prevented vm sandbox hang)
- Sub-minute UTC offset regex in `_resolveLocalToEpochMs`
- Capped all caches (`_dtfCache`, `_canonicalTzCache`, `_napiZdtCache`, `_chineseDangiLeapMonthCache`) at 100 entries
- Removed dead ethioaa branches in year getters
- CI: Test262 runner exit code handling (`set +e` for expected failures)
- CI: `@napi-rs/cli` v3 migration (`--cargo-cwd` → `--manifest-path -o .`)
- CI: publish job depends on test262 conformance
- Removed wasm-pkg/.gitignore that blocked npm pack from including WASM files
- Added missing `libc` field to linux-arm64-gnu platform package
- Empty test262-failures.txt on zero failures (was writing lone newline)

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
