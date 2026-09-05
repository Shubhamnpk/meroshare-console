import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CalendarRange, ClipboardList, Loader2, Rocket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyBlock, ErrorBlock, SkeletonCards, SkeletonLines } from "@/components/states";
import {
  applicableIssuesQuery,
  banksQuery,
  currentIssuesQuery,
  ipoArchiveQuery,
  mfPipelineByTypeQuery,
} from "@/lib/queries";
import { applyForIpo } from "@/lib/meroshare/ipo.functions";
import { getBankDetail } from "@/lib/meroshare/account.functions";
import {
  daysUntil,
  errorMessage,
  formatDate,
  formatNpr,
  formatNumber,
  toNumber,
} from "@/lib/format";
import type { ApplicableIssue } from "@/lib/meroshare/types";
import type { IpoArchiveRow } from "@/lib/nepse/types";
import type { MfPipelineType } from "@/lib/mutual-funds/types";
import { sameCompany } from "@/lib/notifications";
import { ApplicationReports } from "@/components/tools/application-reports";
import { cn } from "@/lib/utils";
import { ogImage, canonicalLink } from "@/lib/seo";

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

function statusGroup(issue: ApplicableIssue): "open" | "upcoming" | "closed" {
  const status = String(issue.statusName ?? "").toLowerCase();
  if (/open|active|apply/i.test(status)) return "open";
  if (/upcoming|announced|coming/i.test(status)) return "upcoming";
  if (/closed|expired|over/i.test(status)) return "closed";
  const closes = daysUntil(issue.issueCloseDate);
  if (closes === null) return "open";
  return closes >= 0 ? "open" : "closed";
}

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

