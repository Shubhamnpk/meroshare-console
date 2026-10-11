import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWatchlist } from "@/lib/watchlist";
import { WatchlistPanel } from "./watchlist-panel";

const STORAGE_KEY = "ms-watchlist-float-y.v1";
const DEFAULT_FRAC = 0.42;
const MIN_FRAC = 0.06;
const MAX_FRAC = 0.94;

function loadY(): number {
  try {
    const v = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(v) && v >= MIN_FRAC && v <= MAX_FRAC) return v;
  } catch {
    // SSR / private mode — fall back to the default spot.
  }
  return DEFAULT_FRAC;
}

/**
 * Floating watchlist tab pinned to the right viewport edge (desktop only).
 * Drag it up/down to reposition (position persists); click (or Enter) opens
 * the watchlist panel.
 */
export function WatchlistFloat({ count, onOpen }: { count: number; onOpen: () => void }) {
  const [frac, setFrac] = useState(DEFAULT_FRAC);
  const [dragging, setDragging] = useState(false);
  const fracRef = useRef(frac);
  fracRef.current = frac;
  const drag = useRef<{ startY: number; startFrac: number; moved: boolean } | null>(null);

  useEffect(() => {
    setFrac(loadY());
  }, []);

  const persist = (v: number) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(v));
    } catch {
      // ignore
    }
  };

  const endDrag = (shouldOpen: boolean) => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d) return;
    if (!d.moved && shouldOpen) onOpen();
    else if (d.moved) persist(fracRef.current);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={count > 0 ? `Open watchlist, ${count} symbols` : "Open watchlist"}
      title="Watchlist — drag to move, click to open"
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        drag.current = { startY: e.clientY, startFrac: fracRef.current, moved: false };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dy = e.clientY - d.startY;
        if (Math.abs(dy) > 4) d.moved = true;
        const vh = window.innerHeight || 800;
        const next = Math.min(MAX_FRAC, Math.max(MIN_FRAC, d.startFrac + dy / vh));
        fracRef.current = next;
        setFrac(next);
      }}
      onPointerUp={() => endDrag(true)}
      onPointerCancel={() => endDrag(false)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{ top: `${frac * 100}vh` }}
      className={cn(
        "fixed right-0 z-30 hidden -translate-y-1/2 touch-none select-none flex-col items-center gap-1 rounded-l-2xl border border-r-0 border-border/70 bg-card/95 py-3 pl-1.5 pr-1 shadow-lg backdrop-blur transition-colors hover:border-primary/40 hover:text-foreground lg:flex",
        dragging ? "cursor-grabbing text-foreground" : "cursor-grab text-muted-foreground",
      )}
    >
      <Star className={cn("size-4", count > 0 && "fill-warning text-warning")} aria-hidden />
      {count > 0 ? (
        <span className="num text-[0.65rem] font-bold leading-none">{count}</span>
      ) : null}
      <span
        aria-hidden
        className="flex flex-col gap-0.5 opacity-50"
      >
        <span className="size-1 rounded-full bg-current" />
        <span className="size-1 rounded-full bg-current" />
        <span className="size-1 rounded-full bg-current" />
      </span>
    </div>
  );
}

/**
 * Drop-in floating watchlist for any page: owns its open state and panel.
 * Picking a symbol deep-links to the terminal unless overridden.
 */
export function WatchlistFloatHost({ onPick }: { onPick?: (symbol: string) => void } = {}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const watchlist = useWatchlist();
  const pick = (symbol: string) => {
    setOpen(false);
    if (onPick) onPick(symbol);
    else void navigate({ to: "/terminal", search: { symbol } });
  };
  return (
    <>
      <WatchlistPanel open={open} onOpenChange={setOpen} onPick={pick} />
      <WatchlistFloat count={watchlist.symbols.length} onOpen={() => setOpen(true)} />
    </>
  );
}
