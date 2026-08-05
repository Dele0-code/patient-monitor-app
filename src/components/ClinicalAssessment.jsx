const SEVERITY_STYLE = {
  critical: {
    label: "CRITICAL",
    badge: "border-red-500 bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400",
    bar: "bg-red-600",
  },
  watch: {
    label: "WATCH",
    badge: "border-amber-500 bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    bar: "bg-amber-500",
  },
  stable: {
    label: "STABLE",
    badge: "border-emerald-600 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
    bar: "bg-emerald-500",
  },
};

const SOURCE_LABEL = {
  llm: "AI CLINICAL ENGINE",
  llm_cached: "AI (RECENT)",
  rules: "RULE ENGINE",
};

// Direction glyph + colour for a single vital's recent trend. "rising" is not
// inherently bad (that depends on the vital), so colour stays neutral-amber for
// any movement and slate for steady — the monitoring-focus line carries the
// clinical "which way is concerning" judgement.
const TREND_STYLE = {
  rising: { glyph: "▲", cls: "text-amber-600 dark:text-amber-400" },
  falling: { glyph: "▼", cls: "text-amber-600 dark:text-amber-400" },
  steady: { glyph: "▬", cls: "text-slate-400 dark:text-slate-600" },
};

function TrendRow({ label, direction, textMuted }) {
  const t = TREND_STYLE[direction] || TREND_STYLE.steady;
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`uppercase tracking-wider ${textMuted}`}>{label}</span>
      <span className={`font-bold uppercase tabular-nums ${t.cls}`}>
        {t.glyph} {direction || "steady"}
      </span>
    </div>
  );
}

function ConfidenceMeter({ value, theme }) {
  if (value == null || Number.isNaN(Number(value))) {
    return <span className="text-slate-400">—</span>;
  }
  const pct = Math.round(Math.min(1, Math.max(0, Number(value))) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className={`h-2 w-24 overflow-hidden rounded-full ${theme === "light" ? "bg-slate-200" : "bg-slate-800"}`}>
        <div className="h-full bg-cyan-500 transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums font-bold text-cyan-600 dark:text-cyan-300">{pct}%</span>
    </div>
  );
}

