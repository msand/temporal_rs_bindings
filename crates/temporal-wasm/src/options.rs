use serde::Deserialize;
use temporal_rs::options::RoundingIncrement;
use wasm_bindgen::prelude::*;

pub(crate) fn to_js_error(e: temporal_rs::TemporalError) -> JsValue {
    JsValue::from_str(&format!("{e}"))
}

// ==== Enum Wrappers ====

#[wasm_bindgen]
#[derive(Clone, Copy, Deserialize)]
pub enum Overflow {
    Constrain,
    Reject,
}

impl From<Overflow> for temporal_rs::options::Overflow {
    fn from(value: Overflow) -> Self {
        match value {
            Overflow::Constrain => Self::Constrain,
            Overflow::Reject => Self::Reject,
        }
    }
}

#[wasm_bindgen]
#[derive(Clone, Copy, Deserialize)]
pub enum Disambiguation {
    Compatible,
    Earlier,
    Later,
    Reject,
}

impl From<Disambiguation> for temporal_rs::options::Disambiguation {
    fn from(value: Disambiguation) -> Self {
        match value {
            Disambiguation::Compatible => Self::Compatible,
            Disambiguation::Earlier => Self::Earlier,
            Disambiguation::Later => Self::Later,
            Disambiguation::Reject => Self::Reject,
        }
    }
}

#[wasm_bindgen]
#[derive(Clone, Copy, Deserialize)]
pub enum OffsetDisambiguation {
    Use,
    Prefer,
    Ignore,
    Reject,
}

impl From<OffsetDisambiguation> for temporal_rs::options::OffsetDisambiguation {
    fn from(value: OffsetDisambiguation) -> Self {
        match value {
            OffsetDisambiguation::Use => Self::Use,
            OffsetDisambiguation::Prefer => Self::Prefer,
            OffsetDisambiguation::Ignore => Self::Ignore,
            OffsetDisambiguation::Reject => Self::Reject,
        }
    }
}

#[wasm_bindgen]
#[derive(Clone, Copy, Deserialize)]
pub enum RoundingMode {
    Ceil,
    Floor,
    Expand,
    Trunc,
    HalfCeil,
    HalfFloor,
    HalfExpand,
    HalfTrunc,
    HalfEven,
}

impl From<RoundingMode> for temporal_rs::options::RoundingMode {
    fn from(value: RoundingMode) -> Self {
        match value {
            RoundingMode::Ceil => Self::Ceil,
            RoundingMode::Floor => Self::Floor,
            RoundingMode::Expand => Self::Expand,
            RoundingMode::Trunc => Self::Trunc,
            RoundingMode::HalfCeil => Self::HalfCeil,
            RoundingMode::HalfFloor => Self::HalfFloor,
            RoundingMode::HalfExpand => Self::HalfExpand,
            RoundingMode::HalfTrunc => Self::HalfTrunc,
            RoundingMode::HalfEven => Self::HalfEven,
        }
    }
}

#[wasm_bindgen]
#[derive(Clone, Copy, Deserialize)]
pub enum Unit {
    Auto,
    Nanosecond,
    Microsecond,
    Millisecond,
    Second,
    Minute,
    Hour,
    Day,
    Week,
    Month,
    Year,
}

impl From<Unit> for temporal_rs::options::Unit {
    fn from(value: Unit) -> Self {
        match value {
            Unit::Auto => Self::Auto,
            Unit::Nanosecond => Self::Nanosecond,
            Unit::Microsecond => Self::Microsecond,
            Unit::Millisecond => Self::Millisecond,
            Unit::Second => Self::Second,
            Unit::Minute => Self::Minute,
            Unit::Hour => Self::Hour,
            Unit::Day => Self::Day,
            Unit::Week => Self::Week,
            Unit::Month => Self::Month,
            Unit::Year => Self::Year,
        }
    }
}

#[wasm_bindgen]
#[derive(Clone, Copy, Deserialize)]
pub enum DisplayCalendar {
    Auto,
    Always,
    Never,
    Critical,
}

impl From<DisplayCalendar> for temporal_rs::options::DisplayCalendar {
    fn from(value: DisplayCalendar) -> Self {
        match value {
            DisplayCalendar::Auto => Self::Auto,
            DisplayCalendar::Always => Self::Always,
            DisplayCalendar::Never => Self::Never,
            DisplayCalendar::Critical => Self::Critical,
        }
    }
}

#[wasm_bindgen]
#[derive(Clone, Copy, Deserialize)]
pub enum DisplayOffset {
    Auto,
    Never,
}

impl From<DisplayOffset> for temporal_rs::options::DisplayOffset {
    fn from(value: DisplayOffset) -> Self {
        match value {
            DisplayOffset::Auto => Self::Auto,
            DisplayOffset::Never => Self::Never,
        }
    }
}

