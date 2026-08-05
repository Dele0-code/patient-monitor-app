export const PATIENTS = {
  "PT-000001": {
    id: "PT-000001",
    full_name: "Adedayo Segun",
    ward: "ICU",
    room: null,
    bed_number: null,
    // The one bed wired to a real ESP32 (falls back to the simulator when idle).
    monitored: true,
  },
  // Demo beds — no device attached. They populate the multi-patient strip so the
  // roster shows "multiple patients"; opening one shows "Awaiting telemetry".
  // Extension point: attach another ESP32 on its own topic and flip monitored.
  "PT-000002": {
    id: "PT-000002",
    full_name: "Ngozi Okafor",
    ward: "ICU",
    room: "ICU-2",
    bed_number: "B-02",
    monitored: false,
  },
  "PT-000003": {
    id: "PT-000003",
    full_name: "Tunde Balogun",
    ward: "HDU",
    room: "HDU-1",
    bed_number: "B-05",
    monitored: false,
  },
};

export const PATIENT_LIST = Object.values(PATIENTS);

export const DEFAULT_PATIENT_ID = "PT-000001";

export function getPatient(patientId) {
  return PATIENTS[patientId] || null;
}
