import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ErrorBlock, LoadingBlock, EmptyBlock } from "@/components/states";
import { applicationReportsQuery, oldApplicationReportsQuery } from "@/lib/queries";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ApplicationReportItem } from "@/lib/meroshare/types";

export const Route = createFileRoute("/_dash/reports")({
  head: () => ({
    meta: [
      { title: "Application Report — MeroShare Investor Console" },
      { name: "description", content: "Track the status of your current and past ASBA share applications." },
      { property: "og:title", content: "Application Report — MeroShare Investor Console" },
      { property: "og:description", content: "Track the status of your current and past ASBA share applications." },
    ],
  }),
  component: ReportsPage,
});

function ReportList({ items }: { items: ApplicationReportItem[] }) {
  if (items.length === 0) {
    return <EmptyBlock title="No applications" description="Applications you submit will be listed here." />;
  }
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {items.map((item) => (
        <li key={`${item.companyShareId}-${item.applicantFormId ?? 0}`} className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{item.companyName}</p>
              <p className="num text-xs text-muted-foreground">{item.scrip} · {item.shareTypeName} {item.shareGroupName}</p>
            </div>
            <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[0.68rem] font-semibold">
              {item.statusName ?? "—"}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ReportsPage() {
  const current = useQuery(applicationReportsQuery());
  const old = useQuery(oldApplicationReportsQuery());
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Application Report</h1>
        <p className="mt-1 text-sm text-muted-foreground">Status of your ASBA share applications.</p>
      </div>
      <Tabs defaultValue="current">
        <TabsList>
          <TabsTrigger value="current">Current</TabsTrigger>
          <TabsTrigger value="old">Old</TabsTrigger>
        </TabsList>
        <TabsContent value="current" className="mt-4">
          {current.isLoading ? <LoadingBlock label="Loading applications" />
            : current.isError ? <ErrorBlock error={current.error} retry={() => void current.refetch()} />
            : <ReportList items={current.data ?? []} />}
        </TabsContent>
        <TabsContent value="old" className="mt-4">
          {old.isLoading ? <LoadingBlock label="Loading history" />
            : old.isError ? <ErrorBlock error={old.error} retry={() => void old.refetch()} />
            : <ReportList items={old.data ?? []} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
