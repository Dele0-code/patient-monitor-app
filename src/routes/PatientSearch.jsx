import { useNavigate } from "react-router-dom";
import { PATIENT_LIST } from "../patients.js";

export default function PatientSearch() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 font-mono text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-8 text-center">
        <h1 className="text-4xl font-bold text-emerald-400 lg:text-5xl">Patient Monitor</h1>
        <p className="mt-2 text-slate-400">Select a patient to open the live bedside monitor</p>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-6 p-6">
        {PATIENT_LIST.map((patient) => (
          <button
            key={patient.id}
            type="button"
            onClick={() => navigate(`/dashboard/${patient.id}`)}
            className="group rounded-2xl border border-slate-700 bg-slate-900 p-8 text-left transition-all hover:border-emerald-600 hover:bg-slate-800"
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm uppercase tracking-widest text-slate-500">{patient.id}</div>
                <div className="mt-1 text-3xl font-bold text-white">{patient.full_name}</div>
                <div className="mt-2 text-slate-400">{patient.ward}</div>
              </div>
              <span className="text-2xl text-emerald-400 transition-transform group-hover:translate-x-1">→</span>
            </div>
          </button>
        ))}
      </main>

      <footer className="border-t border-slate-800 px-6 py-4 text-center text-xs uppercase tracking-widest text-slate-600">
        Raspberry Pi Kiosk Display
      </footer>
    </div>
  );
}
