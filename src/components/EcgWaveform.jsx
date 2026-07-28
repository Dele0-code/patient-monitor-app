import { useEffect, useRef } from "react";

const TRACE_COLOR = "#00e676";
const GRID_FINE = "rgba(0, 180, 80, 0.12)";
const GRID_BOLD = "rgba(0, 180, 80, 0.28)";
const BG_COLOR = "#000000";
const ERASE_GAP = 14;
const ADC_BASELINE = 2048;
const SAMPLE_RATE_HZ = 100;

function drawGrid(ctx, width, height) {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, width, height);

  const fineStep = 8;
  const boldStep = 40;

  ctx.strokeStyle = GRID_FINE;
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += fineStep) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += fineStep) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
    ctx.stroke();
  }

  ctx.strokeStyle = GRID_BOLD;
  for (let x = 0; x <= width; x += boldStep) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += boldStep) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
    ctx.stroke();
  }
}

/** Map ESP32 ADC counts to canvas Y — fixed baseline, no per-batch min-max. */
function sampleToY(value, baselineY, height) {
  const v = Number(value);
  if (!Number.isFinite(v)) return baselineY;
  const gain = height * 0.00085;
  return baselineY - (v - ADC_BASELINE) * gain;
}

export default function EcgWaveform({ rawEcg = null, hasSignal = false, className = "" }) {
  const canvasRef = useRef(null);
  const sampleQueueRef = useRef([]);
  const lastYRef = useRef(0);
  const sweepXRef = useRef(0);
  const lastBatchKeyRef = useRef(null);

  useEffect(() => {
    if (!hasSignal || !rawEcg?.length) return;

    const batchKey = rawEcg.join(",");
    if (batchKey === lastBatchKeyRef.current) return;
    lastBatchKeyRef.current = batchKey;

    for (let i = 0; i < rawEcg.length; i += 1) {
      sampleQueueRef.current.push(Number(rawEcg[i]));
    }

    const maxQueue = SAMPLE_RATE_HZ * 3;
    if (sampleQueueRef.current.length > maxQueue) {
      sampleQueueRef.current = sampleQueueRef.current.slice(-maxQueue);
    }
  }, [rawEcg, hasSignal]);

  useEffect(() => {
    if (!hasSignal) {
      sampleQueueRef.current = [];
      lastBatchKeyRef.current = null;
    }
  }, [hasSignal]);

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
      baselineY = height * 0.52;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawGrid(ctx, width, height);
      lastYRef.current = baselineY;
      sweepXRef.current = 0;
      return true;
    };

    const eraseAhead = (x) => {
      const eraseX = Math.max(0, x);
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(eraseX, 0, ERASE_GAP, height);

      const fineStep = 8;
      const boldStep = 40;
      ctx.strokeStyle = GRID_FINE;
      ctx.lineWidth = 1;
      for (let gx = Math.floor(eraseX / fineStep) * fineStep; gx <= eraseX + ERASE_GAP; gx += fineStep) {
        ctx.beginPath();
        ctx.moveTo(gx + 0.5, 0);
        ctx.lineTo(gx + 0.5, height);
        ctx.stroke();
      }
      for (let gy = 0; gy <= height; gy += fineStep) {
        ctx.beginPath();
        ctx.moveTo(eraseX, gy + 0.5);
        ctx.lineTo(eraseX + ERASE_GAP, gy + 0.5);
        ctx.stroke();
      }
      ctx.strokeStyle = GRID_BOLD;
      for (let gx = Math.floor(eraseX / boldStep) * boldStep; gx <= eraseX + ERASE_GAP; gx += boldStep) {
        ctx.beginPath();
        ctx.moveTo(gx + 0.5, 0);
        ctx.lineTo(gx + 0.5, height);
        ctx.stroke();
      }
      for (let gy = 0; gy <= height; gy += boldStep) {
        ctx.beginPath();
        ctx.moveTo(eraseX, gy + 0.5);
        ctx.lineTo(eraseX + ERASE_GAP, gy + 0.5);
        ctx.stroke();
      }
    };

    const drawSegment = (x1, y1, x2, y2) => {
      eraseAhead(x2);
      ctx.strokeStyle = TRACE_COLOR;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
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
        sampleQueueRef.current = [];
        sweepXRef.current = 0;
        lastYRef.current = baselineY;
      } else {
        const pixelsPerSample = Math.max(1.2, width / 300);
        const samplesToDraw = Math.max(1, Math.floor(dt * SAMPLE_RATE_HZ));

        for (let i = 0; i < samplesToDraw; i += 1) {
          const adcValue = sampleQueueRef.current.shift();
          if (adcValue === undefined) break;

          let x1 = sweepXRef.current;
          let x2 = x1 + pixelsPerSample;
          const y1 = lastYRef.current;
          const y2 = sampleToY(adcValue, baselineY, height);

          if (x2 >= width) {
            x2 = width - 1;
            drawSegment(x1, y1, x2, y2);
            drawGrid(ctx, width, height);
            sweepXRef.current = 0;
            lastYRef.current = baselineY;
            x1 = 0;
            x2 = pixelsPerSample;
          }

          drawSegment(x1, y1, x2, y2);
          sweepXRef.current = x2;
          lastYRef.current = y2;
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
    <div className={`relative overflow-hidden bg-black ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute left-2 top-1.5 flex items-baseline gap-3">
        <span className="text-[11px] font-bold tracking-wider text-emerald-400">ECG II</span>
        <span className="text-[10px] tracking-wider text-emerald-700">x1</span>
      </div>
      <div className="pointer-events-none absolute right-2 top-1.5 text-right text-[10px] leading-tight tracking-wider text-emerald-700">
        <div>25 mm/s</div>
        <div>10 mm/mV</div>
      </div>
      {!hasSignal && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold uppercase tracking-[0.25em] text-slate-500">No Signal</span>
        </div>
      )}
    </div>
  );
}
