use napi_derive::napi;

use crate::options::to_napi_error;

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
    pub fn to_string(&self) -> String {
        format!("{}", self.inner)
    }
}
