use napi_derive::napi;

use crate::calendar::Calendar;
use crate::duration::Duration;
use crate::options::*;

#[napi]
pub struct PlainDate {
    pub(crate) inner: temporal_rs::PlainDate,
}

#[napi]
impl PlainDate {
    /// Construct from ISO year, month, day, and optional calendar.
    #[napi(constructor)]
    pub fn new(year: i32, month: u8, day: u8, calendar: Option<&Calendar>) -> napi::Result<Self> {
        let cal = calendar
            .map(|c| c.inner.clone())
            .unwrap_or_default();
        let inner = temporal_rs::PlainDate::new(year, month, day, cal).map_err(to_napi_error)?;
        Ok(Self { inner })
    }

    #[napi(factory)]
    pub fn from(s: String) -> napi::Result<Self> {
        let inner = temporal_rs::PlainDate::from_utf8(s.as_bytes()).map_err(to_napi_error)?;
        Ok(Self { inner })
    }

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

    #[napi]
    pub fn add(&self, duration: &Duration, overflow: Option<Overflow>) -> napi::Result<PlainDate> {
        let ov = overflow.map(Into::into);
        let inner = self
            .inner
            .add(&duration.inner, ov)
            .map_err(to_napi_error)?;
        Ok(PlainDate { inner })
    }

    #[napi]
    pub fn subtract(
        &self,
        duration: &Duration,
        overflow: Option<Overflow>,
    ) -> napi::Result<PlainDate> {
        let ov = overflow.map(Into::into);
        let inner = self
            .inner
            .subtract(&duration.inner, ov)
            .map_err(to_napi_error)?;
        Ok(PlainDate { inner })
    }

    #[napi]
    pub fn until(
        &self,
        other: &PlainDate,
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
        other: &PlainDate,
        settings: Option<DifferenceSettings>,
    ) -> napi::Result<Duration> {
        let s: temporal_rs::options::DifferenceSettings =
            settings.unwrap_or_default().try_into()?;
        let inner = self.inner.since(&other.inner, s).map_err(to_napi_error)?;
        Ok(Duration { inner })
    }

    #[napi]
    pub fn equals(&self, other: &PlainDate) -> bool {
        self.inner == other.inner
    }

    #[napi]
    pub fn compare(one: &PlainDate, two: &PlainDate) -> i32 {
        one.inner.compare_iso(&two.inner) as i32
    }

    #[napi]
    pub fn to_string(&self, display_calendar: Option<DisplayCalendar>) -> String {
        self.inner.to_ixdtf_string(
            display_calendar
                .unwrap_or(DisplayCalendar::Auto)
                .into(),
        )
    }

    #[napi]
    pub fn with_calendar(&self, calendar: &Calendar) -> PlainDate {
        PlainDate {
            inner: self.inner.with_calendar(calendar.inner.clone()),
        }
    }

    #[napi]
    pub fn to_json(&self) -> String {
        self.inner
            .to_ixdtf_string(temporal_rs::options::DisplayCalendar::Auto)
    }

    #[napi]
    pub fn value_of(&self) -> napi::Result<()> {
        Err(napi::Error::from_reason(
            "Use compare() or equals() to compare PlainDate values",
        ))
    }
}
