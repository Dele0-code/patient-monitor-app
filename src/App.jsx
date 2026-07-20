import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./routes/Dashboard.jsx";
import { DEFAULT_PATIENT_ID } from "./patients.js";
import { ThemeProvider } from "./context/ThemeContext.jsx";

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to={`/dashboard/${DEFAULT_PATIENT_ID}`} replace />} />
          <Route path="/dashboard/:patientId" element={<Dashboard />} />
          <Route path="*" element={<Navigate to={`/dashboard/${DEFAULT_PATIENT_ID}`} replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
