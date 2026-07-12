import { useState, useEffect } from "react";
import { getWardTriage } from "../api.js";
import { useNavigate } from "react-router-dom";

export default function WardOverview() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadWard = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await getWardTriage();
        setPatients(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err.message || "Unable to load ward overview.");
      } finally {
        setLoading(false);
      }
    };
    loadWard();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-cyan-400">Ward Triage</h1>
            <p className="text-slate-500 mt-1">Real-time severity ranking for all monitored patients.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/search")}
            className="rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            Back to Search
          </button>
        </header>

        <div className="rounded-3xl border border-slate-800 bg-slate-900/95 p-4 shadow-lg">
          {loading && <div className="rounded-2xl bg-slate-950/80 p-4 text-slate-400">Loading ward triage...</div>}
          {error && <div className="rounded-2xl bg-red-950/80 p-4 text-red-300">{error}</div>}
          {!loading && !error && patients.length === 0 && (
            <div className="rounded-2xl bg-slate-950/80 p-6 text-center text-slate-500">No ward triage data available yet.</div>
          )}

          {patients.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead className="bg-slate-900 text-slate-500 uppercase text-xs tracking-widest">
                  <tr>
                    <th className="p-3 text-left">Patient</th>
                    <th className="p-3 text-left">Severity</th>
                    <th className="p-3 text-left">Vitals</th>
                    <th className="p-3 text-left">Location</th>
                    <th className="p-3 text-right">Monitor</th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map((item) => (
                    <tr key={item.patient_id} className="border-t border-slate-800 hover:bg-slate-900/80">
                      <td className="p-3 text-slate-100">
                        <div className="font-semibold">{item.patient_id}</div>
                        <div className="text-slate-500 text-xs">{item.summary}</div>
                      </td>
                      <td className="p-3 text-slate-100 uppercase font-semibold text-sm">
                        <span className={`inline-flex rounded-full px-3 py-1 ${item.severity === "critical" ? "bg-red-500 text-black" : item.severity === "watch" ? "bg-amber-500 text-slate-950" : "bg-emerald-500 text-slate-950"}`}>
                          {item.severity}
                        </span>
                      </td>
                      <td className="p-3 text-slate-100">SpO₂ {item.spo2}% · HR {item.max_bpm} · {item.temperature_c}°C</td>
                      <td className="p-3 text-slate-100">{item.room} · Bed {item.bed_number}</td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => navigate(`/dashboard/${encodeURIComponent(item.patient_id)}`)}
                          className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400"
                        >
                          Monitor
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
