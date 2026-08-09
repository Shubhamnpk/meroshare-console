import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ErrorBlock, LoadingBlock, EmptyBlock } from "@/components/states";
import { mySharesQuery } from "@/lib/queries";
import { formatQty } from "@/lib/format";

export const Route = createFileRoute("/_dash/shares")({
  head: () => ({
    meta: [
      { title: "My Shares — MeroShare Investor Console" },
      { name: "description", content: "Free, pledged and locked-in balances for every scrip you hold." },
      { property: "og:title", content: "My Shares — MeroShare Investor Console" },
      { property: "og:description", content: "Free, pledged and locked-in balances for every scrip you hold." },
    ],
  }),
  component: SharesPage,
});

function SharesPage() {
  const q = useQuery(mySharesQuery());
  const items = q.data ?? [];
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">My Shares</h1>
        <p className="mt-1 text-sm text-muted-foreground">Balance breakdown per scrip.</p>
      </div>
      {q.isLoading ? (
        <LoadingBlock label="Loading shares" />
      ) : q.isError ? (
        <ErrorBlock error={q.error} retry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyBlock title="No shares" description="Nothing is held in this demat account yet." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item, idx) => (
            <li key={`${item.script}-${idx}`} className="rounded-2xl border border-border/70 bg-card p-4">
              <p className="font-display text-base font-semibold">{item.script}</p>
              <p className="truncate text-xs text-muted-foreground">{item.scriptDesc}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-xs text-muted-foreground">Current</dt><dd className="num font-medium">{formatQty(item.currentBalance)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Free</dt><dd className="num font-medium">{formatQty(item.freeBalance)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Pledged</dt><dd className="num font-medium">{formatQty(item.pledgedBalance)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Locked in</dt><dd className="num font-medium">{formatQty(item.lockInBalance)}</dd></div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
