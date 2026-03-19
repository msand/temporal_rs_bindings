use napi_derive::napi;
use timezone_provider::zoneinfo64::ZoneInfo64TzdbProvider;

use crate::options::to_napi_error;
use crate::options::{RoundingOptions, Unit};

#[napi]
pub struct Duration {
    pub(crate) inner: temporal_rs::Duration,
}

#[napi]
impl Duration {
    #[napi(constructor)]
    pub fn new(
        years: Option<i64>,
        months: Option<i64>,
        weeks: Option<i64>,
        days: Option<i64>,
        hours: Option<i64>,
        minutes: Option<i64>,
        seconds: Option<i64>,
        milliseconds: Option<i64>,
        microseconds: Option<i64>,
        nanoseconds: Option<i64>,
    ) -> napi::Result<Self> {
        let inner = temporal_rs::Duration::new(
            years.unwrap_or(0),
            months.unwrap_or(0),
            weeks.unwrap_or(0),
            days.unwrap_or(0),
            hours.unwrap_or(0),
            minutes.unwrap_or(0),
            seconds.unwrap_or(0),
            milliseconds.unwrap_or(0),
            microseconds.unwrap_or(0) as i128,
            nanoseconds.unwrap_or(0) as i128,
        )
        .map_err(to_napi_error)?;
        Ok(Self { inner })
    }

    #[napi(factory)]
    pub fn from(s: String) -> napi::Result<Self> {
        let inner = temporal_rs::Duration::from_utf8(s.as_bytes()).map_err(to_napi_error)?;
        Ok(Self { inner })
    }

    #[napi(getter)]
    pub fn years(&self) -> i64 {
        self.inner.years()
    }

    #[napi(getter)]
    pub fn months(&self) -> i64 {
        self.inner.months()
    }

    #[napi(getter)]
    pub fn weeks(&self) -> i64 {
        self.inner.weeks()
    }

    #[napi(getter)]
    pub fn days(&self) -> i64 {
        self.inner.days()
    }

    #[napi(getter)]
    pub fn hours(&self) -> i64 {
        self.inner.hours()
    }

    #[napi(getter)]
    pub fn minutes(&self) -> i64 {
        self.inner.minutes()
    }

    #[napi(getter)]
    pub fn seconds(&self) -> i64 {
        self.inner.seconds()
    }

    #[napi(getter)]
    pub fn milliseconds(&self) -> i64 {
        self.inner.milliseconds()
    }

    #[napi(getter)]
    pub fn microseconds(&self) -> i64 {
        self.inner.microseconds() as i64
    }

    #[napi(getter)]
    pub fn nanoseconds(&self) -> i64 {
        self.inner.nanoseconds() as i64
    }

    #[napi(getter)]
    pub fn sign(&self) -> i8 {
        self.inner.sign() as i8
    }

    #[napi(getter)]
    pub fn is_zero(&self) -> bool {
        self.inner.is_zero()
    }

    #[napi]
    pub fn negated(&self) -> Duration {
        Duration {
            inner: self.inner.negated(),
        }
    }

    #[napi]
    pub fn abs(&self) -> Duration {
        Duration {
            inner: self.inner.abs(),
        }
    }

    #[napi]
    pub fn add(&self, other: &Duration) -> napi::Result<Duration> {
        let inner = self.inner.add(&other.inner).map_err(to_napi_error)?;
        Ok(Duration { inner })
    }

    #[napi]
    pub fn subtract(&self, other: &Duration) -> napi::Result<Duration> {
        let inner = self.inner.subtract(&other.inner).map_err(to_napi_error)?;
        Ok(Duration { inner })
    }

    #[napi]
    pub fn round(
        &self,
        options: RoundingOptions,
        relative_to_date: Option<&crate::plain_date::PlainDate>,
        relative_to_zdt: Option<&crate::zoned_date_time::ZonedDateTime>,
    ) -> napi::Result<Duration> {
        let provider = ZoneInfo64TzdbProvider::zoneinfo64_provider_for_testing()
            .ok_or_else(|| napi::Error::from_reason("Failed to initialize timezone provider"))?;

        let relative_to = if let Some(zdt) = relative_to_zdt {
            Some(temporal_rs::options::RelativeTo::ZonedDateTime(
                zdt.inner.clone(),
            ))
        } else if let Some(date) = relative_to_date {
            Some(temporal_rs::options::RelativeTo::PlainDate(
                date.inner.clone(),
            ))
        } else {
            None
        };

        let opts: temporal_rs::options::RoundingOptions = options.try_into()?;
        let inner = self
            .inner
            .round_with_provider(opts, relative_to, &provider)
            .map_err(to_napi_error)?;
        Ok(Duration { inner })
    }

    #[napi]
    pub fn total(
        &self,
        unit: Unit,
        relative_to_date: Option<&crate::plain_date::PlainDate>,
        relative_to_zdt: Option<&crate::zoned_date_time::ZonedDateTime>,
    ) -> napi::Result<f64> {
        let provider = ZoneInfo64TzdbProvider::zoneinfo64_provider_for_testing()
            .ok_or_else(|| napi::Error::from_reason("Failed to initialize timezone provider"))?;

        let relative_to = if let Some(zdt) = relative_to_zdt {
            Some(temporal_rs::options::RelativeTo::ZonedDateTime(
                zdt.inner.clone(),
            ))
        } else if let Some(date) = relative_to_date {
            Some(temporal_rs::options::RelativeTo::PlainDate(
                date.inner.clone(),
            ))
        } else {
            None
        };

        let unit: temporal_rs::options::Unit = unit.into();
        let result = self
            .inner
            .total_with_provider(unit, relative_to, &provider)
            .map_err(to_napi_error)?;
        Ok(result.as_inner())
    }

    #[napi]
    pub fn compare(
        one: &Duration,
        two: &Duration,
        relative_to_date: Option<&crate::plain_date::PlainDate>,
        relative_to_zdt: Option<&crate::zoned_date_time::ZonedDateTime>,
    ) -> napi::Result<i32> {
        let provider = ZoneInfo64TzdbProvider::zoneinfo64_provider_for_testing()
            .ok_or_else(|| napi::Error::from_reason("Failed to initialize timezone provider"))?;

        let relative_to = if let Some(zdt) = relative_to_zdt {
            Some(temporal_rs::options::RelativeTo::ZonedDateTime(
                zdt.inner.clone(),
            ))
        } else if let Some(date) = relative_to_date {
            Some(temporal_rs::options::RelativeTo::PlainDate(
                date.inner.clone(),
            ))
        } else {
            None
        };

        let result = one
            .inner
            .compare_with_provider(&two.inner, relative_to, &provider)
            .map_err(to_napi_error)?;
        Ok(result as i32)
    }

    #[napi]
    pub fn to_string(&self) -> String {
        format!("{}", self.inner)
    }
}
