import { computeNews2 } from "../lib/news2.js";
import TrendSparkline from "./TrendSparkline.jsx";

const BAND_STYLES = {
  low: { bg: "bg-emerald-900/40", border: "border-emerald-700", text: "text-emerald-400", label: "LOW RISK" },
  "low-medium": { bg: "bg-amber-900/40", border: "border-amber-600", text: "text-amber-400", label: "LOW-MEDIUM RISK" },
  medium: { bg: "bg-orange-900/40", border: "border-orange-600", text: "text-orange-400", label: "MEDIUM RISK" },
  high: { bg: "bg-red-900/40", border: "border-red-600", text: "text-red-400", label: "HIGH RISK" },
};

function TrendArrow({ current, previous }) {
  if (previous == null || current === previous) return <span className="text-slate-500">—</span>;
  if (current > previous) return <span className="text-red-400">▲</span>;
  return <span className="text-emerald-400">▼</span>;
}

export default function EarlyWarningPanel({ vitals = {}, history = [], theme = "dark" }) {
  const { spo2, temp, hr, sbp } = vitals;
  const news2 = computeNews2({ spo2, temp, hr, sbp });
  const { total, subs, band, anyThree, missing } = news2;

  const prevNews2 = history.length >= 2
    ? computeNews2(history[history.length - 2])
    : null;

  const style = BAND_STYLES[band] || BAND_STYLES.low;

  const hrHistory = history.map((r) => r.hr).filter((v) => v != null);
  const spo2History = history.map((r) => r.spo2).filter((v) => v != null);
  const tempHistory = history.map((r) => r.temp).filter((v) => v != null);

  const isDark = theme === "dark";

  return (
    <div className={`flex flex-col gap-3 p-4 ${isDark ? "bg-slate-900 text-slate-100" : "bg-white text-slate-900"}`}>
      {/* NEWS2 Score Card */}
      <div className={`rounded-lg border-2 p-4 ${style.border} ${style.bg}`}>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className={`text-xs font-semibold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-600"}`}>
            Partial NEWS2 Score
          </h3>
          <TrendArrow current={total} previous={prevNews2?.total} />
        </div>
        <div className="flex items-baseline gap-3">
          <span className={`text-5xl font-bold tabular-nums ${style.text}`}>{total}</span>
          <span className={`text-sm font-semibold uppercase ${style.text}`}>{style.label}</span>
        </div>
        {anyThree && (
          <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-amber-400">
            ⚠ Single parameter ≥3
          </div>
        )}
      </div>

      {/* Sub-scores */}
      <div className="grid grid-cols-2 gap-2">
        {subs.spo2 != null && (
          <div className={`rounded border px-2 py-1.5 ${isDark ? "border-slate-700 bg-slate-800" : "border-slate-300 bg-slate-50"}`}>
            <div className={`text-[10px] font-semibold uppercase ${isDark ? "text-slate-500" : "text-slate-600"}`}>SpO₂</div>
            <div className={`text-lg font-bold tabular-nums ${subs.spo2 >= 3 ? "text-red-400" : isDark ? "text-slate-200" : "text-slate-800"}`}>
              {subs.spo2}
            </div>
          </div>
        )}
        {subs.temp != null && (
          <div className={`rounded border px-2 py-1.5 ${isDark ? "border-slate-700 bg-slate-800" : "border-slate-300 bg-slate-50"}`}>
            <div className={`text-[10px] font-semibold uppercase ${isDark ? "text-slate-500" : "text-slate-600"}`}>Temp</div>
            <div className={`text-lg font-bold tabular-nums ${subs.temp >= 3 ? "text-red-400" : isDark ? "text-slate-200" : "text-slate-800"}`}>
              {subs.temp}
            </div>
          </div>
        )}
        {subs.hr != null && (
          <div className={`rounded border px-2 py-1.5 ${isDark ? "border-slate-700 bg-slate-800" : "border-slate-300 bg-slate-50"}`}>
            <div className={`text-[10px] font-semibold uppercase ${isDark ? "text-slate-500" : "text-slate-600"}`}>Heart Rate</div>
            <div className={`text-lg font-bold tabular-nums ${subs.hr >= 3 ? "text-red-400" : isDark ? "text-slate-200" : "text-slate-800"}`}>
              {subs.hr}
            </div>
          </div>
        )}
        {subs.sbp != null && (
          <div className={`rounded border px-2 py-1.5 ${isDark ? "border-slate-700 bg-slate-800" : "border-slate-300 bg-slate-50"}`}>
            <div className={`text-[10px] font-semibold uppercase ${isDark ? "text-slate-500" : "text-slate-600"}`}>Sys BP</div>
            <div className={`text-lg font-bold tabular-nums ${subs.sbp >= 3 ? "text-red-400" : isDark ? "text-slate-200" : "text-slate-800"}`}>
              {subs.sbp}
            </div>
          </div>
        )}
      </div>

      {/* Sparklines */}
      <div className="space-y-2">
        <h4 className={`text-xs font-semibold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-600"}`}>
          Trend History
        </h4>
        {hrHistory.length > 1 && (
          <div>
            <div className={`mb-0.5 text-[10px] font-medium uppercase ${isDark ? "text-slate-500" : "text-slate-600"}`}>
              Heart Rate
            </div>
            <TrendSparkline values={hrHistory} color="#f472b6" height={24} alert={subs.hr >= 3} />
          </div>
        )}
        {spo2History.length > 1 && (
          <div>
            <div className={`mb-0.5 text-[10px] font-medium uppercase ${isDark ? "text-slate-500" : "text-slate-600"}`}>
              SpO₂
            </div>
            <TrendSparkline values={spo2History} color="#38bdf8" height={24} alert={subs.spo2 >= 3} />
          </div>
        )}
        {tempHistory.length > 1 && (
          <div>
            <div className={`mb-0.5 text-[10px] font-medium uppercase ${isDark ? "text-slate-500" : "text-slate-600"}`}>
              Temperature
            </div>
            <TrendSparkline values={tempHistory} color="#fbbf24" height={24} alert={subs.temp >= 3} />
          </div>
        )}
      </div>

      {/* Caveat */}
      <div className={`rounded border p-2 text-[10px] leading-relaxed ${isDark ? "border-slate-700 bg-slate-800/50 text-slate-400" : "border-slate-300 bg-slate-50 text-slate-600"}`}>
        <strong>Note:</strong> This is a partial NEWS2 score.{" "}
        {missing.length > 0 && `Parameters not monitored: ${missing.join(", ")}.`}
      </div>
    </div>
  );
}
