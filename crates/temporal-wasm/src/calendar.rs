use wasm_bindgen::prelude::*;

use crate::options::to_js_error;

#[wasm_bindgen]
pub struct Calendar {
    pub(crate) inner: temporal_rs::Calendar,
}

#[wasm_bindgen]
impl Calendar {
    /// Creates a new Calendar from a calendar identifier string (e.g. "iso8601", "gregorian", "japanese").
    #[wasm_bindgen(constructor)]
    pub fn new(id: &str) -> Result<Calendar, JsValue> {
        let inner = temporal_rs::Calendar::try_from_utf8(id.as_bytes()).map_err(to_js_error)?;
        Ok(Self { inner })
    }

    #[wasm_bindgen(js_name = "iso")]
    pub fn iso() -> Calendar {
        Self {
            inner: temporal_rs::Calendar::ISO,
        }
    }

    #[wasm_bindgen(js_name = "gregorian")]
    pub fn gregorian() -> Calendar {
        Self {
            inner: temporal_rs::Calendar::GREGORIAN,
        }
    }

    #[wasm_bindgen(js_name = "japanese")]
    pub fn japanese() -> Calendar {
        Self {
            inner: temporal_rs::Calendar::JAPANESE,
        }
    }

    #[wasm_bindgen(js_name = "buddhist")]
    pub fn buddhist() -> Calendar {
        Self {
            inner: temporal_rs::Calendar::BUDDHIST,
        }
    }

    #[wasm_bindgen(js_name = "chinese")]
    pub fn chinese() -> Calendar {
        Self {
            inner: temporal_rs::Calendar::CHINESE,
        }
    }

    #[wasm_bindgen(js_name = "coptic")]
    pub fn coptic() -> Calendar {
        Self {
            inner: temporal_rs::Calendar::COPTIC,
        }
    }

    #[wasm_bindgen(js_name = "dangi")]
    pub fn dangi() -> Calendar {
        Self {
            inner: temporal_rs::Calendar::DANGI,
        }
    }

    #[wasm_bindgen(js_name = "ethiopian")]
    pub fn ethiopian() -> Calendar {
        Self {
            inner: temporal_rs::Calendar::ETHIOPIAN,
        }
    }

    #[wasm_bindgen(js_name = "ethiopianAmeteAlem")]
    pub fn ethiopian_amete_alem() -> Calendar {
        Self {
            inner: temporal_rs::Calendar::ETHIOPIAN_AMETE_ALEM,
        }
    }

    #[wasm_bindgen(js_name = "hebrew")]
    pub fn hebrew() -> Calendar {
        Self {
            inner: temporal_rs::Calendar::HEBREW,
        }
    }

    #[wasm_bindgen(js_name = "indian")]
    pub fn indian() -> Calendar {
        Self {
            inner: temporal_rs::Calendar::INDIAN,
        }
    }

    #[wasm_bindgen(js_name = "hijriTabularFriday")]
    pub fn hijri_tabular_friday() -> Calendar {
        Self {
            inner: temporal_rs::Calendar::HIJRI_TABULAR_FRIDAY,
        }
    }

    #[wasm_bindgen(js_name = "hijriTabularThursday")]
    pub fn hijri_tabular_thursday() -> Calendar {
        Self {
            inner: temporal_rs::Calendar::HIJRI_TABULAR_THURSDAY,
        }
    }

    #[wasm_bindgen(js_name = "hijriUmmAlQura")]
    pub fn hijri_umm_al_qura() -> Calendar {
        Self {
            inner: temporal_rs::Calendar::HIJRI_UMM_AL_QURA,
        }
    }

    #[wasm_bindgen(js_name = "persian")]
    pub fn persian() -> Calendar {
        Self {
            inner: temporal_rs::Calendar::PERSIAN,
        }
    }

    #[wasm_bindgen(js_name = "roc")]
    pub fn roc() -> Calendar {
        Self {
            inner: temporal_rs::Calendar::ROC,
        }
    }

    #[wasm_bindgen(getter)]
    pub fn id(&self) -> String {
        self.inner.identifier().to_string()
    }

    #[wasm_bindgen(getter, js_name = "isIso")]
    pub fn is_iso(&self) -> bool {
        self.inner.is_iso()
    }

    #[wasm_bindgen(js_name = "toString")]
    pub fn to_string(&self) -> String {
        self.inner.identifier().to_string()
    }
}
