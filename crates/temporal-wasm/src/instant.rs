use wasm_bindgen::prelude::*;

use crate::duration::Duration;
use crate::options::*;

#[wasm_bindgen(inspectable)]
pub struct Instant {
    pub(crate) inner: temporal_rs::Instant,
}

#[wasm_bindgen]
impl Instant {
    /// Construct from epoch nanoseconds.
    ///
    /// **Precision note:** wasm-bindgen does not natively support BigInt parameters,
    /// so this constructor accepts f64. Values beyond ±2^53 (~104 days of nanoseconds
    /// from epoch) will lose sub-nanosecond precision. For full precision, construct
    /// via `Instant.from()` with an ISO string instead.
    #[wasm_bindgen(constructor)]
    pub fn new(epoch_nanoseconds: f64) -> Result<Instant, JsValue> {
        let ns = temporal_common::f64_to_i128(epoch_nanoseconds).map_err(|e| JsValue::from_str(&e))?;
        let inner = temporal_rs::Instant::try_new(ns).map_err(to_js_error)?;
        Ok(Self { inner })
    }

    #[wasm_bindgen(js_name = "from")]
    pub fn from(s: &str) -> Result<Instant, JsValue> {
        let inner = temporal_rs::Instant::from_utf8(s.as_bytes()).map_err(to_js_error)?;
        Ok(Self { inner })
    }

    #[wasm_bindgen(js_name = "fromEpochMilliseconds")]
    pub fn from_epoch_milliseconds(ms: f64) -> Result<Instant, JsValue> {
        let ms_i64 = temporal_common::f64_to_i64(ms).map_err(|e| JsValue::from_str(&e))?;
        let inner = temporal_rs::Instant::from_epoch_milliseconds(ms_i64).map_err(to_js_error)?;
        Ok(Self { inner })
    }

    #[wasm_bindgen(getter, js_name = "epochMilliseconds")]
    pub fn epoch_milliseconds(&self) -> f64 {
        self.inner.epoch_milliseconds() as f64
    }

    /// Epoch nanoseconds as f64.
    ///
    /// **Precision note:** Returns f64 due to wasm-bindgen limitations.
    /// Values beyond ±2^53 lose precision. Use `epochMilliseconds` for
    /// a safe numeric value, or `toString()` for full nanosecond fidelity.
    #[wasm_bindgen(getter, js_name = "epochNanoseconds")]
    pub fn epoch_nanoseconds(&self) -> f64 {
        self.inner.as_i128() as f64
    }

    #[wasm_bindgen]
    pub fn add(&self, duration: &Duration) -> Result<Instant, JsValue> {
        let inner = self.inner.add(&duration.inner).map_err(to_js_error)?;
        Ok(Instant { inner })
    }

    #[wasm_bindgen]
    pub fn subtract(&self, duration: &Duration) -> Result<Instant, JsValue> {
        let inner = self
            .inner
            .subtract(&duration.inner)
            .map_err(to_js_error)?;
        Ok(Instant { inner })
    }

    #[wasm_bindgen]
    pub fn until(&self, other: &Instant, settings: JsValue) -> Result<Duration, JsValue> {
        let s = deserialize_difference_settings(settings)?;
        let inner = self
            .inner
            .until(&other.inner, s)
            .map_err(to_js_error)?;
        Ok(Duration { inner })
    }

    #[wasm_bindgen]
    pub fn since(&self, other: &Instant, settings: JsValue) -> Result<Duration, JsValue> {
        let s = deserialize_difference_settings(settings)?;
        let inner = self
            .inner
            .since(&other.inner, s)
            .map_err(to_js_error)?;
        Ok(Duration { inner })
    }

    #[wasm_bindgen]
    pub fn round(&self, options: JsValue) -> Result<Instant, JsValue> {
        let opts = deserialize_rounding_options(options)?;
        let inner = self.inner.round(opts).map_err(to_js_error)?;
        Ok(Instant { inner })
    }

    #[wasm_bindgen]
    pub fn equals(&self, other: &Instant) -> bool {
        self.inner == other.inner
    }

    #[wasm_bindgen]
    pub fn compare(one: &Instant, two: &Instant) -> i32 {
        one.inner.cmp(&two.inner) as i32
    }

    #[wasm_bindgen(js_name = "toString")]
    pub fn to_string(&self, options: JsValue) -> Result<String, JsValue> {
        let p = provider()?;
        let opts = deserialize_to_string_rounding_options(options)?;
        self.inner
            .to_ixdtf_string_with_provider(
                None,
                opts,
                p,
            )
            .map_err(to_js_error)
    }

    #[wasm_bindgen(js_name = "toJSON")]
    pub fn to_json(&self) -> Result<String, JsValue> {
        let p = provider()?;
        self.inner
            .to_ixdtf_string_with_provider(
                None,
                temporal_rs::options::ToStringRoundingOptions::default(),
                p,
            )
            .map_err(to_js_error)
    }

    #[wasm_bindgen(js_name = "valueOf")]
    pub fn value_of(&self) -> Result<(), JsValue> {
        Err(JsValue::from_str(
            "Use compare() or equals() to compare Instant values",
        ))
    }
}
