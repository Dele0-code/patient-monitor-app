import { useState, useEffect, useRef, useCallback } from "react";
import EcgWaveform from "./components/EcgWaveform.jsx";
import AlarmBanner from "./components/AlarmBanner.jsx";
import ConnectionBadge from "./components/ConnectionBadge.jsx";
import ClinicalAssessment from "./components/ClinicalAssessment.jsx";
import { getPatient } from "./patients.js";

const NO_SIGNAL = "— — —";

function VitalBlock({ label, value, unit, alert, color = "text-emerald-400", large = false }) {
  const hasValue = value !== null && value !== undefined && value !== NO_SIGNAL;

  return (
    <div
      className={`flex flex-col justify-between border-b border-slate-800 px-3 py-2 ${
        alert ? "animate-pulse bg-red-950/40" : ""
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-[11px] font-bold uppercase tracking-widest ${alert ? "text-red-400" : "text-slate-500"}`}>
          {label}
        </span>
        {unit && hasValue && (
          <span className={`text-[10px] font-semibold uppercase ${alert ? "text-red-400" : color}`}>{unit}</span>
        )}
      </div>
      <div className={`mt-0.5 font-bold leading-none tracking-tight ${alert ? "text-red-400" : color} ${large ? "text-6xl" : "text-4xl"}`}>
        {hasValue ? value : <span className="text-2xl tracking-widest text-slate-600">{NO_SIGNAL}</span>}
      </div>
    </div>
  );
}

export default function PatientMonitor({ patientId, liveEvent, connectionStatus }) {
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
  const [confidence, setConfidence] = useState(null);
  const [assessmentSource, setAssessmentSource] = useState(null);
  const [telemetrySource, setTelemetrySource] = useState(null);
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
      setConfidence(null);
      setAssessmentSource(null);
      setTelemetrySource(null);
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
    setConfidence(liveEvent.confidence ?? null);
    setAssessmentSource(liveEvent.assessment_source ?? null);
    setTelemetrySource(liveEvent.telemetry_source ?? null);
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

  const hrAlert = hasData && heartRate != null && (heartRate > 100 || heartRate < 55);
  const spo2Alert = hasData && spo2 != null && spo2 < 95;
  const tempAlert = hasData && temp != null && (temp > 37.8 || temp < 35.8);
  const nibpAlert =
    hasData &&
    nibpSys != null &&
    nibpDia != null &&
    (nibpSys > 140 || nibpSys < 90 || nibpDia > 90 || nibpDia < 55);

  const nibpDisplay =
    !hasData || nibpSys == null || nibpDia == null ? NO_SIGNAL : `${nibpSys}/${nibpDia}`;

  const displayName = liveEvent?.full_name || patientMeta?.full_name || "Adedayo Segun";
  const room = liveEvent?.room || patientMeta?.room;
  const bed = liveEvent?.bed_number || patientMeta?.bed_number;
  const location =
    room && room !== "—" && bed && bed !== "—"
      ? `${room} / ${bed}`
      : patientMeta?.ward || "Bedside";

  const isDemoData = hasData && telemetrySource === "simulator";

  return (
    <div className="flex h-full flex-col bg-black font-mono text-slate-100">
      <AlarmBanner severity={hasData ? severityTag : null} systemFlags={systemFlags} />
      {isDemoData && (
        <div className="bg-amber-600 px-3 py-1 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-black">
          Demo mode — ESP32 not connected · simulated vitals updating every second
        </div>
      )}

      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-800 bg-[#0a0a0a] px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-4">
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-widest text-slate-600">Patient</div>
            <div className="truncate text-lg font-bold text-emerald-400">{displayName}</div>
          </div>
          <div className="hidden shrink-0 sm:block">
            <div className="text-[9px] uppercase tracking-widest text-slate-600">ID</div>
            <div className="text-sm font-bold text-slate-400">{patientId}</div>
          </div>
          <div className="hidden shrink-0 md:block">
            <div className="text-[9px] uppercase tracking-widest text-slate-600">Location</div>
            <div className="text-sm font-bold text-slate-300">{location}</div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-5">
          <ConnectionBadge status={connectionStatus} demoMode={isDemoData} />
          <div className="text-right">
            <div className="text-lg font-bold tabular-nums tracking-wider text-emerald-400">
              {currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </div>
            <div className="text-[10px] tabular-nums text-slate-500">
              {currentTime.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" })}
            </div>
          </div>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="flex min-h-0 min-w-0 flex-[3] flex-col border-b border-slate-800 lg:border-b-0 lg:border-r">
          <EcgWaveform rawEcg={rawEcg} hasSignal={hasData} className="min-h-[180px] flex-1" />

          <ClinicalAssessment
            hasData={hasData}
            severity={severityTag}
            confidence={confidence}
            rhythmStatus={arrhythmia}
            systemFlags={systemFlags}
            summary={summaryText}
            recommendedAction={recommendedAction}
            assessmentSource={assessmentSource}
          />
        </section>

        <aside className="flex w-full shrink-0 flex-col bg-[#050505] lg:w-56 xl:w-64">
          <VitalBlock
            label="HR"
            value={hasData ? heartRate : NO_SIGNAL}
            unit="bpm"
            alert={hrAlert}
            color="text-emerald-400"
            large
          />
          <VitalBlock
            label="SpO₂"
            value={hasData ? spo2 : NO_SIGNAL}
            unit="%"
            alert={spo2Alert}
            color="text-sky-400"
          />
          <VitalBlock
            label="NIBP"
            value={nibpDisplay}
            unit="mmHg"
            alert={nibpAlert}
            color="text-rose-300"
          />
          <VitalBlock
            label="TEMP"
            value={hasData && temp != null ? temp.toFixed(1) : NO_SIGNAL}
            unit="°C"
            alert={tempAlert}
            color="text-amber-300"
          />

          <div className="mt-auto border-t border-slate-800 p-2">
            <button
              type="button"
              onClick={() => setAudioEnabled((v) => !v)}
              className="w-full border border-slate-700 bg-black px-2 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:border-slate-500 hover:text-slate-200"
            >
              {audioEnabled ? "Mute Alarms" : "Alarms Muted"}
            </button>
          </div>
        </aside>
      </main>
    </div>
  );
}