/** Split announced-but-not-open issues from both sources, deduped by company. */
function upcomingMerged(
  open: ApplicableIssue[],
  calendarList: ApplicableIssue[],
  archived: IpoArchiveRow[],
) {
  const listedNames = [...open, ...calendarList].map((i) => i.companyName || i.scrip || "");
  const cdscUpcoming = calendarList.filter((i) => statusGroup(i) === "upcoming");
  const known = [...listedNames, ...cdscUpcoming.map((i) => i.companyName || i.scrip || "")];
  const archUpcoming = archived.filter(
    (row) => !known.some((name) => sameCompany(name, row.company)),
  );
  return { cdscUpcoming, archUpcoming };
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
          <li
            key={issue.companyShareId}
            className="rounded-xl border border-border/60 bg-surface p-3"
          >
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
        {archUpcoming.map((row, i) => (
          <li
            key={`arch-${row.company}-${i}`}
            className="rounded-xl border border-border/60 bg-surface p-3"
          >
            <p className="text-sm font-semibold">{row.company}</p>
            <p className="num mt-1 text-xs text-muted-foreground">
              {row.units ? `${row.units} units` : "Units TBA"}
              {row.dateRange ? ` · ${row.dateRange}` : ""}
            </p>
            {row.url ? (
              <a
                href={row.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
              >
                Announcement →
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function CalendarView() {
  const issues = useQuery(currentIssuesQuery());
  const archive = useQuery(ipoArchiveQuery());
  const list = issues.data ?? [];

  const groups = {
    open: list.filter((i) => statusGroup(i) === "open"),
    upcoming: list.filter((i) => statusGroup(i) === "upcoming"),
    closed: list.filter((i) => statusGroup(i) === "closed").slice(0, 10),
  };

  // CDSC rarely lists anything as upcoming and only carries open issues -
  // fill both gaps with archive announcements it doesn't carry yet.
  const { archUpcoming: archiveUpcoming } = upcomingMerged(
    list,
    list,
    archive.data?.upcoming ?? [],
  );
  const listedNames = list.map((i) => i.companyName || i.scrip || "");
  const archivePast = (archive.data?.past ?? [])
    .filter((row) => !listedNames.some((name) => sameCompany(name, row.company)))
    .slice(0, 10);

  const hasArchive = archiveUpcoming.length > 0 || archivePast.length > 0;

  return (
    <div className="space-y-5">
      {issues.isLoading ? (
        <SkeletonCards count={4} />
      ) : issues.isError ? (
        <ErrorBlock error={issues.error} retry={() => void issues.refetch()} />
      ) : list.length === 0 && !hasArchive && !archive.isLoading ? (
        <EmptyBlock
          title="No issues found"
          description="Nothing open, upcoming or recently closed right now."
        />
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
                  <li
                    key={issue.companyShareId}
                    className="rounded-xl border border-border/60 bg-surface p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{issue.companyName}</p>
                        <p className="num text-xs text-muted-foreground">
                          {issue.scrip} · {issue.shareTypeName} {issue.shareGroupName}
                        </p>
                      </div>
                      <CountdownChip target={issue.issueCloseDate} />
                    </div>
                    <p className="num mt-2 text-xs text-muted-foreground">
                      {formatDate(issue.issueOpenDate)} → {formatDate(issue.issueCloseDate)} · Rs{" "}
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
            {groups.closed.length === 0 && archivePast.length === 0 && !archive.isLoading ? (
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
                      {issue.scrip} · closed {formatDate(issue.issueCloseDate)} · Rs{" "}
                      {formatNumber(issue.sharePerUnit)}/unit
                    </p>
                  </li>
                ))}
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
              {pipeline.totalAmount != null
                ? formatNpr(pipeline.totalAmount, { compact: true })
                : ""}
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
              <p className="num text-xs text-muted-foreground">
                +{pipeline.items.length - 8} more in the pipeline
              </p>
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
                  <li
                    key={`${row.company}-${i}`}
                    className="min-w-0 rounded-xl border border-border/60 bg-surface p-3"
                  >
                    <p className="truncate text-sm font-semibold" title={row.company}>
                      {row.company}
                    </p>
                    <p
                      className="num mt-1 truncate text-xs text-muted-foreground"
                      title={
                        [
                          row.units ? `${row.units} units` : null,
                          row.dateRange,
                          row.announcementDate,
                        ]
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
  const issues = useQuery(applicableIssuesQuery());
  const banks = useQuery(banksQuery());
  const { tab: tabParam } = Route.useSearch();
  const [tab, setTab] = useState(tabParam ?? "apply");
  const [active, setActive] = useState<ApplicableIssue | null>(null);
  const [bankId, setBankId] = useState<string>("");
  const [kitta, setKitta] = useState("10");
  const [pin, setPin] = useState("");

  const bankDetail = useQuery({
    queryKey: ["bank-detail", bankId],
    queryFn: () => getBankDetail({ data: { bankId: Number(bankId) } }),
    enabled: Boolean(bankId),
  });

  const apply = useMutation({
    mutationFn: applyForIpo,
    onSuccess: () => {
      toast.success("Application submitted to MeroShare.");
      setActive(null);
      setPin("");
      void queryClient.invalidateQueries({ queryKey: ["applicable-issues"] });
      void queryClient.invalidateQueries({ queryKey: ["application-reports"] });
      setTab("applications");
    },
    onError: (error) => toast.error(errorMessage(error, "Could not submit the application.")),
  });

  const submit = () => {
    const detail = bankDetail.data;
    if (!active || !detail) return;
    apply.mutate({
      data: {
        companyShareId: active.companyShareId,
        appliedKitta: Number(kitta),
        bankId: Number(bankId),
        accountBranchId: toNumber(detail.branchId),
        accountNumber: String(detail.accountNumber ?? ""),
        customerId: toNumber(detail.id),
        crnNumber: String(detail.crnNumber ?? ""),
        transactionPIN: pin,
      },
    });
  };

  const list = issues.data ?? [];
  const calendar = useQuery(currentIssuesQuery());
  const archive = useQuery(ipoArchiveQuery());
  const { cdscUpcoming, archUpcoming } = upcomingMerged(
    list,
    calendar.data ?? [],
    archive.data?.upcoming ?? [],
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">IPO</h1>
        <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
          Apply for open issues and track your applications.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="apply">Apply for issue</TabsTrigger>
          <TabsTrigger value="applications">
            <ClipboardList className="hidden size-4 sm:block" /> My applications
          </TabsTrigger>
          <TabsTrigger value="calendar">
            <CalendarRange className="hidden size-4 sm:block" /> Calendar
          </TabsTrigger>
          <TabsTrigger value="archive">
            <Archive className="hidden size-4 sm:block" /> Archive
          </TabsTrigger>
        </TabsList>

        <TabsContent value="apply" className="mt-4">
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
                  <ul className="grid gap-3 md:grid-cols-2">
                    {list.map((issue) => (
                      <li
                        key={issue.companyShareId}
                        className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4"
                      >
                        <div>
                          <p className="font-display text-base font-semibold">
                            {issue.companyName}
                          </p>
                          <p className="num text-xs text-muted-foreground">
                            {issue.scrip} · {issue.shareTypeName} {issue.shareGroupName}
                          </p>
                        </div>
                        <dl className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <dt className="text-muted-foreground">Opens</dt>
                            <dd>{formatDate(issue.issueOpenDate)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Closes</dt>
                            <dd>{formatDate(issue.issueCloseDate)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Price / unit</dt>
                            <dd className="num">Rs {formatNumber(issue.sharePerUnit)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Units</dt>
                            <dd className="num">
                              {formatNumber(issue.minUnit)} – {formatNumber(issue.maxUnit)}
                            </dd>
                          </div>
                        </dl>
                        <Button
                          className="mt-auto"
                          onClick={() => {
                            setActive(issue);
                            setKitta(String(issue.minUnit ?? 10));
                          }}
                        >
                          Apply
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <UpcomingSection cdscUpcoming={cdscUpcoming} archUpcoming={archUpcoming} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="applications" className="mt-4">
          <ApplicationReports />
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <CalendarView />
        </TabsContent>

        <TabsContent value="archive" className="mt-4">
          <ArchiveView />
        </TabsContent>
      </Tabs>

      <Dialog
        open={Boolean(active)}
        onOpenChange={(open) => {
          if (!open) setActive(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{active?.companyName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Bank</Label>
              <Select value={bankId} onValueChange={setBankId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select your ASBA bank" />
                </SelectTrigger>
                <SelectContent>
                  {(banks.data ?? []).map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {bankDetail.isLoading ? (
                <SkeletonLines rows={2} className="pt-1" />
              ) : bankDetail.data ? (
                <p className="num text-xs text-muted-foreground">
                  A/C {String(bankDetail.data.accountNumber ?? "")} · CRN{" "}
                  {String(bankDetail.data.crnNumber ?? "")}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="kitta">Applied units</Label>
              <Input
                id="kitta"
                inputMode="numeric"
                value={kitta}
                onChange={(e) => setKitta(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin">Transaction PIN</Label>
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActive(null)}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={apply.isPending || !bankDetail.data || pin.length < 4}
            >
              {apply.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Submitting…
                </>
              ) : (
                "Confirm application"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
