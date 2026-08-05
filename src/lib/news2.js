// Partial NEWS2 (National Early Warning Score 2), SpO₂ Scale 1.
// This device does not measure respiration rate, consciousness (ACVPU) or
// O₂-supplement status, so those parameters are reported in `missing` and
// excluded from the aggregate — hence "partial". Thresholds follow the RCP
// NEWS2 chart for the parameters we do measure.

function num(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function scoreSpo2(spo2) {
  if (spo2 == null) return null;
  if (spo2 <= 91) return 3;
  if (spo2 <= 93) return 2;
  if (spo2 <= 95) return 1;
  return 0;
}

function scoreTemp(t) {
  if (t == null) return null;
  if (t <= 35.0) return 3;
  if (t <= 36.0) return 1;
  if (t <= 38.0) return 0;
  if (t <= 39.0) return 1;
  return 2;
}

function scoreHr(hr) {
  if (hr == null) return null;
  if (hr <= 40) return 3;
  if (hr <= 50) return 1;
  if (hr <= 90) return 0;
  if (hr <= 110) return 1;
  if (hr <= 130) return 2;
  return 3;
}

function scoreSbp(sbp) {
  if (sbp == null) return null;
  if (sbp <= 90) return 3;
  if (sbp <= 100) return 2;
  if (sbp <= 110) return 1;
  if (sbp <= 219) return 0;
  return 3;
}

/**
 * @returns {{ total:number, subs:{spo2:?number,temp:?number,hr:?number,sbp:?number},
 *   band:"low"|"low-medium"|"medium"|"high", anyThree:boolean, missing:string[] }}
 */
export function computeNews2({ spo2, temp, hr, sbp } = {}) {
  const subs = {
    spo2: scoreSpo2(num(spo2)),
    temp: scoreTemp(num(temp)),
    hr: scoreHr(num(hr)),
    sbp: scoreSbp(num(sbp)),
  };

  const present = Object.values(subs).filter((s) => s != null);
  const total = present.reduce((a, b) => a + b, 0);
  const anyThree = present.some((s) => s === 3);

  const missing = ["Respiration rate", "Consciousness (ACVPU)"];
  if (subs.sbp == null) missing.push("Systolic BP");

  let band;
  if (total >= 7) band = "high";
  else if (total >= 5) band = "medium";
  else if (anyThree) band = "low-medium";
  else band = "low";

  return { total, subs, band, anyThree, missing };
}
