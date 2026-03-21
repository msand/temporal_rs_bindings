use napi_derive::napi;

use crate::duration::Duration;
use crate::options::*;

#[napi]
pub struct Instant {
    pub(crate) inner: temporal_rs::Instant,
}

#[napi]
impl Instant {
    #[napi(constructor)]
    pub fn new(epoch_nanoseconds: napi::bindgen_prelude::BigInt) -> napi::Result<Self> {
        let (ns, lossless) = epoch_nanoseconds.get_i128();
        if !lossless {
            return Err(napi::Error::from_reason("RangeError: BigInt value out of i128 range"));
        }
        let inner = temporal_rs::Instant::try_new(ns).map_err(to_napi_error)?;
        Ok(Self { inner })
    }

    #[napi(factory)]
    pub fn from(s: String) -> napi::Result<Self> {
        let inner = temporal_rs::Instant::from_utf8(s.as_bytes()).map_err(to_napi_error)?;
        Ok(Self { inner })
    }

    #[napi(factory)]
    pub fn from_epoch_milliseconds(ms: i64) -> napi::Result<Self> {
        let inner = temporal_rs::Instant::from_epoch_milliseconds(ms).map_err(to_napi_error)?;
        Ok(Self { inner })
    }

    #[napi(getter)]
    pub fn epoch_milliseconds(&self) -> i64 {
        self.inner.epoch_milliseconds()
    }

    #[napi(getter)]
    pub fn epoch_nanoseconds(&self) -> i128 {
        self.inner.as_i128()
    }

    #[napi]
    pub fn add(&self, duration: &Duration) -> napi::Result<Instant> {
        let inner = self.inner.add(&duration.inner).map_err(to_napi_error)?;
        Ok(Instant { inner })
    }

    #[napi]
    pub fn subtract(&self, duration: &Duration) -> napi::Result<Instant> {
        let inner = self
            .inner
            .subtract(&duration.inner)
            .map_err(to_napi_error)?;
        Ok(Instant { inner })
    }

    #[napi]
    pub fn until(
        &self,
        other: &Instant,
        settings: Option<DifferenceSettings>,
    ) -> napi::Result<Duration> {
        let s: temporal_rs::options::DifferenceSettings =
            settings.unwrap_or_default().try_into()?;
        let inner = self
            .inner
            .until(&other.inner, s)
            .map_err(to_napi_error)?;
        Ok(Duration { inner })
    }

    #[napi]
    pub fn since(
        &self,
        other: &Instant,
        settings: Option<DifferenceSettings>,
    ) -> napi::Result<Duration> {
        let s: temporal_rs::options::DifferenceSettings =
            settings.unwrap_or_default().try_into()?;
        let inner = self
            .inner
            .since(&other.inner, s)
            .map_err(to_napi_error)?;
        Ok(Duration { inner })
    }

    #[napi]
    pub fn round(&self, options: RoundingOptions) -> napi::Result<Instant> {
        let opts: temporal_rs::options::RoundingOptions = options.try_into()?;
        let inner = self.inner.round(opts).map_err(to_napi_error)?;
        Ok(Instant { inner })
    }

    #[napi]
    pub fn equals(&self, other: &Instant) -> bool {
        self.inner == other.inner
    }

    #[napi]
    pub fn compare(one: &Instant, two: &Instant) -> i32 {
        one.inner.cmp(&two.inner) as i32
    }

    #[napi]
    pub fn to_string(&self) -> napi::Result<String> {
        self.inner
            .to_ixdtf_string_with_provider(
                None,
                temporal_rs::options::ToStringRoundingOptions::default(),
                provider()?,
            )
            .map_err(to_napi_error)
    }

    #[napi]
    pub fn to_json(&self) -> napi::Result<String> {
        self.inner
            .to_ixdtf_string_with_provider(
                None,
                temporal_rs::options::ToStringRoundingOptions::default(),
                provider()?,
            )
            .map_err(to_napi_error)
    }

    #[napi]
    pub fn value_of(&self) -> napi::Result<()> {
        Err(napi::Error::from_reason(
            "Use compare() or equals() to compare Instant values",
        ))
    }
}
