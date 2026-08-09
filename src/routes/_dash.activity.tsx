import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ErrorBlock, EmptyBlock, LoadingBlock } from "@/components/states";
import { activityLogQuery, defaultActivityRange } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_dash/activity")({
  head: () => ({
    meta: [
      { title: "Activity Log — MeroShare Investor Console" },
      { name: "description", content: "Recent sign-ins and account activity recorded by MeroShare." },
      { property: "og:title", content: "Activity Log — MeroShare Investor Console" },
      { property: "og:description", content: "Recent sign-ins and account activity recorded by MeroShare." },
    ],
  }),
  component: ActivityPage,
});

function ActivityPage() {
  const range = defaultActivityRange();
  const q = useQuery(activityLogQuery(range.startDate, range.endDate));
  const items = q.data?.items ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Activity Log</h1>
        <p className="mt-1 text-sm text-muted-foreground">Last 30 days of account activity.</p>
      </div>
      {q.isLoading ? (
        <LoadingBlock label="Loading activity" />
      ) : q.isError ? (
        <ErrorBlock error={q.error} retry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyBlock title="No activity" description="Nothing recorded in this period." />
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card">
          {items.map((item, idx) => (
            <li key={idx} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{item.activityType ?? "Activity"}</p>
                <p className="truncate text-xs text-muted-foreground">{item.browserName} · {item.osName}</p>
              </div>
              <div className="shrink-0 text-right text-xs text-muted-foreground">
                <p className="num">{item.ipAddress}</p>
                <p>{formatDateTime(item.recordedDate)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
