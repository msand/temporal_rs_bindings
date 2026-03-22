use wasm_bindgen::prelude::*;
use temporal_rs::host::{HostClock, HostHooks, HostTimeZone};
use temporal_rs::unix_time::EpochNanoseconds;
use temporal_rs::now::Now;

use crate::instant::Instant;
use crate::options::{provider, to_js_error};
use crate::plain_date::PlainDate;
use crate::plain_date_time::PlainDateTime;
use crate::plain_time::PlainTime;
use crate::time_zone::TimeZone;
use crate::zoned_date_time::ZonedDateTime;

/// A browser-compatible host system that uses `js_sys::Date::now()` to obtain
/// the current time. This avoids relying on `std::time::SystemTime::now()`,
/// which may not work correctly in all WASM environments (e.g. returning
/// epoch 0 in some browsers).
///
/// The timezone fallback is UTC because reliable IANA timezone detection is
/// not available from within WASM without additional JS interop.
struct BrowserHostSystem;

impl HostClock for BrowserHostSystem {
    fn get_host_epoch_nanoseconds(&self) -> temporal_rs::TemporalResult<EpochNanoseconds> {
        // js_sys::Date::now() returns milliseconds since Unix epoch as f64.
        let ms = js_sys::Date::now();
        let ns = (ms as i128) * 1_000_000;
        if ns.abs() > 8_640_000_000_000_000_000_000i128 {
            return Err(temporal_rs::TemporalError::range()
                .with_message("current time is outside the supported epoch nanosecond range"));
        }
        Ok(EpochNanoseconds(ns))
    }
}

impl HostTimeZone for BrowserHostSystem {
    fn get_host_time_zone(
        &self,
        _provider: &(impl temporal_rs::provider::TimeZoneProvider + ?Sized),
    ) -> temporal_rs::TemporalResult<temporal_rs::TimeZone> {
        // Fall back to UTC in WASM environments where system timezone detection
        // is not reliably available.
        Ok(temporal_rs::TimeZone::from(temporal_rs::UtcOffset::default()))
    }
}

impl HostHooks for BrowserHostSystem {}

fn browser_now() -> Now<BrowserHostSystem> {
    Now::new(BrowserHostSystem)
}

/// Returns the current instant.
///
/// Uses `js_sys::Date::now()` for the current time, which is reliable across
/// all browser and WASM environments (unlike `std::time::SystemTime::now()`
/// which may return epoch 0 in some runtimes).
#[wasm_bindgen(js_name = "nowInstant")]
pub fn now_instant() -> Result<Instant, JsValue> {
    let inner = browser_now().instant().map_err(to_js_error)?;
    Ok(Instant { inner })
}

/// Returns the current time zone.
///
/// **Note:** In WASM environments, the fallback time zone is UTC because
/// reliable IANA timezone detection is not available from within WASM
/// without additional JS interop.
#[wasm_bindgen(js_name = "nowTimeZone")]
pub fn now_time_zone() -> Result<TimeZone, JsValue> {
    let provider = provider()?;
    let inner = browser_now()
        .time_zone_with_provider(provider)
        .map_err(to_js_error)?;
    Ok(TimeZone { inner })
}

/// Returns the current zoned date-time in the ISO calendar.
///
/// Uses `js_sys::Date::now()` for the current time. The fallback time zone
/// is UTC in WASM environments.
///
/// The `time_zone` parameter, if provided, is consumed (moved) due to
/// wasm-bindgen limitations on passing borrowed references.
#[wasm_bindgen(js_name = "nowZonedDateTimeISO")]
pub fn now_zoned_date_time_iso(time_zone: Option<TimeZone>) -> Result<ZonedDateTime, JsValue> {
    let provider = provider()?;
    let tz = time_zone.map(|t| t.inner);
    let inner = browser_now()
        .zoned_date_time_iso_with_provider(tz, provider)
        .map_err(to_js_error)?;
    Ok(ZonedDateTime { inner })
}

/// Returns the current plain date-time in the ISO calendar.
///
/// Uses `js_sys::Date::now()` for the current time. The fallback time zone
/// is UTC in WASM environments.
///
/// The `time_zone` parameter, if provided, is consumed (moved) due to
/// wasm-bindgen limitations on passing borrowed references.
#[wasm_bindgen(js_name = "nowPlainDateTimeISO")]
pub fn now_plain_date_time_iso(time_zone: Option<TimeZone>) -> Result<PlainDateTime, JsValue> {
    let provider = provider()?;
    let tz = time_zone.map(|t| t.inner);
    let inner = browser_now()
        .plain_date_time_iso_with_provider(tz, provider)
        .map_err(to_js_error)?;
    Ok(PlainDateTime { inner })
}

/// Returns the current plain date in the ISO calendar.
///
/// Uses `js_sys::Date::now()` for the current time. The fallback time zone
/// is UTC in WASM environments.
///
/// The `time_zone` parameter, if provided, is consumed (moved) due to
/// wasm-bindgen limitations on passing borrowed references.
#[wasm_bindgen(js_name = "nowPlainDateISO")]
pub fn now_plain_date_iso(time_zone: Option<TimeZone>) -> Result<PlainDate, JsValue> {
    let provider = provider()?;
    let tz = time_zone.map(|t| t.inner);
    let inner = browser_now()
        .plain_date_iso_with_provider(tz, provider)
        .map_err(to_js_error)?;
    Ok(PlainDate { inner })
}

/// Returns the current plain time in the ISO calendar.
///
/// Uses `js_sys::Date::now()` for the current time. The fallback time zone
/// is UTC in WASM environments.
///
/// The `time_zone` parameter, if provided, is consumed (moved) due to
/// wasm-bindgen limitations on passing borrowed references.
#[wasm_bindgen(js_name = "nowPlainTimeISO")]
pub fn now_plain_time_iso(time_zone: Option<TimeZone>) -> Result<PlainTime, JsValue> {
    let provider = provider()?;
    let tz = time_zone.map(|t| t.inner);
    let inner = browser_now()
        .plain_time_iso_with_provider(tz, provider)
        .map_err(to_js_error)?;
    Ok(PlainTime { inner })
}
