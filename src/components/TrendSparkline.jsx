/** Dependency-free inline-SVG sparkline. Scales to its container width. */
export default function TrendSparkline({
  values,
  color = "#38bdf8",
  height = 20,
  min = null,
  max = null,
  alert = false,
}) {
  const nums = (values || []).filter((v) => typeof v === "number" && !Number.isNaN(v));
  if (nums.length < 2) return null;

  const width = 100; // viewBox units; preserveAspectRatio=none stretches to container
  const pad = 2;
  const lo = min ?? Math.min(...nums);
  const hi = max ?? Math.max(...nums);
  const range = hi - lo || 1;
  const stepX = (width - pad * 2) / (nums.length - 1);

  const pts = nums.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (v - lo) / range) * (height - pad * 2);
    return [x, y];
  });

  const stroke = alert ? "#f87171" : color;
  const [lastX, lastY] = pts[pts.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      className="block"
      aria-hidden="true"
    >
      <polyline
        points={pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastX.toFixed(2)} cy={lastY.toFixed(2)} r="1.7" fill={stroke} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
