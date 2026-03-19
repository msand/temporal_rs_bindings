use wasm_bindgen::prelude::*;

use crate::options::to_js_error;

#[wasm_bindgen]
pub struct Duration {
    pub(crate) inner: temporal_rs::Duration,
}

#[wasm_bindgen]
impl Duration {
    #[wasm_bindgen(constructor)]
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
    ) -> Result<Duration, JsValue> {
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
        .map_err(to_js_error)?;
        Ok(Self { inner })
    }

    #[wasm_bindgen(js_name = "from")]
    pub fn from_str(s: &str) -> Result<Duration, JsValue> {
        let inner = temporal_rs::Duration::from_utf8(s.as_bytes()).map_err(to_js_error)?;
        Ok(Self { inner })
    }

    #[wasm_bindgen(getter)]
    pub fn years(&self) -> i64 {
        self.inner.years()
    }

    #[wasm_bindgen(getter)]
    pub fn months(&self) -> i64 {
        self.inner.months()
    }

    #[wasm_bindgen(getter)]
    pub fn weeks(&self) -> i64 {
        self.inner.weeks()
    }

    #[wasm_bindgen(getter)]
    pub fn days(&self) -> i64 {
        self.inner.days()
    }

    #[wasm_bindgen(getter)]
    pub fn hours(&self) -> i64 {
        self.inner.hours()
    }

    #[wasm_bindgen(getter)]
    pub fn minutes(&self) -> i64 {
        self.inner.minutes()
    }

    #[wasm_bindgen(getter)]
    pub fn seconds(&self) -> i64 {
        self.inner.seconds()
    }

    #[wasm_bindgen(getter)]
    pub fn milliseconds(&self) -> i64 {
        self.inner.milliseconds()
    }

    #[wasm_bindgen(getter)]
    pub fn microseconds(&self) -> i64 {
        self.inner.microseconds() as i64
    }

    #[wasm_bindgen(getter)]
    pub fn nanoseconds(&self) -> i64 {
        self.inner.nanoseconds() as i64
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
    pub fn to_string(&self) -> String {
        format!("{}", self.inner)
    }
}
