export default function AlarmBanner({ severity, systemFlags }) {
  if (severity === "critical") {
    return (
      <div className="animate-pulse bg-red-600 px-4 py-2 text-center text-sm font-bold uppercase tracking-wider text-black">
        Critical Alert — Immediate Review Required
        {systemFlags && systemFlags !== "Stable" ? ` · ${systemFlags}` : ""}
      </div>
    );
  }

  if (severity === "watch") {
    return (
      <div className="bg-amber-500 px-4 py-2 text-center text-sm font-bold uppercase tracking-wider text-slate-950">
        Watch — Increased Monitoring Advised
        {systemFlags && systemFlags !== "Stable" ? ` · ${systemFlags}` : ""}
      </div>
    );
  }

  return null;
}
