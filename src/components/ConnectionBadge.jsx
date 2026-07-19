const STATUS_CONFIG = {
  live: {
    label: "LIVE",
    color: "text-emerald-400",
    dot: "bg-emerald-400",
  },
  connecting: {
    label: "CONNECTING",
    color: "text-amber-400",
    dot: "bg-amber-400 animate-pulse",
  },
  offline: {
    label: "NO SIGNAL",
    color: "text-red-400",
    dot: "bg-red-500 animate-pulse",
  },
};

export default function ConnectionBadge({ status = "offline" }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.offline;

  return (
    <div className={`flex items-center gap-2 text-xs font-bold tracking-widest ${config.color}`}>
      <span className={`h-2 w-2 rounded-full ${config.dot}`} />
      {config.label}
    </div>
  );
}
