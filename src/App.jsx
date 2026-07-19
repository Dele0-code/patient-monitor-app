import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./routes/Dashboard.jsx";
import { DEFAULT_PATIENT_ID } from "./patients.js";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to={`/dashboard/${DEFAULT_PATIENT_ID}`} replace />} />
        <Route path="/dashboard/:patientId" element={<Dashboard />} />
        <Route path="*" element={<Navigate to={`/dashboard/${DEFAULT_PATIENT_ID}`} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
