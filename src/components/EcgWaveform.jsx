import { useEffect, useRef } from "react";

const TRACE_COLOR = "#00e676";
const TRACE_GLOW = "rgba(0, 230, 118, 0.35)";
const GRID_FINE = "rgba(0, 180, 80, 0.10)";
const GRID_BOLD = "rgba(0, 180, 80, 0.22)";
const BG_COLOR = "#000000";

// Display calibration
const SAMPLE_RATE_HZ = 100; // incoming ECG sample rate
const SECONDS_VISIBLE = 5; // how many seconds of trace fill the width
const AMPLITUDE_FRAC = 0.3; // R-peak height as a fraction of panel height (smaller = flatter)
const ERASE_GAP = 12; // px of blanking ahead of the sweep cursor
const FINE_STEP = 10;
const BOLD_STEP = 50;

function drawGridBand(ctx, x0, x1, height) {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(x0, 0, x1 - x0, height);

  ctx.strokeStyle = GRID_FINE;
  ctx.lineWidth = 1;
  for (let x = Math.floor(x0 / FINE_STEP) * FINE_STEP; x <= x1; x += FINE_STEP) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += FINE_STEP) {
    ctx.beginPath();
    ctx.moveTo(x0, y + 0.5);
    ctx.lineTo(x1, y + 0.5);
    ctx.stroke();
  }

  ctx.strokeStyle = GRID_BOLD;
  for (let x = Math.floor(x0 / BOLD_STEP) * BOLD_STEP; x <= x1; x += BOLD_STEP) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += BOLD_STEP) {
    ctx.beginPath();
    ctx.moveTo(x0, y + 0.5);
    ctx.lineTo(x1, y + 0.5);
    ctx.stroke();
  }
}

export default function EcgWaveform({ rawEcg = null, hasSignal = false, className = "" }) {
  const canvasRef = useRef(null);
  const queueRef = useRef([]);
  // Adaptive calibration kept ACROSS packets so the baseline stays flat and the gain
  // stays consistent — no more per-packet rescaling that made the trace jump around.
  const baselineRef = useRef(null);
  const peakRef = useRef(60);
  const lastYRef = useRef(0);
  const sweepXRef = useRef(0);

  // Feed raw samples straight into the queue; calibration happens at draw time.
  useEffect(() => {
    if (!hasSignal || !rawEcg?.length) return;
    const q = queueRef.current;
    for (const v of rawEcg) q.push(Number(v));
    // keep at most ~4s of backlog so we never drift far from real-time
    const maxLen = SAMPLE_RATE_HZ * 4;
    if (q.length > maxLen) q.splice(0, q.length - maxLen);
  }, [rawEcg, hasSignal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let animationId;
    let lastTime = performance.now();
    let width = 0;
    let height = 0;
    let baselineY = 0;
    let pxPerSample = 2;

    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      if (!width || !height) return false;
      baselineY = height * 0.5;
      pxPerSample = Math.max(1, width / (SECONDS_VISIBLE * SAMPLE_RATE_HZ));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawGridBand(ctx, 0, width, height);
      lastYRef.current = baselineY;
      sweepXRef.current = 0;
      return true;
    };

    const calibrate = (raw) => {
      // slow-moving isoelectric baseline (EMA) → flat line between beats
      if (baselineRef.current == null) baselineRef.current = raw;
      baselineRef.current += (raw - baselineRef.current) * 0.002;
      const dev = raw - baselineRef.current;
      // slowly-decaying peak tracker → stable R-wave height regardless of ADC scale
      peakRef.current = Math.max(peakRef.current * 0.9997, Math.abs(dev), 25);
      const norm = dev / peakRef.current;
      return Math.max(-1.15, Math.min(1.15, norm));
    };

    const drawSegment = (x1, y1, x2, y2) => {
      // blank a small band ahead of the cursor, then repaint its grid
      const gap = Math.max(ERASE_GAP, pxPerSample + 2);
      drawGridBand(ctx, x2, Math.min(width, x2 + gap), height);

      ctx.strokeStyle = TRACE_COLOR;
      ctx.shadowColor = TRACE_GLOW;
      ctx.shadowBlur = 6;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    const render = (time) => {
      if (!width || !height) {
        animationId = requestAnimationFrame(render);
        return;
      }
      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      if (!hasSignal) {
        drawGridBand(ctx, 0, width, height);
        queueRef.current = [];
        sweepXRef.current = 0;
        lastYRef.current = baselineY;
        animationId = requestAnimationFrame(render);
        return;
      }

      const q = queueRef.current;
      let toDraw = Math.round(dt * SAMPLE_RATE_HZ);
      // gently catch up if a backlog builds so the trace stays near real-time
      if (q.length > SAMPLE_RATE_HZ * 2) toDraw += Math.ceil((q.length - SAMPLE_RATE_HZ * 2) / 15);

      for (let i = 0; i < toDraw; i += 1) {
        const raw = q.shift();
        if (raw === undefined) break;

        const norm = calibrate(raw);
        let x1 = sweepXRef.current;
        let x2 = x1 + pxPerSample;
        const y1 = lastYRef.current;
        const y2 = baselineY - norm * (height * AMPLITUDE_FRAC);

        if (x2 >= width) {
          sweepXRef.current = 0;
          x1 = 0;
          x2 = pxPerSample;
        }
        drawSegment(x1, y1, x2, y2);
        sweepXRef.current = x2;
        lastYRef.current = y2;
      }

      animationId = requestAnimationFrame(render);
    };

    const init = () => {
      if (measure()) animationId = requestAnimationFrame(render);
      else animationId = requestAnimationFrame(init);
    };

    init();
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", onResize);
    };
  }, [hasSignal]);

  return (
    <div className={`relative overflow-hidden bg-black ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute left-3 top-2 flex items-baseline gap-3">
        <span className="text-xs font-bold tracking-wider text-emerald-400">ECG II</span>
        <span className="text-[10px] tracking-wider text-emerald-700">×1.0</span>
      </div>
      <div className="pointer-events-none absolute right-3 top-2 text-right text-[10px] leading-tight tracking-wider text-emerald-700">
        <div>25 mm/s</div>
        <div>10 mm/mV</div>
      </div>
      {!hasSignal && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold uppercase tracking-[0.3em] text-slate-600">No Signal</span>
        </div>
      )}
    </div>
  );
}
