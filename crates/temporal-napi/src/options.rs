// NOTE: The enum definitions and From impls in this file must stay in sync
// with the corresponding file in the sibling crate (temporal-napi or temporal-wasm).
// Changes to enum variants or conversion logic must be applied to both.

use temporal_rs::options::RoundingIncrement;

pub(crate) fn to_napi_error(e: temporal_rs::TemporalError) -> napi::Error {
    napi::Error::from_reason(format!("{e}"))
}

// ==== Enum Wrappers ====

#[napi(string_enum)]
pub enum Overflow {
    Constrain,
    Reject,
}

temporal_common::impl_temporal_enum_from!(Overflow => temporal_rs::options::Overflow {
    Constrain, Reject,
});

#[napi(string_enum)]
pub enum Disambiguation {
    Compatible,
    Earlier,
    Later,
    Reject,
}

temporal_common::impl_temporal_enum_from!(Disambiguation => temporal_rs::options::Disambiguation {
    Compatible, Earlier, Later, Reject,
});

#[napi(string_enum)]
pub enum OffsetDisambiguation {
    Use,
    Prefer,
    Ignore,
    Reject,
}

temporal_common::impl_temporal_enum_from!(OffsetDisambiguation => temporal_rs::options::OffsetDisambiguation {
    Use, Prefer, Ignore, Reject,
});

#[napi(string_enum)]
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

#[napi(string_enum)]
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

#[napi(string_enum)]
pub enum DisplayCalendar {
    Auto,
    Always,
    Never,
    Critical,
}

temporal_common::impl_temporal_enum_from!(DisplayCalendar => temporal_rs::options::DisplayCalendar {
    Auto, Always, Never, Critical,
});

#[napi(string_enum)]
pub enum DisplayOffset {
    Auto,
    Never,
}

temporal_common::impl_temporal_enum_from!(DisplayOffset => temporal_rs::options::DisplayOffset {
    Auto, Never,
});

#[napi(string_enum)]
pub enum DisplayTimeZone {
    Auto,
    Never,
    Critical,
}

temporal_common::impl_temporal_enum_from!(DisplayTimeZone => temporal_rs::options::DisplayTimeZone {
    Auto, Never, Critical,
});

// ==== Option Structs ====

#[napi(object)]
#[derive(Default)]
pub struct DifferenceSettings {
    pub largest_unit: Option<Unit>,
    pub smallest_unit: Option<Unit>,
    pub rounding_mode: Option<RoundingMode>,
    pub rounding_increment: Option<u32>,
}

impl TryFrom<DifferenceSettings> for temporal_rs::options::DifferenceSettings {
    type Error = napi::Error;
    fn try_from(value: DifferenceSettings) -> Result<Self, Self::Error> {
        let mut ret = Self::default();
        ret.largest_unit = value.largest_unit.map(Into::into);
        ret.smallest_unit = value.smallest_unit.map(Into::into);
        ret.rounding_mode = value.rounding_mode.map(Into::into);
        if let Some(inc) = value.rounding_increment {
            ret.increment =
                Some(RoundingIncrement::try_new(inc).map_err(to_napi_error)?);
        }
        Ok(ret)
    }
}

#[napi(object)]
pub struct RoundingOptions {
    pub largest_unit: Option<Unit>,
    pub smallest_unit: Option<Unit>,
    pub rounding_mode: Option<RoundingMode>,
    pub rounding_increment: Option<u32>,
}

impl TryFrom<RoundingOptions> for temporal_rs::options::RoundingOptions {
    type Error = napi::Error;
    fn try_from(value: RoundingOptions) -> Result<Self, Self::Error> {
        let mut ret = Self::default();
        ret.largest_unit = value.largest_unit.map(Into::into);
        ret.smallest_unit = value.smallest_unit.map(Into::into);
        ret.rounding_mode = value.rounding_mode.map(Into::into);
        if let Some(inc) = value.rounding_increment {
            ret.increment =
                Some(RoundingIncrement::try_new(inc).map_err(to_napi_error)?);
        }
        Ok(ret)
    }
}

#[napi(object)]
#[derive(Default)]
pub struct ToStringRoundingOptions {
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

pub(crate) fn provider() -> napi::Result<&'static temporal_common::TzProvider> {
    temporal_common::cached_provider()
        .ok_or_else(|| napi::Error::from_reason("Failed to initialize timezone provider"))
}
