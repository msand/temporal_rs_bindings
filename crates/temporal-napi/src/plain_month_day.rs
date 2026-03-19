use napi_derive::napi;

use crate::calendar::Calendar;
use crate::options::*;

#[napi]
pub struct PlainMonthDay {
    pub(crate) inner: temporal_rs::PlainMonthDay,
}

#[napi]
impl PlainMonthDay {
    #[napi(constructor)]
    pub fn new(
        month: u8,
        day: u8,
        calendar: Option<&Calendar>,
        reference_year: Option<i32>,
    ) -> napi::Result<Self> {
        let cal = calendar.map(|c| c.inner.clone()).unwrap_or_default();
        let inner = temporal_rs::PlainMonthDay::new_with_overflow(
            month,
            day,
            cal,
            temporal_rs::options::Overflow::Constrain,
            reference_year,
        )
        .map_err(to_napi_error)?;
        Ok(Self { inner })
    }

    #[napi(factory)]
    pub fn from(s: String) -> napi::Result<Self> {
        let inner =
            temporal_rs::PlainMonthDay::from_utf8(s.as_bytes()).map_err(to_napi_error)?;
        Ok(Self { inner })
    }

    #[napi(getter)]
    pub fn month_code(&self) -> String {
        self.inner.month_code().as_str().to_string()
    }

    #[napi(getter)]
    pub fn day(&self) -> u8 {
        self.inner.day()
    }

    #[napi(getter)]
    pub fn calendar(&self) -> Calendar {
        Calendar {
            inner: self.inner.calendar().clone(),
        }
    }

    #[napi]
    pub fn equals(&self, other: &PlainMonthDay) -> bool {
        self.inner == other.inner
    }

    #[napi]
    pub fn to_string(&self, display_calendar: Option<DisplayCalendar>) -> String {
        self.inner.to_ixdtf_string(
            display_calendar
                .unwrap_or(DisplayCalendar::Auto)
                .into(),
        )
    }

    #[napi]
    pub fn to_json(&self) -> String {
        self.inner
            .to_ixdtf_string(temporal_rs::options::DisplayCalendar::Auto)
    }

    #[napi]
    pub fn value_of(&self) -> napi::Result<()> {
        Err(napi::Error::from_reason(
            "Use equals() to compare PlainMonthDay values",
        ))
    }
}
