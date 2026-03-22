use wasm_bindgen::prelude::*;

use crate::calendar::Calendar;
use crate::duration::Duration;
use crate::options::*;

#[wasm_bindgen(inspectable)]
pub struct PlainDate {
    pub(crate) inner: temporal_rs::PlainDate,
}

#[wasm_bindgen]
impl PlainDate {
    #[wasm_bindgen(constructor)]
    pub fn new(year: i32, month: u8, day: u8, calendar: Option<Calendar>) -> Result<PlainDate, JsValue> {
        let cal = calendar
            .map(|c| c.inner)
            .unwrap_or_default();
        let inner = temporal_rs::PlainDate::new(year, month, day, cal).map_err(to_js_error)?;
        Ok(Self { inner })
    }

    #[wasm_bindgen(js_name = "from")]
    pub fn from(s: &str) -> Result<PlainDate, JsValue> {
        let inner = temporal_rs::PlainDate::from_utf8(s.as_bytes()).map_err(to_js_error)?;
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
    pub fn day(&self) -> u8 {
        self.inner.day()
    }

    #[wasm_bindgen(getter, js_name = "dayOfWeek")]
    pub fn day_of_week(&self) -> u16 {
        self.inner.day_of_week()
    }

    #[wasm_bindgen(getter, js_name = "dayOfYear")]
    pub fn day_of_year(&self) -> u16 {
        self.inner.day_of_year()
    }

    #[wasm_bindgen(getter, js_name = "weekOfYear")]
    pub fn week_of_year(&self) -> Option<u8> {
        self.inner.week_of_year()
    }

    #[wasm_bindgen(getter, js_name = "yearOfWeek")]
    pub fn year_of_week(&self) -> Option<i32> {
        self.inner.year_of_week()
    }

    #[wasm_bindgen(getter, js_name = "daysInWeek")]
    pub fn days_in_week(&self) -> u16 {
        self.inner.days_in_week()
    }

    #[wasm_bindgen(getter, js_name = "daysInMonth")]
    pub fn days_in_month(&self) -> u16 {
        self.inner.days_in_month()
    }

    #[wasm_bindgen(getter, js_name = "daysInYear")]
    pub fn days_in_year(&self) -> u16 {
        self.inner.days_in_year()
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
    pub fn era(&self) -> Option<String> {
        self.inner.era().map(|e| e.to_string())
    }

    #[wasm_bindgen(getter, js_name = "eraYear")]
    pub fn era_year(&self) -> Option<i32> {
        self.inner.era_year()
    }

    #[wasm_bindgen(getter)]
    pub fn calendar(&self) -> Calendar {
        Calendar {
            inner: self.inner.calendar().clone(),
        }
    }

    #[wasm_bindgen]
    pub fn add(&self, duration: &Duration, overflow: Option<Overflow>) -> Result<PlainDate, JsValue> {
        let ov = Some(overflow.map(Into::into).unwrap_or(temporal_rs::options::Overflow::Constrain));
        let inner = self
            .inner
            .add(&duration.inner, ov)
            .map_err(to_js_error)?;
        Ok(PlainDate { inner })
    }

    #[wasm_bindgen]
    pub fn subtract(&self, duration: &Duration, overflow: Option<Overflow>) -> Result<PlainDate, JsValue> {
        let ov = Some(overflow.map(Into::into).unwrap_or(temporal_rs::options::Overflow::Constrain));
        let inner = self
            .inner
            .subtract(&duration.inner, ov)
            .map_err(to_js_error)?;
        Ok(PlainDate { inner })
    }

    #[wasm_bindgen]
    pub fn until(&self, other: &PlainDate, settings: JsValue) -> Result<Duration, JsValue> {
        let s = deserialize_difference_settings(settings)?;
        let inner = self.inner.until(&other.inner, s).map_err(to_js_error)?;
        Ok(Duration { inner })
    }

    #[wasm_bindgen]
    pub fn since(&self, other: &PlainDate, settings: JsValue) -> Result<Duration, JsValue> {
        let s = deserialize_difference_settings(settings)?;
        let inner = self.inner.since(&other.inner, s).map_err(to_js_error)?;
        Ok(Duration { inner })
    }

    #[wasm_bindgen]
    pub fn equals(&self, other: &PlainDate) -> bool {
        self.inner == other.inner
    }

    #[wasm_bindgen]
    pub fn compare(one: &PlainDate, two: &PlainDate) -> i32 {
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

    #[wasm_bindgen(js_name = "withCalendar")]
    pub fn with_calendar(&self, calendar: &Calendar) -> PlainDate {
        PlainDate {
            inner: self.inner.with_calendar(calendar.inner.clone()),
        }
    }

    #[wasm_bindgen(js_name = "toJSON")]
    pub fn to_json(&self) -> String {
        self.inner
            .to_ixdtf_string(temporal_rs::options::DisplayCalendar::Auto)
    }

    #[wasm_bindgen(js_name = "valueOf")]
    pub fn value_of(&self) -> Result<(), JsValue> {
        Err(JsValue::from_str(
            "Use compare() or equals() to compare PlainDate values",
        ))
    }
}
