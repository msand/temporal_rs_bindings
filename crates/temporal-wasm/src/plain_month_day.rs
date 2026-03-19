use wasm_bindgen::prelude::*;

use crate::calendar::Calendar;
use crate::options::*;

#[wasm_bindgen]
pub struct PlainMonthDay {
    pub(crate) inner: temporal_rs::PlainMonthDay,
}

#[wasm_bindgen]
impl PlainMonthDay {
    #[wasm_bindgen(constructor)]
    pub fn new(
        month: u8,
        day: u8,
        calendar: Option<Calendar>,
        reference_year: Option<i32>,
    ) -> Result<PlainMonthDay, JsValue> {
        let cal = calendar.map(|c| c.inner.clone()).unwrap_or_default();
        let inner = temporal_rs::PlainMonthDay::new_with_overflow(
            month,
            day,
            cal,
            temporal_rs::options::Overflow::Constrain,
            reference_year,
        )
        .map_err(to_js_error)?;
        Ok(Self { inner })
    }

    #[wasm_bindgen(js_name = "from")]
    pub fn from(s: &str) -> Result<PlainMonthDay, JsValue> {
        let inner =
            temporal_rs::PlainMonthDay::from_utf8(s.as_bytes()).map_err(to_js_error)?;
        Ok(Self { inner })
    }

    #[wasm_bindgen(getter, js_name = "monthCode")]
    pub fn month_code(&self) -> String {
        self.inner.month_code().as_str().to_string()
    }

    #[wasm_bindgen(getter)]
    pub fn day(&self) -> u8 {
        self.inner.day()
    }

    #[wasm_bindgen(getter)]
    pub fn calendar(&self) -> Calendar {
        Calendar {
            inner: self.inner.calendar().clone(),
        }
    }

    #[wasm_bindgen]
    pub fn equals(&self, other: &PlainMonthDay) -> bool {
        self.inner == other.inner
    }

    #[wasm_bindgen(js_name = "toString")]
    pub fn to_string(&self, display_calendar: Option<DisplayCalendar>) -> String {
        self.inner.to_ixdtf_string(
            display_calendar
                .unwrap_or(DisplayCalendar::Auto)
                .into(),
        )
    }

    #[wasm_bindgen(js_name = "toJSON")]
    pub fn to_json(&self) -> String {
        self.inner
            .to_ixdtf_string(temporal_rs::options::DisplayCalendar::Auto)
    }

    #[wasm_bindgen(js_name = "valueOf")]
    pub fn value_of(&self) -> Result<(), JsValue> {
        Err(JsValue::from_str(
            "Use equals() to compare PlainMonthDay values",
        ))
    }
}
