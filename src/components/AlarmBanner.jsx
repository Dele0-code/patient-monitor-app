export default function AlarmBanner({ severity, systemFlags, latchedSeverity, signalLost = false }) {
  const displaySeverity = latchedSeverity || severity;

  if (displaySeverity === "critical") {
    return (
      <div className="animate-pulse bg-red-600 px-3 py-1.5 text-center text-xs font-bold uppercase tracking-[0.2em] text-black">
        *** CRITICAL ***
        {systemFlags && systemFlags !== "Stable" ? `  ${systemFlags}` : "  IMMEDIATE REVIEW"}
      </div>
    );
  }

  // Technical (equipment) alarm — distinct from clinical severity banners.
  if (signalLost) {
    return (
      <div className="animate-pulse bg-sky-400 px-3 py-1.5 text-center text-xs font-bold uppercase tracking-[0.2em] text-black">
        !! SIGNAL LOST !!  NO TELEMETRY — CHECK DEVICE / CONNECTION
      </div>
    );
  }

  if (displaySeverity === "watch") {
    return (
      <div className="animate-pulse bg-amber-500 px-3 py-1.5 text-center text-xs font-bold uppercase tracking-[0.2em] text-black">
        ** WATCH **
        {systemFlags && systemFlags !== "Stable" ? `  ${systemFlags}` : "  INCREASED MONITORING"}
      </div>
    );
  }

  return null;
}
