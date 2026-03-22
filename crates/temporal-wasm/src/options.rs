// NOTE: The enum definitions and From impls in this file must stay in sync
// with the corresponding file in the sibling crate (temporal-napi or temporal-wasm).
// Changes to enum variants or conversion logic must be applied to both.

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

temporal_common::impl_temporal_enum_from!(Overflow => temporal_rs::options::Overflow {
    Constrain, Reject,
});

#[wasm_bindgen]
#[derive(Clone, Copy, Deserialize)]
pub enum Disambiguation {
    Compatible,
    Earlier,
    Later,
    Reject,
}

temporal_common::impl_temporal_enum_from!(Disambiguation => temporal_rs::options::Disambiguation {
    Compatible, Earlier, Later, Reject,
});

#[wasm_bindgen]
#[derive(Clone, Copy, Deserialize)]
pub enum OffsetDisambiguation {
    Use,
    Prefer,
    Ignore,
    Reject,
}

temporal_common::impl_temporal_enum_from!(OffsetDisambiguation => temporal_rs::options::OffsetDisambiguation {
    Use, Prefer, Ignore, Reject,
});

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

temporal_common::impl_temporal_enum_from!(RoundingMode => temporal_rs::options::RoundingMode {
    Ceil, Floor, Expand, Trunc, HalfCeil, HalfFloor, HalfExpand, HalfTrunc, HalfEven,
});

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

temporal_common::impl_temporal_enum_from!(Unit => temporal_rs::options::Unit {
    Auto, Nanosecond, Microsecond, Millisecond, Second, Minute, Hour, Day, Week, Month, Year,
});

#[wasm_bindgen]
#[derive(Clone, Copy, Deserialize)]
pub enum DisplayCalendar {
    Auto,
    Always,
    Never,
    Critical,
}

temporal_common::impl_temporal_enum_from!(DisplayCalendar => temporal_rs::options::DisplayCalendar {
    Auto, Always, Never, Critical,
});

#[wasm_bindgen]
#[derive(Clone, Copy, Deserialize)]
pub enum DisplayOffset {
    Auto,
    Never,
}

temporal_common::impl_temporal_enum_from!(DisplayOffset => temporal_rs::options::DisplayOffset {
    Auto, Never,
});

#[wasm_bindgen]
#[derive(Clone, Copy, Deserialize)]
pub enum DisplayTimeZone {
    Auto,
    Never,
    Critical,
}

temporal_common::impl_temporal_enum_from!(DisplayTimeZone => temporal_rs::options::DisplayTimeZone {
    Auto, Never, Critical,
});

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

pub(crate) fn provider() -> Result<&'static temporal_common::TzProvider, JsValue> {
    temporal_common::cached_provider()
        .ok_or_else(|| JsValue::from_str("Failed to initialize timezone provider"))
}
