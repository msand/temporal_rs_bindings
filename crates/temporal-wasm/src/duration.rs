use wasm_bindgen::prelude::*;

use crate::options::{provider, to_js_error, deserialize_rounding_options, Unit};
use crate::plain_date::PlainDate;
use crate::zoned_date_time::ZonedDateTime;

fn make_relative_to(
    relative_to_date: &Option<PlainDate>,
    relative_to_zdt: &Option<ZonedDateTime>,
) -> Option<temporal_rs::options::RelativeTo> {
    temporal_common::make_relative_to(
        relative_to_date.as_ref().map(|d| &d.inner),
        relative_to_zdt.as_ref().map(|z| &z.inner),
    )
}

fn f64_to_i64(v: f64) -> Result<i64, JsValue> {
    temporal_common::f64_to_i64(v).map_err(|e| JsValue::from_str(&e))
}

fn f64_to_i128(v: f64) -> Result<i128, JsValue> {
    temporal_common::f64_to_i128(v).map_err(|e| JsValue::from_str(&e))
}

#[wasm_bindgen(inspectable)]
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

    /// Microseconds component as f64.
    ///
    /// **Precision note:** The inner value is i128. Values beyond ±2^53 will
    /// lose precision when returned as f64. For full precision, use `toString()`
    /// or construct via an ISO 8601 duration string.
    #[wasm_bindgen(getter)]
    pub fn microseconds(&self) -> f64 {
        self.inner.microseconds() as f64
    }

    /// Nanoseconds component as f64.
    ///
    /// **Precision note:** The inner value is i128. Values beyond ±2^53 will
    /// lose precision when returned as f64. For full precision, use `toString()`
    /// or construct via an ISO 8601 duration string.
    #[wasm_bindgen(getter)]
    pub fn nanoseconds(&self) -> f64 {
        self.inner.nanoseconds() as f64
    }

    #[wasm_bindgen(getter)]
    pub fn sign(&self) -> i32 {
        self.inner.sign() as i32
    }

    #[wasm_bindgen(getter, js_name = "isZero")]
    pub fn is_zero(&self) -> bool {
        self.inner.is_zero()
    }

    #[wasm_bindgen]
    pub fn negated(&self) -> Duration {
        Duration {
            inner: self.inner.negated(),
        }
    }

    #[wasm_bindgen]
    pub fn abs(&self) -> Duration {
        Duration {
            inner: self.inner.abs(),
        }
    }

    #[wasm_bindgen]
    pub fn add(&self, other: &Duration) -> Result<Duration, JsValue> {
        let inner = self.inner.add(&other.inner).map_err(to_js_error)?;
        Ok(Duration { inner })
    }

    #[wasm_bindgen]
    pub fn subtract(&self, other: &Duration) -> Result<Duration, JsValue> {
        let inner = self.inner.subtract(&other.inner).map_err(to_js_error)?;
        Ok(Duration { inner })
    }

    /// The `relative_to_date` and `relative_to_zdt` parameters, if provided,
    /// are consumed (moved) due to wasm-bindgen limitations on passing
    /// borrowed references.
    #[wasm_bindgen]
    pub fn round(
        &self,
        options: JsValue,
        relative_to_date: Option<PlainDate>,
        relative_to_zdt: Option<ZonedDateTime>,
    ) -> Result<Duration, JsValue> {
        let provider = provider()?;

        let relative_to = make_relative_to(&relative_to_date, &relative_to_zdt);

        let opts = deserialize_rounding_options(options)?;
        let inner = self
            .inner
            .round_with_provider(opts, relative_to, &provider)
            .map_err(to_js_error)?;
        Ok(Duration { inner })
    }

    /// The `relative_to_date` and `relative_to_zdt` parameters, if provided,
    /// are consumed (moved) due to wasm-bindgen limitations on passing
    /// borrowed references.
    #[wasm_bindgen]
    pub fn total(
        &self,
        unit: Unit,
        relative_to_date: Option<PlainDate>,
        relative_to_zdt: Option<ZonedDateTime>,
    ) -> Result<f64, JsValue> {
        let provider = provider()?;

        let relative_to = make_relative_to(&relative_to_date, &relative_to_zdt);

        let unit: temporal_rs::options::Unit = unit.into();
        let result = self
            .inner
            .total_with_provider(unit, relative_to, &provider)
            .map_err(to_js_error)?;
        Ok(result.as_inner())
    }

    /// The `relative_to_date` and `relative_to_zdt` parameters, if provided,
    /// are consumed (moved) due to wasm-bindgen limitations on passing
    /// borrowed references.
    #[wasm_bindgen]
    pub fn compare(
        one: &Duration,
        two: &Duration,
        relative_to_date: Option<PlainDate>,
        relative_to_zdt: Option<ZonedDateTime>,
    ) -> Result<i32, JsValue> {
        let provider = provider()?;

        let relative_to = make_relative_to(&relative_to_date, &relative_to_zdt);

        let result = one
            .inner
            .compare_with_provider(&two.inner, relative_to, &provider)
            .map_err(to_js_error)?;
        Ok(result as i32)
    }

    #[wasm_bindgen(js_name = "toString")]
    #[allow(clippy::inherent_to_string)]
    pub fn to_string(&self) -> String {
        format!("{}", self.inner)
    }

    #[wasm_bindgen(js_name = "toJSON")]
    pub fn to_json(&self) -> String {
        format!("{}", self.inner)
    }

    #[wasm_bindgen(js_name = "valueOf")]
    pub fn value_of(&self) -> Result<(), JsValue> {
        Err(js_sys::Error::new("Use compare() to compare Duration values").into())
    }
}
