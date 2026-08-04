/**
 * Clinical alarm generator (WebAudio).
 *
 * Bedside monitors use distinct, hard-to-ignore audible patterns per priority
 * (loosely modelled on IEC 60601-1-8). This module produces:
 *   - "critical"    : a fast high-pitched 5-pulse burst  (highest priority)
 *   - "watch"       : a calmer 3-pulse mid burst
 *   - "signal-loss" : an urgent falling two-tone "technical alarm"
 *
 * Everything runs through one shared AudioContext and a master gain so the
 * whole thing is genuinely loud on a TV, and can be muted from one place.
 */

let ctx = null;
let master = null;
let muted = false;

function ensureContext() {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!ctx) {
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
  }
  return ctx;
}

/** Browsers start the AudioContext suspended until a user gesture — call this on first click/keypress. */
export function unlockAudio() {
  const c = ensureContext();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

export function setMuted(next) {
  muted = next;
  if (master && ctx) master.gain.setValueAtTime(next ? 0 : 1, ctx.currentTime);
}

function beep(c, { freq, at, dur, gain, type = "square" }) {
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  // Fast attack, brief sustain, quick release → a crisp, piercing pulse.
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + 0.008);
  env.gain.setValueAtTime(gain, at + dur - 0.04);
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(env);
  env.connect(master);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/**
 * Play one burst of the given alarm kind. Call this repeatedly on an interval
 * (see ALARM_PERIOD_MS) to sustain a continuous alarm while a condition holds.
 */
export function playAlarm(kind) {
  const c = ensureContext();
  if (!c || muted) return;
  if (c.state === "suspended") {
    c.resume().catch(() => {});
    return;
  }
  const t = c.currentTime + 0.02;

  if (kind === "critical") {
    // 5 loud pulses, last two a tone higher — classic "come now" cadence.
    const v = 0.55;
    [
      [880, 0.0], [880, 0.16], [880, 0.32],
      [988, 0.56], [988, 0.72],
    ].forEach(([freq, off]) => beep(c, { freq, at: t + off, dur: 0.12, gain: v, type: "square" }));
  } else if (kind === "signal-loss") {
    // Falling two-tone "technical" alarm — clearly different from a patient alarm.
    const v = 0.5;
    beep(c, { freq: 660, at: t, dur: 0.28, gain: v, type: "sawtooth" });
    beep(c, { freq: 440, at: t + 0.34, dur: 0.4, gain: v, type: "sawtooth" });
  } else if (kind === "watch") {
    // 3 calmer pulses.
    const v = 0.34;
    [0.0, 0.26, 0.52].forEach((off) =>
      beep(c, { freq: 660, at: t + off, dur: 0.14, gain: v, type: "triangle" }));
  }
}

/** How often to re-fire each alarm kind (ms) to keep it ringing continuously. */
export const ALARM_PERIOD_MS = {
  critical: 1100,
  "signal-loss": 1300,
  watch: 4000,
};
