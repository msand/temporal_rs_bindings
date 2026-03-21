use wasm_bindgen::prelude::*;

use crate::duration::Duration;
use crate::options::*;

#[wasm_bindgen]
pub struct PlainTime {
    pub(crate) inner: temporal_rs::PlainTime,
}

#[wasm_bindgen]
impl PlainTime {
    #[wasm_bindgen(constructor)]
    pub fn new(
        hour: u8,
        minute: u8,
        second: u8,
        millisecond: Option<u16>,
        microsecond: Option<u16>,
        nanosecond: Option<u16>,
    ) -> Result<PlainTime, JsValue> {
        let inner = temporal_rs::PlainTime::new(
            hour,
            minute,
            second,
            millisecond.unwrap_or(0),
            microsecond.unwrap_or(0),
            nanosecond.unwrap_or(0),
        )
        .map_err(to_js_error)?;
        Ok(Self { inner })
    }

    #[wasm_bindgen(js_name = "from")]
    pub fn from(s: &str) -> Result<PlainTime, JsValue> {
        let inner = temporal_rs::PlainTime::from_utf8(s.as_bytes()).map_err(to_js_error)?;
        Ok(Self { inner })
    }

    #[wasm_bindgen(getter)]
    pub fn hour(&self) -> u8 {
        self.inner.hour()
    }

    #[wasm_bindgen(getter)]
    pub fn minute(&self) -> u8 {
        self.inner.minute()
    }

    #[wasm_bindgen(getter)]
    pub fn second(&self) -> u8 {
        self.inner.second()
    }

    #[wasm_bindgen(getter)]
    pub fn millisecond(&self) -> u16 {
        self.inner.millisecond()
    }

    #[wasm_bindgen(getter)]
    pub fn microsecond(&self) -> u16 {
        self.inner.microsecond()
    }

    #[wasm_bindgen(getter)]
    pub fn nanosecond(&self) -> u16 {
        self.inner.nanosecond()
    }

    #[wasm_bindgen]
    pub fn add(&self, duration: &Duration) -> Result<PlainTime, JsValue> {
        let inner = self.inner.add(&duration.inner).map_err(to_js_error)?;
        Ok(PlainTime { inner })
    }

    #[wasm_bindgen]
    pub fn subtract(&self, duration: &Duration) -> Result<PlainTime, JsValue> {
        let inner = self
            .inner
            .subtract(&duration.inner)
            .map_err(to_js_error)?;
        Ok(PlainTime { inner })
    }

    #[wasm_bindgen]
    pub fn until(&self, other: &PlainTime, settings: JsValue) -> Result<Duration, JsValue> {
        let s = deserialize_difference_settings(settings)?;
        let inner = self.inner.until(&other.inner, s).map_err(to_js_error)?;
        Ok(Duration { inner })
    }

    #[wasm_bindgen]
    pub fn since(&self, other: &PlainTime, settings: JsValue) -> Result<Duration, JsValue> {
        let s = deserialize_difference_settings(settings)?;
        let inner = self.inner.since(&other.inner, s).map_err(to_js_error)?;
        Ok(Duration { inner })
    }

    #[wasm_bindgen]
    pub fn round(&self, options: JsValue) -> Result<PlainTime, JsValue> {
        let opts = deserialize_rounding_options(options)?;
        let inner = self.inner.round(opts).map_err(to_js_error)?;
        Ok(PlainTime { inner })
    }

    pub fn compare(one: &PlainTime, two: &PlainTime) -> i32 {
        one.inner.cmp(&two.inner) as i32
    }

    #[wasm_bindgen]
    pub fn equals(&self, other: &PlainTime) -> bool {
        self.inner == other.inner
    }

    #[wasm_bindgen(js_name = "toString")]
    pub fn to_string(&self, options: JsValue) -> Result<String, JsValue> {
        let opts = deserialize_to_string_rounding_options(options)?;
        self.inner.to_ixdtf_string(opts).map_err(to_js_error)
    }

    #[wasm_bindgen(js_name = "toJSON")]
    pub fn to_json(&self) -> Result<String, JsValue> {
        self.inner
            .to_ixdtf_string(temporal_rs::options::ToStringRoundingOptions::default())
            .map_err(to_js_error)
    }

    #[wasm_bindgen(js_name = "valueOf")]
    pub fn value_of(&self) -> Result<(), JsValue> {
        Err(JsValue::from_str(
            "Use compare() or equals() to compare PlainTime values",
        ))
    }
}
