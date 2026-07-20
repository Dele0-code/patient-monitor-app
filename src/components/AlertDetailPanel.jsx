const SEVERITY_STYLE = {
  critical: {
    banner: "bg-red-600 text-black",
    panel: "border-red-500 bg-red-950/40 dark:bg-red-950/50",
    label: "CRITICAL ALERT",
  },
  watch: {
    banner: "bg-amber-500 text-black",
    panel: "border-amber-500 bg-amber-50 dark:bg-amber-950/40",
    label: "CLINICAL WATCH",
  },
  stable: {
    banner: "bg-slate-600 text-white",
    panel: "border-slate-500 bg-slate-100 dark:bg-slate-900",
    label: "ALERT",
  },
};

function formatTime(date) {
  if (!date) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function AlertDetailPanel({ alert, theme = "dark" }) {
  if (!alert) return null;

  const style = SEVERITY_STYLE[alert.severity] || SEVERITY_STYLE.watch;
  const textMain = theme === "light" ? "text-slate-900" : "text-slate-100";
  const textMuted = theme === "light" ? "text-slate-600" : "text-slate-400";

  return (
    <div className={`border-b px-4 py-2.5 ${style.panel}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className={`text-[10px] font-bold uppercase tracking-[0.2em] ${textMuted}`}>
            {style.label} · held for review
          </div>
          <div className={`mt-1 text-sm font-bold ${textMain}`}>
            {alert.messages.join(" · ")}
          </div>
          {alert.detail && (
            <div className={`mt-1 text-xs ${textMuted}`}>{alert.detail}</div>
          )}
        </div>
        <div className={`text-right text-[10px] tabular-nums ${textMuted}`}>
          <div>Detected {formatTime(alert.flaggedAt)}</div>
          <div>Visible until {formatTime(alert.expiresAt)}</div>
        </div>
      </div>
    </div>
  );
}
