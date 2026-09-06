import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SwipeableCards({
  cards,
  className,
  cardClassName,
}: {
  cards: ReactNode[];
  className?: string;
  cardClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const index = Math.round(el.scrollLeft / el.clientWidth);
      setActive((prev) => (prev !== index ? index : prev));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const goTo = (index: number) => {
    const el = containerRef.current;
    if (!el) return;
    const cards = el.querySelectorAll<HTMLElement>("[data-card]");
    if (!cards[index]) return;
    el.style.scrollSnapType = "none";
    cards[index]?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    window.setTimeout(() => {
      el.style.scrollSnapType = "x mandatory";
    }, 400);
    setActive(index);
  };

  return (
    <div className={cn("w-full", className)}>
      <div
        ref={containerRef}
        className="flex overflow-x-auto px-4 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          scrollBehavior: "smooth",
          WebkitOverflowScrolling: "touch",
          scrollSnapType: "x mandatory",
        }}
      >
        {cards.map((card, i) => (
          <div
            key={i}
            data-card
            className="flex shrink-0 snap-start"
            style={{ width: "calc(100% - 16px)", scrollSnapAlign: "start" }}
          >
            <div className={cn("mr-4 min-w-0 flex-1", cardClassName)}>{card}</div>
          </div>
        ))}
      </div>

      {cards.length > 1 ? (
        <div className="mt-3 flex justify-center gap-3">
          {cards.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to card ${i + 1}`}
              className={cn(
                "relative rounded-full transition-all duration-300",
                active === i
                  ? "h-2 w-6 scale-110 bg-primary"
                  : "h-2 w-2 bg-muted-foreground/40 hover:bg-muted-foreground/60",
              )}
            >
              {active === i ? (
                <div className="absolute inset-0 animate-pulse rounded-full bg-primary/30" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Peeking swipe strip (the Market pattern): horizontal snap scroll with the
 * next card peeking on phones, a plain grid on sm+. Children carry their own
 * widths — wrap them in {@link SwipeItem} or pass equivalent classes.
 */
export function SwipeStrip({
  children,
  cols = "sm:grid-cols-2 xl:grid-cols-4",
  className,
}: {
  children: ReactNode;
  cols?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] sm:grid sm:snap-none sm:overflow-x-visible sm:pb-0 [&::-webkit-scrollbar]:hidden",
        cols,
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Fixed-width peeking item for {@link SwipeStrip} on phones, fluid in grids. */
export function SwipeItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("w-[15.5rem] shrink-0 snap-start sm:w-auto", className)}>
      {children}
    </div>
  );
}
