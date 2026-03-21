use wasm_bindgen::prelude::*;

use crate::calendar::Calendar;
use crate::duration::Duration;
use crate::instant::Instant;
use crate::options::*;
use crate::plain_date::PlainDate;
use crate::plain_date_time::PlainDateTime;
use crate::plain_time::PlainTime;
use crate::time_zone::TimeZone;

fn provider() -> Result<timezone_provider::zoneinfo64::ZoneInfo64TzdbProvider<'static>, JsValue> {
    temporal_common::create_provider()
        .ok_or_else(|| JsValue::from_str("Failed to initialize timezone provider"))
}

#[wasm_bindgen]
pub struct ZonedDateTime {
    pub(crate) inner: temporal_rs::ZonedDateTime,
}

#[wasm_bindgen]
impl ZonedDateTime {
    #[wasm_bindgen(constructor)]
    pub fn new(
        epoch_nanoseconds: f64,
        timezone: &TimeZone,
        calendar: Option<Calendar>,
    ) -> Result<ZonedDateTime, JsValue> {
        let cal = calendar.map(|c| c.inner.clone()).unwrap_or_default();
        let inner = temporal_rs::ZonedDateTime::try_new_with_provider(
            epoch_nanoseconds as i128,
            timezone.inner,
            cal,
            &provider()?,
        )
        .map_err(to_js_error)?;
        Ok(Self { inner })
    }

    #[wasm_bindgen(js_name = "from")]
    pub fn from(s: &str) -> Result<ZonedDateTime, JsValue> {
        let inner = temporal_rs::ZonedDateTime::from_utf8_with_provider(
            s.as_bytes(),
            temporal_rs::options::Disambiguation::Compatible,
            temporal_rs::options::OffsetDisambiguation::Reject,
            &provider()?,
        )
        .map_err(to_js_error)?;
        Ok(Self { inner })
    }

    #[wasm_bindgen(js_name = "fromEpochMilliseconds")]
    pub fn from_epoch_milliseconds(
        ms: f64,
        timezone: &TimeZone,
        calendar: Option<Calendar>,
    ) -> Result<ZonedDateTime, JsValue> {
        let cal = calendar.map(|c| c.inner.clone()).unwrap_or_default();
        let instant =
            temporal_rs::Instant::from_epoch_milliseconds(ms as i64).map_err(to_js_error)?;
        let inner = temporal_rs::ZonedDateTime::try_new_from_instant_with_provider(
            instant,
            timezone.inner,
            cal,
            &provider()?,
        )
        .map_err(to_js_error)?;
        Ok(Self { inner })
    }

    // ==== Date getters ====

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

    // ==== Time getters ====

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

    // ==== Zone/offset getters ====

    #[wasm_bindgen(getter)]
    pub fn calendar(&self) -> Calendar {
        Calendar {
            inner: self.inner.calendar().clone(),
        }
    }

    #[wasm_bindgen(getter, js_name = "timeZone")]
    pub fn time_zone(&self) -> TimeZone {
        TimeZone {
            inner: *self.inner.time_zone(),
        }
    }

    #[wasm_bindgen(getter)]
    pub fn offset(&self) -> String {
        self.inner.offset()
    }

    #[wasm_bindgen(getter, js_name = "offsetNanoseconds")]
    pub fn offset_nanoseconds(&self) -> f64 {
        self.inner.offset_nanoseconds() as f64
    }

    #[wasm_bindgen(getter, js_name = "epochMilliseconds")]
    pub fn epoch_milliseconds(&self) -> f64 {
        self.inner.epoch_milliseconds() as f64
    }

    #[wasm_bindgen(getter, js_name = "epochNanoseconds")]
    pub fn epoch_nanoseconds(&self) -> f64 {
        self.inner.epoch_nanoseconds().as_i128() as f64
    }

    // ==== Arithmetic ====

    #[wasm_bindgen]
    pub fn add(
        &self,
        duration: &Duration,
        overflow: Option<Overflow>,
    ) -> Result<ZonedDateTime, JsValue> {
        let inner = self
            .inner
            .add_with_provider(&duration.inner, overflow.map(Into::into), &provider()?)
            .map_err(to_js_error)?;
        Ok(ZonedDateTime { inner })
    }

