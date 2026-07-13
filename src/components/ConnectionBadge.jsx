const STATUS_CONFIG = {
  live: {
    label: "LIVE",
    dotClass: "bg-emerald-400 animate-pulse",
    badgeClass: "border-emerald-700 bg-emerald-950/60 text-emerald-400",
  },
  connecting: {
    label: "CONNECTING...",
    dotClass: "bg-amber-400 animate-pulse",
    badgeClass: "border-amber-700 bg-amber-950/40 text-amber-400",
  },
  offline: {
    label: "NO SIGNAL",
    dotClass: "bg-red-500 animate-pulse",
    badgeClass: "border-red-700 bg-red-950/40 text-red-400",
  },
};

export default function ConnectionBadge({ status = "offline" }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.offline;

  return (
    <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${config.badgeClass}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${config.dotClass}`} />
      {config.label}
    </div>
  );
}
