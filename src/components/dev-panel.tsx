import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/settings";

const DEMO_TOASTS: { label: string; run: () => void }[] = [
  { label: "Success", run: () => toast.success("Order placed", { description: "ALI100 × 50 @ NPR 412.50" }) },
  {
    label: "Error",
    run: () => toast.error("Order rejected", { description: "Insufficient balance — required NPR 5,400" }),
  },
  { label: "Warning", run: () => toast.warning("Price alert", { description: "NABIL crossed NPR 1,205" }) },
  { label: "Info", run: () => toast.info("Market opens soon", { description: "Session 11:00–15:00 NPT" }) },
  { label: "Default", run: () => toast("Session expired") },
  {
    label: "Action",
    run: () =>
      toast("AMO queued", {
        description: "Fires when the market opens",
        action: { label: "View", onClick: () => {} },
      }),
  },
];

const SECTION_LABEL = "mb-2 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">
      {children}
    </kbd>
  );
}

export function DevPanel() {
  const [open, setOpen] = useState(false);
  const tabHeld = useRef(false);
  const tabTimeout = useRef<number | undefined>(undefined);
  const closeRef = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();
  const { theme, setTheme } = useSettings();

  useEffect(() => {
    const clearTab = () => {
      tabHeld.current = false;
      window.clearTimeout(tabTimeout.current);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        tabHeld.current = true;
        window.clearTimeout(tabTimeout.current);
        tabTimeout.current = window.setTimeout(clearTab, 1500);
      } else if (e.key === "Escape") {
        setOpen(false);
      } else if ((e.key === "d" || e.key === "D") && tabHeld.current && !e.repeat) {
        e.preventDefault();
        clearTab();
        setOpen((o) => !o);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Tab") clearTab();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearTab);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearTab);
      window.clearTimeout(tabTimeout.current);
    };
  }, []);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  const runLoading = () => {
    const id = toast.loading("Placing order…", { description: "Sending to broker" });
    window.setTimeout(() => {
      toast.success("Order placed", { id, description: "ALI100 × 50 @ NPR 412.50" });
    }, 2000);
  };

  if (!open) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[99999] w-80 rounded-xl border border-border bg-card p-4 text-foreground shadow-xl">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">Dev tools</div>
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Kbd>Tab</Kbd> hold + <Kbd>D</Kbd> to toggle
          </div>
        </div>
        <Button
          ref={closeRef}
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Close dev panel"
          onClick={() => setOpen(false)}
        >
          ✕
        </Button>
      </div>

      <div className={SECTION_LABEL}>Toasts</div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {DEMO_TOASTS.map((t) => (
          <Button key={t.label} variant="outline" size="sm" onClick={t.run}>
            {t.label}
          </Button>
        ))}
        <Button variant="outline" size="sm" onClick={runLoading}>
          Loading → ✓
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => DEMO_TOASTS.forEach((t, i) => window.setTimeout(t.run, i * 120))}
        >
          Fire all
        </Button>
        <Button variant="outline" size="sm" onClick={() => toast.dismiss()}>
          Dismiss all
        </Button>
      </div>

      <div className={SECTION_LABEL}>Queries</div>
      <div className="mb-4">
        <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries()}>
          Invalidate all
        </Button>
      </div>

      <div className={SECTION_LABEL}>Theme</div>
      <div className="mb-4 flex gap-1.5">
        {(["light", "dark", "system"] as const).map((t) => (
          <Button
            key={t}
            variant={theme === t ? "default" : "outline"}
            size="sm"
            className="capitalize"
            onClick={() => setTheme(t)}
          >
            {t}
          </Button>
        ))}
      </div>

      <div className="border-t border-border pt-2 text-[11px] text-muted-foreground">
        mode: {import.meta.env.MODE} · <span className="font-mono">window.toast()</span> in console
      </div>
    </div>
  );
}
