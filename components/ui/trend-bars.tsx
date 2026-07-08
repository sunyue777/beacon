const BAR_WIDTH = 5;
const BAR_GAP = 3;
const HEIGHT = 26;

/**
 * Minimal weekly-trend bar strip. Values render oldest → newest; the newest
 * bar is emphasized, earlier bars fade back. Color comes from `color`
 * (an hsl()/token string) so callers can tie it to a role accent.
 */
export function TrendBars({
  values,
  color = "hsl(var(--primary))",
  label
}: {
  values: number[];
  color?: string;
  label?: string;
}) {
  const max = Math.max(...values, 1);
  const width = values.length * (BAR_WIDTH + BAR_GAP) - BAR_GAP;

  return (
    <svg
      width={width}
      height={HEIGHT}
      viewBox={`0 0 ${width} ${HEIGHT}`}
      role="img"
      aria-label={label ?? `Weekly trend: ${values.join(", ")}`}
      className="shrink-0"
    >
      {values.map((value, index) => {
        const barHeight = Math.max(2.5, (value / max) * (HEIGHT - 3));
        return (
          <rect
            key={index}
            x={index * (BAR_WIDTH + BAR_GAP)}
            y={HEIGHT - barHeight}
            width={BAR_WIDTH}
            height={barHeight}
            rx={1.5}
            fill={color}
            opacity={index === values.length - 1 ? 1 : 0.28 + (index / values.length) * 0.3}
          />
        );
      })}
    </svg>
  );
}
