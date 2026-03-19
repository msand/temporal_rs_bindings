use wasm_bindgen::prelude::*;

use crate::options::to_js_error;

#[wasm_bindgen]
pub struct TimeZone {
    pub(crate) inner: temporal_rs::TimeZone,
}

#[wasm_bindgen]
impl TimeZone {
    /// Constructor: takes IANA timezone identifier or UTC offset string
    /// (e.g. "America/New_York", "+05:30", "UTC")
    #[wasm_bindgen(constructor)]
    pub fn new(identifier: &str) -> Result<TimeZone, JsValue> {
        let inner = temporal_rs::TimeZone::try_from_str(identifier).map_err(to_js_error)?;
        Ok(Self { inner })
    }

    /// Factory for UTC
    #[wasm_bindgen(js_name = "utc")]
    pub fn utc() -> TimeZone {
        Self {
            inner: temporal_rs::TimeZone::utc(),
        }
    }

    /// Get the timezone identifier string
    #[wasm_bindgen(getter)]
    pub fn id(&self) -> Result<String, JsValue> {
        self.inner.identifier().map_err(to_js_error)
    }

    #[wasm_bindgen(js_name = "toString")]
    pub fn to_string(&self) -> Result<String, JsValue> {
        self.inner.identifier().map_err(to_js_error)
    }
}
