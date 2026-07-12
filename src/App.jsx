import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import PatientSearch from "./routes/PatientSearch.jsx";
import Dashboard from "./routes/Dashboard.jsx";
import { DEFAULT_PATIENT_ID } from "./patients.js";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PatientSearch />} />
        <Route path="/dashboard/:patientId" element={<Dashboard />} />
        <Route path="/search" element={<Navigate to="/" replace />} />
        <Route path="/ward" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to={`/dashboard/${DEFAULT_PATIENT_ID}`} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
