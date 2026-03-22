use napi_derive::napi;

use crate::options::to_napi_error;
use crate::options::{provider, RoundingOptions, Unit};

fn make_relative_to(
    relative_to_date: Option<&crate::plain_date::PlainDate>,
    relative_to_zdt: Option<&crate::zoned_date_time::ZonedDateTime>,
) -> Option<temporal_rs::options::RelativeTo> {
    temporal_common::make_relative_to(
        relative_to_date.map(|d| &d.inner),
        relative_to_zdt.map(|z| &z.inner),
    )
}

#[napi]
pub struct Duration {
    pub(crate) inner: temporal_rs::Duration,
}

fn f64_to_i64(v: f64) -> napi::Result<i64> {
    temporal_common::f64_to_i64(v).map_err(napi::Error::from_reason)
}

fn f64_to_i128(v: f64) -> napi::Result<i128> {
    temporal_common::f64_to_i128(v).map_err(napi::Error::from_reason)
}

#[napi]
impl Duration {
    /// Construct with individual date/time components (all optional, default 0).
    ///
    /// Accepts f64 for all fields (matching JS Number type).
    /// Microseconds and nanoseconds are converted to i128 to preserve
    /// precision for values exceeding i64 range.
    #[napi(constructor)]
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        years: Option<f64>,
        months: Option<f64>,
        weeks: Option<f64>,
        days: Option<f64>,
        hours: Option<f64>,
        minutes: Option<f64>,
        seconds: Option<f64>,
        milliseconds: Option<f64>,
        microseconds: Option<f64>,
        nanoseconds: Option<f64>,
    ) -> napi::Result<Self> {
        let inner = temporal_rs::Duration::new(
            f64_to_i64(years.unwrap_or(0.0))?,
            f64_to_i64(months.unwrap_or(0.0))?,
            f64_to_i64(weeks.unwrap_or(0.0))?,
            f64_to_i64(days.unwrap_or(0.0))?,
            f64_to_i64(hours.unwrap_or(0.0))?,
            f64_to_i64(minutes.unwrap_or(0.0))?,
            f64_to_i64(seconds.unwrap_or(0.0))?,
            f64_to_i64(milliseconds.unwrap_or(0.0))?,
            f64_to_i128(microseconds.unwrap_or(0.0))?,
            f64_to_i128(nanoseconds.unwrap_or(0.0))?,
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
    pub fn years(&self) -> f64 {
        self.inner.years() as f64
    }

    #[napi(getter)]
    pub fn months(&self) -> f64 {
        self.inner.months() as f64
    }

    #[napi(getter)]
    pub fn weeks(&self) -> f64 {
        self.inner.weeks() as f64
    }

    #[napi(getter)]
    pub fn days(&self) -> f64 {
        self.inner.days() as f64
    }

    /// Hours component as f64.
    ///
    /// **Precision note:** The inner value is i64. Values beyond ±2^53 will
    /// lose precision when returned as f64.
    #[napi(getter)]
    pub fn hours(&self) -> f64 {
        self.inner.hours() as f64
    }

    /// Minutes component as f64.
    ///
    /// **Precision note:** The inner value is i64. Values beyond ±2^53 will
    /// lose precision when returned as f64.
    #[napi(getter)]
    pub fn minutes(&self) -> f64 {
        self.inner.minutes() as f64
    }

    /// Seconds component as f64.
    ///
    /// **Precision note:** The inner value is i64. Values beyond ±2^53 will
    /// lose precision when returned as f64.
    #[napi(getter)]
    pub fn seconds(&self) -> f64 {
        self.inner.seconds() as f64
    }

    /// Milliseconds component as f64.
    ///
    /// **Precision note:** The inner value is i64. Values beyond ±2^53 will
    /// lose precision when returned as f64.
    #[napi(getter)]
    pub fn milliseconds(&self) -> f64 {
        self.inner.milliseconds() as f64
    }

    /// Note: returns f64 per TC39 Temporal spec. Precision loss possible for values > 2^53.
    #[napi(getter)]
    pub fn microseconds(&self) -> f64 {
        self.inner.microseconds() as f64
    }

    /// Note: returns f64 per TC39 Temporal spec. Precision loss possible for values > 2^53.
    #[napi(getter)]
    pub fn nanoseconds(&self) -> f64 {
        self.inner.nanoseconds() as f64
    }

    #[napi(getter)]
    pub fn sign(&self) -> i32 {
        self.inner.sign() as i32
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
        let provider = provider()?;

        let relative_to = make_relative_to(relative_to_date, relative_to_zdt);

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
        let provider = provider()?;

        let relative_to = make_relative_to(relative_to_date, relative_to_zdt);

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
        let provider = provider()?;

        let relative_to = make_relative_to(relative_to_date, relative_to_zdt);

        let result = one
            .inner
            .compare_with_provider(&two.inner, relative_to, &provider)
            .map_err(to_napi_error)?;
        Ok(result as i32)
    }

    #[napi]
    #[allow(clippy::inherent_to_string)]
    pub fn to_string(&self) -> String {
        format!("{}", self.inner)
    }

    #[napi]
    pub fn to_json(&self) -> String {
        format!("{}", self.inner)
    }

    #[napi]
    pub fn value_of(&self) -> napi::Result<()> {
        Err(napi::Error::from_reason(
            "Use compare() to compare Duration values",
        ))
    }
}
