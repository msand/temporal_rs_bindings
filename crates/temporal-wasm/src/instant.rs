use wasm_bindgen::prelude::*;
use timezone_provider::zoneinfo64::ZoneInfo64TzdbProvider;

use crate::duration::Duration;
use crate::options::*;

fn provider() -> Result<ZoneInfo64TzdbProvider<'static>, JsValue> {
    ZoneInfo64TzdbProvider::zoneinfo64_provider_for_testing()
        .ok_or_else(|| JsValue::from_str("Failed to initialize timezone provider"))
}

#[wasm_bindgen]
pub struct Instant {
    pub(crate) inner: temporal_rs::Instant,
}

#[wasm_bindgen]
impl Instant {
    #[wasm_bindgen(constructor)]
    pub fn new(epoch_nanoseconds: i64) -> Result<Instant, JsValue> {
        let inner =
            temporal_rs::Instant::try_new(epoch_nanoseconds as i128).map_err(to_js_error)?;
        Ok(Self { inner })
    }

    #[wasm_bindgen(js_name = "from")]
    pub fn from(s: &str) -> Result<Instant, JsValue> {
        let inner = temporal_rs::Instant::from_utf8(s.as_bytes()).map_err(to_js_error)?;
        Ok(Self { inner })
    }

    #[wasm_bindgen(js_name = "fromEpochMilliseconds")]
    pub fn from_epoch_milliseconds(ms: i64) -> Result<Instant, JsValue> {
        let inner = temporal_rs::Instant::from_epoch_milliseconds(ms).map_err(to_js_error)?;
        Ok(Self { inner })
    }

    #[wasm_bindgen(getter, js_name = "epochMilliseconds")]
    pub fn epoch_milliseconds(&self) -> i64 {
        self.inner.epoch_milliseconds()
    }

    #[wasm_bindgen(getter, js_name = "epochNanoseconds")]
    pub fn epoch_nanoseconds(&self) -> i64 {
        self.inner.as_i128() as i64
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
    pub fn to_string(&self) -> Result<String, JsValue> {
        let p = provider()?;
        self.inner
            .to_ixdtf_string_with_provider(
                None,
                temporal_rs::options::ToStringRoundingOptions::default(),
                &p,
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
                &p,
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
