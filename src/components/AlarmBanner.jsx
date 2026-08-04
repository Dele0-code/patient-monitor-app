export default function AlarmBanner({ severity, systemFlags, latchedSeverity, signalLost }) {
  // Signal loss (technical alarm) takes absolute priority — something is wrong with
  // the monitor itself, not the patient. This is always critical & always visible.
  if (signalLost) {
    return (
      <div className="animate-pulse bg-red-600 px-3 py-1.5 text-center text-xs font-bold uppercase tracking-[0.2em] text-black">
        *** DATA LOSS *** NO TELEMETRY RECEIVED
      </div>
    );
  }

  const displaySeverity = latchedSeverity || severity;

  if (displaySeverity === "critical") {
    return (
      <div className="animate-pulse bg-red-600 px-3 py-1.5 text-center text-xs font-bold uppercase tracking-[0.2em] text-black">
        *** CRITICAL ***
        {systemFlags && systemFlags !== "Stable" ? `  ${systemFlags}` : "  IMMEDIATE REVIEW"}
      </div>
    );
  }

  if (displaySeverity === "watch") {
    return (
      <div className="bg-amber-500 px-3 py-1.5 text-center text-xs font-bold uppercase tracking-[0.2em] text-black">
        ** WATCH **
        {systemFlags && systemFlags !== "Stable" ? `  ${systemFlags}` : "  INCREASED MONITORING"}
      </div>
    );
  }

  return null;
}
