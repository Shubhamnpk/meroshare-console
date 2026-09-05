import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText, Hourglass, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDocViewer } from "@/components/ui/use-doc-viewer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorBlock, EmptyBlock, LoadingBlock } from "@/components/states";
import { BackButton } from "@/components/back-button";
import { SortableTh, sortBy, useSort } from "@/components/sortable-table";
import { mfApprovalsQuery, mfPipelineByTypeQuery, mfPipelineOverviewQuery } from "@/lib/queries";
import { formatNpr, formatNumber } from "@/lib/format";
import type { MfApproval, MfPipelineItem, MfPipelineType } from "@/lib/mutual-funds/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_dash/ipo-pipeline")({
  head: () => ({
    meta: [
      { title: "IPO Pipeline | MeroShare Investor Console" },
      {
        name: "description",
        content: "Every issue waiting on SEBON approval: IPOs, rights, FPOs and debentures.",
      },
      { property: "og:title", content: "IPO Pipeline | MeroShare Investor Console" },
    ],
  }),
  component: IpoPipelinePage,
});

const PIPE_TYPES: { key: MfPipelineType; label: string }[] = [
  { key: "ipo", label: "IPO" },
  { key: "right", label: "Right" },
  { key: "fpo", label: "FPO" },
  { key: "debenture", label: "Debenture" },
];

type SortKey = "company" | "units" | "amount" | "status" | "manager" | "appliedDate";

function statusPill(status: string | null) {
  if (!status) return null;
  const s = status.toLowerCase();
  const tone = /approv|permit/i.test(s)
    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
    : /reject|cancel|return/i.test(s)
      ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
      : "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  return (
    <span
      className={cn(
        "inline-block max-w-40 truncate rounded-full px-2 py-0.5 text-[0.68rem] font-semibold",
        tone,
      )}
      title={status}
    >
      {status}
    </span>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card px-3.5 py-2 leading-tight">
      <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="num font-semibold">{value}</p>
    </div>
  );
}

