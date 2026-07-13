import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import EcgWaveform from "./components/EcgWaveform.jsx";
import AlarmBanner from "./components/AlarmBanner.jsx";
import ConnectionBadge from "./components/ConnectionBadge.jsx";
import { getPatient } from "./patients.js";

const NO_SIGNAL = "NO SIGNAL";

function VitalCard({ label, value, unit, alert, colorClass = "text-emerald-400" }) {
  const hasValue = value !== null && value !== undefined && value !== NO_SIGNAL;

  return (
    <div
      className={`flex flex-col justify-between rounded-xl border p-4 shadow-lg transition-all ${
        alert ? "animate-pulse border-red-500 bg-red-950/10" : "border-slate-800 bg-slate-900"
      }`}
    >
      <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{label}</div>
      <div className="flex items-baseline gap-2">
        {hasValue ? (
          <>
            <span className={`text-5xl font-extrabold tracking-tight ${colorClass}`}>{value}</span>
            {unit && <span className={`text-sm font-semibold ${colorClass}`}>{unit}</span>}
          </>
        ) : (
          <span className="text-2xl font-bold uppercase tracking-widest text-slate-600">{NO_SIGNAL}</span>
        )}
      </div>
    </div>
  );
}

export default function PatientMonitor({ patientId, liveEvent, connectionStatus }) {
  const navigate = useNavigate();
  const patientMeta = getPatient(patientId);
  const hasData = connectionStatus === "live";

  const [heartRate, setHeartRate] = useState(null);
  const [spo2, setSpo2] = useState(null);
  const [temp, setTemp] = useState(null);
  const [nibpSys, setNibpSys] = useState(null);
  const [nibpDia, setNibpDia] = useState(null);
  const [arrhythmia, setArrhythmia] = useState(null);
  const [summaryText, setSummaryText] = useState(null);
  const [recommendedAction, setRecommendedAction] = useState(null);
  const [severityTag, setSeverityTag] = useState(null);
  const [systemFlags, setSystemFlags] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [rawEcg, setRawEcg] = useState(null);

  const audioCtxRef = useRef(null);
  const audioEnabledRef = useRef(audioEnabled);

  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);

  useEffect(() => {
    const clock = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    if (!hasData) {
      setHeartRate(null);
      setSpo2(null);
      setTemp(null);
      setNibpSys(null);
      setNibpDia(null);
      setArrhythmia(null);
      setSummaryText(null);
      setRecommendedAction(null);
      setSeverityTag(null);
      setSystemFlags(null);
      setRawEcg(null);
      return;
    }
    if (!liveEvent) return;
    setHeartRate(liveEvent.max_bpm ?? null);
    setSpo2(liveEvent.spo2 ?? null);
    setTemp(liveEvent.temperature_c ?? null);
    setNibpSys(liveEvent.nibp_sys ?? null);
    setNibpDia(liveEvent.nibp_dia ?? null);
    setArrhythmia(liveEvent.rhythm_status ?? null);
    setSummaryText(liveEvent.summary ?? null);
    setRecommendedAction(liveEvent.recommended_action ?? null);
    setSeverityTag(liveEvent.severity ?? null);
    setSystemFlags(liveEvent.system_flags ?? null);
    if (liveEvent.raw_ecg?.length) {
      setRawEcg(liveEvent.raw_ecg);
    }
  }, [hasData, liveEvent]);

  const triggerBeep = useCallback((freq, duration, volume = 0.05) => {
    if (!audioEnabledRef.current) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!audioCtxRef.current && AudioContext) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      if (!ctx || ctx.state === "suspended") return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Audio unavailable on some kiosk setups
    }
  }, []);

  useEffect(() => {
    if (!hasData || severityTag !== "critical") return undefined;
    const interval = setInterval(() => {
      triggerBeep(880, 0.1, 0.08);
      setTimeout(() => triggerBeep(880, 0.1, 0.08), 150);
    }, 1000);
    return () => clearInterval(interval);
  }, [hasData, severityTag, triggerBeep]);

  const hrAlert = hasData && (heartRate > 100 || heartRate < 55);
  const spo2Alert = hasData && spo2 < 95;
  const tempAlert = hasData && (temp > 37.8 || temp < 35.8);
  const nibpAlert =
    hasData &&
    nibpSys != null &&
    nibpDia != null &&
    (nibpSys > 140 || nibpSys < 90 || nibpDia > 90 || nibpDia < 55);
  const rhythmAlert = hasData && arrhythmia && !arrhythmia.toLowerCase().includes("normal");

  const nibpDisplay =
    !hasData || nibpSys == null || nibpDia == null ? NO_SIGNAL : `${nibpSys}/${nibpDia}`;

  const displayName = liveEvent?.full_name || patientMeta?.full_name || patientId;
  const room = liveEvent?.room || patientMeta?.room || "—";
  const bed = liveEvent?.bed_number || patientMeta?.bed_number || "—";

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 font-mono text-slate-100">
      <AlarmBanner severity={hasData ? severityTag : null} systemFlags={systemFlags} />

      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500">Patient Monitor</div>
            <div className="text-xl font-bold text-emerald-400">{patientId}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500">Name</div>
            <div className="text-lg font-bold text-white">{displayName}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500">Room / Bed</div>
            <div className="text-lg font-bold text-slate-300">
              {room} / {bed}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <ConnectionBadge status={connectionStatus} />
          <div className="text-right">
            <div className="text-2xl font-bold tracking-widest text-emerald-400">
              {currentTime.toLocaleTimeString()}
            </div>
            <div className="text-xs text-slate-500">{currentTime.toLocaleDateString()}</div>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-3 p-3 lg:flex-row">
        <section className="flex flex-[2] flex-col gap-3">
          <div className="flex min-h-[280px] flex-1 flex-col rounded-xl border border-slate-800 bg-slate-900 p-3 lg:min-h-[340px]">
            <div className="mb-2 flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">ECG Lead I</span>
            </div>
            <EcgWaveform rawEcg={rawEcg} hasSignal={hasData} className="min-h-[220px] flex-1 lg:min-h-[280px]" />
            <div className="mt-2 flex justify-end">
              <div
                className={`rounded border px-4 py-2 text-right ${
                  hrAlert ? "animate-pulse border-red-500 bg-red-950/10" : "border-slate-800 bg-black/60"
                }`}
              >
                <div className="text-[10px] font-bold uppercase text-emerald-600">Heart Rate</div>
                {hasData ? (
                  <div className="text-5xl font-extrabold text-emerald-400">
                    {heartRate}
                    <span className="ml-1 text-sm text-slate-500">bpm</span>
                  </div>
                ) : (
                  <div className="text-2xl font-bold uppercase tracking-widest text-slate-600">{NO_SIGNAL}</div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <VitalCard label="SpO₂" value={hasData ? spo2 : NO_SIGNAL} unit="%" alert={spo2Alert} colorClass="text-cyan-400" />
            <VitalCard
              label="Temperature"
              value={hasData ? temp?.toFixed(1) : NO_SIGNAL}
              unit="°C"
              alert={tempAlert}
              colorClass="text-cyan-300"
            />
            <VitalCard label="NIBP" value={nibpDisplay} unit="mmHg" alert={nibpAlert} colorClass="text-fuchsia-400" />
            <div
              className={`rounded-xl border p-4 ${
                rhythmAlert ? "animate-pulse border-red-500 bg-red-950/10" : "border-slate-800 bg-slate-900"
              }`}
            >
              <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Rhythm</div>
              {hasData ? (
                <div className="mt-2 text-lg font-bold uppercase text-emerald-400">{arrhythmia}</div>
              ) : (
                <div className="mt-2 text-2xl font-bold uppercase tracking-widest text-slate-600">{NO_SIGNAL}</div>
              )}
            </div>
          </div>
        </section>

        <section className="flex flex-1 flex-col gap-3">
          <div className="flex-1 rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-3 border-b border-slate-800 pb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              Clinical Assessment
            </h2>
            {hasData && summaryText ? (
              <>
                <p className="text-sm leading-relaxed text-slate-200">{summaryText}</p>
                {recommendedAction && (
                  <p className="mt-3 rounded border border-cyan-900/40 bg-cyan-950/20 p-3 text-sm text-cyan-200">
                    {recommendedAction}
                  </p>
                )}
              </>
            ) : (
              <p className="text-2xl font-bold uppercase tracking-widest text-slate-600">{NO_SIGNAL}</p>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Controls</h2>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAudioEnabled((v) => !v)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-xs font-semibold uppercase hover:border-slate-500"
              >
                {audioEnabled ? "Mute Alarms" : "Unmute Alarms"}
              </button>
              <button
                type="button"
                onClick={() => navigate("/")}
                className="col-span-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-semibold hover:border-emerald-600"
              >
                Back to Patients
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="flex items-center justify-between border-t border-slate-800 bg-slate-900 px-4 py-2 text-[11px] uppercase tracking-wider text-slate-500">
        <span>Patient Monitor</span>
        <ConnectionBadge status={connectionStatus} />
        <span>MQTT + WebSocket</span>
      </footer>
    </div>
  );
}
