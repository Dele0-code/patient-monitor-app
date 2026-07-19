import { useParams } from "react-router-dom";
import PatientMonitor from "../PatientMonitor.jsx";
import { DEFAULT_PATIENT_ID, getPatient } from "../patients.js";
import { usePatientWebSocket } from "../hooks/usePatientWebSocket.js";

export default function Dashboard() {
  const { patientId: routePatientId } = useParams();
  const patientId = getPatient(routePatientId) ? routePatientId : DEFAULT_PATIENT_ID;
  const { liveEvent, connectionStatus } = usePatientWebSocket(patientId);

  return (
    <PatientMonitor
      patientId={patientId}
      liveEvent={liveEvent}
      connectionStatus={connectionStatus}
    />
  );
}
