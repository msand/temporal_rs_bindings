use napi_derive::napi;

use crate::options::to_napi_error;
use crate::options::{provider, RoundingOptions, Unit};
use temporal_rs::options::{DifferenceSettings, Overflow, RelativeTo};

fn make_relative_to(
    relative_to_date: Option<&crate::plain_date::PlainDate>,
    relative_to_zdt: Option<&crate::zoned_date_time::ZonedDateTime>,
) -> Option<temporal_rs::options::RelativeTo> {
    temporal_common::make_relative_to(
        relative_to_date.map(|d| &d.inner),
        relative_to_zdt.map(|z| &z.inner),
    )
}

/// DefaultTemporalLargestUnit: returns the largest non-zero unit of a Duration.
fn default_largest_unit(d: &temporal_rs::Duration) -> temporal_rs::options::Unit {
    use temporal_rs::options::Unit;
    if d.years() != 0 { return Unit::Year; }
    if d.months() != 0 { return Unit::Month; }
    if d.weeks() != 0 { return Unit::Week; }
    if d.days() != 0 { return Unit::Day; }
    if d.hours() != 0 { return Unit::Hour; }
    if d.minutes() != 0 { return Unit::Minute; }
    if d.seconds() != 0 { return Unit::Second; }
    if d.milliseconds() != 0 { return Unit::Millisecond; }
    if d.microseconds() != 0 { return Unit::Microsecond; }
    Unit::Nanosecond
}

/// Implements the TC39 AddDurations abstract operation (7.5.27).
///
/// When `relative_to` is provided, calendar-unit durations are resolved
/// via PlainDate or ZonedDateTime arithmetic.  Without `relative_to`,
/// only time-unit durations are supported (calendar units throw RangeError).
fn add_durations(
    duration: &temporal_rs::Duration,
    other: &temporal_rs::Duration,
    relative_to: Option<RelativeTo>,
) -> temporal_rs::TemporalResult<temporal_rs::Duration> {
    // Steps 3-5: Determine largest unit
    let largest_unit = default_largest_unit(duration).max(default_largest_unit(other));

    match relative_to {
        // Step 6: zonedRelativeTo path
        Some(RelativeTo::ZonedDateTime(ref zdt)) => {
            let provider = provider().map_err(|_| {
                temporal_rs::TemporalError::range()
                    .with_message("Failed to create time zone provider")
            })?;
            // a. Add duration to zdt
            let intermediate = zdt
                .add_with_provider(duration, Some(Overflow::Constrain), &provider)?;
            // b. Add other to intermediate
            let end = intermediate
                .add_with_provider(other, Some(Overflow::Constrain), &provider)?;
            // c. Diff zdt and end with largestUnit
            let mut diff_settings = DifferenceSettings::default();
            diff_settings.largest_unit = Some(largest_unit);
            zdt.until_with_provider(&end, diff_settings, &provider)
        }
        // Step 7: plainRelativeTo path
        Some(RelativeTo::PlainDate(ref plain_date)) => {
            // a. Add duration to plainDate
            let intermediate = plain_date.add(duration, Some(Overflow::Constrain))?;
            // b. Add other to intermediate
            let end = intermediate.add(other, Some(Overflow::Constrain))?;
            // c. Diff plainDate and end with largestUnit
            let mut diff_settings = DifferenceSettings::default();
            diff_settings.largest_unit = Some(largest_unit);
            plain_date.until(&end, diff_settings)
        }
        // Steps 8-13: no relativeTo — delegate to existing Duration::add
        None => duration.add(other),
    }
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
    pub fn add(
        &self,
        other: &Duration,
        relative_to_date: Option<&crate::plain_date::PlainDate>,
        relative_to_zdt: Option<&crate::zoned_date_time::ZonedDateTime>,
    ) -> napi::Result<Duration> {
        let relative_to = make_relative_to(relative_to_date, relative_to_zdt);
        let inner =
            add_durations(&self.inner, &other.inner, relative_to).map_err(to_napi_error)?;
        Ok(Duration { inner })
    }

    #[napi]
    pub fn subtract(
        &self,
        other: &Duration,
        relative_to_date: Option<&crate::plain_date::PlainDate>,
        relative_to_zdt: Option<&crate::zoned_date_time::ZonedDateTime>,
    ) -> napi::Result<Duration> {
        let relative_to = make_relative_to(relative_to_date, relative_to_zdt);
        let inner =
            add_durations(&self.inner, &other.inner.negated(), relative_to).map_err(to_napi_error)?;
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
            "TypeError: Use compare() to compare Duration values",
        ))
    }
}
