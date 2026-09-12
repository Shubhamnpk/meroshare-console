import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FlaskConical, Info, Layers, Send, XCircle } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/ui/button";
import { EdisTransferList, EdisNodelTrades, EdisPoolAccountStatus } from "@/components/tools/edis";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_dash/edis")({
  head: () => ({
    meta: [
      { title: "EDIS Share Transfer | MeroShare Investor Console" },
      {
        name: "description",
        content:
          "Electronic Delivery Instruction System - transfer shares between demat accounts, view active transfers, and track no-delivery trades.",
      },
      { property: "og:title", content: "EDIS Share Transfer | MeroShare Investor Console" },
    ],
  }),
  component: EdisPage,
});

type Tab = "transfers" | "nodel" | "about";

function EdisPage() {
  const [tab, setTab] = useState<Tab>("transfers");
  const { edisBeta, setEdisBeta } = useSettings();

  if (!edisBeta) {
    return (
      <div className="space-y-6">
        <header className="space-y-1">
          <BackButton fallback="/tools" label="Tools" />
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
            EDIS Share Transfer
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[0.68rem] font-semibold text-warning">
              Beta
            </span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Electronic Delivery Instruction System. Still in beta and off by default.
          </p>
        </header>
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-border/70 bg-card p-6">
          <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <FlaskConical className="size-5" />
          </span>
          <div>
            <p className="font-semibold">Enable EDIS beta to continue</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Turn it on in Settings → Advanced. You can switch it back off anytime.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setEdisBeta(true)}>
              Enable EDIS beta
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/settings" search={{ tab: "advanced" }}>
                Open settings
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: typeof Layers }[] = [
    { key: "transfers", label: "Active Transfers", icon: Layers },
    { key: "nodel", label: "No-Delivery Trades", icon: XCircle },
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <BackButton fallback="/tools" label="Tools" />
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
          EDIS Share Transfer
          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[0.68rem] font-semibold text-warning">
            Beta
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Electronic Delivery Instruction System. Transfer shares between demat accounts, view
          active transfers, and track no-delivery trades.
        </p>
      </header>

      <EdisPoolAccountStatus />

      <div className="flex gap-1 rounded-xl border border-border/70 bg-muted/30 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              tab === t.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="size-4" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-[400px]">
        {tab === "transfers" && <EdisTransferList />}
        {tab === "nodel" && <EdisNodelTrades />}
      </div>
    </div>
  );
}
