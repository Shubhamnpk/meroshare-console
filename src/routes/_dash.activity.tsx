import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ErrorBlock, EmptyBlock, LoadingBlock } from "@/components/states";
import { useMemo, useState } from "react";
import { Globe, History, MonitorSmartphone, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExportButton, csvRow } from "@/components/export-dialog";
import { activityLogQuery, defaultActivityRange } from "@/lib/queries";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { ActivityLogItem } from "@/lib/meroshare/types";

export const Route = createFileRoute("/_dash/activity")({
  head: () => ({
    meta: [
      { title: "Activity Log : MeroShare Investor Console" },
      {
        name: "description",
        content: "Recent signins and account activity recorded by MeroShare.",
      },
      { property: "og:title", content: "Activity Log : MeroShare Investor Console" },
      {
        property: "og:description",
        content: "Recent signins and account activity recorded by MeroShare.",
      },
    ],
  }),
  component: ActivityPage,
});

function activityCsv(items: ActivityLogItem[]) {
  const rows = items.map((item, i) =>
    csvRow([
      i + 1,
      String(item.description ?? item.activityType ?? ""),
      String(item.browserName ?? ""),
      String(item.broswerVersion ?? ""),
      String(item.osName ?? ""),
      String(item.ipAddress ?? ""),
      String(item.recordedDate ?? ""),
    ]),
  );
  return [
    csvRow(["SN", "Activity", "Browser", "Browser version", "OS", "IP address", "Recorded on"]),
    ...rows,
  ].join("\n");
}

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-card px-3.5 py-2">
      <span className="text-muted-foreground">{icon}</span>
      <div className="leading-tight">
        <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="num font-semibold">{value}</p>
      </div>
    </div>
  );
}

function ActivityPage() {
  const range = defaultActivityRange();
  const q = useQuery(activityLogQuery(range.startDate, range.endDate));
  const [search, setSearch] = useState("");
  const all = q.data?.items ?? [];

  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return all;
    return all.filter((item) =>
      [
        item.description,
        item.activityType,
        item.browserName,
        item.broswerVersion,
        item.osName,
        item.ipAddress,
      ]
        .filter((v): v is string => typeof v === "string" && v.trim() !== "")
        .some((v) => v.toLowerCase().includes(term)),
    );
  }, [all, search]);

  const uniqueIps = useMemo(
    () => new Set(all.map((i) => i.ipAddress).filter((v): v is string => !!v)).size,
    [all],
  );
  const uniqueBrowsers = useMemo(
    () => new Set(all.map((i) => String(i.browserName ?? "")).filter((v) => v.trim() !== "")).size,
    [all],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Activity Log</h1>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
            Last 30 days of account activity.
          </p>
        </div>
        <ExportButton
          disabled={items.length === 0}
          formats={[
            {
              title: "CSV",
              description: "Activity, browser, OS and IP per row",
              filename: "activity-log",
              extension: "csv",
              build: () => activityCsv(items),
            },
            {
              title: "JSON",
              description: "Raw sign-in and account activity records",
              filename: "activity-log",
              extension: "json",
              build: () => JSON.stringify(items, null, 2),
            },
            {
              title: "PDF",
              description: "Formatted activity log for printing or sharing",
              filename: "activity-log",
              extension: "pdf",
              build: () => "",
              pdf: () => ({
                title: "Account activity log",
                head: ["SN", "Activity", "Browser", "OS", "IP address", "Recorded on"],
                body: items.map((item, i) => [
                  i + 1,
                  String(item.description ?? item.activityType ?? ""),
                  `${String(item.browserName ?? "")} ${String(item.broswerVersion ?? "")}`.trim(),
                  String(item.osName ?? ""),
                  String(item.ipAddress ?? ""),
                  String(item.recordedDate ?? ""),
                ]),
              }),
            },
          ]}
        />
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search activity, browser or IP…"
          className="h-10 rounded-xl pl-9"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <StatChip
          icon={<History className="size-4" />}
          label="Records"
          value={formatNumber(all.length)}
        />
        <StatChip
          icon={<Globe className="size-4" />}
          label="Unique IPs"
          value={formatNumber(uniqueIps)}
        />
        <StatChip
          icon={<MonitorSmartphone className="size-4" />}
          label="Unique browsers"
          value={formatNumber(uniqueBrowsers)}
        />
      </div>

      {q.isLoading ? (
        <LoadingBlock label="Loading activity" />
      ) : q.isError ? (
        <ErrorBlock error={q.error} retry={() => void q.refetch()} />
      ) : all.length === 0 ? (
        <EmptyBlock title="No activity" description="Nothing recorded in this period." />
      ) : items.length === 0 ? (
        <EmptyBlock title="No matches" description="Nothing matches your search." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-10 pl-4">SN</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead>Browser</TableHead>
                <TableHead className="hidden md:table-cell">OS</TableHead>
                <TableHead className="hidden sm:table-cell">IP address</TableHead>
                <TableHead className="pr-4 text-right">Recorded on</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, idx) => (
                <TableRow key={`${String(item.recordedDate)}-${item.ipAddress}-${idx}`}>
                  <TableCell className="pl-4 text-xs text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell
                    className="max-w-64 truncate font-medium"
                    title={String(item.description ?? item.activityType ?? "")}
                  >
                    {item.description ?? item.activityType ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {item.browserName ?? "—"}
                    {item.broswerVersion ? (
                      <span className="text-muted-foreground"> {item.broswerVersion}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                    {item.osName ?? "—"}
                  </TableCell>
                  <TableCell className="num hidden text-xs sm:table-cell">
                    {item.ipAddress ?? "—"}
                  </TableCell>
                  <TableCell className="num whitespace-nowrap pr-4 text-right text-xs">
                    {formatDateTime(item.recordedDate)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
