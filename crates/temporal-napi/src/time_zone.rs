use napi_derive::napi;

use crate::options::to_napi_error;

#[napi]
pub struct TimeZone {
    pub(crate) inner: temporal_rs::TimeZone,
}

#[napi]
impl TimeZone {
    /// Constructor: takes IANA timezone identifier or UTC offset string
    /// (e.g. "America/New_York", "+05:30", "UTC")
    #[napi(constructor)]
    pub fn new(identifier: String) -> napi::Result<Self> {
        let inner =
            temporal_rs::TimeZone::try_from_str(&identifier).map_err(to_napi_error)?;
        Ok(Self { inner })
    }

    /// Factory for UTC
    #[napi(factory)]
    pub fn utc() -> Self {
        Self {
            inner: temporal_rs::TimeZone::utc(),
        }
    }

    /// Get the timezone identifier string
    #[napi(getter)]
    pub fn id(&self) -> napi::Result<String> {
        self.inner.identifier().map_err(to_napi_error)
    }

    #[napi]
    pub fn to_string(&self) -> napi::Result<String> {
        self.inner.identifier().map_err(to_napi_error)
    }
}
