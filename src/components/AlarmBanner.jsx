export default function AlarmBanner({ severity, systemFlags }) {
  if (severity === "critical") {
    return (
      <div className="animate-pulse bg-red-600 px-3 py-1.5 text-center text-xs font-bold uppercase tracking-[0.2em] text-black">
        *** CRITICAL ***
        {systemFlags && systemFlags !== "Stable" ? `  ${systemFlags}` : "  IMMEDIATE REVIEW"}
      </div>
    );
  }

  if (severity === "watch") {
    return (
      <div className="bg-amber-500 px-3 py-1.5 text-center text-xs font-bold uppercase tracking-[0.2em] text-black">
        ** WATCH **
        {systemFlags && systemFlags !== "Stable" ? `  ${systemFlags}` : "  INCREASED MONITORING"}
      </div>
    );
  }

  return null;
}