function IpoPipelinePage() {
  const [pipeType, setPipeType] = useState<MfPipelineType>("ipo");
  const [search, setSearch] = useState("");
  const [approval, setApproval] = useState<MfApproval | null>(null);
  const viewer = useDocViewer();
  const pipelineQ = useQuery(mfPipelineByTypeQuery(pipeType));
  const overviewQ = useQuery(mfPipelineOverviewQuery());
  const approvalsQ = useQuery(mfApprovalsQuery());

  type Row = MfPipelineItem;
  const { sort, toggle } = useSort<SortKey>(
    { key: "amount", dir: "desc" },
    {
      company: "text",
      units: "number",
      amount: "number",
      status: "text",
      manager: "text",
      appliedDate: "number",
    },
  );

  const rows = useMemo(() => {
    const items = pipelineQ.data?.items ?? [];
    const term = search.trim().toLowerCase();
    const filtered = term
      ? items.filter(
          (r) =>
            r.company.toLowerCase().includes(term) ||
            (r.issueManager ?? "").toLowerCase().includes(term) ||
            (r.sector ?? "").toLowerCase().includes(term),
        )
      : [...items];
    const getter = (r: Row): string | number => {
      switch (sort.key) {
        case "company":
          return r.company;
        case "units":
          return r.units ?? -1;
        case "status":
          return r.status ?? "";
        case "manager":
          return r.issueManager ?? "";
        case "appliedDate":
          return r.appliedDate ?? "";
        default:
          return r.amount ?? -1;
      }
    };
    return sortBy(filtered, getter, sort.dir);
  }, [pipelineQ.data, search, sort]);

  const counts = overviewQ.data?.counts ?? {};
  const label =
    pipeType === "ipo"
      ? "IPO"
      : pipeType === "right"
        ? "Right"
        : pipeType === "fpo"
          ? "FPO"
          : "Debenture";

  return (
    <div className="space-y-5">
      <BackButton fallback="/tools" />
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
          <Hourglass className="size-5" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">IPO Pipeline</h1>
          <p className="mt-0.5 hidden text-sm text-muted-foreground sm:block">
            Every issue sitting with SEBON for approval.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <StatChip
          label={`${label} pending`}
          value={pipelineQ.data ? formatNumber(pipelineQ.data.count) : "-"}
        />
        <StatChip
          label="Amount awaiting approval"
          value={
            pipelineQ.data?.totalAmount != null
              ? formatNpr(pipelineQ.data.totalAmount, { compact: true })
              : "-"
          }
        />
        <StatChip
          label="All pipelines"
          value={overviewQ.data ? formatNumber(overviewQ.data.total) : "-"}
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company or issue manager…"
            className="h-10 rounded-xl pl-9"
          />
        </div>
        <div className="flex items-center gap-1 self-start rounded-xl border border-border/60 bg-card p-1 sm:self-auto">
          {PIPE_TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setPipeType(t.key)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                pipeType === t.key
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {counts[t.key] != null ? (
                <span className="num ml-1 opacity-70">{counts[t.key]}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {pipelineQ.isLoading ? (
        <LoadingBlock label={`Loading ${label} pipeline`} />
      ) : pipelineQ.isError ? (
        <ErrorBlock error={pipelineQ.error} retry={() => void pipelineQ.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyBlock
          title={search ? "No matches" : `No ${label} in pipeline`}
          description={
            search
              ? "Nothing matches your search."
              : `No ${label} applications pending with SEBON right now.`
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <SortableTh
                    label="Company"
                    active={sort.key === "company"}
                    dir={sort.dir}
                    onClick={() => toggle("company")}
                    className="pl-4"
                    kind="text"
                  />
                  <SortableTh
                    label="Units"
                    active={sort.key === "units"}
                    dir={sort.dir}
                    onClick={() => toggle("units")}
                    align="right"
                  />
                  <SortableTh
                    label="Amount"
                    active={sort.key === "amount"}
                    dir={sort.dir}
                    onClick={() => toggle("amount")}
                    align="right"
                  />
                  <SortableTh
                    label="Status"
                    active={sort.key === "status"}
                    dir={sort.dir}
                    onClick={() => toggle("status")}
                    align="left"
                    kind="text"
                  />
                  <SortableTh
                    label="Issue manager"
                    active={sort.key === "manager"}
                    dir={sort.dir}
                    onClick={() => toggle("manager")}
                    align="left"
                    className="hidden md:table-cell"
                    kind="text"
                  />
                  <SortableTh
                    label="Applied"
                    active={sort.key === "appliedDate"}
                    dir={sort.dir}
                    onClick={() => toggle("appliedDate")}
                    align="right"
                    className="pr-4"
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow
                    key={`${row.company}-${i}`}
                    className="cursor-pointer transition-colors hover:bg-muted/40"
                  >
                    <TableCell className="max-w-56 pl-4">
                      <p className="truncate text-[13px] font-semibold" title={row.company}>
                        {row.company}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {[row.issueType, row.sector].filter(Boolean).join(" · ")}
                      </p>
                    </TableCell>
                    <TableCell className="num whitespace-nowrap text-right text-xs">
                      {row.units != null ? formatNumber(row.units) : "-"}
                    </TableCell>
                    <TableCell className="num whitespace-nowrap text-right text-xs font-medium">
                      {row.amount != null ? formatNpr(row.amount, { compact: true }) : "-"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{statusPill(row.status)}</TableCell>
                    <TableCell
                      className="hidden max-w-44 truncate text-xs text-muted-foreground md:table-cell"
                      title={row.issueManager ?? ""}
                    >
                      {row.issueManager ?? "-"}
                    </TableCell>
                    <TableCell className="num whitespace-nowrap pr-4 text-right text-xs text-muted-foreground">
                      {row.appliedDate ?? "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="border-t border-border/70 px-4 py-2.5 text-[11px] text-muted-foreground">
            {pipelineQ.data
              ? `${pipelineQ.data.count} pending${pipelineQ.data.asOfBs ? ` · as of ${pipelineQ.data.asOfBs}` : ""}`
              : ""}{" "}
            SEBON pipeline data comes from a community feed and is indicative only.
          </p>
        </div>
      )}

      {approvalsQ.data && approvalsQ.data.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-display text-base font-semibold">Fresh SEBON approvals</h2>
          <ul className="grid gap-2 md:grid-cols-2">
            {approvalsQ.data.slice(0, 6).map((a) => (
              <li key={`${a.title}-${a.bsDate ?? ""}`}>
                <button
                  type="button"
                  onClick={() => setApproval(a)}
                  className="group flex w-full items-center gap-2.5 rounded-xl border border-border/60 bg-card px-3.5 py-2.5 text-left transition-colors hover:border-primary/40"
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{a.title}</span>
                    {a.bsDate ? (
                      <span className="num block text-[11px] text-muted-foreground">
                        {a.bsDate}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-[11px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    Details
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Dialog
        open={approval !== null}
        onOpenChange={(open) => {
          if (!open) setApproval(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base leading-snug">{approval?.title}</DialogTitle>
            <DialogDescription>SEBON approval notice</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                Dated (BS)
              </dt>
              <dd className="num mt-1 font-semibold">{approval?.bsDate ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                Dated (AD)
              </dt>
              <dd className="num mt-1 font-semibold">
                {approval?.adDate
                  ? new Date(approval.adDate).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  : "-"}
              </dd>
            </div>
          </dl>
          {approval?.pdfUrl ? (
            <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3">
              <p className="flex items-center gap-2 text-xs font-semibold">
                <FileText className="size-4 text-primary" /> Official source document
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    viewer.openPreview(approval!.title, approval!.pdfUrl);
                    setApproval(null);
                  }}
                >
                  Preview document
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={approval.pdfUrl} target="_blank" rel="noreferrer">
                    Open source
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No source document attached.</p>
          )}
        </DialogContent>
      </Dialog>
      {viewer.modal}
    </div>
  );
}
