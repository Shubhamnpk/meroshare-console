import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowUpRight, CalendarRange, CheckCircle2, ClipboardList, Rocket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyBlock, ErrorBlock, SkeletonCards, SkeletonLines } from "@/components/states";
import {
  applicableIssuesQuery,
  applicationDetailsQuery,
  applicationReportsQuery,
  currentIssuesQuery,
  ipoArchiveQuery,
  mfPipelineByTypeQuery,
  sessionQuery,
} from "@/lib/queries";
import { useSettings } from "@/lib/settings";
import {
  isDemoIssueId,
  loadDemoApplications,
  removeDemoApplication,
  toDetailRecord,
  toReportItem,
} from "@/lib/demo-ipo";
import { deleteIpoApply } from "@/lib/meroshare/ipo.functions";
import { daysUntil, errorMessage, formatDate, formatNpr, formatNumber, formatQty, toNumber } from "@/lib/format";
import type { ApplicableIssue, JsonRecord } from "@/lib/meroshare/types";
import type { IpoArchiveRow } from "@/lib/nepse/types";
import type { MfPipelineType } from "@/lib/mutual-funds/types";
import { sameCompany } from "@/lib/notifications";
import { ApplicationReports } from "@/components/ipo/application-reports";
import { IpoDetailSheet, type IpoSheetEdit, type IpoSheetIssue } from "@/components/ipo/ipo-detail-sheet";
import { cn } from "@/lib/utils";
import { ogImage, canonicalLink } from "@/lib/seo";
import { parseBsRange, statusGroup, upcomingMerged } from "@/lib/ipo/status";

export const Route = createFileRoute("/_dash/ipo")({
  validateSearch: (search: Record<string, unknown>): { tab?: string | undefined } => ({
    tab: typeof search["tab"] === "string" ? search["tab"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "IPO | MeroShare Investor Console" },
      {
        name: "description",
        content: "Apply for open IPO, FPO and right share issues and track your ASBA applications.",
      },
      { property: "og:title", content: "IPO | MeroShare Investor Console" },
      {
        property: "og:description",
        content: "Apply for open IPO, FPO and right share issues and track your ASBA applications.",
      },
      ogImage(),
    ],
    links: [canonicalLink("/ipo")],
  }),
  component: IpoPage,
});

function CountdownChip({ target }: { target: string | undefined }) {
  const days = daysUntil(target);
  if (days === null) return null;
  if (days === 0)
    return (
      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[0.68rem] font-semibold text-primary">
        Closing today
      </span>
    );
  if (days < 0)
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-[0.68rem] font-semibold text-muted-foreground">
        {Math.abs(days)}d ago
      </span>
    );
  if (days === 1)
    return (
      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[0.68rem] font-semibold text-primary">
        Closes tomorrow
      </span>
    );
  return (
    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[0.68rem] font-semibold text-primary">
      {days} days left
    </span>
  );
}

