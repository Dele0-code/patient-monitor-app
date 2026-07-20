/** Circular vital sign gauge (SpO₂, HR, temp, NIBP). */

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

export default function VitalGauge({
  label,
  value,
  displayValue,
  unit,
  min = 0,
  max = 100,
  alert = false,
  strokeColor = "#34d399",
  size = 88,
  theme = "dark",
}) {
  const hasValue = value !== null && value !== undefined && !Number.isNaN(Number(value));
  const radius = (size - 12) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const pct = hasValue ? Math.min(1, Math.max(0, (Number(value) - min) / (max - min))) : 0;
  const sweep = pct * 270;
  const trackColor = theme === "light" ? "#cbd5e1" : "#1e293b";
  const alertColor = "#f87171";
  const activeColor = alert ? alertColor : strokeColor;

  return (
    <div
      className={`flex flex-col items-center border-b px-2 py-3 ${
        theme === "light" ? "border-slate-200" : "border-slate-800"
      } ${alert ? (theme === "light" ? "bg-red-50" : "bg-red-950/30") : ""}`}
    >
      <span
        className={`mb-1 text-[10px] font-bold uppercase tracking-widest ${
          alert ? "text-red-500" : theme === "light" ? "text-slate-500" : "text-slate-500"
        }`}
      >
        {label}
      </span>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-[135deg]">
          <path
            d={describeArc(cx, cy, radius, 0, 270)}
            fill="none"
            stroke={trackColor}
            strokeWidth="6"
            strokeLinecap="round"
          />
          {hasValue && sweep > 0 && (
            <path
              d={describeArc(cx, cy, radius, 0, sweep)}
              fill="none"
              stroke={activeColor}
              strokeWidth="6"
              strokeLinecap="round"
              className="transition-all duration-700 ease-out"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {hasValue ? (
            <>
              <span
                className={`text-xl font-bold leading-none tabular-nums ${
                  alert ? "text-red-500" : theme === "light" ? "text-slate-800" : "text-white"
                }`}
              >
                {displayValue ?? value}
              </span>
              {unit && (
                <span className={`text-[9px] font-semibold uppercase ${theme === "light" ? "text-slate-500" : "text-slate-500"}`}>
                  {unit}
                </span>
              )}
            </>
          ) : (
            <span className={`text-sm font-bold ${theme === "light" ? "text-slate-400" : "text-slate-600"}`}>—</span>
          )}
        </div>
      </div>
    </div>
  );
}
