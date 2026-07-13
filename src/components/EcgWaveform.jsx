import { useEffect, useRef } from "react";

const TRACE_COLOR = "#39ff14";
const GRID_FINE = "rgba(57, 255, 20, 0.08)";
const GRID_BOLD = "rgba(57, 255, 20, 0.18)";
const BG_COLOR = "#020a02";

function drawGrid(ctx, width, height) {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, width, height);

  const fineStep = 10;
  const boldStep = 50;

  ctx.strokeStyle = GRID_FINE;
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += fineStep) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += fineStep) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.strokeStyle = GRID_BOLD;
  ctx.lineWidth = 1.5;
  for (let x = 0; x <= width; x += boldStep) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += boldStep) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawBaseline(ctx, width, height, baselineY) {
  ctx.strokeStyle = "rgba(57, 255, 20, 0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, baselineY);
  ctx.lineTo(width, baselineY);
  ctx.stroke();
}

function normalizeSamples(samples) {
  if (!samples?.length) return [];
  const values = samples.map((v) => Number(v));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  return values.map((v) => (v - (min + max) / 2) / range);
}

export default function EcgWaveform({ rawEcg = null, hasSignal = false, className = "" }) {
  const canvasRef = useRef(null);
  const sampleQueueRef = useRef([]);
  const lastYRef = useRef(0);
  const sweepXRef = useRef(0);

  useEffect(() => {
    if (!hasSignal || !rawEcg?.length) return;
    const normalized = normalizeSamples(rawEcg);
    sampleQueueRef.current.push(...normalized);
    if (sampleQueueRef.current.length > 2000) {
      sampleQueueRef.current = sampleQueueRef.current.slice(-1000);
    }
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

    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      if (!width || !height) return false;
      baselineY = height * 0.55;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawGrid(ctx, width, height);
      drawBaseline(ctx, width, height, baselineY);
      lastYRef.current = baselineY;
      sweepXRef.current = 0;
      return true;
    };

    const drawSegment = (x1, y1, x2, y2) => {
      ctx.strokeStyle = TRACE_COLOR;
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowBlur = 6;
      ctx.shadowColor = TRACE_COLOR;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(x2, 0, 3, height);
    };

    const render = (time) => {
      if (!width || !height) {
        animationId = requestAnimationFrame(render);
        return;
      }

      const dt = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;

      if (!hasSignal) {
        drawGrid(ctx, width, height);
        drawBaseline(ctx, width, height, baselineY);
        sampleQueueRef.current = [];
        sweepXRef.current = 0;
        lastYRef.current = baselineY;
      } else {
        const samplesPerSecond = 100;
        const pixelsPerSample = 1.8;
        const samplesToDraw = Math.max(1, Math.floor(dt * samplesPerSecond));

        for (let i = 0; i < samplesToDraw; i += 1) {
          const sample = sampleQueueRef.current.shift();
          if (sample === undefined) break;

          const nextX = (sweepXRef.current + pixelsPerSample) % width;
          const nextY = baselineY - sample * (height * 0.38);

          if (nextX < sweepXRef.current) {
            drawGrid(ctx, width, height);
            drawBaseline(ctx, width, height, baselineY);
            lastYRef.current = baselineY;
          }

          drawSegment(sweepXRef.current, lastYRef.current, nextX, nextY);
          sweepXRef.current = nextX;
          lastYRef.current = nextY;
        }
      }

      animationId = requestAnimationFrame(render);
    };

    const init = () => {
      if (measure()) {
        animationId = requestAnimationFrame(render);
      } else {
        animationId = requestAnimationFrame(init);
      }
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
    <div className={`relative overflow-hidden rounded-lg border border-emerald-950/50 ecg-grid ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute left-3 top-3 rounded border border-emerald-900/30 bg-black/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
        Lead I
      </div>
      <div className="pointer-events-none absolute right-3 top-3 text-right">
        <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-600">Gain 10 mm/mV</div>
        <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-600">25 mm/s</div>
      </div>
      {!hasSignal && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded border border-slate-700 bg-black/70 px-4 py-2 text-sm font-bold uppercase tracking-widest text-slate-400">
            No Signal
          </span>
        </div>
      )}
    </div>
  );
}
