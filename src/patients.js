export const PATIENTS = {
  "PT-DEMO": {
    id: "PT-DEMO",
    full_name: "Demo Patient",
    age: 45,
    gender: "Female",
    ward: "Training Ward",
    room: "01",
    bed_number: "A",
    isLive: false,
    description: "Simulated vitals for demonstration",
  },
  "PT-000001": {
    id: "PT-000001",
    full_name: "Live Patient",
    age: null,
    gender: null,
    ward: "ICU",
    room: "—",
    bed_number: "—",
    isLive: true,
    description: "Live telemetry via MQTT (simulated until ESP32 is connected)",
  },
};

export const PATIENT_LIST = Object.values(PATIENTS);

export const DEFAULT_PATIENT_ID = "PT-DEMO";

export function getPatient(patientId) {
  return PATIENTS[patientId] || null;
}

export function isLivePatient(patientId) {
  return PATIENTS[patientId]?.isLive === true;
}
