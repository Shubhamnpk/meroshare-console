import * as React from "react";

import { cn } from "@/lib/utils";

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & {
    /**
     * Pass-through wrapper (default): below xl it keeps horizontal
     * scrolling; at xl+ it stops being a scroll container so sticky
     * headers ride the page scroll (`clip` still guards against blowout).
     * Set false to force the legacy always-trapping wrapper (e.g. tables
     * inside tight custom scrollers). Headers still need trap-free
     * ancestors: prefer `overflow-clip` over `overflow-hidden` on hosts.
     */
    viewportSticky?: boolean;
  }
>(({ className, viewportSticky = true, ...props }, ref) => {
  const tableRef = React.useRef<HTMLTableElement | null>(null);
  React.useEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const thead = table.querySelector("thead");
    if (!(thead instanceof HTMLElement)) return;
    if (table.closest('[role="dialog"]')) return;
    const mq = window.matchMedia("(max-width: 1279.98px)");
    const STUCK_TOP = 63;
    let raf = 0;
    const update = () => {
      raf = 0;
      if (!mq.matches) {
        thead.style.transform = "";
        return;
      }
      const r = table.getBoundingClientRect();
      const y = Math.max(0, Math.min(STUCK_TOP - r.top, r.bottom - thead.offsetHeight - r.top));
      thead.style.transform = y > 0 ? `translateY(${y}px)` : "";
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    mq.addEventListener("change", schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      mq.removeEventListener("change", schedule);
      thead.style.transform = "";
    };
  }, []);
  return (
    <div className={cn("relative w-full overflow-x-auto", viewportSticky && "xl:overflow-x-clip")}>
      <table
        ref={(node) => {
          tableRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
});
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead
      ref={ref}
      className={cn(
        // Pure-CSS viewport sticky works only at xl (the wrapper clips there,
        // so no scroll trap). Below xl the overflow-x-auto wrapper is a scroll
        // container, so a CSS top offset would park the header 4rem inside
        // the card (gap above, overlapping row 1) — hence `auto` here, while
        // the Table effect nudges the thead under the navbar with translateY
        // (verified: pins at 63px, zero column drift on horizontal swipe).
        // Dialog/Drawer/Sheet set `[--sticky-top:0]` and scroll themselves,
        // so the header sticks there at every breakpoint.
        // The -1px pull hides the 1px collapse slit (tr borders don't paint
        // in sticky context); the shadow is the bottom edge because shadows
        // stick while collapse borders don't — same 1px look at rest.
        "sticky top-[var(--sticky-top,auto)] xl:top-[calc(var(--sticky-top,4rem)-1px)] z-10 bg-card shadow-[0_1px_0_0_var(--color-border)]",
        className,
      )}
      {...props}
    />
  ),
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  ),
);
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot ref={ref} className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)} {...props} />
  ),
);
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn("border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted", className)}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        // Canonical header cell: explicit per-cell classes (align, responsive
        // visibility, custom padding) always win via merge.
        "h-10 px-4 py-2.5 text-left align-middle text-xs font-medium uppercase tracking-wider text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn(
        // Canonical body cell; explicit per-cell classes always win via merge.
        "px-4 py-2.5 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  ),
);
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
  ),
);
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
