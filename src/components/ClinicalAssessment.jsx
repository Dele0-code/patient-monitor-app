const SEVERITY_STYLE = {
  critical: {
    label: "CRITICAL",
    accent: "#ef4444",
    ring: "ring-red-500/40",
    glow: "shadow-[0_0_30px_-6px_rgba(239,68,68,0.6)]",
    pill: "bg-red-500 text-white",
    bar: "from-red-600 to-red-400",
    text: "text-red-500",
  },
  watch: {
    label: "WATCH",
    accent: "#f59e0b",
    ring: "ring-amber-500/40",
    glow: "shadow-[0_0_30px_-6px_rgba(245,158,11,0.5)]",
    pill: "bg-amber-500 text-black",
    bar: "from-amber-500 to-amber-300",
    text: "text-amber-500",
  },
  stable: {
    label: "STABLE",
    accent: "#10b981",
    ring: "ring-emerald-500/30",
    glow: "shadow-[0_0_30px_-8px_rgba(16,185,129,0.45)]",
    pill: "bg-emerald-500 text-black",
    bar: "from-emerald-500 to-emerald-300",
    text: "text-emerald-500",
  },
};

const SOURCE_META = {
  llm: { label: "AI ENGINE", live: true },
  llm_cached: { label: "AI ENGINE", live: true },
  rules: { label: "RULE ENGINE", live: false },
};

const TREND_META = {
  improving: { label: "IMPROVING", color: "#10b981", glyph: "M5 15l7-7 7 7" },
  worsening: { label: "WORSENING", color: "#ef4444", glyph: "M5 9l7 7 7-7" },
  stable: { label: "STEADY", color: "#64748b", glyph: "M5 12h14" },
};

function TrendBadge({ trend, theme }) {
  const meta = TREND_META[trend];
  if (!meta) return null;
  const base = theme === "light" ? "bg-white border-slate-200" : "bg-black/40 border-slate-800";
  return (
    <div className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 ${base}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={meta.color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d={meta.glyph} />
      </svg>
      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: meta.color }}>
        {meta.label}
      </span>
    </div>
  );
}

function ConfidenceMeter({ value, accent, theme }) {
  if (value == null || Number.isNaN(Number(value))) {
    return <span className="text-slate-500">—</span>;
  }
  const pct = Math.round(Math.min(1, Math.max(0, Number(value))) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className={`h-2.5 w-28 overflow-hidden rounded-full ${theme === "light" ? "bg-slate-200" : "bg-slate-800"}`}>
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, background: accent }}
        />
      </div>
      <span className="tabular-nums text-sm font-bold" style={{ color: accent }}>{pct}%</span>
    </div>
  );
}

function Chip({ label, value, alert, theme }) {
  const base = theme === "light" ? "border-slate-200 bg-white" : "border-slate-800 bg-black/40";
  return (
    <div className={`flex flex-col gap-1 rounded-lg border px-3 py-2 ${base}`}>
      <span className={`text-[10px] font-bold uppercase tracking-widest ${theme === "light" ? "text-slate-500" : "text-slate-500"}`}>
        {label}
      </span>
      <span className={`text-sm font-bold uppercase ${alert ? "text-red-500" : theme === "light" ? "text-slate-800" : "text-slate-200"}`}>
        {value || "—"}
      </span>
    </div>
  );
}

