import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getPatientLatest } from "../api.js";
import PatientMonitor from "../PatientMonitor.jsx";
import { getPatient, isLivePatient } from "../patients.js";

const DEMO_FALLBACK = {
  patient_id: "PT-DEMO",
  full_name: "Demo Patient",
  age: 45,
  gender: "Female",
  room: "01",
  bed_number: "A",
  spo2: 98,
  max_bpm: 76,
  temperature_c: 36.8,
  nibp_sys: 120,
  nibp_dia: 80,
  rhythm_status: "Normal Sinus Rhythm",
  summary: "Stable simulated vitals for training and demonstration.",
  severity: "stable",
};

export default function Dashboard() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const patientMeta = getPatient(patientId);
  const live = isLivePatient(patientId);

  const [latest, setLatest] = useState(live ? null : DEMO_FALLBACK);
  const [wsConnected, setWsConnected] = useState(false);
  const [liveEvent, setLiveEvent] = useState(null);

  const fetchLatest = useCallback(async () => {
    if (!live) {
      setLatest(DEMO_FALLBACK);
      return;
    }
    try {
      const data = await getPatientLatest(patientId);
      if (data && Object.keys(data).length > 0) {
        setLatest({ ...patientMeta, ...data });
      }
    } catch {
      // Live patient may have no history yet until ESP32 connects
    }
  }, [patientId, live, patientMeta]);

  useEffect(() => {
    if (!patientMeta) {
      navigate("/", { replace: true });
      return;
    }
    fetchLatest();
  }, [patientMeta, fetchLatest, navigate]);

  useEffect(() => {
    if (!live) return undefined;

    const host = import.meta.env.VITE_API_BASE || "http://localhost:8000";
    const ws = new WebSocket(`${host.replace(/^http/, "ws")}/ws/${encodeURIComponent(patientId)}`);

    ws.addEventListener("open", () => setWsConnected(true));
    ws.addEventListener("close", () => setWsConnected(false));
    ws.addEventListener("message", (event) => {
      try {
        setLiveEvent(JSON.parse(event.data));
      } catch {
        setLiveEvent({ message: event.data });
      }
    });
    ws.addEventListener("error", () => setWsConnected(false));

    return () => ws.close();
  }, [patientId, live]);

  if (!patientMeta) return null;

  return (
    <PatientMonitor
      patientId={patientId}
      latest={latest}
      liveEvent={liveEvent}
      wsConnected={wsConnected}
    />
  );
}
