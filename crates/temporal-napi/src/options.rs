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

impl From<Overflow> for temporal_rs::options::Overflow {
    fn from(value: Overflow) -> Self {
        match value {
            Overflow::Constrain => Self::Constrain,
            Overflow::Reject => Self::Reject,
        }
    }
}

#[napi(string_enum)]
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

#[napi(string_enum)]
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

#[napi(string_enum)]
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

#[napi(string_enum)]
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

#[napi(string_enum)]
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
