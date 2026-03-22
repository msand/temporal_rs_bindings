use wasm_bindgen::prelude::*;

use crate::calendar::Calendar;
use crate::duration::Duration;
use crate::options::*;

#[wasm_bindgen(inspectable)]
pub struct PlainYearMonth {
    pub(crate) inner: temporal_rs::PlainYearMonth,
}

#[wasm_bindgen]
impl PlainYearMonth {
    #[wasm_bindgen(constructor)]
    pub fn new(
        year: i32,
        month: u8,
        calendar: Option<Calendar>,
        reference_day: Option<u8>,
    ) -> Result<PlainYearMonth, JsValue> {
        let cal = calendar.map(|c| c.inner).unwrap_or_default();
        let inner =
            temporal_rs::PlainYearMonth::new(year, month, reference_day, cal)
                .map_err(to_js_error)?;
        Ok(Self { inner })
    }

    #[wasm_bindgen(js_name = "from")]
    pub fn from(s: &str) -> Result<PlainYearMonth, JsValue> {
        let inner =
            temporal_rs::PlainYearMonth::from_utf8(s.as_bytes()).map_err(to_js_error)?;
        Ok(Self { inner })
    }

    #[wasm_bindgen(getter)]
    pub fn year(&self) -> i32 {
        self.inner.year()
    }

    #[wasm_bindgen(getter)]
    pub fn month(&self) -> u8 {
        self.inner.month()
    }

    #[wasm_bindgen(getter, js_name = "monthCode")]
    pub fn month_code(&self) -> String {
        self.inner.month_code().as_str().to_string()
    }

    #[wasm_bindgen(getter)]
    pub fn era(&self) -> Option<String> {
        self.inner.era().map(|e| e.to_string())
    }

    #[wasm_bindgen(getter, js_name = "eraYear")]
    pub fn era_year(&self) -> Option<i32> {
        self.inner.era_year()
    }

    #[wasm_bindgen(getter, js_name = "daysInYear")]
    pub fn days_in_year(&self) -> u16 {
        self.inner.days_in_year()
    }

    #[wasm_bindgen(getter, js_name = "daysInMonth")]
    pub fn days_in_month(&self) -> u16 {
        self.inner.days_in_month()
    }

    #[wasm_bindgen(getter, js_name = "monthsInYear")]
    pub fn months_in_year(&self) -> u16 {
        self.inner.months_in_year()
    }

    #[wasm_bindgen(getter, js_name = "inLeapYear")]
    pub fn in_leap_year(&self) -> bool {
        self.inner.in_leap_year()
    }

    #[wasm_bindgen(getter)]
    pub fn calendar(&self) -> Calendar {
        Calendar {
            inner: self.inner.calendar().clone(),
        }
    }

    #[wasm_bindgen]
    pub fn add(
        &self,
        duration: &Duration,
        overflow: Option<Overflow>,
    ) -> Result<PlainYearMonth, JsValue> {
        let ov = overflow.map(Into::into).unwrap_or(temporal_rs::options::Overflow::Constrain);
        let inner = self
            .inner
            .add(&duration.inner, ov)
            .map_err(to_js_error)?;
        Ok(PlainYearMonth { inner })
    }

    #[wasm_bindgen]
    pub fn subtract(
        &self,
        duration: &Duration,
        overflow: Option<Overflow>,
    ) -> Result<PlainYearMonth, JsValue> {
        let ov = overflow.map(Into::into).unwrap_or(temporal_rs::options::Overflow::Constrain);
        let inner = self
            .inner
            .subtract(&duration.inner, ov)
            .map_err(to_js_error)?;
        Ok(PlainYearMonth { inner })
    }

    #[wasm_bindgen]
    pub fn until(
        &self,
        other: &PlainYearMonth,
        settings: JsValue,
    ) -> Result<Duration, JsValue> {
        let s = deserialize_difference_settings(settings)?;
        let inner = self.inner.until(&other.inner, s).map_err(to_js_error)?;
        Ok(Duration { inner })
    }

    #[wasm_bindgen]
    pub fn since(
        &self,
        other: &PlainYearMonth,
        settings: JsValue,
    ) -> Result<Duration, JsValue> {
        let s = deserialize_difference_settings(settings)?;
        let inner = self.inner.since(&other.inner, s).map_err(to_js_error)?;
        Ok(Duration { inner })
    }

    #[wasm_bindgen]
    pub fn equals(&self, other: &PlainYearMonth) -> bool {
        self.inner == other.inner
    }

    #[wasm_bindgen]
    pub fn compare(one: &PlainYearMonth, two: &PlainYearMonth) -> i32 {
        one.inner.compare_iso(&two.inner) as i32
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
        Err(js_sys::Error::new("Use compare() or equals() to compare PlainYearMonth values").into())
    }
}
