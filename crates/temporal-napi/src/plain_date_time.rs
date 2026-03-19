use napi_derive::napi;

use crate::calendar::Calendar;
use crate::duration::Duration;
use crate::options::*;
use crate::plain_date::PlainDate;
use crate::plain_time::PlainTime;

#[napi]
pub struct PlainDateTime {
    pub(crate) inner: temporal_rs::PlainDateTime,
}

#[napi]
impl PlainDateTime {
    #[napi(constructor)]
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        year: i32,
        month: u8,
        day: u8,
        hour: Option<u8>,
        minute: Option<u8>,
        second: Option<u8>,
        millisecond: Option<u16>,
        microsecond: Option<u16>,
        nanosecond: Option<u16>,
        calendar: Option<&Calendar>,
    ) -> napi::Result<Self> {
        let cal = calendar
            .map(|c| c.inner.clone())
            .unwrap_or_default();
        let inner = temporal_rs::PlainDateTime::new(
            year,
            month,
            day,
            hour.unwrap_or(0),
            minute.unwrap_or(0),
            second.unwrap_or(0),
            millisecond.unwrap_or(0),
            microsecond.unwrap_or(0),
            nanosecond.unwrap_or(0),
            cal,
        )
        .map_err(to_napi_error)?;
        Ok(Self { inner })
    }

    #[napi(factory)]
    pub fn from(s: String) -> napi::Result<Self> {
        let inner =
            temporal_rs::PlainDateTime::from_utf8(s.as_bytes()).map_err(to_napi_error)?;
        Ok(Self { inner })
    }

    // ==== Date Getters ====

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

    #[napi(getter)]
    pub fn calendar(&self) -> Calendar {
        Calendar {
            inner: self.inner.calendar().clone(),
        }
    }

    // ==== Time Getters ====

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

    // ==== Arithmetic ====

    #[napi]
    pub fn add(
        &self,
        duration: &Duration,
        overflow: Option<Overflow>,
    ) -> napi::Result<PlainDateTime> {
        let inner = self
            .inner
            .add(&duration.inner, overflow.map(Into::into))
            .map_err(to_napi_error)?;
        Ok(PlainDateTime { inner })
    }

    #[napi]
    pub fn subtract(
        &self,
        duration: &Duration,
        overflow: Option<Overflow>,
    ) -> napi::Result<PlainDateTime> {
        let inner = self
            .inner
            .subtract(&duration.inner, overflow.map(Into::into))
            .map_err(to_napi_error)?;
        Ok(PlainDateTime { inner })
    }

    #[napi]
    pub fn until(
        &self,
        other: &PlainDateTime,
        settings: Option<DifferenceSettings>,
    ) -> napi::Result<Duration> {
        let s: temporal_rs::options::DifferenceSettings =
            settings.unwrap_or_default().try_into()?;
        let inner = self.inner.until(&other.inner, s).map_err(to_napi_error)?;
        Ok(Duration { inner })
    }

    #[napi]
    pub fn since(
        &self,
        other: &PlainDateTime,
        settings: Option<DifferenceSettings>,
    ) -> napi::Result<Duration> {
        let s: temporal_rs::options::DifferenceSettings =
            settings.unwrap_or_default().try_into()?;
        let inner = self.inner.since(&other.inner, s).map_err(to_napi_error)?;
        Ok(Duration { inner })
    }

    // ==== Other ====

    #[napi]
    pub fn round(&self, options: RoundingOptions) -> napi::Result<PlainDateTime> {
        let inner = self
            .inner
            .round(options.try_into()?)
            .map_err(to_napi_error)?;
        Ok(PlainDateTime { inner })
    }

    #[napi]
    pub fn equals(&self, other: &PlainDateTime) -> bool {
        self.inner == other.inner
    }

    #[napi]
    pub fn compare(one: &PlainDateTime, two: &PlainDateTime) -> i32 {
        one.inner.compare_iso(&two.inner) as i32
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
    pub fn with_calendar(&self, calendar: &Calendar) -> PlainDateTime {
        PlainDateTime {
            inner: self.inner.with_calendar(calendar.inner.clone()),
        }
    }

    #[napi]
    pub fn to_string(
        &self,
        options: Option<ToStringRoundingOptions>,
        display_calendar: Option<DisplayCalendar>,
    ) -> napi::Result<String> {
        self.inner
            .to_ixdtf_string(
                options.unwrap_or_default().into(),
                display_calendar
                    .unwrap_or(DisplayCalendar::Auto)
                    .into(),
            )
            .map_err(to_napi_error)
    }

    #[napi]
    pub fn to_json(&self) -> napi::Result<String> {
        self.inner
            .to_ixdtf_string(
                temporal_rs::options::ToStringRoundingOptions::default(),
                temporal_rs::options::DisplayCalendar::Auto,
            )
            .map_err(to_napi_error)
    }

    #[napi]
    pub fn value_of(&self) -> napi::Result<()> {
        Err(napi::Error::from_reason(
            "Use compare() or equals() to compare PlainDateTime values",
        ))
    }
}