#[wasm_bindgen]
#[derive(Clone, Copy, Deserialize)]
pub enum DisplayTimeZone {
    Auto,
    Never,
    Critical,
}

impl From<DisplayTimeZone> for temporal_rs::options::DisplayTimeZone {
    fn from(value: DisplayTimeZone) -> Self {
        match value {
            DisplayTimeZone::Auto => Self::Auto,
            DisplayTimeZone::Never => Self::Never,
            DisplayTimeZone::Critical => Self::Critical,
        }
    }
}

// ==== Option Structs (serde-deserializable for JsValue) ====

#[derive(Default, Deserialize)]
pub(crate) struct DifferenceSettings {
    pub largest_unit: Option<Unit>,
    pub smallest_unit: Option<Unit>,
    pub rounding_mode: Option<RoundingMode>,
    pub rounding_increment: Option<u32>,
}

impl DifferenceSettings {
    pub fn try_into_temporal(self) -> Result<temporal_rs::options::DifferenceSettings, JsValue> {
        let mut ret = temporal_rs::options::DifferenceSettings::default();
        ret.largest_unit = self.largest_unit.map(Into::into);
        ret.smallest_unit = self.smallest_unit.map(Into::into);
        ret.rounding_mode = self.rounding_mode.map(Into::into);
        if let Some(inc) = self.rounding_increment {
            ret.increment =
                Some(RoundingIncrement::try_new(inc).map_err(to_js_error)?);
        }
        Ok(ret)
    }
}

pub(crate) fn deserialize_difference_settings(
    val: JsValue,
) -> Result<temporal_rs::options::DifferenceSettings, JsValue> {
    if val.is_undefined() || val.is_null() {
        Ok(temporal_rs::options::DifferenceSettings::default())
    } else {
        let settings: DifferenceSettings =
            serde_wasm_bindgen::from_value(val).map_err(|e| JsValue::from_str(&format!("{e}")))?;
        settings.try_into_temporal()
    }
}

#[derive(Default, Deserialize)]
pub(crate) struct RoundingOptions {
    pub largest_unit: Option<Unit>,
    pub smallest_unit: Option<Unit>,
    pub rounding_mode: Option<RoundingMode>,
    pub rounding_increment: Option<u32>,
}

impl RoundingOptions {
    pub fn try_into_temporal(self) -> Result<temporal_rs::options::RoundingOptions, JsValue> {
        let mut ret = temporal_rs::options::RoundingOptions::default();
        ret.largest_unit = self.largest_unit.map(Into::into);
        ret.smallest_unit = self.smallest_unit.map(Into::into);
        ret.rounding_mode = self.rounding_mode.map(Into::into);
        if let Some(inc) = self.rounding_increment {
            ret.increment =
                Some(RoundingIncrement::try_new(inc).map_err(to_js_error)?);
        }
        Ok(ret)
    }
}

pub(crate) fn deserialize_rounding_options(
    val: JsValue,
) -> Result<temporal_rs::options::RoundingOptions, JsValue> {
    let options: RoundingOptions =
        serde_wasm_bindgen::from_value(val).map_err(|e| JsValue::from_str(&format!("{e}")))?;
    options.try_into_temporal()
}

#[derive(Default, Deserialize)]
pub(crate) struct ToStringRoundingOptions {
    pub precision: Option<u8>,
    pub is_minute: Option<bool>,
    pub smallest_unit: Option<Unit>,
    pub rounding_mode: Option<RoundingMode>,
}

impl From<ToStringRoundingOptions> for temporal_rs::options::ToStringRoundingOptions {
    fn from(value: ToStringRoundingOptions) -> Self {
        let precision = if value.is_minute.unwrap_or(false) {
            temporal_rs::parsers::Precision::Minute
        } else if let Some(digit) = value.precision {
            temporal_rs::parsers::Precision::Digit(digit)
        } else {
            temporal_rs::parsers::Precision::Auto
        };
        Self {
            precision,
            smallest_unit: value.smallest_unit.map(Into::into),
            rounding_mode: value.rounding_mode.map(Into::into),
        }
    }
}

pub(crate) fn deserialize_to_string_rounding_options(
    val: JsValue,
) -> Result<temporal_rs::options::ToStringRoundingOptions, JsValue> {
    if val.is_undefined() || val.is_null() {
        Ok(temporal_rs::options::ToStringRoundingOptions::default())
    } else {
        let options: ToStringRoundingOptions =
            serde_wasm_bindgen::from_value(val).map_err(|e| JsValue::from_str(&format!("{e}")))?;
        Ok(options.into())
    }
}