    #[wasm_bindgen]
    pub fn subtract(
        &self,
        duration: &Duration,
        overflow: Option<Overflow>,
    ) -> Result<ZonedDateTime, JsValue> {
        let inner = self
            .inner
            .subtract_with_provider(&duration.inner, overflow.map(Into::into), &provider()?)
            .map_err(to_js_error)?;
        Ok(ZonedDateTime { inner })
    }

    #[wasm_bindgen]
    pub fn until(
        &self,
        other: &ZonedDateTime,
        settings: JsValue,
    ) -> Result<Duration, JsValue> {
        let s = deserialize_difference_settings(settings)?;
        let inner = self
            .inner
            .until_with_provider(&other.inner, s, &provider()?)
            .map_err(to_js_error)?;
        Ok(Duration { inner })
    }

    #[wasm_bindgen]
    pub fn since(
        &self,
        other: &ZonedDateTime,
        settings: JsValue,
    ) -> Result<Duration, JsValue> {
        let s = deserialize_difference_settings(settings)?;
        let inner = self
            .inner
            .since_with_provider(&other.inner, s, &provider()?)
            .map_err(to_js_error)?;
        Ok(Duration { inner })
    }

    // ==== Other methods ====

    #[wasm_bindgen]
    pub fn round(&self, options: JsValue) -> Result<ZonedDateTime, JsValue> {
        let opts = deserialize_rounding_options(options)?;
        let inner = self
            .inner
            .round_with_provider(opts, &provider()?)
            .map_err(to_js_error)?;
        Ok(ZonedDateTime { inner })
    }

    #[wasm_bindgen]
    pub fn equals(&self, other: &ZonedDateTime) -> Result<bool, JsValue> {
        self.inner
            .equals_with_provider(&other.inner, &provider()?)
            .map_err(to_js_error)
    }

    #[wasm_bindgen(js_name = "compareInstant")]
    pub fn compare_instant(one: &ZonedDateTime, two: &ZonedDateTime) -> i32 {
        one.inner.compare_instant(&two.inner) as i32
    }

    #[wasm_bindgen(getter, js_name = "hoursInDay")]
    pub fn hours_in_day(&self) -> Result<f64, JsValue> {
        self.inner
            .hours_in_day_with_provider(&provider()?)
            .map_err(to_js_error)
    }

    #[wasm_bindgen(js_name = "startOfDay")]
    pub fn start_of_day(&self) -> Result<ZonedDateTime, JsValue> {
        let inner = self
            .inner
            .start_of_day_with_provider(&provider()?)
            .map_err(to_js_error)?;
        Ok(ZonedDateTime { inner })
    }

    #[wasm_bindgen(js_name = "toInstant")]
    pub fn to_instant(&self) -> Instant {
        Instant {
            inner: self.inner.to_instant(),
        }
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

    #[wasm_bindgen(js_name = "toPlainDateTime")]
    pub fn to_plain_date_time(&self) -> PlainDateTime {
        PlainDateTime {
            inner: self.inner.to_plain_date_time(),
        }
    }

    #[wasm_bindgen(js_name = "withCalendar")]
    pub fn with_calendar(&self, calendar: &Calendar) -> ZonedDateTime {
        ZonedDateTime {
            inner: self.inner.with_calendar(calendar.inner.clone()),
        }
    }

    #[wasm_bindgen(js_name = "withTimeZone")]
    pub fn with_time_zone(&self, timezone: &TimeZone) -> Result<ZonedDateTime, JsValue> {
        let inner = self
            .inner
            .with_time_zone_with_provider(timezone.inner, &provider()?)
            .map_err(to_js_error)?;
        Ok(ZonedDateTime { inner })
    }

    #[wasm_bindgen(js_name = "toString")]
    pub fn to_string(&self) -> Result<String, JsValue> {
        self.inner
            .to_string_with_provider(&provider()?)
            .map_err(to_js_error)
    }

    #[wasm_bindgen(js_name = "toJSON")]
    pub fn to_json(&self) -> Result<String, JsValue> {
        self.inner
            .to_string_with_provider(&provider()?)
            .map_err(to_js_error)
    }

    #[wasm_bindgen(js_name = "valueOf")]
    pub fn value_of(&self) -> Result<(), JsValue> {
        Err(JsValue::from_str(
            "Use compare() or equals() to compare ZonedDateTime values",
        ))
    }
}
