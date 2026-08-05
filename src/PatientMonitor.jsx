import { useState, useEffect, useRef } from "react";
import EcgWaveform from "./components/EcgWaveform.jsx";
import AlarmBanner from "./components/AlarmBanner.jsx";
import AlertDetailPanel from "./components/AlertDetailPanel.jsx";
import ConnectionBadge from "./components/ConnectionBadge.jsx";
import ClinicalAssessment from "./components/ClinicalAssessment.jsx";
import EarlyWarningPanel from "./components/EarlyWarningPanel.jsx";
import PatientStrip from "./components/PatientStrip.jsx";
import VitalGauge from "./components/VitalGauge.jsx";
import useAlarms from "./hooks/useAlarms.js";
import { useTheme } from "./context/ThemeContext.jsx";
import { getPatient } from "./patients.js";

const ALERT_HOLD_MS = 60000;
const HISTORY_LEN = 60;

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
  const [ecgPrediction, setEcgPrediction] = useState(null);
  const [rhythmAnomaly, setRhythmAnomaly] = useState(null);
  const [systemFlags, setSystemFlags] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [rawEcg, setRawEcg] = useState(null);
  const [latchedAlert, setLatchedAlert] = useState(null);

  const vitalHistoryRef = useRef([]);

  const isDark = theme === "dark";
  const shell = isDark ? "bg-black text-slate-100" : "bg-slate-100 text-slate-900";
  const headerBg = isDark ? "bg-[#0a0a0a] border-slate-800" : "bg-white border-slate-200";
  const asideBg = isDark ? "bg-[#050505]" : "bg-white";
  const borderColor = isDark ? "border-slate-800" : "border-slate-200";
  const labelMuted = isDark ? "text-slate-600" : "text-slate-500";
  const accent = isDark ? "text-emerald-400" : "text-emerald-600";

  const [vitalHistory, setVitalHistory] = useState([]);

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
      setEcgPrediction(null);
      setRhythmAnomaly(null);
      setSystemFlags(null);
      setRawEcg(null);
      vitalHistoryRef.current = [];
      setVitalHistory([]);
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
    if (liveEvent.ecg_prediction) setEcgPrediction(liveEvent.ecg_prediction);
    if (liveEvent.rhythm_anomaly != null) setRhythmAnomaly(liveEvent.rhythm_anomaly);
    if (liveEvent.system_flags) setSystemFlags(liveEvent.system_flags);
    if (liveEvent.raw_ecg?.length) setRawEcg(liveEvent.raw_ecg);

    // Ring buffer of the last HISTORY_LEN readings for NEWS2 trend + sparklines.
    const reading = {
      hr: liveEvent.max_bpm ?? null,
      spo2: liveEvent.spo2 ?? null,
      temp: liveEvent.temperature_c ?? null,
      sbp: liveEvent.nibp_sys ?? null,
    };
    const next = [...vitalHistoryRef.current, reading].slice(-HISTORY_LEN);
    vitalHistoryRef.current = next;
    setVitalHistory(next);
  }, [connectionStatus, liveEvent]);

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

  // Highest active alarm priority drives the hospital-style tone/silence machine.
  const activeSeverity = latchedAlert?.severity || (hasData ? severityTag : null);
  const anyVitalAlert = hrAlert || spo2Alert || tempAlert || nibpAlert;
  const alarmPriority =
    activeSeverity === "critical"
      ? "critical"
      : activeSeverity === "watch" || anyVitalAlert
        ? "watch"
        : "none";

  const alarms = useAlarms(alarmPriority, connectionStatus);
  // A gauge pulses only while its alarm is active AND not silenced.
  const gaugeAlarmLive = (isAlert) => isAlert && alarms.audible;
  const signalLost = alarms.priority === "noSignal";

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
          <div className="hidden min-w-0 lg:block">
            <div className={`mb-0.5 text-[9px] uppercase tracking-widest ${labelMuted}`}>Beds</div>
            <PatientStrip activeId={patientId} theme={theme} liveStatus={connectionStatus} />
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
        <section className={`flex min-h-0 min-w-0 flex-[2] flex-col border-b lg:flex-[3] lg:border-b-0 lg:border-r ${borderColor}`}>
          <EcgWaveform rawEcg={rawEcg} hasSignal={hasData} className="h-[150px] shrink-0 sm:h-[170px]" />

          <ClinicalAssessment
            hasData={hasData}
            severity={latchedAlert?.severity || severityTag}
            confidence={confidence}
            rhythmStatus={arrhythmia}
            ecgPrediction={ecgPrediction}
            rhythmAnomaly={rhythmAnomaly}
            systemFlags={systemFlags}
            summary={summaryText}
            recommendedAction={recommendedAction}
            assessmentSource={assessmentSource}
            readingTimestamp={liveEvent?.timestamp}
            theme={theme}
            className="shrink-0"
          />

          <div className={`min-h-0 flex-1 overflow-y-auto border-t ${borderColor}`}>
            <EarlyWarningPanel
              vitals={{ spo2, temp, hr: heartRate, sbp: nibpSys }}
              history={vitalHistory}
              theme={theme}
            />
          </div>
        </section>

        <aside className={`grid w-full shrink-0 grid-cols-2 gap-0 lg:flex lg:w-56 lg:flex-col xl:w-64 ${asideBg}`}>
          <VitalGauge
            label="HR"
            value={hasData ? heartRate : null}
            displayValue={hasData ? heartRate : null}
            unit="bpm"
            min={40}
            max={160}
            alert={hrAlert}
            alarmActive={gaugeAlarmLive(hrAlert)}
            history={vitalHistory.map((r) => r.hr).filter((v) => v != null)}
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
            alarmActive={gaugeAlarmLive(spo2Alert)}
            history={vitalHistory.map((r) => r.spo2).filter((v) => v != null)}
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
            alarmActive={gaugeAlarmLive(nibpAlert)}
            history={vitalHistory.map((r) => r.sbp).filter((v) => v != null)}
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
            alarmActive={gaugeAlarmLive(tempAlert)}
            history={vitalHistory.map((r) => r.temp).filter((v) => v != null)}
            strokeColor="#fcd34d"
            theme={theme}
          />

          <div className={`col-span-2 mt-auto border-t p-2 lg:col-span-1 ${borderColor}`}>
            <button
              type="button"
              onClick={alarms.acknowledge}
              disabled={alarms.disabled}
              className={`w-full border px-2 py-2 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                alarms.active && !alarms.isSilenced
                  ? "border-red-600 bg-red-600 text-black hover:bg-red-500"
                  : alarms.isSilenced
                    ? isDark
                      ? "border-amber-700 bg-amber-950/40 text-amber-400"
                      : "border-amber-400 bg-amber-50 text-amber-700"
                    : isDark
                      ? "border-slate-800 bg-black text-slate-600"
                      : "border-slate-200 bg-slate-50 text-slate-400"
              } ${alarms.disabled ? "cursor-default" : "cursor-pointer"}`}
            >
              {alarms.label}
            </button>
          </div>
        </aside>
      </main>
    </div>
  );
}
