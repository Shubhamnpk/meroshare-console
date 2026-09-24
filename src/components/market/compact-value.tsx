import { useEffect, useRef, useState } from "react";
import { formatNpr, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Compact number with the full figure on hover. When the value is small
 * enough that compact === full, no tooltip is rendered.
 */
function Hoverable({
  short,
  full,
  className,
}: {
  short: string;
  full: string;
  className?: string | undefined;
}) {
  if (short === full) return <span className={className}>{short}</span>;
  return (
    <span className={className} title={full}>
      {short}
    </span>
  );
}

export function CompactNpr({
  value,
  compact = true,
  className,
}: {
  value: unknown;
  compact?: boolean | undefined;
  className?: string | undefined;
}) {
  return (
    <Hoverable
      short={formatNpr(value, { compact })}
      full={formatNpr(value)}
      className={className}
    />
  );
}

/**
 * Automatic mode: shows the full figure, but switches to the compact form
 * (with the full figure on hover) only when the row would otherwise
 * overflow. Watches the parent row directly, so it flips back to full
 * automatically when space allows — no stuck states.
 */
export function AdaptiveNpr({
  value,
  className,
}: {
  value: unknown;
  className?: string | undefined;
}) {
  const full = formatNpr(value);
  const short = formatNpr(value, { compact: true });
  const [useShort, setUseShort] = useState(false);
  const selfRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (full === short) {
      setUseShort(false);
      return;
    }
    const parent = selfRef.current?.parentElement;
    if (!parent) return;
    const check = () => setUseShort(parent.scrollWidth > parent.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(parent);
    window.addEventListener("resize", check);
    if (typeof document !== "undefined" && document.fonts) {
      void document.fonts.ready.then(check);
    }
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", check);
    };
  }, [full, short]);

  return (
    <span ref={selfRef} className={cn("truncate", className)} title={useShort ? full : undefined}>
      {useShort ? short : full}
    </span>
  );
}

export function CompactQty({
  value,
  compact = true,
  className,
}: {
  value: unknown;
  compact?: boolean | undefined;
  className?: string | undefined;
}) {
  return (
    <Hoverable
      short={formatQty(value, { compact })}
      full={formatQty(value)}
      className={className}
    />
  );
}
