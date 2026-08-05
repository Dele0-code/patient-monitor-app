import { useCallback, useEffect, useRef, useState } from "react";

// Full hospital-style alarm manager (IEC 60601-1-8 inspired).
// Owns WebAudio tone generation and the silence/acknowledge state machine.

const SILENCE_MS = 120000; // "Silence 2 min" then auto re-arm
const SIGNAL_LOSS_GRACE_MS = 3000; // don't blare during the initial boot connect
const RANK = { none: 0, watch: 1, noSignal: 2, critical: 3 };

// Priority-distinct tone patterns.
//  - critical / watch: clinical alarms (high, urgent) — now clearly louder.
//  - noSignal: a deliberately different low, slow "equipment" tone so a lost
//    ESP32 / dropped connection sounds unlike any patient-vital alarm.
const PATTERNS = {
  critical: { freq: 950, pulses: 5, pulseMs: 150, gapMs: 110, repeatMs: 2500, volume: 0.35 },
  watch: { freq: 600, pulses: 3, pulseMs: 200, gapMs: 180, repeatMs: 15000, volume: 0.22 },
  noSignal: { freq: 440, pulses: 2, pulseMs: 300, gapMs: 250, repeatMs: 5000, volume: 0.28 },
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
      let t = ctx.currentTime;
      for (let i = 0; i < pattern.pulses; i += 1) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(pattern.freq, t);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(pattern.volume, t + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + pattern.pulseMs / 1000);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + pattern.pulseMs / 1000 + 0.02);
        t += (pattern.pulseMs + pattern.gapMs) / 1000;
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
