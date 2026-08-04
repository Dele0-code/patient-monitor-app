import { useState, useEffect, useRef } from "react";
import EcgWaveform from "./components/EcgWaveform.jsx";
import AlarmBanner from "./components/AlarmBanner.jsx";
import AlertDetailPanel from "./components/AlertDetailPanel.jsx";
import ConnectionBadge from "./components/ConnectionBadge.jsx";
import ClinicalAssessment from "./components/ClinicalAssessment.jsx";
import VitalGauge from "./components/VitalGauge.jsx";
import { useTheme } from "./context/ThemeContext.jsx";
import { getPatient } from "./patients.js";
import { playAlarm, setMuted, unlockAudio, ALARM_PERIOD_MS } from "./alarm.js";

const ALERT_HOLD_MS = 60000;
// If we have had telemetry but no packet arrives for this long, treat the feed as lost
// and raise a technical (signal-loss) alarm. Packets normally arrive ~1 Hz.
const DATA_STALL_MS = 8000;

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
  const [trend, setTrend] = useState(null);
  const [monitoringFocus, setMonitoringFocus] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [rawEcg, setRawEcg] = useState(null);
  const [latchedAlert, setLatchedAlert] = useState(null);
  const [signalLost, setSignalLost] = useState(false);

  const lastPacketAtRef = useRef(null);

  const isDark = theme === "dark";
  const shell = isDark ? "bg-black text-slate-100" : "bg-slate-100 text-slate-900";
  const headerBg = isDark ? "bg-[#0a0a0a] border-slate-800" : "bg-white border-slate-200";
  const asideBg = isDark ? "bg-[#050505]" : "bg-white";
  const borderColor = isDark ? "border-slate-800" : "border-slate-200";
  const labelMuted = isDark ? "text-slate-600" : "text-slate-500";
  const accent = isDark ? "text-emerald-400" : "text-emerald-600";

  // Route the Mute button through the shared alarm engine (single-point mute).
  useEffect(() => {
    setMuted(!audioEnabled);
  }, [audioEnabled]);

  // Browsers keep the AudioContext suspended until a user gesture — unlock on first interaction.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

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
    if (liveEvent.trend) setTrend(liveEvent.trend);
    if (liveEvent.monitoring_focus) setMonitoringFocus(liveEvent.monitoring_focus);
    if (liveEvent.raw_ecg?.length) setRawEcg(liveEvent.raw_ecg);

    // A fresh packet arrived — remember when, and clear any signal-loss alarm.
    lastPacketAtRef.current = Date.now();
    setSignalLost(false);
  }, [connectionStatus, liveEvent]);

  // Data-loss watchdog: once we've received telemetry, raise a technical alarm if the
  // feed goes quiet (no packets for DATA_STALL_MS) or the socket drops entirely.
  useEffect(() => {
    const check = setInterval(() => {
      const last = lastPacketAtRef.current;
      if (last == null) return; // never had data yet — nothing to lose
      const stalled = Date.now() - last > DATA_STALL_MS;
      const dropped = connectionStatus === "offline";
      setSignalLost(stalled || dropped);
    }, 1000);
    return () => clearInterval(check);
  }, [connectionStatus]);

  const hrAlertInstant = hasData && heartRate != null && (heartRate > 110 || heartRate < 52);
  const spo2AlertInstant = hasData && spo2 != null && spo2 < 92;
  const tempAlertInstant = hasData && temp != null && (temp > 38.0 || temp < 35.5);
  const nibpAlertInstant =
    hasData && nibpSys != null && nibpDia != null && (nibpSys > 140 || nibpSys < 90 || nibpDia > 90 || nibpDia < 55);
  const rhythmAlertInstant =
    hasData && arrhythmia && !String(arrhythmia).toLowerCase().includes("normal");

  useEffect(() => {
    if (!hasData) return;

    const messages = [];
    if (heartRate != null && heartRate > 110) messages.push(`Tachycardia — HR ${heartRate} bpm`);
    else if (heartRate != null && heartRate < 52) messages.push(`Bradycardia — HR ${heartRate} bpm`);
    if (spo2 != null && spo2 < 92) messages.push(`Hypoxemia — SpO₂ ${spo2}%`);
    if (temp != null && temp > 38.0) messages.push(`Pyrexia — ${temp.toFixed(1)}°C`);
    else if (temp != null && temp < 35.5) messages.push(`Hypothermia — ${temp.toFixed(1)}°C`);
    if (rhythmAlertInstant) messages.push(String(arrhythmia));
    if (systemFlags && systemFlags !== "Stable" && !messages.some((m) => m.includes(systemFlags))) {
      messages.push(systemFlags);
    }

    const hasIssue = messages.length > 0 || severityTag === "watch" || severityTag === "critical";
    if (!hasIssue) return;

    const now = Date.now();
    const severity =
      severityTag === "critical" ? "critical" : severityTag === "watch" || messages.length ? "watch" : "stable";

    setLatchedAlert((prev) => {
      const rank = { stable: 0, watch: 1, critical: 2 };
      const shouldReplace =
        !prev ||
        rank[severity] > rank[prev.severity] ||
        messages.join("|") !== prev.messages.join("|");

      if (!shouldReplace) return prev;

      return {
        severity,
        messages:
          messages.length > 0
            ? messages
            : [severityTag === "critical" ? "Critical vital signs detected" : "Clinical watch — review patient"],
        detail: `HR ${heartRate ?? "—"} bpm · SpO₂ ${spo2 ?? "—"}% · Temp ${temp != null ? temp.toFixed(1) : "—"}°C`,
        flaggedAt: new Date(),
        expiresAt: new Date(now + ALERT_HOLD_MS),
        expiresAtMs: now + ALERT_HOLD_MS,
      };
    });
  }, [hasData, heartRate, spo2, temp, arrhythmia, systemFlags, severityTag, rhythmAlertInstant]);

  useEffect(() => {
    if (!latchedAlert) return undefined;
    const remaining = latchedAlert.expiresAtMs - Date.now();
    if (remaining <= 0) {
      setLatchedAlert(null);
      return undefined;
    }
    const timer = setTimeout(() => setLatchedAlert(null), remaining);
    return () => clearTimeout(timer);
  }, [latchedAlert]);

  const hrAlert =
    hrAlertInstant ||
    Boolean(latchedAlert?.messages.some((m) => /tachycardia|bradycardia|HR/i.test(m)));
  const spo2Alert =
    spo2AlertInstant || Boolean(latchedAlert?.messages.some((m) => /hypoxemia|SpO₂/i.test(m)));
  const tempAlert =
    tempAlertInstant || Boolean(latchedAlert?.messages.some((m) => /pyrexia|hypothermia|°C/i.test(m)));
  const nibpAlert = nibpAlertInstant;

  // Which audible alarm should be sounding right now. Priority: technical signal-loss
  // (something is wrong with the monitor itself) > critical patient alarm > watch.
  const activeSeverity = latchedAlert?.severity || severityTag;
  const alarmKind = signalLost
    ? "signal-loss"
    : hasData && activeSeverity === "critical"
    ? "critical"
    : hasData && activeSeverity === "watch"
    ? "watch"
    : null;

  useEffect(() => {
    if (!alarmKind) return undefined;
    playAlarm(alarmKind); // sound immediately, then repeat on the kind's cadence
    const period = ALARM_PERIOD_MS[alarmKind] || 1500;
    const interval = setInterval(() => playAlarm(alarmKind), period);
    return () => clearInterval(interval);
  }, [alarmKind]);

  const nibpGaugeValue = hasData && nibpSys != null ? nibpSys : null;
  const nibpDisplay = !hasData || nibpSys == null || nibpDia == null ? null : `${nibpSys}/${nibpDia}`;

  const displayName = liveEvent?.full_name || patientMeta?.full_name || "Adedayo Segun";
  const room = liveEvent?.room || patientMeta?.room;
  const bed = liveEvent?.bed_number || patientMeta?.bed_number;
  const location =
    room && room !== "—" && bed && bed !== "—" ? `${room} / ${bed}` : patientMeta?.ward || "ICU";

  return (
    <div className={`flex h-full flex-col font-mono ${shell}`}>
      <AlarmBanner
        severity={hasData ? severityTag : null}
        systemFlags={systemFlags}
        latchedSeverity={latchedAlert?.severity}
        signalLost={signalLost}
      />
      <AlertDetailPanel alert={latchedAlert} theme={theme} />

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
          <EcgWaveform
            rawEcg={rawEcg}
            hasSignal={hasData}
            theme={theme}
            className="h-[32vh] max-h-[330px] min-h-[160px] shrink-0"
          />

          <ClinicalAssessment
            hasData={hasData}
            severity={latchedAlert?.severity || severityTag}
            confidence={confidence}
            rhythmStatus={arrhythmia}
            systemFlags={systemFlags}
            summary={summaryText}
            recommendedAction={recommendedAction}
            assessmentSource={assessmentSource}
            trend={trend}
            monitoringFocus={monitoringFocus}
            theme={theme}
          />
        </section>

        <aside className={`grid w-full shrink-0 grid-cols-2 gap-0 lg:flex lg:w-64 lg:flex-col xl:w-72 ${asideBg}`}>
          <VitalGauge
            label="HR"
            value={hasData ? heartRate : null}
            displayValue={hasData ? heartRate : null}
            unit="bpm"
            min={40}
            max={160}
            alert={hrAlert}
            strokeColor="#34d399"
            size={128}
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
            size={128}
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
            size={128}
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
            size={128}
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
