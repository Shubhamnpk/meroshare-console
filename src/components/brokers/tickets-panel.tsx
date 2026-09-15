import { useQuery } from "@tanstack/react-query";
import { LifeBuoy } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { brokerTicketsQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { BrokerId } from "@/lib/brokers/types";

/** Broker support tickets, living on the broker page (not in notifications). */
export function BrokerTicketsPanel({ brokerId }: { brokerId: BrokerId | null }) {
  const tickets = useQuery(brokerTicketsQuery(brokerId));
  if (!brokerId) return null;

  const list = tickets.data ?? [];
  const unread = list.filter((t) => t.unread).length;

  return (
    <Panel as="section">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <LifeBuoy className="size-4 text-primary" /> Broker support
        </h2>
        {unread > 0 ? (
          <span className="num rounded-full bg-primary/15 px-2 py-0.5 text-[0.68rem] font-semibold text-primary">
            {unread} unread
          </span>
        ) : null}
      </div>
      {tickets.isPending ? (
        <p className="py-4 text-center text-xs text-muted-foreground">Checking tickets…</p>
      ) : tickets.isError ? (
        <div className="flex flex-wrap items-center justify-between gap-2 py-2">
          <p className="text-xs text-muted-foreground">Tickets unavailable right now.</p>
          <button
            type="button"
            onClick={() => void tickets.refetch()}
            className="text-xs font-medium text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      ) : list.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">No support tickets.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {list.map((t) => (
            <li key={t.id || t.description} className="flex items-start gap-2.5 py-2.5">
              <span
                className={cn(
                  "mt-1.5 size-1.5 shrink-0 rounded-full",
                  t.status === "resolved"
                    ? "bg-emerald-500"
                    : t.status === "pending"
                      ? "bg-amber-500"
                      : "bg-primary",
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-medium leading-snug">
                  <span className="truncate">{t.description || `Ticket ${t.id}`}</span>
                  {t.unread ? <span className="size-1.5 shrink-0 rounded-full bg-primary" /> : null}
                </span>
                <span className="mt-0.5 block text-xs capitalize text-muted-foreground">
                  {t.status}
                  {t.time ? ` · ${t.time}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
