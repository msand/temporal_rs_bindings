use napi_derive::napi;

use crate::calendar::Calendar;
use crate::duration::Duration;
use crate::instant::Instant;
use crate::options::*;
use crate::plain_date::PlainDate;
use crate::plain_date_time::PlainDateTime;
use crate::plain_time::PlainTime;
use crate::time_zone::TimeZone;

fn provider() -> napi::Result<&'static timezone_provider::zoneinfo64::ZoneInfo64TzdbProvider<'static>> {
    temporal_common::cached_provider()
        .ok_or_else(|| napi::Error::from_reason("Failed to initialize timezone provider"))
}

#[napi]
pub struct ZonedDateTime {
    pub(crate) inner: temporal_rs::ZonedDateTime,
}

#[napi]
impl ZonedDateTime {
    #[napi(constructor)]
    pub fn new(
        epoch_nanoseconds: napi::bindgen_prelude::BigInt,
        timezone: &TimeZone,
        calendar: Option<&Calendar>,
    ) -> napi::Result<Self> {
        let (ns, _lossless) = epoch_nanoseconds.get_i128();
        let cal = calendar.map(|c| c.inner.clone()).unwrap_or_default();
        let inner = temporal_rs::ZonedDateTime::try_new_with_provider(
            ns,
            timezone.inner,
            cal,
            provider()?,
        )
        .map_err(to_napi_error)?;
        Ok(Self { inner })
    }

    #[napi(factory)]
    pub fn from(s: String) -> napi::Result<Self> {
        let inner = temporal_rs::ZonedDateTime::from_utf8_with_provider(
            s.as_bytes(),
            temporal_rs::options::Disambiguation::Compatible,
            temporal_rs::options::OffsetDisambiguation::Reject,
            provider()?,
        )
        .map_err(to_napi_error)?;
        Ok(Self { inner })
    }

    #[napi(factory)]
    pub fn from_epoch_milliseconds(
        ms: i64,
        timezone: &TimeZone,
        calendar: Option<&Calendar>,
    ) -> napi::Result<Self> {
        let cal = calendar.map(|c| c.inner.clone()).unwrap_or_default();
        let instant =
            temporal_rs::Instant::from_epoch_milliseconds(ms).map_err(to_napi_error)?;
        let inner = temporal_rs::ZonedDateTime::try_new_from_instant_with_provider(
            instant,
            timezone.inner,
            cal,
            provider()?,
        )
        .map_err(to_napi_error)?;
        Ok(Self { inner })
    }

    // ==== Date getters ====

    #[napi(getter)]
    pub fn year(&self) -> i32 {
        self.inner.year()
    }

    #[napi(getter)]
    pub fn month(&self) -> u8 {
        self.inner.month()
    }

    #[napi(getter)]
    pub fn month_code(&self) -> String {
        self.inner.month_code().as_str().to_string()
    }

    #[napi(getter)]
    pub fn day(&self) -> u8 {
        self.inner.day()
    }

    #[napi(getter)]
    pub fn day_of_week(&self) -> u16 {
        self.inner.day_of_week()
    }

    #[napi(getter)]
    pub fn day_of_year(&self) -> u16 {
        self.inner.day_of_year()
    }

    #[napi(getter)]
    pub fn week_of_year(&self) -> Option<u8> {
        self.inner.week_of_year()
    }

    #[napi(getter)]
    pub fn year_of_week(&self) -> Option<i32> {
        self.inner.year_of_week()
    }

    #[napi(getter)]
    pub fn days_in_week(&self) -> u16 {
        self.inner.days_in_week()
    }

    #[napi(getter)]
    pub fn days_in_month(&self) -> u16 {
        self.inner.days_in_month()
    }

    #[napi(getter)]
    pub fn days_in_year(&self) -> u16 {
        self.inner.days_in_year()
    }

    #[napi(getter)]
    pub fn months_in_year(&self) -> u16 {
        self.inner.months_in_year()
    }

    #[napi(getter)]
    pub fn in_leap_year(&self) -> bool {
        self.inner.in_leap_year()
    }

    #[napi(getter)]
    pub fn era(&self) -> Option<String> {
        self.inner.era().map(|e| e.to_string())
    }

    #[napi(getter)]
    pub fn era_year(&self) -> Option<i32> {
        self.inner.era_year()
    }

    // ==== Time getters ====

    #[napi(getter)]
    pub fn hour(&self) -> u8 {
        self.inner.hour()
    }

    #[napi(getter)]
    pub fn minute(&self) -> u8 {
        self.inner.minute()
    }

    #[napi(getter)]
    pub fn second(&self) -> u8 {
        self.inner.second()
    }

    #[napi(getter)]
    pub fn millisecond(&self) -> u16 {
        self.inner.millisecond()
    }

    #[napi(getter)]
    pub fn microsecond(&self) -> u16 {
        self.inner.microsecond()
    }

    #[napi(getter)]
    pub fn nanosecond(&self) -> u16 {
        self.inner.nanosecond()
    }

    // ==== Zone/offset getters ====

    #[napi(getter)]
    pub fn calendar(&self) -> Calendar {
        Calendar {
            inner: self.inner.calendar().clone(),
        }
    }

    #[napi(getter)]
    pub fn time_zone(&self) -> TimeZone {
        TimeZone {
            inner: *self.inner.time_zone(),
        }
    }

