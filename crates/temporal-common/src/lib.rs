//! Shared utilities for temporal-napi and temporal-wasm crates.
//!
//! This crate contains common logic that is used by both the NAPI (Node.js native)
//! and WASM (WebAssembly) binding crates, avoiding code duplication.

use timezone_provider::zoneinfo64::ZoneInfo64TzdbProvider;

/// Re-exported provider type so downstream crates don't need a direct
/// `timezone_provider` dependency for type signatures.
pub type TzProvider = ZoneInfo64TzdbProvider<'static>;

/// Convert an f64 (JS Number) to i64, rejecting NaN, Infinity, and fractional values.
/// Uses the correct i64 boundary: the largest f64 that is < i64::MAX when truncated.
pub fn f64_to_i64(v: f64) -> Result<i64, String> {
    if v.is_nan() || v.is_infinite() {
        return Err("RangeError: Duration field must be finite".into());
    }
    if v.fract() != 0.0 {
        return Err("RangeError: Duration field value must be an integer".into());
    }
    // i64::MAX as f64 rounds up to 2^63, which overflows i64.
    // Use strict less-than to avoid the boundary value that saturates.
    if v >= (i64::MAX as f64) || v < (i64::MIN as f64) {
        return Err("RangeError: Duration field value is out of range".into());
    }
    Ok(v as i64)
}

/// Convert an f64 (JS Number) to i128 for nanosecond-precision values.
/// Rejects NaN, Infinity, and fractional values.
pub fn f64_to_i128(v: f64) -> Result<i128, String> {
    if v.is_nan() || v.is_infinite() {
        return Err("RangeError: Duration field must be finite".into());
    }
    if v.fract() != 0.0 {
        return Err("RangeError: Duration field value must be an integer".into());
    }
    // f64 can only represent integers exactly up to 2^53, but the i128
    // cast itself is safe for any finite f64 value.
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

/// Macro to generate a `From` impl mapping a local enum's variants to `temporal_rs` enum variants.
/// Both enums must have identical variant names.
#[macro_export]
macro_rules! impl_temporal_enum_from {
    ($local:ty => $temporal:ty { $($variant:ident),+ $(,)? }) => {
        impl From<$local> for $temporal {
            fn from(value: $local) -> Self {
                match value {
                    $( <$local>::$variant => Self::$variant, )+
                }
            }
        }
    };
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
