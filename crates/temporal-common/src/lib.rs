//! Shared utilities for temporal-napi and temporal-wasm crates.
//!
//! This crate contains common logic that is used by both the NAPI (Node.js native)
//! and WASM (WebAssembly) binding crates, avoiding code duplication.

use timezone_provider::zoneinfo64::ZoneInfo64TzdbProvider;

/// Convert an f64 (JS Number) to i64, matching the spec's ToIntegerIfIntegral.
/// The value must be finite, integral, and within the representable i64 range.
pub fn f64_to_i64(v: f64) -> Result<i64, String> {
    if v.is_nan() || v.is_infinite() {
        return Err("RangeError: Duration field must be finite".into());
    }
    if v.fract() != 0.0 {
        return Err("RangeError: Duration field must be an integer".into());
    }
    if v > (i64::MAX as f64) || v < (i64::MIN as f64) {
        return Err("RangeError: Duration field value is out of range".into());
    }
    Ok(v as i64)
}

/// Convert an f64 (JS Number) to i128 for microseconds/nanoseconds.
/// These fields can hold values larger than i64 range but must still
/// be representable as f64 integers (within ±2^53).
pub fn f64_to_i128(v: f64) -> Result<i128, String> {
    if v.is_nan() || v.is_infinite() {
        return Err("RangeError: Duration field must be finite".into());
    }
    if v.fract() != 0.0 {
        return Err("RangeError: Duration field must be an integer".into());
    }
    Ok(v as i128)
}

/// Build a `RelativeTo` from optional date and zoned-date-time references.
pub fn make_relative_to(
    relative_to_date: Option<&temporal_rs::PlainDate>,
    relative_to_zdt: Option<&temporal_rs::ZonedDateTime>,
) -> Option<temporal_rs::options::RelativeTo> {
    relative_to_zdt
        .map(|zdt| temporal_rs::options::RelativeTo::ZonedDateTime(zdt.clone()))
        .or_else(|| {
            relative_to_date
                .map(|date| temporal_rs::options::RelativeTo::PlainDate(date.clone()))
        })
}

// ZoneInfo64TzdbProvider::zoneinfo64_provider_for_testing() is the standard embedded
// IANA timezone provider from the `icu` crate. Despite the "_for_testing" suffix in its
// name (an upstream naming convention), it is the correct provider for production use.

/// Create a fresh embedded IANA timezone provider instance.
///
/// Returns `None` only if the embedded timezone data failed to load,
/// which should not happen in practice.
///
/// Prefer [`cached_provider`] when a shared reference suffices, to
/// avoid repeated initialisation overhead.
pub fn create_provider() -> Option<ZoneInfo64TzdbProvider<'static>> {
    ZoneInfo64TzdbProvider::zoneinfo64_provider_for_testing()
}

/// Return a reference to a lazily-initialised, process-wide timezone provider.
///
/// This avoids creating a new provider on every timezone operation.
/// The provider is initialised once on first call and reused thereafter.
pub fn cached_provider() -> Option<&'static ZoneInfo64TzdbProvider<'static>> {
    use std::sync::OnceLock;
    static PROVIDER: OnceLock<Option<ZoneInfo64TzdbProvider<'static>>> = OnceLock::new();
    PROVIDER
        .get_or_init(ZoneInfo64TzdbProvider::zoneinfo64_provider_for_testing)
        .as_ref()
}
