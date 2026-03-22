use napi_derive::napi;

use crate::duration::Duration;
use crate::options::*;

#[napi]
pub struct PlainTime {
    pub(crate) inner: temporal_rs::PlainTime,
}

#[napi]
impl PlainTime {
    #[napi(constructor)]
    pub fn new(
        hour: Option<u8>,
        minute: Option<u8>,
        second: Option<u8>,
        millisecond: Option<u16>,
        microsecond: Option<u16>,
        nanosecond: Option<u16>,
    ) -> napi::Result<Self> {
        let inner = temporal_rs::PlainTime::new(
            hour.unwrap_or(0),
            minute.unwrap_or(0),
            second.unwrap_or(0),
            millisecond.unwrap_or(0),
            microsecond.unwrap_or(0),
            nanosecond.unwrap_or(0),
        )
        .map_err(to_napi_error)?;
        Ok(Self { inner })
    }

    #[napi(factory)]
    pub fn from(s: String) -> napi::Result<Self> {
        let inner = temporal_rs::PlainTime::from_utf8(s.as_bytes()).map_err(to_napi_error)?;
        Ok(Self { inner })
    }

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

    #[napi]
    pub fn add(&self, duration: &Duration) -> napi::Result<PlainTime> {
        let inner = self.inner.add(&duration.inner).map_err(to_napi_error)?;
        Ok(PlainTime { inner })
    }

    #[napi]
    pub fn subtract(&self, duration: &Duration) -> napi::Result<PlainTime> {
        let inner = self
            .inner
            .subtract(&duration.inner)
            .map_err(to_napi_error)?;
        Ok(PlainTime { inner })
    }

    #[napi]
    pub fn until(
        &self,
        other: &PlainTime,
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
        other: &PlainTime,
        settings: Option<DifferenceSettings>,
    ) -> napi::Result<Duration> {
        let s: temporal_rs::options::DifferenceSettings =
            settings.unwrap_or_default().try_into()?;
        let inner = self.inner.since(&other.inner, s).map_err(to_napi_error)?;
        Ok(Duration { inner })
    }

    #[napi]
    pub fn round(&self, options: RoundingOptions) -> napi::Result<PlainTime> {
        let inner = self
            .inner
            .round(options.try_into()?)
            .map_err(to_napi_error)?;
        Ok(PlainTime { inner })
    }

    #[napi]
    pub fn compare(one: &PlainTime, two: &PlainTime) -> i32 {
        one.inner.cmp(&two.inner) as i32
    }

    #[napi]
    pub fn equals(&self, other: &PlainTime) -> bool {
        self.inner == other.inner
    }

    #[napi]
    pub fn to_string(&self, options: Option<ToStringRoundingOptions>) -> napi::Result<String> {
        self.inner
            .to_ixdtf_string(options.unwrap_or_default().into())
            .map_err(to_napi_error)
    }

    #[napi]
    pub fn to_json(&self) -> napi::Result<String> {
        self.inner
            .to_ixdtf_string(temporal_rs::options::ToStringRoundingOptions::default())
            .map_err(to_napi_error)
    }

    #[napi]
    pub fn value_of(&self) -> napi::Result<()> {
        Err(napi::Error::from_reason(
            "Use compare() or equals() to compare PlainTime values",
        ))
    }
}
