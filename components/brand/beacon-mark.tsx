type BeaconMarkVariant = "brand" | "mono" | "watermark";

export function BeaconMark({
  className,
  variant = "brand",
  title
}: {
  className?: string;
  variant?: BeaconMarkVariant;
  title?: string;
}) {
  const tower = variant === "brand" ? "hsl(var(--foreground))" : "currentColor";
  const wave = variant === "mono" || variant === "watermark" ? "currentColor" : "hsl(var(--brand-blue))";
  const gold = variant === "mono" || variant === "watermark" ? "currentColor" : "hsl(var(--brand-gold))";
  // "mono" sits on fixed brand-navy surfaces (launcher FAB and panel header);
  // a theme-driven card color there desyncs light/dark, so use a true cutout.
  const cutout =
    variant === "watermark" ? "hsl(var(--background))" : variant === "mono" ? "transparent" : "hsl(var(--card))";
  const beamOpacity = variant === "watermark" ? 0.15 : 0.28;
  const waveOpacity = variant === "watermark" ? 0.7 : 1;

  return (
    <svg
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={className}
      role={title ? "img" : undefined}
      viewBox="0 0 360 360"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M170 96 18 52c50 5 100 18 150 44Z" fill={gold} opacity={beamOpacity} />
      <path d="M190 96 342 52c-50 5-100 18-150 44Z" fill={gold} opacity={beamOpacity} />

      <path d="M166 56 180 42l14 14 22 20h-72l22-20Z" fill={tower} />
      <path d="M180 78 187 94 204 101 187 108 180 126 173 108 156 101 173 94Z" fill={gold} />
      <rect fill={tower} height="17" rx="2.5" width="60" x="150" y="123" />

      <path d="M137 151h45l-25 148c-14 4-31 4-51-1l31-147Z" fill={tower} />
      <path d="M178 151h45l31 147c-20 5-37 5-51 1l-25-148Z" fill={tower} />
      <path
        d="M180 156 202 277c-6 15-13 27-22 37-9-10-16-22-22-37l22-121Z"
        fill={cutout}
        opacity={variant === "watermark" ? 0.56 : 0.98}
      />

      <path
        d="M75 297c38 22 77 18 119 0 38-16 71-17 104 5-38-10-65-3-101 13-48 21-89 16-122-18Z"
        fill={tower}
        opacity={waveOpacity}
      />
      <path
        d="M112 318c31 12 60 6 88-7 31-14 61-13 86 3-30-4-52 4-79 16-35 16-66 13-95-12Z"
        fill={wave}
        opacity={waveOpacity}
      />
    </svg>
  );
}
