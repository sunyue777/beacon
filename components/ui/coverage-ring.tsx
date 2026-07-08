const RADIUS = 15.5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Compact SVG donut for coverage-style percentages (0–100).
 * Tone follows the shared state tokens: warning under the threshold,
 * success at or above it. Sized for inline stat rows; pass `size` to scale.
 */
export function CoverageRing({
  pct,
  size = 40,
  threshold = 60,
  label
}: {
  pct: number;
  size?: number;
  threshold?: number;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const tone = clamped < threshold ? "warning" : "success";
  const filled = (clamped / 100) * CIRCUMFERENCE;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label={label ?? `${clamped}% coverage`}
      className="shrink-0"
    >
      <circle cx="20" cy="20" r={RADIUS} fill="none" stroke="hsl(var(--muted))" strokeWidth="4" />
      <circle
        cx="20"
        cy="20"
        r={RADIUS}
        fill="none"
        stroke={`hsl(var(--${tone}))`}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${CIRCUMFERENCE - filled}`}
        transform="rotate(-90 20 20)"
      />
      <text
        x="20"
        y="21.5"
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-foreground tabular-nums"
        fontSize="11"
        fontWeight="600"
      >
        {clamped}
        <tspan fontSize="6.5" fontWeight="500" opacity="0.65">
          %
        </tspan>
      </text>
    </svg>
  );
}
