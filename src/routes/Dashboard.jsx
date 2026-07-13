import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PatientMonitor from "../PatientMonitor.jsx";
import { getPatient } from "../patients.js";
import { usePatientWebSocket } from "../hooks/usePatientWebSocket.js";

export default function Dashboard() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const patientMeta = getPatient(patientId);
  const { liveEvent, connectionStatus } = usePatientWebSocket(patientId);

  useEffect(() => {
    if (!patientMeta) {
      navigate("/", { replace: true });
    }
  }, [patientMeta, navigate]);

  if (!patientMeta) return null;

  return (
    <PatientMonitor
      patientId={patientId}
      liveEvent={liveEvent}
      connectionStatus={connectionStatus}
    />
  );
}
