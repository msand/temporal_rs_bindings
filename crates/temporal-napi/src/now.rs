use napi_derive::napi;
use temporal_rs::sys::{LocalHostSystem, Temporal};
use timezone_provider::zoneinfo64::ZoneInfo64TzdbProvider;

use crate::instant::Instant;
use crate::options::to_napi_error;
use crate::plain_date::PlainDate;
use crate::plain_date_time::PlainDateTime;
use crate::plain_time::PlainTime;
use crate::time_zone::TimeZone;
use crate::zoned_date_time::ZonedDateTime;

fn make_provider() -> napi::Result<ZoneInfo64TzdbProvider<'static>> {
    ZoneInfo64TzdbProvider::zoneinfo64_provider_for_testing()
        .ok_or_else(|| napi::Error::from_reason("Failed to initialize timezone provider"))
}

fn local_now() -> temporal_rs::now::Now<LocalHostSystem> {
    Temporal::local_now()
}

#[napi]
pub fn now_instant() -> napi::Result<Instant> {
    let inner = local_now().instant().map_err(to_napi_error)?;
    Ok(Instant { inner })
}

#[napi]
pub fn now_time_zone() -> napi::Result<TimeZone> {
    let provider = make_provider()?;
    let inner = local_now()
        .time_zone_with_provider(&provider)
        .map_err(to_napi_error)?;
    Ok(TimeZone { inner })
}

#[napi]
pub fn now_zoned_date_time_iso(time_zone: Option<&TimeZone>) -> napi::Result<ZonedDateTime> {
    let provider = make_provider()?;
    let tz = time_zone.map(|t| t.inner);
    let inner = local_now()
        .zoned_date_time_iso_with_provider(tz, &provider)
        .map_err(to_napi_error)?;
    Ok(ZonedDateTime { inner })
}

#[napi]
pub fn now_plain_date_time_iso(time_zone: Option<&TimeZone>) -> napi::Result<PlainDateTime> {
    let provider = make_provider()?;
    let tz = time_zone.map(|t| t.inner);
    let inner = local_now()
        .plain_date_time_iso_with_provider(tz, &provider)
        .map_err(to_napi_error)?;
    Ok(PlainDateTime { inner })
}

#[napi]
pub fn now_plain_date_iso(time_zone: Option<&TimeZone>) -> napi::Result<PlainDate> {
    let provider = make_provider()?;
    let tz = time_zone.map(|t| t.inner);
    let inner = local_now()
        .plain_date_iso_with_provider(tz, &provider)
        .map_err(to_napi_error)?;
    Ok(PlainDate { inner })
}

#[napi]
pub fn now_plain_time_iso(time_zone: Option<&TimeZone>) -> napi::Result<PlainTime> {
    let provider = make_provider()?;
    let tz = time_zone.map(|t| t.inner);
    let inner = local_now()
        .plain_time_iso_with_provider(tz, &provider)
        .map_err(to_napi_error)?;
    Ok(PlainTime { inner })
}