function UpcomingSection({
  cdscUpcoming,
  archUpcoming,
}: {
  cdscUpcoming: ApplicableIssue[];
  archUpcoming: IpoArchiveRow[];
}) {
  if (cdscUpcoming.length === 0 && archUpcoming.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="font-display text-base font-semibold">
        Upcoming{" "}
        <span className="num rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
          {cdscUpcoming.length + archUpcoming.length}
        </span>
      </h2>
      <ul className="grid gap-2 md:grid-cols-2">
        {cdscUpcoming.map((issue) => (
          <li key={issue.companyShareId} className="rounded-xl border border-border/60 bg-surface p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{issue.companyName}</p>
                <p className="num text-xs text-muted-foreground">
                  {issue.scrip} · {issue.shareTypeName} {issue.shareGroupName}
                </p>
              </div>
              <CountdownChip target={issue.issueOpenDate} />
            </div>
            <p className="num mt-2 text-xs text-muted-foreground">
              Opens {formatDate(issue.issueOpenDate)} · Rs {formatNumber(issue.sharePerUnit)}/unit
            </p>
          </li>
        ))}
        {archUpcoming.map((row, i) => {
          const range = row.dateRange ? parseBsRange(row.dateRange) : null;
          const today = new Date(new Date().toDateString()).getTime();
          const live = range ? today >= range.start.getTime() && today <= range.end.getTime() : null;
          const units = row.units ? toNumber(row.units) : 0;
          return (
            <li key={`arch-${row.company}-${i}`} className="rounded-xl border border-border/60 bg-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-semibold" title={row.company}>
                  {row.company}
                </p>
                {live === null ? null : live ? (
                  <span className="num shrink-0 rounded-full bg-gain/15 px-2 py-0.5 text-[0.68rem] font-semibold text-gain">
                    Open now
                  </span>
                ) : (
                  <span className="num shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[0.68rem] font-semibold text-primary">
                    Opens {formatDate(range!.start)}
                  </span>
                )}
              </div>
              <p className="num mt-1 truncate text-xs text-muted-foreground">
                {units > 0 ? `${formatQty(units)} units` : "Units TBA"}
                {row.dateRange ? ` · ${row.dateRange}` : ""}
              </p>
              {row.url ? (
                <a
                  href={row.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Read the issue announcement on merolagani (opens in a new tab)"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  View announcement <ArrowUpRight className="size-3" />
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CalendarView({ showDemo = true }: { showDemo?: boolean }) {
  const issues = useQuery(currentIssuesQuery());
  const archive = useQuery(ipoArchiveQuery());
  const rawList = issues.data ?? [];
  const list = showDemo ? rawList : rawList.filter((i) => !isDemoIssueId(i.companyShareId));

  const groups = {
    open: list.filter((i) => statusGroup(i) === "open"),
    upcoming: list.filter((i) => statusGroup(i) === "upcoming"),
    closed: list.filter((i) => statusGroup(i) === "closed").slice(0, 10),
  };

  // CDSC rarely lists anything as upcoming and only carries open issues -
  // fill both gaps with archive announcements it doesn't carry yet.
  // Ended upcoming rows resurface under Recently closed.
  const { archUpcoming: archiveUpcoming, archClosed: archiveClosed } = upcomingMerged(
    list,
    list,
    archive.data?.upcoming ?? [],
  );
  const listedNames = list.map((i) => i.companyName || i.scrip || "");
  const archivePast = (archive.data?.past ?? [])
    .filter((row) => !listedNames.some((name) => sameCompany(name, row.company)))
    .slice(0, 10);

  const hasArchive = archiveUpcoming.length > 0 || archivePast.length > 0 || archiveClosed.length > 0;

  return (
    <div className="space-y-5">
      {issues.isLoading ? (
        <SkeletonCards count={4} />
      ) : issues.isError ? (
        <ErrorBlock error={issues.error} retry={() => void issues.refetch()} />
      ) : list.length === 0 && !hasArchive && !archive.isLoading ? (
        <EmptyBlock title="No issues found" description="Nothing open, upcoming or recently closed right now." />
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              Open now{" "}
              <span className="num rounded-full bg-gain/15 px-2 py-0.5 text-xs font-semibold text-gain">
                {groups.open.length}
              </span>
            </h2>
            {groups.open.length === 0 ? (
              <p className="rounded-xl border border-border/60 bg-surface px-3 py-2.5 text-sm text-muted-foreground">
                No issues are open right now.
              </p>
            ) : (
              <ul className="grid gap-2 md:grid-cols-2">
                {groups.open.map((issue) => (
                  <li key={issue.companyShareId} className="rounded-xl border border-border/60 bg-surface p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{issue.companyName}</p>
                        <p className="num truncate text-xs text-muted-foreground">
                          {issue.scrip} · {issue.shareTypeName} {issue.shareGroupName}
                        </p>
                      </div>
                      <CountdownChip target={issue.issueCloseDate} />
                    </div>
                    <p className="num mt-2 text-xs text-muted-foreground">
                      {formatDate(issue.issueOpenDate)} to {formatDate(issue.issueCloseDate)} · Rs{" "}
                      {formatNumber(issue.sharePerUnit)}/unit
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <UpcomingSection cdscUpcoming={groups.upcoming} archUpcoming={archiveUpcoming} />

          <section className="space-y-2">
            <h2 className="font-display text-base font-semibold">Recently closed</h2>
            {groups.closed.length === 0 &&
            archivePast.length === 0 &&
            archiveClosed.length === 0 &&
            !archive.isLoading ? (
              <p className="rounded-xl border border-border/60 bg-surface px-3 py-2.5 text-sm text-muted-foreground">
                Nothing closed recently.
              </p>
            ) : (
              <ul className="grid gap-2 md:grid-cols-2">
                {groups.closed.map((issue) => (
                  <li
                    key={issue.companyShareId}
                    className="rounded-xl border border-border/60 bg-surface p-3 opacity-80"
                  >
                    <p className="truncate text-sm font-semibold">{issue.companyName}</p>
                    <p className="num mt-1 text-xs text-muted-foreground">
                      {issue.scrip} · closed {formatDate(issue.issueCloseDate)} · Rs {formatNumber(issue.sharePerUnit)}
                      /unit
                    </p>
                  </li>
                ))}
                {archiveClosed.map((row, i) => {
                  const units = row.units ? toNumber(row.units) : 0;
                  return (
                    <li
                      key={`arch-closed-${row.company}-${i}`}
                      className="rounded-xl border border-border/60 bg-surface p-3 opacity-80"
                    >
                      <p className="truncate text-sm font-semibold">{row.company}</p>
                      <p className="num mt-1 text-xs text-muted-foreground">
                        {units > 0 ? `${formatQty(units)} units` : ""}
                        {row.dateRange ? ` · ${row.dateRange}` : ""}
                      </p>
                    </li>
                  );
                })}
                {archivePast.map((row, i) => (
                  <li
                    key={`arch-past-${row.company}-${i}`}
                    className="rounded-xl border border-border/60 bg-surface p-3 opacity-80"
                  >
                    <p className="truncate text-sm font-semibold">{row.company}</p>
                    <p className="num mt-1 text-xs text-muted-foreground">
                      {row.units ? `${row.units} units` : ""}
                      {row.dateRange ? ` · ${row.dateRange}` : ""}
                      {row.announcementDate ? ` · ${row.announcementDate}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function ArchiveView() {
  const archive = useQuery(ipoArchiveQuery());
  const data = archive.data;
  const [pipeType, setPipeType] = useState<MfPipelineType>("ipo");
  const pipelineQ = useQuery(mfPipelineByTypeQuery(pipeType));
  const pipeline = pipelineQ.data ?? null;

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h2 className="font-display text-base font-semibold">SEBON pipeline</h2>
        <div className="flex flex-wrap items-center gap-1">
          {(["ipo", "right", "fpo", "debenture"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setPipeType(t)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
                pipeType === t
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {t === "ipo" ? "IPO" : t === "fpo" ? "FPO" : t === "right" ? "Right" : "Debenture"}
            </button>
          ))}
        </div>
        {pipelineQ.isLoading ? (
          <SkeletonLines rows={3} />
        ) : pipelineQ.isError || !pipeline || pipeline.items.length === 0 ? (
          <p className="rounded-xl border border-border/60 bg-surface px-3 py-2.5 text-sm text-muted-foreground">
            No {pipeType.toUpperCase()} applications pending with SEBON right now.
          </p>
        ) : (
          <>
            <p className="num text-xs text-muted-foreground">
              {pipeline.count} pending ·{" "}
              {pipeline.totalAmount != null ? formatNpr(pipeline.totalAmount, { compact: true }) : ""}
              {pipeline.asOfBs ? ` · as of ${pipeline.asOfBs}` : ""}
            </p>
            <ul className="grid gap-2 md:grid-cols-2">
              {pipeline.items.slice(0, 8).map((item) => (
                <li
                  key={`${item.company}-${item.units ?? ""}-${item.appliedDate ?? ""}`}
                  className="min-w-0 rounded-xl border border-border/60 bg-surface p-3"
                  title={item.remarks ?? undefined}
                >
                  <p className="truncate text-sm font-semibold" title={item.company}>
                    {item.company}
                  </p>
                  <p
                    className="num mt-1 truncate text-xs text-muted-foreground"
                    title={
                      [
                        item.units ? `${formatNumber(item.units)} units` : null,
                        item.sector,
                        item.appliedDate ? `applied ${item.appliedDate}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || undefined
                    }
                  >
                    {item.units ? `${formatNumber(item.units)} units` : ""}
                    {item.sector ? ` · ${item.sector}` : ""}
                    {item.appliedDate ? ` · applied ${item.appliedDate}` : ""}
                  </p>
                </li>
              ))}
            </ul>
            {pipeline.items.length > 8 ? (
              <p className="num text-xs text-muted-foreground">+{pipeline.items.length - 8} more in the pipeline</p>
            ) : null}
          </>
        )}
      </section>

      {archive.isLoading ? (
        <SkeletonCards count={4} />
      ) : archive.isError ? (
        <ErrorBlock error={archive.error} retry={() => void archive.refetch()} />
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="font-display text-base font-semibold">Past issues</h2>
            {!data?.past.length ? (
              <p className="rounded-xl border border-border/60 bg-surface px-3 py-2.5 text-sm text-muted-foreground">
                The archive feed has no past issues yet.
              </p>
            ) : (
              <ul className="grid gap-2 md:grid-cols-2">
                {data.past.map((row, i) => (
                  <li key={`${row.company}-${i}`} className="min-w-0 rounded-xl border border-border/60 bg-surface p-3">
                    <p className="truncate text-sm font-semibold" title={row.company}>
                      {row.company}
                    </p>
                    <p
                      className="num mt-1 truncate text-xs text-muted-foreground"
                      title={
                        [row.units ? `${row.units} units` : null, row.dateRange, row.announcementDate]
                          .filter(Boolean)
                          .join(" · ") || undefined
                      }
                    >
                      {row.units ? `${row.units} units` : ""}
                      {row.dateRange ? ` · ${row.dateRange}` : ""}
                      {row.announcementDate ? ` · ${row.announcementDate}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-xs text-muted-foreground">
            Archive data comes from a public community NEPSE feed and is indicative only.
          </p>
        </>
      )}
    </div>
  );
}

function IpoPage() {
  const queryClient = useQueryClient();
  const session = useQuery(sessionQuery());
  const { demoIpoEnabled } = useSettings();
  const isDemo = session.data?.username === "demo";
  const demoIpoOn = Boolean(isDemo && demoIpoEnabled);
  const [demoTick, setDemoTick] = useState(0);
  const bumpDemo = () => setDemoTick((t) => t + 1);

  const issues = useQuery(applicableIssuesQuery());
  const reports = useQuery(applicationReportsQuery());
  const { tab: tabParam } = Route.useSearch();
  const [tab, setTab] = useState(tabParam ?? "apply");
  const [sheetIssue, setSheetIssue] = useState<IpoSheetIssue | null>(null);
  const [sheetEdit, setSheetEdit] = useState<IpoSheetEdit | null>(null);

  // Demo playground applications (this device only), merged ahead of server rows.
  const demoApps = useMemo(() => (demoIpoOn ? loadDemoApplications() : []), [demoIpoOn, demoTick]);
  const demoItems = useMemo(() => demoApps.map(toReportItem), [demoApps]);
  const demoDetailByForm = useMemo(() => {
    const m = new Map<number, JsonRecord>();
    for (const a of demoApps) m.set(a.formId, toDetailRecord(a));
    return m;
  }, [demoApps]);

  const serverReports = reports.data ?? [];
  const mergedReports = useMemo(() => [...demoItems, ...serverReports], [demoItems, serverReports]);
  const serverDetailArgs = useMemo(
    () =>
      serverReports
        .filter((r) => (r.applicantFormId ?? 0) > 0)
        .map((r) => ({ formId: r.applicantFormId ?? 0, old: false })),
    [serverReports],
  );
  const appliedDetails = useQuery({
    ...applicationDetailsQuery(serverDetailArgs),
    enabled: serverDetailArgs.length > 0,
  });
  const serverDetailByForm = new Map<number, Record<string, unknown>>();
  {
    let di = 0;
    for (const r of serverReports) {
      if ((r.applicantFormId ?? 0) <= 0) continue;
      const d = appliedDetails.data?.[di] as Record<string, unknown> | null | undefined;
      di += 1;
      if (d && r.applicantFormId != null) serverDetailByForm.set(r.applicantFormId, d);
    }
  }

  // Applied-state map: applicableIssue endpoint keeps returning issues even
  // after applying, so the Apply tab must itself know what is already applied.
  const appliedByShare = new Map(
    mergedReports
      .filter((r) => r.companyShareId != null && r.applicantFormId != null)
      .map((r) => [r.companyShareId, r]),
  );
  const appliedDetailByShare = new Map<number, Record<string, unknown>>();
  for (const r of mergedReports) {
    const fid = r.applicantFormId;
    if (fid == null) continue;
    const d = fid < 0 ? demoDetailByForm.get(fid) : serverDetailByForm.get(fid);
    if (d) appliedDetailByShare.set(r.companyShareId, d);
  }

  const openSheet = (issue: ApplicableIssue, edit: IpoSheetEdit | null) => {
    setSheetIssue({
      companyShareId: issue.companyShareId,
      ...(issue.companyName ? { companyName: issue.companyName } : {}),
      ...(issue.scrip ? { scrip: issue.scrip } : {}),
      ...(issue.shareTypeName ? { shareTypeName: issue.shareTypeName } : {}),
      ...(issue.shareGroupName ? { shareGroupName: issue.shareGroupName } : {}),
      ...(issue.issueOpenDate ? { issueOpenDate: issue.issueOpenDate } : {}),
      ...(issue.issueCloseDate ? { issueCloseDate: issue.issueCloseDate } : {}),
      ...(issue.sharePerUnit != null ? { sharePerUnit: issue.sharePerUnit } : {}),
      ...(issue.minUnit != null ? { minUnit: issue.minUnit } : {}),
      ...(issue.maxUnit != null ? { maxUnit: issue.maxUnit } : {}),
    });
    setSheetEdit(edit);
  };

  const openEdit = (opts: {
    companyShareId: number;
    companyName?: string | undefined;
    scrip?: string | undefined;
    applicantFormId: number;
    appliedKitta?: number | undefined;
    bankId?: number | undefined;
    accountNumber?: string | undefined;
    crnNumber?: string | undefined;
  }) => {
    openSheet(
      {
        companyShareId: opts.companyShareId,
        ...(opts.companyName ? { companyName: opts.companyName } : {}),
        ...(opts.scrip ? { scrip: opts.scrip } : {}),
      },
      {
        applicantFormId: opts.applicantFormId,
        ...(opts.appliedKitta != null ? { appliedKitta: opts.appliedKitta } : {}),
        ...(opts.bankId != null ? { bankId: opts.bankId } : {}),
        ...(opts.accountNumber ? { accountNumber: opts.accountNumber } : {}),
        ...(opts.crnNumber ? { crnNumber: opts.crnNumber } : {}),
      },
    );
  };

  const withdraw = useMutation({
    mutationFn: deleteIpoApply,
    onSuccess: () => {
      toast.success("Application withdrawn.");
      void queryClient.invalidateQueries({ queryKey: ["application-reports"] });
      void queryClient.invalidateQueries({ queryKey: ["applicable-issues"] });
    },
    onError: (error) => toast.error(errorMessage(error, "Could not withdraw the application.")),
  });

  // Demo IPO playground can be switched off from Settings (demo users only).
  const rawList = issues.data ?? [];
  const list = !isDemo || demoIpoEnabled ? rawList : rawList.filter((i) => !isDemoIssueId(i.companyShareId));
  const calendar = useQuery(currentIssuesQuery());
  const archive = useQuery(ipoArchiveQuery());
  const calendarList = useMemo(
    () =>
      !isDemo || demoIpoEnabled
        ? (calendar.data ?? [])
        : (calendar.data ?? []).filter((i) => !isDemoIssueId(i.companyShareId)),
    [isDemo, demoIpoEnabled, calendar.data],
  );
  const { cdscUpcoming, archUpcoming } = upcomingMerged(list, calendarList, archive.data?.upcoming ?? []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">IPO</h1>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="apply" className="shrink-0 px-2 text-xs sm:px-3 sm:text-sm">
            <span className="hidden sm:inline">Apply for issue</span>
            <span className="sm:hidden">Apply</span>
          </TabsTrigger>
          <TabsTrigger value="applications" className="shrink-0 px-2 text-xs sm:px-3 sm:text-sm">
            <ClipboardList className="hidden size-4 sm:block" />
            <span className="hidden sm:inline">My applications</span>
            <span className="sm:hidden">Applications</span>
          </TabsTrigger>
          <TabsTrigger value="calendar" className="shrink-0 px-2 text-xs sm:px-3 sm:text-sm">
            <CalendarRange className="hidden size-4 sm:block" /> Calendar
          </TabsTrigger>
          <TabsTrigger value="archive" className="shrink-0 px-2 text-xs sm:px-3 sm:text-sm">
            <Archive className="hidden size-4 sm:block" /> Archive
          </TabsTrigger>
        </TabsList>

        <TabsContent value="apply" className="mt-4">
          {demoIpoOn ? (
            <p className="mb-3 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-xs text-muted-foreground">
              Demo IPO playground — these issues are fake. Apply, edit and withdraw to test the
              forms; nothing is sent to CDSC. Turn it off in Settings → Advanced.
            </p>
          ) : null}
          {issues.isLoading ? (
            <SkeletonCards count={4} />
          ) : issues.isError ? (
            <ErrorBlock error={issues.error} retry={() => void issues.refetch()} />
          ) : list.length === 0 && cdscUpcoming.length === 0 && archUpcoming.length === 0 ? (
            <EmptyBlock
              title="No open issues"
              description="Check back when a new issue opens."
              icon={<Rocket className="size-6" />}
            />
          ) : (
            <div className="space-y-6">
              <section className="space-y-2">
                <h2 className="flex items-center gap-2 font-display text-base font-semibold">
                  Open now{" "}
                  <span className="num rounded-full bg-gain/15 px-2 py-0.5 text-xs font-semibold text-gain">
                    {list.length}
                  </span>
                </h2>
                {list.length === 0 ? (
                  <p className="rounded-xl border border-border/60 bg-surface px-3 py-2.5 text-sm text-muted-foreground">
                    Nothing open right now. Upcoming issues are listed below.
                  </p>
                ) : (
                  <ul className="overflow-hidden rounded-2xl border border-border/70 bg-card divide-y divide-border/60">
                    {list.map((issue) => {
                      const applied = appliedByShare.get(issue.companyShareId);
                      const appliedDetail = appliedDetailByShare.get(issue.companyShareId);
                      const daysLeft = daysUntil(issue.issueCloseDate);
                      const timeLabel =
                        daysLeft === null
                          ? "Dates TBA"
                          : daysLeft < 0
                            ? `Closed ${formatDate(issue.issueCloseDate)}`
                            : daysLeft === 0
                              ? "Closes today"
                              : daysLeft === 1
                                ? "1 day left"
                                : `${daysLeft} days left`;
                      const urgent = daysLeft !== null && daysLeft >= 0 && daysLeft <= 3;
                      const openThis = () => {
                        if (applied) {
                          openEdit({
                            companyShareId: issue.companyShareId,
                            companyName: issue.companyName,
                            scrip: issue.scrip,
                            applicantFormId: applied.applicantFormId ?? 0,
                            appliedKitta: appliedDetail ? Number(appliedDetail["appliedKitta"] ?? 10) : 10,
                            bankId: appliedDetail ? Number(appliedDetail["bankId"] ?? 0) || undefined : undefined,
                            accountNumber: appliedDetail
                              ? String(appliedDetail["accountNumber"] ?? "") || undefined
                              : undefined,
                            crnNumber: appliedDetail
                              ? String(appliedDetail["crnNumber"] ?? "") || undefined
                              : undefined,
                          });
                        } else {
                          openSheet(issue, null);
                        }
                      };
                      const typeLabel = (() => {
                        const hay = `${issue.shareTypeName ?? ""} ${issue.shareGroupName ?? ""}`;
                        if (/right/i.test(hay)) return "Right";
                        if (/fpo/i.test(hay)) return "FPO";
                        if (/\bipo\b/i.test(hay)) return "IPO";
                        if (/mutual|fund/i.test(hay)) return "Fund";
                        if (/debenture|bond/i.test(hay)) return "Bond";
                        if (/auction/i.test(hay)) return "Auction";
                        return null;
                      })();
                      return (
                        <li key={issue.companyShareId}>
                          <div
                            onClick={openThis}
                            className="flex w-full cursor-pointer items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-muted/40 sm:px-5 sm:py-5"
                          >
                            <span
                              aria-hidden
                              className="num flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
                            >
                              {String(issue.companyName ?? issue.scrip ?? "?")
                                .trim()
                                .charAt(0)
                                .toUpperCase() || "?"}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-1.5">
                                <span className="truncate font-display text-sm font-semibold" title={issue.companyName}>
                                  {issue.companyName}
                                </span>
                                {typeLabel ? (
                                  <span className="num shrink-0 rounded-full border border-border/70 px-2 py-0.5 text-[0.68rem] font-semibold text-muted-foreground">
                                    {typeLabel}
                                  </span>
                                ) : null}
                                {applied ? (
                                  <span className="num inline-flex shrink-0 items-center gap-1 rounded-full bg-gain/15 px-2 py-0.5 text-[0.68rem] font-semibold text-gain">
                                    <CheckCircle2 className="size-3" />
                                    Applied
                                    {appliedDetail?.["appliedKitta"]
                                      ? ` · ${formatNumber(appliedDetail["appliedKitta"])} kitta`
                                      : ""}
                                  </span>
                                ) : null}
                                <span
                                  className={
                                    daysLeft !== null && daysLeft < 0
                                      ? "num shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.68rem] font-semibold text-muted-foreground"
                                      : urgent
                                        ? "num shrink-0 rounded-full bg-loss/15 px-2 py-0.5 text-[0.68rem] font-semibold text-loss"
                                        : "num shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[0.68rem] font-semibold text-primary"
                                  }
                                >
                                  {timeLabel}
                                </span>
                              </span>
                              <span className="num mt-0.5 block truncate text-xs text-muted-foreground">
                                {issue.scrip} · {formatDate(issue.issueOpenDate)} to {formatDate(issue.issueCloseDate)}
                              </span>
                              <span className="num mt-0.5 block text-xs text-muted-foreground">
                                {issue.sharePerUnit ? `Rs ${formatNumber(issue.sharePerUnit)}/unit` : ""}
                                {issue.sharePerUnit && (issue.minUnit || issue.maxUnit) ? " · " : ""}
                                {issue.minUnit || issue.maxUnit
                                  ? `${formatNumber(issue.minUnit)}-${formatNumber(issue.maxUnit)} units`
                                  : ""}
                              </span>
                            </span>
                            <Button
                              size="sm"
                              variant={applied ? "outline" : "default"}
                              className="shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                openThis();
                              }}
                            >
                              {applied ? "Edit" : "Apply"}
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
              <UpcomingSection cdscUpcoming={cdscUpcoming} archUpcoming={archUpcoming} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="applications" className="mt-4">
          <ApplicationReports
            onEdit={(item, detail) =>
              openEdit({
                companyShareId: item.companyShareId,
                companyName: item.companyName,
                scrip: item.scrip,
                applicantFormId: item.applicantFormId ?? 0,
                appliedKitta: detail ? Number(detail["appliedKitta"] ?? 10) : 10,
                bankId: detail ? Number(detail["bankId"] ?? 0) || undefined : undefined,
                accountNumber: detail ? String(detail["accountNumber"] ?? "") || undefined : undefined,
                crnNumber: detail ? String(detail["crnNumber"] ?? "") || undefined : undefined,
              })
            }
            onWithdraw={(item, pinValue) => {
              if ((item.applicantFormId ?? 0) < 0) {
                if (removeDemoApplication(item.applicantFormId ?? 0)) {
                  toast.success("Demo application withdrawn.");
                  bumpDemo();
                } else {
                  toast.error("Could not withdraw the demo application.");
                }
                return;
              }
              withdraw.mutate({
                data: {
                  applicantFormId: item.applicantFormId ?? 0,
                  companyShareId: item.companyShareId,
                  transactionPIN: pinValue,
                },
              });
            }}
            extraItems={demoItems}
            extraDetails={demoItems.map((i) => demoDetailByForm.get(i.applicantFormId ?? 0) ?? null)}
          />
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <CalendarView showDemo={demoIpoOn} />
        </TabsContent>

        <TabsContent value="archive" className="mt-4">
          <ArchiveView />
        </TabsContent>
      </Tabs>

      <IpoDetailSheet
        issue={sheetIssue}
        edit={sheetEdit}
        demo={demoIpoOn}
        onDemoChange={bumpDemo}
        onOpenChange={(open) => {
          if (!open) {
            setSheetIssue(null);
            setSheetEdit(null);
          }
        }}
      />
    </div>
  );
}
