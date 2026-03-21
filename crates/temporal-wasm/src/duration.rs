use wasm_bindgen::prelude::*;

use crate::options::to_js_error;

/// Convert an f64 (JS Number) to i64 for duration fields.
fn f64_to_i64(v: f64) -> Result<i64, JsValue> {
    if v.is_nan() || v.is_infinite() {
        return Err(JsValue::from_str("RangeError: Duration field must be finite"));
    }
    if v.fract() != 0.0 {
        return Err(JsValue::from_str(
            "RangeError: Duration field must be an integer",
        ));
    }
    Ok(v as i64)
}

/// Convert an f64 (JS Number) to i128 for microseconds/nanoseconds.
fn f64_to_i128(v: f64) -> Result<i128, JsValue> {
    if v.is_nan() || v.is_infinite() {
        return Err(JsValue::from_str("RangeError: Duration field must be finite"));
    }
    if v.fract() != 0.0 {
        return Err(JsValue::from_str(
            "RangeError: Duration field must be an integer",
        ));
    }
    Ok(v as i128)
}

#[wasm_bindgen]
pub struct Duration {
    pub(crate) inner: temporal_rs::Duration,
}

#[wasm_bindgen]
impl Duration {
    #[wasm_bindgen(constructor)]
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        years: Option<f64>,
        months: Option<f64>,
        weeks: Option<f64>,
        days: Option<f64>,
        hours: Option<f64>,
        minutes: Option<f64>,
        seconds: Option<f64>,
        milliseconds: Option<f64>,
        microseconds: Option<f64>,
        nanoseconds: Option<f64>,
    ) -> Result<Duration, JsValue> {
        let inner = temporal_rs::Duration::new(
            f64_to_i64(years.unwrap_or(0.0))?,
            f64_to_i64(months.unwrap_or(0.0))?,
            f64_to_i64(weeks.unwrap_or(0.0))?,
            f64_to_i64(days.unwrap_or(0.0))?,
            f64_to_i64(hours.unwrap_or(0.0))?,
            f64_to_i64(minutes.unwrap_or(0.0))?,
            f64_to_i64(seconds.unwrap_or(0.0))?,
            f64_to_i64(milliseconds.unwrap_or(0.0))?,
            f64_to_i128(microseconds.unwrap_or(0.0))?,
            f64_to_i128(nanoseconds.unwrap_or(0.0))?,
        )
        .map_err(to_js_error)?;
        Ok(Self { inner })
    }

    #[wasm_bindgen(js_name = "from")]
    pub fn from_str(s: &str) -> Result<Duration, JsValue> {
        let inner = temporal_rs::Duration::from_utf8(s.as_bytes()).map_err(to_js_error)?;
        Ok(Self { inner })
    }

    #[wasm_bindgen(getter)]
    pub fn years(&self) -> f64 {
        self.inner.years() as f64
    }

    #[wasm_bindgen(getter)]
    pub fn months(&self) -> f64 {
        self.inner.months() as f64
    }

    #[wasm_bindgen(getter)]
    pub fn weeks(&self) -> f64 {
        self.inner.weeks() as f64
    }

    #[wasm_bindgen(getter)]
    pub fn days(&self) -> f64 {
        self.inner.days() as f64
    }

    #[wasm_bindgen(getter)]
    pub fn hours(&self) -> f64 {
        self.inner.hours() as f64
    }

    #[wasm_bindgen(getter)]
    pub fn minutes(&self) -> f64 {
        self.inner.minutes() as f64
    }

    #[wasm_bindgen(getter)]
    pub fn seconds(&self) -> f64 {
        self.inner.seconds() as f64
    }

    #[wasm_bindgen(getter)]
    pub fn milliseconds(&self) -> f64 {
        self.inner.milliseconds() as f64
    }

    #[wasm_bindgen(getter)]
    pub fn microseconds(&self) -> f64 {
        self.inner.microseconds() as f64
    }

    #[wasm_bindgen(getter)]
    pub fn nanoseconds(&self) -> f64 {
        self.inner.nanoseconds() as f64
    }

    #[wasm_bindgen(getter)]
    pub fn sign(&self) -> i8 {
        self.inner.sign() as i8
    }

    #[wasm_bindgen(getter, js_name = "isZero")]
    pub fn is_zero(&self) -> bool {
        self.inner.is_zero()
    }

    pub fn negated(&self) -> Duration {
        Duration {
            inner: self.inner.negated(),
        }
    }

    pub fn abs(&self) -> Duration {
        Duration {
            inner: self.inner.abs(),
        }
    }

    pub fn add(&self, other: &Duration) -> Result<Duration, JsValue> {
        let inner = self.inner.add(&other.inner).map_err(to_js_error)?;
        Ok(Duration { inner })
    }

    pub fn subtract(&self, other: &Duration) -> Result<Duration, JsValue> {
        let inner = self.inner.subtract(&other.inner).map_err(to_js_error)?;
        Ok(Duration { inner })
    }

    #[wasm_bindgen(js_name = "toString")]
    #[allow(clippy::inherent_to_string)]
    pub fn to_string(&self) -> String {
        format!("{}", self.inner)
    }
}