    #[napi(getter)]
    pub fn offset(&self) -> String {
        self.inner.offset()
    }

    #[napi(getter)]
    pub fn offset_nanoseconds(&self) -> i64 {
        self.inner.offset_nanoseconds()
    }

    #[napi(getter)]
    pub fn epoch_milliseconds(&self) -> i64 {
        self.inner.epoch_milliseconds()
    }

    #[napi(getter)]
    pub fn epoch_nanoseconds(&self) -> i128 {
        self.inner.epoch_nanoseconds().as_i128()
    }

    // ==== Arithmetic ====

    #[napi]
    pub fn add(
        &self,
        duration: &Duration,
        overflow: Option<Overflow>,
    ) -> napi::Result<ZonedDateTime> {
        let inner = self
            .inner
            .add_with_provider(&duration.inner, overflow.map(Into::into), provider()?)
            .map_err(to_napi_error)?;
        Ok(ZonedDateTime { inner })
    }

    #[napi]
    pub fn subtract(
        &self,
        duration: &Duration,
        overflow: Option<Overflow>,
    ) -> napi::Result<ZonedDateTime> {
        let inner = self
            .inner
            .subtract_with_provider(&duration.inner, overflow.map(Into::into), provider()?)
            .map_err(to_napi_error)?;
        Ok(ZonedDateTime { inner })
    }

    #[napi]
    pub fn until(
        &self,
        other: &ZonedDateTime,
        settings: Option<DifferenceSettings>,
    ) -> napi::Result<Duration> {
        let s: temporal_rs::options::DifferenceSettings =
            settings.unwrap_or_default().try_into()?;
        let inner = self
            .inner
            .until_with_provider(&other.inner, s, provider()?)
            .map_err(to_napi_error)?;
        Ok(Duration { inner })
    }

    #[napi]
    pub fn since(
        &self,
        other: &ZonedDateTime,
        settings: Option<DifferenceSettings>,
    ) -> napi::Result<Duration> {
        let s: temporal_rs::options::DifferenceSettings =
            settings.unwrap_or_default().try_into()?;
        let inner = self
            .inner
            .since_with_provider(&other.inner, s, provider()?)
            .map_err(to_napi_error)?;
        Ok(Duration { inner })
    }

    // ==== Other methods ====

    #[napi]
    pub fn round(&self, options: RoundingOptions) -> napi::Result<ZonedDateTime> {
        let opts: temporal_rs::options::RoundingOptions = options.try_into()?;
        let inner = self
            .inner
            .round_with_provider(opts, provider()?)
            .map_err(to_napi_error)?;
        Ok(ZonedDateTime { inner })
    }

    #[napi]
    pub fn equals(&self, other: &ZonedDateTime) -> napi::Result<bool> {
        self.inner
            .equals_with_provider(&other.inner, provider()?)
            .map_err(to_napi_error)
    }

    #[napi]
    pub fn compare_instant(one: &ZonedDateTime, two: &ZonedDateTime) -> i32 {
        one.inner.compare_instant(&two.inner) as i32
    }

    #[napi(getter)]
    pub fn hours_in_day(&self) -> napi::Result<f64> {
        self.inner
            .hours_in_day_with_provider(provider()?)
            .map_err(to_napi_error)
    }

    #[napi]
    pub fn start_of_day(&self) -> napi::Result<ZonedDateTime> {
        let inner = self
            .inner
            .start_of_day_with_provider(provider()?)
            .map_err(to_napi_error)?;
        Ok(ZonedDateTime { inner })
    }

    #[napi]
    pub fn to_instant(&self) -> Instant {
        Instant {
            inner: self.inner.to_instant(),
        }
    }

    #[napi]
    pub fn to_plain_date(&self) -> PlainDate {
        PlainDate {
            inner: self.inner.to_plain_date(),
        }
    }

    #[napi]
    pub fn to_plain_time(&self) -> PlainTime {
        PlainTime {
            inner: self.inner.to_plain_time(),
        }
    }

    #[napi]
    pub fn to_plain_date_time(&self) -> PlainDateTime {
        PlainDateTime {
            inner: self.inner.to_plain_date_time(),
        }
    }

    #[napi]
    pub fn with_calendar(&self, calendar: &Calendar) -> ZonedDateTime {
        ZonedDateTime {
            inner: self.inner.with_calendar(calendar.inner.clone()),
        }
    }

    #[napi]
    pub fn with_time_zone(&self, timezone: &TimeZone) -> napi::Result<ZonedDateTime> {
        let inner = self
            .inner
            .with_time_zone_with_provider(timezone.inner, provider()?)
            .map_err(to_napi_error)?;
        Ok(ZonedDateTime { inner })
    }

    #[napi]
    pub fn to_string(&self) -> napi::Result<String> {
        self.inner
            .to_string_with_provider(provider()?)
            .map_err(to_napi_error)
    }

    #[napi]
    pub fn to_json(&self) -> napi::Result<String> {
        self.inner
            .to_string_with_provider(provider()?)
            .map_err(to_napi_error)
    }

    #[napi]
    pub fn value_of(&self) -> napi::Result<()> {
        Err(napi::Error::from_reason(
            "Use compare() or equals() to compare ZonedDateTime values",
        ))
    }
}
