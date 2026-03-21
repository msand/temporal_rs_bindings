use wasm_bindgen::prelude::*;
use temporal_rs::sys::{LocalHostSystem, Temporal};

use crate::instant::Instant;
use crate::options::{provider, to_js_error};
use crate::plain_date::PlainDate;
use crate::plain_date_time::PlainDateTime;
use crate::plain_time::PlainTime;
use crate::time_zone::TimeZone;
use crate::zoned_date_time::ZonedDateTime;

fn local_now() -> temporal_rs::now::Now<LocalHostSystem> {
    Temporal::local_now()
}

#[wasm_bindgen(js_name = "nowInstant")]
pub fn now_instant() -> Result<Instant, JsValue> {
    let inner = local_now().instant().map_err(to_js_error)?;
    Ok(Instant { inner })
}

#[wasm_bindgen(js_name = "nowTimeZone")]
pub fn now_time_zone() -> Result<TimeZone, JsValue> {
    let provider = provider()?;
    let inner = local_now()
        .time_zone_with_provider(&provider)
        .map_err(to_js_error)?;
    Ok(TimeZone { inner })
}

#[wasm_bindgen(js_name = "nowZonedDateTimeISO")]
pub fn now_zoned_date_time_iso(time_zone: Option<TimeZone>) -> Result<ZonedDateTime, JsValue> {
    let provider = provider()?;
    let tz = time_zone.map(|t| t.inner);
    let inner = local_now()
        .zoned_date_time_iso_with_provider(tz, &provider)
        .map_err(to_js_error)?;
    Ok(ZonedDateTime { inner })
}

#[wasm_bindgen(js_name = "nowPlainDateTimeISO")]
pub fn now_plain_date_time_iso(time_zone: Option<TimeZone>) -> Result<PlainDateTime, JsValue> {
    let provider = provider()?;
    let tz = time_zone.map(|t| t.inner);
    let inner = local_now()
        .plain_date_time_iso_with_provider(tz, &provider)
        .map_err(to_js_error)?;
    Ok(PlainDateTime { inner })
}

#[wasm_bindgen(js_name = "nowPlainDateISO")]
pub fn now_plain_date_iso(time_zone: Option<TimeZone>) -> Result<PlainDate, JsValue> {
    let provider = provider()?;
    let tz = time_zone.map(|t| t.inner);
    let inner = local_now()
        .plain_date_iso_with_provider(tz, &provider)
        .map_err(to_js_error)?;
    Ok(PlainDate { inner })
}

#[wasm_bindgen(js_name = "nowPlainTimeISO")]
pub fn now_plain_time_iso(time_zone: Option<TimeZone>) -> Result<PlainTime, JsValue> {
    let provider = provider()?;
    let tz = time_zone.map(|t| t.inner);
    let inner = local_now()
        .plain_time_iso_with_provider(tz, &provider)
        .map_err(to_js_error)?;
    Ok(PlainTime { inner })
}
