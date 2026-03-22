use napi_derive::napi;

use crate::options::to_napi_error;

#[napi]
pub struct Calendar {
    pub(crate) inner: temporal_rs::Calendar,
}

#[napi]
impl Calendar {
    /// Creates a new Calendar from a calendar identifier string (e.g. "iso8601", "gregorian", "japanese").
    #[napi(constructor)]
    pub fn new(id: String) -> napi::Result<Self> {
        let inner = temporal_rs::Calendar::try_from_utf8(id.as_bytes()).map_err(to_napi_error)?;
        Ok(Self { inner })
    }

    /// Create an ISO 8601 calendar.
    #[napi(factory)]
    pub fn iso() -> Self {
        Self { inner: temporal_rs::Calendar::ISO }
    }

    /// Create a Gregorian calendar.
    #[napi(factory)]
    pub fn gregorian() -> Self {
        Self { inner: temporal_rs::Calendar::GREGORIAN }
    }

    /// Create a Japanese calendar.
    #[napi(factory)]
    pub fn japanese() -> Self {
        Self { inner: temporal_rs::Calendar::JAPANESE }
    }

    /// Create a Buddhist calendar.
    #[napi(factory)]
    pub fn buddhist() -> Self {
        Self { inner: temporal_rs::Calendar::BUDDHIST }
    }

    /// Create a Chinese calendar.
    #[napi(factory)]
    pub fn chinese() -> Self {
        Self { inner: temporal_rs::Calendar::CHINESE }
    }

    /// Create a Coptic calendar.
    #[napi(factory)]
    pub fn coptic() -> Self {
        Self { inner: temporal_rs::Calendar::COPTIC }
    }

    /// Create a Dangi (Korean) calendar.
    #[napi(factory)]
    pub fn dangi() -> Self {
        Self { inner: temporal_rs::Calendar::DANGI }
    }

    /// Create an Ethiopian calendar.
    #[napi(factory)]
    pub fn ethiopian() -> Self {
        Self { inner: temporal_rs::Calendar::ETHIOPIAN }
    }

    /// Create an Ethiopian Amete Alem calendar.
    #[napi(factory)]
    pub fn ethiopian_amete_alem() -> Self {
        Self { inner: temporal_rs::Calendar::ETHIOPIAN_AMETE_ALEM }
    }

    /// Create a Hebrew calendar.
    #[napi(factory)]
    pub fn hebrew() -> Self {
        Self { inner: temporal_rs::Calendar::HEBREW }
    }

    /// Create an Indian calendar.
    #[napi(factory)]
    pub fn indian() -> Self {
        Self { inner: temporal_rs::Calendar::INDIAN }
    }

    /// Create a Hijri Tabular (Friday epoch) calendar.
    #[napi(factory)]
    pub fn hijri_tabular_friday() -> Self {
        Self { inner: temporal_rs::Calendar::HIJRI_TABULAR_FRIDAY }
    }

    /// Create a Hijri Tabular (Thursday epoch) calendar.
    #[napi(factory)]
    pub fn hijri_tabular_thursday() -> Self {
        Self { inner: temporal_rs::Calendar::HIJRI_TABULAR_THURSDAY }
    }

    /// Create a Hijri Umm al-Qura calendar.
    #[napi(factory)]
    pub fn hijri_umm_al_qura() -> Self {
        Self { inner: temporal_rs::Calendar::HIJRI_UMM_AL_QURA }
    }

    /// Create a Persian calendar.
    #[napi(factory)]
    pub fn persian() -> Self {
        Self { inner: temporal_rs::Calendar::PERSIAN }
    }

    /// Create a Republic of China (Minguo) calendar.
    #[napi(factory)]
    pub fn roc() -> Self {
        Self { inner: temporal_rs::Calendar::ROC }
    }

    #[napi(getter)]
    pub fn id(&self) -> &str {
        self.inner.identifier()
    }

    #[napi(getter)]
    pub fn is_iso(&self) -> bool {
        self.inner.is_iso()
    }

    #[napi]
    pub fn to_string(&self) -> &str {
        self.inner.identifier()
    }
}
