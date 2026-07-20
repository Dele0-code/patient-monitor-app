export const PATIENTS = {
  "PT-000001": {
    id: "PT-000001",
    full_name: "Adedayo Segun",
    ward: "ICU",
    room: null,
    bed_number: null,
  },
};

export const PATIENT_LIST = Object.values(PATIENTS);

export const DEFAULT_PATIENT_ID = "PT-000001";

export function getPatient(patientId) {
  return PATIENTS[patientId] || null;
}