function formatReadingTime(timestamp) {
  if (!timestamp) return "—";
  const d = new Date(typeof timestamp === "number" && timestamp < 1e12 ? timestamp : Number(timestamp));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function ClinicalAssessment({
  hasData,
  severity,
  confidence,
  rhythmStatus,
  ecgPrediction,
  rhythmAnomaly,
  systemFlags,
  summary,
  recommendedAction,
  assessmentSource,
  trend,
  readingTimestamp,
  theme = "dark",
  className = "",
}) {
  const style = SEVERITY_STYLE[severity] || SEVERITY_STYLE.stable;
  const sourceLabel = SOURCE_LABEL[assessmentSource] || (hasData ? "ANALYSING…" : "—");
  const isLlm = assessmentSource === "llm" || assessmentSource === "llm_cached";
  const panelBg = theme === "light" ? "bg-slate-50" : "bg-[#050505]";
  const borderColor = theme === "light" ? "border-slate-200" : "border-slate-800";
  const textMuted = theme === "light" ? "text-slate-500" : "text-slate-600";
  const textBody = theme === "light" ? "text-slate-800" : "text-slate-200";

  const cnnLabel =
    ecgPrediction ||
    (rhythmAnomaly === true ? "Anomaly" : rhythmAnomaly === false ? "Normal" : null);
  const cnnIsAnomaly = cnnLabel === "Anomaly" || rhythmAnomaly === true;

  if (!hasData) {
    return (
      <div className={`flex min-h-[140px] items-center justify-center border-t ${borderColor} ${panelBg} px-4 ${className}`}>
        <span className={`text-sm font-bold uppercase tracking-[0.25em] ${textMuted}`}>
          Awaiting telemetry for clinical assessment
        </span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col border-t ${borderColor} ${panelBg} ${className}`}>
      <div className={`h-1 w-full shrink-0 ${style.bar}`} />

      <div className="flex flex-1 flex-col gap-3 px-3 py-2 lg:flex-row lg:gap-4 lg:px-4 lg:py-3">
        <div className="flex shrink-0 flex-col gap-2 lg:w-56">
          <div className="flex items-center justify-between gap-2">
            <div className={`text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>This Reading</div>
            <span className={`tabular-nums text-[10px] ${textMuted}`}>{formatReadingTime(readingTimestamp)}</span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className={`text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>Clinical Status</div>
            <span
              className={`rounded px-2 py-0.5 text-[9px] font-bold tracking-wider ${
                isLlm
                  ? "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
                  : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
              }`}
            >
              {sourceLabel}
            </span>
          </div>

          <div className={`inline-flex w-fit border px-3 py-1.5 text-sm font-bold tracking-widest ${style.badge}`}>
            {style.label}
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className={`uppercase tracking-wider ${textMuted}`}>ECG CNN</span>
              <span
                className={`rounded px-2 py-0.5 font-bold uppercase ${
                  cnnIsAnomaly
                    ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                }`}
              >
                {cnnLabel || "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className={`uppercase tracking-wider ${textMuted}`}>Rhythm</span>
              <span className={`text-right font-bold uppercase ${textMuted}`}>{rhythmStatus || "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className={`uppercase tracking-wider ${textMuted}`}>Vitals Flag</span>
              <span
                className={`font-bold uppercase ${
                  systemFlags && systemFlags !== "Stable" ? "text-amber-600 dark:text-amber-400" : textMuted
                }`}
              >
                {systemFlags || "Stable"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className={`uppercase tracking-wider ${textMuted}`}>AI Confidence</span>
              <ConfidenceMeter value={confidence} theme={theme} />
            </div>
          </div>

          {trend && (
            <div className={`space-y-1.5 border-t pt-2 text-xs ${borderColor}`}>
              <div className={`text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>
                Trend ({trend.window || 0} readings)
              </div>
              <TrendRow label="HR" direction={trend.hr} textMuted={textMuted} />
              <TrendRow label="SpO₂" direction={trend.spo2} textMuted={textMuted} />
              <TrendRow label="Temp" direction={trend.temp} textMuted={textMuted} />
            </div>
          )}
        </div>

        <div className={`flex min-w-0 flex-1 flex-col gap-2 border-t pt-2 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0 ${borderColor}`}>
          {trend?.monitoring_focus && (
            <div className="flex items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1.5 dark:border-sky-900/50 dark:bg-sky-950/20">
              <span className="text-[10px] font-bold uppercase tracking-widest text-sky-700 dark:text-sky-300">
                Monitoring Focus
              </span>
              <span className="text-xs font-semibold text-sky-900 dark:text-sky-200">
                {trend.monitoring_focus}
              </span>
            </div>
          )}
          <div
            className={`rounded-lg border p-2.5 ${
              isLlm
                ? "border-violet-300 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/30"
                : `${borderColor} ${theme === "light" ? "bg-white" : "bg-black/40"}`
            }`}
          >
            <div
              className={`mb-1.5 text-[10px] font-bold uppercase tracking-widest ${
                isLlm ? "text-violet-700 dark:text-violet-300" : textMuted
              }`}
            >
              AI Interpretation (this reading)
            </div>
            <p className={`text-sm leading-relaxed ${textBody}`}>
              {summary || "Analysis in progress — interpretation will appear shortly."}
            </p>
          </div>
          <div>
            <div className={`mb-1 text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>
              Recommended Action
            </div>
            <p className="rounded-lg border border-cyan-300 bg-cyan-50 px-2.5 py-2 text-xs font-semibold leading-relaxed text-cyan-900 dark:border-cyan-900/50 dark:bg-cyan-950/20 dark:text-cyan-200">
              {recommendedAction || "Continue routine bedside monitoring."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
