export function RangeBar({
  low,
  high,
  value,
  format,
  tone,
  showValueLabel = true,
  colorByPosition = false,
  valueToneByPosition = false,
}: {
  low: number;
  high: number;
  value: number;
  format: (v: number) => string;
  tone?: "gain" | "loss" | null;
  showValueLabel?: boolean;
  colorByPosition?: boolean;
  valueToneByPosition?: boolean;
}) {
  const pct = high > low ? Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100)) : 0;
  const toneClass =
    tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : "text-foreground";
  const dotClass = tone === "gain" ? "bg-gain" : tone === "loss" ? "bg-loss" : "bg-primary";
  const posFill = pct < 33 ? "bg-loss/70" : pct < 66 ? "bg-warning/70" : "bg-gain/70";
  const posDot = pct < 33 ? "bg-loss" : pct < 66 ? "bg-warning" : "bg-gain";
  const posText = pct < 33 ? "text-loss" : pct < 66 ? "text-warning" : "text-gain";
  return (
    <div>
      <div className="relative mt-2 flex h-1.5 rounded-full bg-muted">
        <div
          className={`rounded-full ${colorByPosition ? posFill : "bg-primary/70"}`}
          style={{ width: `${pct}%` }}
        />
        <span
          aria-hidden
          title={format(value)}
          className={`absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface ${colorByPosition ? posDot : dotClass}`}
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="num mt-1 flex justify-between text-[0.65rem] text-muted-foreground">
        <span>{format(low)}</span>
        {showValueLabel ? (
          <span className={`font-semibold ${valueToneByPosition ? posText : toneClass}`}>
            {format(value)}
          </span>
        ) : null}
        <span>{format(high)}</span>
      </div>
    </div>
  );
}
