import { useNavigate } from "react-router-dom";
import { PATIENT_LIST } from "../patients.js";

/**
 * Slim, unobtrusive roster of patient chips. The active patient is highlighted;
 * clicking another navigates to its dashboard. Only the `monitored` bed carries
 * live/simulator data — others render an idle dot.
 */
export default function PatientStrip({ activeId, theme = "dark", liveStatus = "connecting" }) {
  const navigate = useNavigate();
  const isDark = theme === "dark";

  if (PATIENT_LIST.length < 2) return null;

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      {PATIENT_LIST.map((p) => {
        const isActive = p.id === activeId;
        // Dot: active monitored bed reflects the real feed state; others are idle.
        const dotClass = !p.monitored
          ? "bg-slate-500"
          : isActive && liveStatus === "live"
            ? "bg-emerald-400 animate-pulse"
            : isActive
              ? "bg-amber-400"
              : "bg-slate-500";

        const base = isDark
          ? isActive
            ? "border-emerald-500 bg-emerald-950/40 text-emerald-300"
            : "border-slate-700 bg-black text-slate-400 hover:border-slate-500"
          : isActive
            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
            : "border-slate-300 bg-white text-slate-600 hover:border-slate-400";

        return (
          <button
            key={p.id}
            type="button"
            onClick={() => !isActive && navigate(`/dashboard/${p.id}`)}
            title={`${p.full_name} · ${p.ward}${p.monitored ? "" : " · no device"}`}
            className={`flex shrink-0 items-center gap-1.5 border px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${base} ${
              isActive ? "cursor-default" : "cursor-pointer"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
            <span className="max-w-[8rem] truncate">{p.full_name}</span>
          </button>
        );
      })}
    </div>
  );
}
