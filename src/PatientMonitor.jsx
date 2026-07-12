import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import EcgWaveform from "./components/EcgWaveform.jsx";
import { getPatient, isLivePatient } from "./patients.js";

const DEMO_TELEMETRY = {
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
  summary: "Stable simulated vitals. Use for training and demonstration.",
  severity: "stable",
};

function VitalCard({ label, value, unit, alert, color = "emerald" }) {
  const colorMap = {
    emerald: "text-emerald-400",
    cyan: "text-cyan-400",
    fuchsia: "text-fuchsia-400",
  };

  return (
    <div
      className={`flex flex-col justify-between rounded-xl border p-4 shadow-lg transition-all ${
        alert ? "border-red-500 bg-red-950/20" : "border-slate-800 bg-slate-900"
      }`}
    >
      <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className={`text-5xl font-extrabold tracking-tight ${alert ? "animate-pulse text-red-500" : colorMap[color]}`}>
          {value}
        </span>
        {unit && <span className={`text-sm font-semibold ${colorMap[color]}`}>{unit}</span>}
      </div>
    </div>
  );
}

export default function PatientMonitor({ patientId, latest, liveEvent, wsConnected }) {
  const navigate = useNavigate();
  const live = isLivePatient(patientId);
  const patientMeta = getPatient(patientId);

  const [heartRate, setHeartRate] = useState(72);
  const [spo2, setSpo2] = useState(98);
  const [temp, setTemp] = useState(36.8);
  const [nibpSys, setNibpSys] = useState(120);
  const [nibpDia, setNibpDia] = useState(80);
  const [arrhythmia, setArrhythmia] = useState("Normal Sinus Rhythm");
  const [summaryText, setSummaryText] = useState("Monitoring in progress.");
  const [recommendedAction, setRecommendedAction] = useState("");
  const [severityTag, setSeverityTag] = useState("stable");
  const [alarmActive, setAlarmActive] = useState(false);
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
    const source = live && liveEvent ? liveEvent : latest || (live ? null : DEMO_TELEMETRY);
    if (!source) return;

    setHeartRate(source.max_bpm ?? 72);
    setSpo2(source.spo2 ?? 98);
    setTemp(source.temperature_c ?? 36.8);
    setArrhythmia(source.rhythm_status || "Normal Sinus Rhythm");
    setSummaryText(source.summary || "Monitoring in progress.");
    setRecommendedAction(source.recommended_action || "");
    setSeverityTag(source.severity || "stable");

    if (source.nibp_sys != null) setNibpSys(source.nibp_sys);
    if (source.nibp_dia != null) setNibpDia(source.nibp_dia);

    if (source.severity === "critical") {
      setAlarmActive(true);
    } else if (!live || liveEvent) {
      setAlarmActive(source.severity === "critical");
    }
  }, [latest, liveEvent, live]);

  useEffect(() => {
    if (!liveEvent?.raw_ecg?.length) return;
    setRawEcg(liveEvent.raw_ecg);
  }, [liveEvent]);

  useEffect(() => {
    if (live) return undefined;

    const interval = setInterval(() => {
      setHeartRate((prev) => Math.min(90, Math.max(60, prev + Math.round(Math.random() * 4 - 2))));
      setSpo2((prev) => Math.min(100, Math.max(96, prev + (Math.random() > 0.7 ? (Math.random() > 0.5 ? 1 : -1) : 0))));
      setTemp((prev) => Math.min(37.4, Math.max(36.2, parseFloat((prev + (Math.random() * 0.1 - 0.05)).toFixed(1)))));
    }, 2000);

    return () => clearInterval(interval);
  }, [live]);

  useEffect(() => {
    if (!alarmActive) return undefined;
    const interval = setInterval(() => {
      triggerBeep(880, 0.1, 0.08);
      setTimeout(() => triggerBeep(880, 0.1, 0.08), 150);
    }, 1000);
    return () => clearInterval(interval);
  }, [alarmActive, triggerBeep]);

  const hrAlert = heartRate > 100 || heartRate < 55;
  const spo2Alert = spo2 < 95;
  const tempAlert = temp > 37.8 || temp < 35.8;
  const rhythmAlert = !arrhythmia.toLowerCase().includes("normal");
  const nibpDisplay = live && (!nibpSys || !nibpDia) ? "—/—" : `${nibpSys}/${nibpDia}`;

  const severityColors = {
    stable: "bg-emerald-500 text-slate-950",
    watch: "bg-amber-500 text-slate-950",
    critical: "bg-red-500 text-white",
  };

  const displayName = latest?.full_name || patientMeta?.full_name || `Patient ${patientId}`;
  const room = latest?.room || patientMeta?.room || "—";
  const bed = latest?.bed_number || patientMeta?.bed_number || "—";

  return (
    <div
      className={`flex min-h-screen flex-col bg-slate-950 font-mono text-slate-100 ${
        alarmActive ? "ring-4 ring-red-600" : ""
      }`}
    >
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
            <div className="text-lg font-bold text-rose-400">
              {room} / {bed}
            </div>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
              live ? "bg-cyan-500 text-slate-950" : "bg-slate-700 text-slate-200"
            }`}
          >
            {live ? "Live Patient" : "Demo Data"}
          </span>
          <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${severityColors[severityTag] || severityColors.watch}`}>
            {severityTag}
          </span>
        </div>

        <div className="flex items-center gap-4">
          {alarmActive && (
            <div className="animate-pulse rounded bg-red-600 px-4 py-2 text-sm font-bold text-black">
              CRITICAL ALERT
            </div>
          )}
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
              <span className="text-[10px] uppercase text-slate-500">
                {live ? (wsConnected ? "Receiving live waveform" : "Waiting for ESP32...") : "Simulated waveform"}
              </span>
            </div>
            <EcgWaveform
              mode={live ? "live" : "synthetic"}
              heartRate={heartRate}
              rawEcg={rawEcg}
              className="min-h-[220px] flex-1 lg:min-h-[280px]"
            />
            <div className="mt-2 flex justify-end">
              <div className="rounded border border-slate-800 bg-black/60 px-4 py-2 text-right">
                <div className="text-[10px] font-bold uppercase text-emerald-600">Heart Rate</div>
                <div className={`text-5xl font-extrabold ${hrAlert ? "text-red-500" : "text-emerald-400"}`}>
                  {heartRate}
                  <span className="ml-1 text-sm text-slate-500">bpm</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <VitalCard label="SpO₂" value={spo2} unit="%" alert={spo2Alert} />
            <VitalCard label="Temperature" value={temp.toFixed(1)} unit="°C" alert={tempAlert} color="cyan" />
            <VitalCard label="NIBP" value={nibpDisplay} unit="mmHg" alert={false} color="fuchsia" />
            <div
              className={`rounded-xl border p-4 ${
                rhythmAlert ? "border-red-500 bg-red-950/20" : "border-slate-800 bg-slate-900"
              }`}
            >
              <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Rhythm</div>
              <div className={`mt-2 text-lg font-bold uppercase ${rhythmAlert ? "text-red-400" : "text-emerald-400"}`}>
                {arrhythmia}
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-1 flex-col gap-3">
          <div className="flex-1 rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-3 border-b border-slate-800 pb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              Clinical Assessment
            </h2>
            <p className="text-sm leading-relaxed text-slate-200">{summaryText}</p>
            {recommendedAction && (
              <p className="mt-3 rounded border border-cyan-900/40 bg-cyan-950/20 p-3 text-sm text-cyan-200">
                {recommendedAction}
              </p>
            )}
            {live && liveEvent?.system_flags && liveEvent.system_flags !== "Stable" && (
              <p className="mt-3 text-sm font-bold text-amber-400">{liveEvent.system_flags}</p>
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
              {alarmActive && (
                <button
                  type="button"
                  onClick={() => setAlarmActive(false)}
                  className="rounded-lg border border-emerald-700 bg-emerald-800 px-3 py-3 text-xs font-semibold uppercase text-white"
                >
                  Clear Alarm
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate("/")}
                className="col-span-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-sm font-semibold hover:border-emerald-600"
              >
                Switch Patient
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="flex items-center justify-between border-t border-slate-800 bg-slate-900 px-4 py-2 text-[11px] uppercase tracking-wider text-slate-500">
        <span>Patient Monitor v1.0</span>
        <span className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${wsConnected ? "bg-emerald-400" : live ? "bg-red-500 animate-pulse" : "bg-slate-600"}`} />
          {live ? (wsConnected ? "MQTT Connected" : "Waiting for telemetry...") : "Demo Mode"}
        </span>
        <span>{live ? "Backend + MQTT" : "Local Simulation"}</span>
      </footer>
    </div>
  );
}
