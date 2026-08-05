import { useCallback, useEffect, useRef, useState } from "react";

// Full hospital-style alarm manager (IEC 60601-1-8 inspired).
// Owns WebAudio tone generation and the silence/acknowledge state machine.

const SILENCE_MS = 120000; // "Silence 2 min" then auto re-arm
const SIGNAL_LOSS_GRACE_MS = 3000; // don't blare during the initial boot connect
const RANK = { none: 0, watch: 1, noSignal: 2, critical: 3 };

// Priority-distinct tone patterns, modelled on the IEC 60601-1-8 reference
// alarm melodies used by real bedside monitors.
//
//  - Each PULSE is a harmonically rich tone (fundamental + upper harmonics),
//    NOT a pure sine — that timbre is what makes it read as a "hospital" alarm
//    rather than a toy beep. The standard requires a fundamental of 150-1000 Hz
//    plus at least four harmonic components in the 300-4000 Hz band.
//  - Each BURST is a short MELODY (a pitch per pulse), not one repeated note.
//  - High priority: 5 pulses grouped 3 + 2 (the classic "da-da-da ... da-da"
//    cadence), burst repeating urgently. Medium: 3 pulses. Both defined here as
//    semitone offsets from the pattern's base frequency.
//
// noSignal is a deliberately different low, slow, falling two-tone "equipment"
// alarm so a lost ESP32 / dropped link never sounds like a patient-vital alarm.

const SEMI = (base, n) => base * 2 ** (n / 12);

// Relative harmonic amplitudes → rich, penetrating timbre (fundamental strongest).
const HARMONICS = [
  { mult: 1, gain: 1.0 },
  { mult: 2, gain: 0.6 },
  { mult: 3, gain: 0.4 },
  { mult: 4, gain: 0.28 },
  { mult: 5, gain: 0.16 },
];

const PATTERNS = {
  // High-priority: C6-ish base, 5-pulse melody grouped 3 + 2, fast repeat.
  critical: {
    base: 988, // ~B5
    // semitone offset + inter-onset gap (ms) after each pulse; big gap = the 3|2 split
    melody: [
      { semi: 0, gapMs: 90 },
      { semi: 0, gapMs: 90 },
      { semi: 0, gapMs: 350 },
      { semi: 0, gapMs: 90 },
      { semi: 0, gapMs: 0 },
    ],
    pulseMs: 150,
    repeatMs: 2500,
    volume: 0.5,
  },
  // Medium-priority: lower, 3-pulse melody, calmer, slower repeat.
  watch: {
    base: 622, // ~D#5
    melody: [
      { semi: 0, gapMs: 130 },
      { semi: 0, gapMs: 130 },
      { semi: 0, gapMs: 0 },
    ],
    pulseMs: 180,
    repeatMs: 15000,
    volume: 0.32,
  },
  // Technical / equipment alarm: low falling two-tone, unmistakably non-clinical.
  noSignal: {
    base: 440,
    melody: [
      { semi: 0, gapMs: 320 },
      { semi: -5, gapMs: 0 },
    ],
    pulseMs: 300,
    repeatMs: 5000,
    volume: 0.34,
  },
};

function formatCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  return `${m}:${ss}`;
}

/**
 * @param {"none"|"watch"|"critical"} priority current highest active clinical alarm priority
 * @param {string} [connectionStatus] websocket status; anything other than "live" engages the signal-loss tone (after a short grace)
 */
export default function useAlarms(priority, connectionStatus = "live") {
  const [silencedUntil, setSilencedUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [signalLost, setSignalLost] = useState(false);
  const silencedPriorityRef = useRef("none");
  const audioCtxRef = useRef(null);

  // Signal-loss engages only after a short grace so the alarm doesn't blare
  // during the normal boot/reconnect handshake. A real critical vital still
  // outranks it below.
  useEffect(() => {
    if (connectionStatus === "live") {
      setSignalLost(false);
      return undefined;
    }
    const id = setTimeout(() => setSignalLost(true), SIGNAL_LOSS_GRACE_MS);
    return () => clearTimeout(id);
  }, [connectionStatus]);

  const effectivePriority =
    priority === "critical" ? "critical" : signalLost ? "noSignal" : priority;

  const playBurst = useCallback((pattern) => {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!audioCtxRef.current && AC) audioCtxRef.current = new AC();
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume?.();
      const pulseS = pattern.pulseMs / 1000;
      let t = ctx.currentTime;
      for (const step of pattern.melody) {
        const fundamental = SEMI(pattern.base, step.semi);
        // One shared per-pulse envelope drives the whole harmonic stack so the
        // partials rise and fall together as a single voiced tone.
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(pattern.volume, t + 0.012);
        env.gain.exponentialRampToValueAtTime(0.0001, t + pulseS);
        env.connect(ctx.destination);
        for (const h of HARMONICS) {
          const osc = ctx.createOscillator();
          const hg = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(fundamental * h.mult, t);
          hg.gain.setValueAtTime(h.gain, t);
          osc.connect(hg);
          hg.connect(env);
          osc.start(t);
          osc.stop(t + pulseS + 0.02);
        }
        t += (pattern.pulseMs + step.gapMs) / 1000;
      }
    } catch {
      // Audio unavailable (e.g. kiosk without output) — visuals still alarm.
    }
  }, []);

  // Audible loop: sound the active priority's pattern unless currently silenced.
  useEffect(() => {
    const audible = effectivePriority !== "none" && silencedUntil <= Date.now();
    const pattern = PATTERNS[effectivePriority];
    if (!audible || !pattern) return undefined;
    playBurst(pattern);
    const id = setInterval(() => playBurst(pattern), pattern.repeatMs);
    return () => clearInterval(id);
  }, [effectivePriority, silencedUntil, playBurst]);

  // Countdown + auto re-arm: clears silence when the 2-minute window expires.
  useEffect(() => {
    if (!silencedUntil) return undefined;
    const tick = () => {
      if (silencedUntil - Date.now() <= 0) setSilencedUntil(0);
      setNow(Date.now());
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [silencedUntil]);

  // Escalation override: a higher-priority alarm during silence re-sounds at once.
  useEffect(() => {
    if (silencedUntil && RANK[effectivePriority] > RANK[silencedPriorityRef.current]) {
      setSilencedUntil(0);
    }
  }, [effectivePriority, silencedUntil]);

  const acknowledge = useCallback(() => {
    if (effectivePriority === "none") return;
    silencedPriorityRef.current = effectivePriority;
    audioCtxRef.current?.resume?.();
    setSilencedUntil(Date.now() + SILENCE_MS);
    setNow(Date.now());
  }, [effectivePriority]);

  const isSilenced = silencedUntil > now;
  const remainingMs = Math.max(0, silencedUntil - now);
  const active = effectivePriority !== "none";

  let label;
  if (effectivePriority === "none") label = "No Active Alarms";
  else if (isSilenced) label = `Silenced ${formatCountdown(remainingMs)}`;
  else if (effectivePriority === "noSignal") label = "Signal Lost — Silence";
  else label = "Silence 2 min";

  return {
    acknowledge,
    label,
    priority: effectivePriority,
    disabled: effectivePriority === "none" || isSilenced,
    isSilenced,
    remainingMs,
    active,
    audible: active && !isSilenced,
  };
}