export default function ClinicalAssessment({
  hasData,
  severity,
  confidence,
  rhythmStatus,
  systemFlags,
  summary,
  recommendedAction,
  assessmentSource,
  trend,
  monitoringFocus,
  theme = "dark",
}) {
  const style = SEVERITY_STYLE[severity] || SEVERITY_STYLE.stable;
  const rhythmAlert = hasData && rhythmStatus && !String(rhythmStatus).toLowerCase().includes("normal");
  const source = SOURCE_META[assessmentSource] || null;
  const panelBg = theme === "light" ? "bg-slate-50" : "bg-[#070707]";
  const borderColor = theme === "light" ? "border-slate-200" : "border-slate-800";
  const textMuted = theme === "light" ? "text-slate-500" : "text-slate-500";
  const textBody = theme === "light" ? "text-slate-800" : "text-slate-100";
  const cardBg = theme === "light" ? "bg-white" : "bg-black/50";

  if (!hasData) {
    return (
      <div className={`flex flex-1 items-center justify-center border-t ${borderColor} ${panelBg} px-6`}>
        <div className="flex flex-col items-center gap-3 text-center">
          <div className={`h-2 w-2 animate-pulse rounded-full ${theme === "light" ? "bg-slate-400" : "bg-slate-600"}`} />
          <span className={`text-sm font-bold uppercase tracking-[0.3em] ${textMuted}`}>
            Awaiting telemetry for clinical assessment
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-1 flex-col border-t ${borderColor} ${panelBg}`}>
      {/* Severity ribbon */}
      <div className={`h-1.5 w-full bg-gradient-to-r ${style.bar}`} />

      <div className="flex flex-1 flex-col gap-4 p-5">
        {/* Header row: title, source, severity */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg text-black"
              style={{ background: style.accent }}
            >
              {/* pulse/heart glyph */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12h4l2 5 4-10 2 5h6" />
              </svg>
            </div>
            <div>
              <div className={`text-sm font-bold uppercase tracking-[0.2em] ${textBody}`}>Clinical Interpretation</div>
              {source && (
                <div className="mt-0.5 flex items-center gap-1.5">
                  {source.live && (
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
                    </span>
                  )}
                  <span
                    className={`text-[11px] font-bold uppercase tracking-widest ${
                      source.live ? "text-violet-500 dark:text-violet-300" : textMuted
                    }`}
                  >
                    {source.label}
                  </span>
                </div>
              )}
            </div>
            {trend?.direction && <TrendBadge trend={trend.direction} theme={theme} />}
          </div>

          <div className={`flex items-center gap-4 rounded-xl px-4 py-2 ring-1 ${style.ring} ${style.glow} ${cardBg}`}>
            <div className="flex flex-col items-end">
              <span className={`text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>Status</span>
              <span className={`text-lg font-black tracking-wider ${style.text}`}>{style.label}</span>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={`text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>Confidence</span>
              <ConfidenceMeter value={confidence} accent={style.accent} theme={theme} />
            </div>
          </div>
        </div>

        {/* Interpretation text */}
        <div className={`rounded-xl border ${borderColor} ${cardBg} p-4`}>
          <p className={`text-lg leading-relaxed ${textBody}`}>
            {summary || "Analysis in progress — interpretation will appear shortly."}
          </p>
          {trend?.summary && (
            <p className={`mt-2 text-sm ${textMuted}`}>{trend.summary}</p>
          )}
        </div>

        {/* Recommended action */}
        <div
          className="rounded-xl p-4"
          style={{ background: `${style.accent}14`, border: `1px solid ${style.accent}55` }}
        >
          <div className="mb-1 flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={style.accent} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2 3 14h7l-1 8 10-12h-7z" />
            </svg>
            <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: style.accent }}>
              Recommended Action
            </span>
          </div>
          <p className={`text-base font-semibold leading-relaxed ${textBody}`}>
            {recommendedAction || "Continue routine bedside monitoring."}
          </p>
        </div>

        {/* Bottom chips */}
        {monitoringFocus && (
          <div className={`rounded-lg border px-3 py-2 ${borderColor} ${cardBg}`}>
            <div className={`mb-1 text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>Monitoring Focus</div>
            <p className={`text-sm font-semibold ${textBody}`}>{monitoringFocus}</p>
          </div>
        )}
        <div className="mt-auto grid grid-cols-2 gap-3">
          <Chip label="CNN Rhythm" value={rhythmStatus} alert={rhythmAlert} theme={theme} />
          <Chip
            label="Vitals Flag"
            value={systemFlags}
            alert={systemFlags && systemFlags !== "Stable"}
            theme={theme}
          />
        </div>
      </div>
    </div>
  );
}
