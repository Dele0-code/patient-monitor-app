const SEVERITY_STYLE = {
  critical: {
    label: "CRITICAL",
    badge: "border-red-500 bg-red-950/50 text-red-400",
    bar: "bg-red-600",
  },
  watch: {
    label: "WATCH",
    badge: "border-amber-500 bg-amber-950/40 text-amber-300",
    bar: "bg-amber-500",
  },
  stable: {
    label: "STABLE",
    badge: "border-emerald-600 bg-emerald-950/40 text-emerald-400",
    bar: "bg-emerald-500",
  },
};

function ConfidenceMeter({ value }) {
  if (value == null || Number.isNaN(Number(value))) {
    return <span className="text-slate-600">—</span>;
  }
  const pct = Math.round(Math.min(1, Math.max(0, Number(value))) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden bg-slate-800">
        <div className="h-full bg-cyan-400 transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums text-cyan-300">{pct}%</span>
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
}) {
  const style = SEVERITY_STYLE[severity] || SEVERITY_STYLE.stable;
  const rhythmAlert = hasData && rhythmStatus && !String(rhythmStatus).toLowerCase().includes("normal");

  if (!hasData) {
    return (
      <div className="flex h-full min-h-[140px] items-center justify-center border-t border-slate-800 bg-[#050505] px-4">
        <span className="text-sm font-bold uppercase tracking-[0.25em] text-slate-600">
          Awaiting telemetry for clinical assessment
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-h-[140px] flex-col border-t border-slate-800 bg-[#050505]">
      <div className={`h-0.5 w-full ${style.bar}`} />

      <div className="flex flex-1 flex-col gap-3 px-3 py-2.5 sm:flex-row sm:gap-5">
        {/* Severity + meta */}
        <div className="flex shrink-0 flex-col gap-2 sm:w-44">
          <div className="text-[9px] font-bold uppercase tracking-widest text-slate-600">
            Clinical Assessment
          </div>
          <div className={`inline-flex w-fit border px-2.5 py-1 text-sm font-bold tracking-widest ${style.badge}`}>
            {style.label}
          </div>
          <div className="space-y-1 text-[11px]">
            <div className="flex items-center justify-between gap-3">
              <span className="uppercase tracking-wider text-slate-600">Confidence</span>
              <ConfidenceMeter value={confidence} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="uppercase tracking-wider text-slate-600">CNN Rhythm</span>
              <span className={`font-bold uppercase ${rhythmAlert ? "text-red-400" : "text-emerald-400"}`}>
                {rhythmStatus || "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="uppercase tracking-wider text-slate-600">Vitals Flag</span>
              <span
                className={`font-bold uppercase ${
                  systemFlags && systemFlags !== "Stable" ? "text-amber-300" : "text-slate-400"
                }`}
              >
                {systemFlags || "—"}
              </span>
            </div>
          </div>
        </div>

        {/* LLM / rule prediction text */}
        <div className="flex min-w-0 flex-1 flex-col gap-2 border-t border-slate-800 pt-2 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
          <div>
            <div className="mb-1 text-[9px] font-bold uppercase tracking-widest text-slate-600">
              Prediction Summary
            </div>
            <p className="text-sm leading-relaxed text-slate-200">
              {summary || "No assessment text available yet."}
            </p>
          </div>
          <div>
            <div className="mb-1 text-[9px] font-bold uppercase tracking-widest text-slate-600">
              Recommended Action
            </div>
            <p className="border border-cyan-900/50 bg-cyan-950/20 px-2.5 py-2 text-sm font-semibold leading-snug text-cyan-200">
              {recommendedAction || "Continue routine monitoring."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
