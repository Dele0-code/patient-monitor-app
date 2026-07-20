import { useState, useEffect, useRef, useCallback } from "react";
import EcgWaveform from "./components/EcgWaveform.jsx";
import AlarmBanner from "./components/AlarmBanner.jsx";
import ConnectionBadge from "./components/ConnectionBadge.jsx";
import ClinicalAssessment from "./components/ClinicalAssessment.jsx";
import VitalGauge from "./components/VitalGauge.jsx";
import { useTheme } from "./context/ThemeContext.jsx";
import { getPatient } from "./patients.js";

const NO_SIGNAL = "— — —";

export default function PatientMonitor({ patientId, liveEvent, connectionStatus }) {
  const { theme, toggleTheme } = useTheme();
  const patientMeta = getPatient(patientId);
  const hasData = liveEvent != null && connectionStatus !== "offline";
  const isLiveFeed = connectionStatus === "live";

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
  const [systemFlags, setSystemFlags] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [rawEcg, setRawEcg] = useState(null);

  const audioCtxRef = useRef(null);
  const audioEnabledRef = useRef(audioEnabled);

  const isDark = theme === "dark";
  const shell = isDark ? "bg-black text-slate-100" : "bg-slate-100 text-slate-900";
  const headerBg = isDark ? "bg-[#0a0a0a] border-slate-800" : "bg-white border-slate-200";
  const asideBg = isDark ? "bg-[#050505]" : "bg-white";
  const borderColor = isDark ? "border-slate-800" : "border-slate-200";
  const labelMuted = isDark ? "text-slate-600" : "text-slate-500";
  const accent = isDark ? "text-emerald-400" : "text-emerald-600";

  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);

  useEffect(() => {
    const clock = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    if (!liveEvent) return;
    if (connectionStatus === "offline") {
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
      setSystemFlags(null);
      setRawEcg(null);
      return;
    }

    setHeartRate(liveEvent.max_bpm ?? null);
    setSpo2(liveEvent.spo2 ?? null);
    setTemp(liveEvent.temperature_c ?? null);
    setNibpSys(liveEvent.nibp_sys ?? null);
    setNibpDia(liveEvent.nibp_dia ?? null);
    setArrhythmia(liveEvent.rhythm_status ?? null);
    if (liveEvent.summary) setSummaryText(liveEvent.summary);
    if (liveEvent.recommended_action) setRecommendedAction(liveEvent.recommended_action);
    if (liveEvent.severity) setSeverityTag(liveEvent.severity);
    if (liveEvent.confidence != null) setConfidence(liveEvent.confidence);
    if (liveEvent.assessment_source) setAssessmentSource(liveEvent.assessment_source);
    if (liveEvent.system_flags) setSystemFlags(liveEvent.system_flags);
    if (liveEvent.raw_ecg?.length) setRawEcg(liveEvent.raw_ecg);
  }, [connectionStatus, liveEvent]);

  const triggerBeep = useCallback((freq, duration, volume = 0.05) => {
    if (!audioEnabledRef.current) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!audioCtxRef.current && AudioContext) audioCtxRef.current = new AudioContext();
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
      // Audio unavailable on kiosk
    }
  }, []);

  useEffect(() => {
    if (!hasData || severityTag !== "critical") return undefined;
    const interval = setInterval(() => {
      triggerBeep(880, 0.1, 0.08);
      setTimeout(() => triggerBeep(880, 0.1, 0.08), 150);
    }, 2000);
    return () => clearInterval(interval);
  }, [hasData, severityTag, triggerBeep]);

  const hrAlert = hasData && heartRate != null && (heartRate > 110 || heartRate < 52);
  const spo2Alert = hasData && spo2 != null && spo2 < 92;
  const tempAlert = hasData && temp != null && (temp > 38.0 || temp < 35.5);
  const nibpAlert =
    hasData && nibpSys != null && nibpDia != null && (nibpSys > 140 || nibpSys < 90 || nibpDia > 90 || nibpDia < 55);

  const nibpGaugeValue = hasData && nibpSys != null ? nibpSys : null;
  const nibpDisplay = !hasData || nibpSys == null || nibpDia == null ? null : `${nibpSys}/${nibpDia}`;

  const displayName = liveEvent?.full_name || patientMeta?.full_name || "Adedayo Segun";
  const room = liveEvent?.room || patientMeta?.room;
  const bed = liveEvent?.bed_number || patientMeta?.bed_number;
  const location =
    room && room !== "—" && bed && bed !== "—" ? `${room} / ${bed}` : patientMeta?.ward || "ICU";

  return (
    <div className={`flex h-full flex-col font-mono ${shell}`}>
      <AlarmBanner severity={hasData ? severityTag : null} systemFlags={systemFlags} />

      <header className={`flex shrink-0 items-center justify-between gap-4 border-b px-3 py-1.5 ${headerBg}`}>
        <div className="flex min-w-0 items-center gap-4">
          <div className="min-w-0">
            <div className={`text-[9px] uppercase tracking-widest ${labelMuted}`}>Patient</div>
            <div className={`truncate text-lg font-bold ${accent}`}>{displayName}</div>
          </div>
          <div className="hidden shrink-0 sm:block">
            <div className={`text-[9px] uppercase tracking-widest ${labelMuted}`}>ID</div>
            <div className={`text-sm font-bold ${isDark ? "text-slate-400" : "text-slate-600"}`}>{patientId}</div>
          </div>
          <div className="hidden shrink-0 md:block">
            <div className={`text-[9px] uppercase tracking-widest ${labelMuted}`}>Location</div>
            <div className={`text-sm font-bold ${isDark ? "text-slate-300" : "text-slate-700"}`}>{location}</div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={toggleTheme}
            className={`border px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${
              isDark
                ? "border-slate-700 text-slate-400 hover:border-slate-500"
                : "border-slate-300 text-slate-600 hover:border-slate-400"
            }`}
          >
            {isDark ? "Light" : "Dark"}
          </button>
          <ConnectionBadge status={isLiveFeed ? connectionStatus : "connecting"} />
          <div className="text-right">
            <div className={`text-lg font-bold tabular-nums tracking-wider ${accent}`}>
              {currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </div>
            <div className={`text-[10px] tabular-nums ${labelMuted}`}>
              {currentTime.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" })}
            </div>
          </div>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className={`flex min-h-0 min-w-0 flex-[3] flex-col border-b lg:border-b-0 lg:border-r ${borderColor}`}>
          <EcgWaveform rawEcg={rawEcg} hasSignal={hasData} theme={theme} className="min-h-[180px] flex-1" />

          <ClinicalAssessment
            hasData={hasData}
            severity={severityTag}
            confidence={confidence}
            rhythmStatus={arrhythmia}
            systemFlags={systemFlags}
            summary={summaryText}
            recommendedAction={recommendedAction}
            assessmentSource={assessmentSource}
            theme={theme}
          />
        </section>

        <aside className={`grid w-full shrink-0 grid-cols-2 gap-0 lg:flex lg:w-52 lg:flex-col xl:w-60 ${asideBg}`}>
          <VitalGauge
            label="HR"
            value={hasData ? heartRate : null}
            displayValue={hasData ? heartRate : null}
            unit="bpm"
            min={40}
            max={160}
            alert={hrAlert}
            strokeColor="#34d399"
            theme={theme}
          />
          <VitalGauge
            label="SpO₂"
            value={hasData ? spo2 : null}
            displayValue={hasData ? spo2 : null}
            unit="%"
            min={80}
            max={100}
            alert={spo2Alert}
            strokeColor="#38bdf8"
            theme={theme}
          />
          <VitalGauge
            label="NIBP"
            value={nibpGaugeValue}
            displayValue={nibpDisplay}
            unit="mmHg"
            min={60}
            max={180}
            alert={nibpAlert}
            strokeColor="#f9a8d4"
            theme={theme}
          />
          <VitalGauge
            label="TEMP"
            value={hasData && temp != null ? temp : null}
            displayValue={hasData && temp != null ? temp.toFixed(1) : null}
            unit="°C"
            min={35}
            max={40}
            alert={tempAlert}
            strokeColor="#fcd34d"
            theme={theme}
          />

          <div className={`col-span-2 mt-auto border-t p-2 lg:col-span-1 ${borderColor}`}>
            <button
              type="button"
              onClick={() => setAudioEnabled((v) => !v)}
              className={`w-full border px-2 py-2 text-[10px] font-bold uppercase tracking-widest ${
                isDark
                  ? "border-slate-700 bg-black text-slate-400 hover:border-slate-500"
                  : "border-slate-300 bg-slate-50 text-slate-600 hover:border-slate-400"
              }`}
            >
              {audioEnabled ? "Mute Alarms" : "Alarms Muted"}
            </button>
          </div>
        </aside>
      </main>
    </div>
  );
}
