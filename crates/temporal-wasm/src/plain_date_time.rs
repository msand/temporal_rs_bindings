use wasm_bindgen::prelude::*;

use crate::calendar::Calendar;
use crate::duration::Duration;
use crate::options::*;
use crate::plain_date::PlainDate;
use crate::plain_time::PlainTime;

#[wasm_bindgen(inspectable)]
pub struct PlainDateTime {
    pub(crate) inner: temporal_rs::PlainDateTime,
}

#[wasm_bindgen]
impl PlainDateTime {
    #[wasm_bindgen(constructor)]
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        year: i32,
        month: u8,
        day: u8,
        hour: Option<u8>,
        minute: Option<u8>,
        second: Option<u8>,
        millisecond: Option<u16>,
        microsecond: Option<u16>,
        nanosecond: Option<u16>,
        calendar: Option<Calendar>,
    ) -> Result<PlainDateTime, JsValue> {
        let cal = calendar
            .map(|c| c.inner)
            .unwrap_or_default();
        let inner = temporal_rs::PlainDateTime::new(
            year,
            month,
            day,
            hour.unwrap_or(0),
            minute.unwrap_or(0),
            second.unwrap_or(0),
            millisecond.unwrap_or(0),
            microsecond.unwrap_or(0),
            nanosecond.unwrap_or(0),
            cal,
        )
        .map_err(to_js_error)?;
        Ok(Self { inner })
    }

    #[wasm_bindgen(js_name = "from")]
    pub fn from(s: &str) -> Result<PlainDateTime, JsValue> {
        let inner =
            temporal_rs::PlainDateTime::from_utf8(s.as_bytes()).map_err(to_js_error)?;
        Ok(Self { inner })
    }

    // ==== Date Getters ====

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

    // ==== Time Getters ====

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

    // ==== Arithmetic ====

    #[wasm_bindgen]
    pub fn add(
        &self,
        duration: &Duration,
        overflow: Option<Overflow>,
    ) -> Result<PlainDateTime, JsValue> {
        let inner = self
            .inner
            .add(&duration.inner, overflow.map(Into::into))
            .map_err(to_js_error)?;
        Ok(PlainDateTime { inner })
    }

    #[wasm_bindgen]
    pub fn subtract(
        &self,
        duration: &Duration,
        overflow: Option<Overflow>,
    ) -> Result<PlainDateTime, JsValue> {
        let inner = self
            .inner
            .subtract(&duration.inner, overflow.map(Into::into))
            .map_err(to_js_error)?;
        Ok(PlainDateTime { inner })
    }

    #[wasm_bindgen]
    pub fn until(&self, other: &PlainDateTime, settings: JsValue) -> Result<Duration, JsValue> {
        let s = deserialize_difference_settings(settings)?;
        let inner = self.inner.until(&other.inner, s).map_err(to_js_error)?;
        Ok(Duration { inner })
    }

    #[wasm_bindgen]
    pub fn since(&self, other: &PlainDateTime, settings: JsValue) -> Result<Duration, JsValue> {
        let s = deserialize_difference_settings(settings)?;
        let inner = self.inner.since(&other.inner, s).map_err(to_js_error)?;
        Ok(Duration { inner })
    }

    // ==== Other ====

    #[wasm_bindgen]
    pub fn round(&self, options: JsValue) -> Result<PlainDateTime, JsValue> {
        let opts = deserialize_rounding_options(options)?;
        let inner = self.inner.round(opts).map_err(to_js_error)?;
        Ok(PlainDateTime { inner })
    }

    #[wasm_bindgen]
    pub fn equals(&self, other: &PlainDateTime) -> bool {
        self.inner == other.inner
    }

    #[wasm_bindgen]
    pub fn compare(one: &PlainDateTime, two: &PlainDateTime) -> i32 {
        one.inner.compare_iso(&two.inner) as i32
    }

    #[wasm_bindgen(js_name = "toPlainDate")]
    pub fn to_plain_date(&self) -> PlainDate {
        PlainDate {
            inner: self.inner.to_plain_date(),
        }
    }

    #[wasm_bindgen(js_name = "toPlainTime")]
    pub fn to_plain_time(&self) -> PlainTime {
        PlainTime {
            inner: self.inner.to_plain_time(),
        }
    }

    #[wasm_bindgen(js_name = "withCalendar")]
    pub fn with_calendar(&self, calendar: &Calendar) -> PlainDateTime {
        PlainDateTime {
            inner: self.inner.with_calendar(calendar.inner.clone()),
        }
    }

    #[wasm_bindgen(js_name = "toString")]
    pub fn to_string(
        &self,
        options: JsValue,
        display_calendar: Option<DisplayCalendar>,
    ) -> Result<String, JsValue> {
        let opts = deserialize_to_string_rounding_options(options)?;
        self.inner
            .to_ixdtf_string(
                opts,
                display_calendar
                    .unwrap_or(DisplayCalendar::Auto)
                    .into(),
            )
            .map_err(to_js_error)
    }

    #[wasm_bindgen(js_name = "toJSON")]
    pub fn to_json(&self) -> Result<String, JsValue> {
        self.inner
            .to_ixdtf_string(
                temporal_rs::options::ToStringRoundingOptions::default(),
                temporal_rs::options::DisplayCalendar::Auto,
            )
            .map_err(to_js_error)
    }

    #[wasm_bindgen(js_name = "valueOf")]
    pub fn value_of(&self) -> Result<(), JsValue> {
        Err(js_sys::Error::new("Use compare() or equals() to compare PlainDateTime values").into())
    }
}
