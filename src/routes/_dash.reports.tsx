import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ErrorBlock, LoadingBlock, EmptyBlock } from "@/components/states";
import { useMemo, useState } from "react";
import { FileDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applicationDetailsQuery, applicationReportsQuery, oldApplicationReportsQuery } from "@/lib/queries";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { formatDateTime, formatQty, isoDate, toNumber } from "@/lib/format";
import type { ApplicationReportItem, JsonRecord, JsonValue } from "@/lib/meroshare/types";

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

type Outcome = { kind: "allotted" | "not-allotted" | "pending"; label: string };

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function deriveOutcome(d: JsonRecord): Outcome {
  const rk = toNumber(d["receivedKitta"]);
  const stage = str(d["stageName"]) ?? "";
  const status = str(d["statusName"]) ?? "";
  if (rk > 0) return { kind: "allotted", label: "Allotted" };
  if (stage === "ALLOTMENT_RESULT_UPLOADED" || /NOT_ALLOTED|REJECTED/.test(status)) {
    return { kind: "not-allotted", label: "Not allotted" };
  }
  return { kind: "pending", label: "Pending result" };
}

const outcomeStyles: Record<Outcome["kind"], string> = {
  allotted: "bg-emerald-500/10 text-emerald-600",
  "not-allotted": "bg-red-500/10 text-red-600",
  pending: "bg-amber-500/10 text-amber-600",
};

function Chip({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`num font-semibold ${valueClass ?? ""}`}>{value}</span>
    </div>
  );
}

function Summary({ details }: { details: (JsonRecord | null)[] }) {
  const valid = details.filter((d): d is JsonRecord => d !== null);
  const outcomes = valid.map(deriveOutcome);
  const counts = { allotted: 0, "not-allotted": 0, pending: 0 };
  for (const o of outcomes) counts[o.kind] += 1;
  const kittaApplied = valid.reduce((s, d) => s + Math.max(0, toNumber(d["appliedKitta"])), 0);
  const kittaAllotted = valid.reduce((s, d) => s + Math.max(0, toNumber(d["receivedKitta"])), 0);
  return (
    <div className="flex flex-wrap gap-2">
      <Chip label="Applied" value={String(valid.length)} />
      <Chip label="Allotted" value={String(counts.allotted)} valueClass="text-gain" />
      <Chip label="Not allotted" value={String(counts["not-allotted"])} valueClass="text-loss" />
      <Chip label="Awaiting result" value={String(counts.pending)} valueClass="text-amber-600" />
      <Chip label="Kitta applied" value={formatQty(kittaApplied)} />
      <Chip label="Kitta allotted" value={formatQty(kittaAllotted)} valueClass="text-gain" />
    </div>
  );
}

const knownFields: Record<string, string> = {
  applicantFormId: "Application ID",
  appliedKitta: "Applied",
  receivedKitta: "Allotted",
  amount: "Amount",
  statusName: "Status",
  stageName: "Stage",
  meroshareRemark: "Remark",
  reasonOrRemark: "Reason",
  bankId: "Bank ID",
  bankName: "Bank",
  accountBranchId: "Branch ID",
  accountBranchName: "Branch",
  accountNumber: "Account no.",
  crnNumber: "CRN",
  demat: "Demat",
  boid: "BOID",
  clientName: "Client",
  appliedDate: "Applied on",
  updatedDate: "Updated on",
  recordedDate: "Recorded on",
};

function humanize(key: string): string {
  const known = knownFields[key];
  if (known) return known;
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

function renderValue(value: JsonValue): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function DetailGrid({ detail }: { detail: JsonRecord }) {
  const known = new Set(Object.keys(knownFields));
  const extraRows = Object.entries(detail).filter(
    ([k, v]) =>
      !known.has(k) &&
      v !== null &&
      v !== undefined &&
      v !== "" &&
      !(typeof v === "object" && Object.keys(v as object).length === 0),
  );
  const rows: [string, string][] = [];
  for (const k of Object.keys(knownFields)) {
    const v = detail[k];
    if (v !== null && v !== undefined && v !== "") {
      const formatted =
        k === "appliedKitta" || k === "receivedKitta"
          ? formatQty(v)
          : /date/i.test(k)
            ? formatDateTime(v)
            : renderValue(v);
      rows.push([humanize(k), formatted]);
    }
  }
  for (const [k, v] of extraRows) rows.push([humanize(k), renderValue(v)]);
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="truncate text-sm font-medium" title={value}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function matches(item: ApplicationReportItem, detail: JsonRecord | null, term: string): boolean {
  const haystack = [
    item.companyName,
    item.scrip,
    item.statusName,
    item.shareTypeName,
    item.shareGroupName,
    detail ? str(detail["stageName"]) ?? "" : "",
    detail ? str(detail["meroshareRemark"]) ?? "" : "",
    detail ? str(detail["applicantFormId"]) ?? "" : "",
  ];
  return haystack.some((s) => s && s.toLowerCase().includes(term));
}

function exportCsv(items: ApplicationReportItem[], details: (JsonRecord | null)[]) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = items.map((item, idx) => {
    const d = details[idx] ?? null;
    return [
      String(idx + 1),
      String(item.companyName ?? ""),
      String(item.scrip ?? ""),
      d ? String(toNumber(d["appliedKitta"])) : "",
      d ? String(toNumber(d["receivedKitta"])) : "",
      d ? String(toNumber(d["amount"])) : "",
      d ? String(d["statusName"] ?? "") : String(item.statusName ?? ""),
      d ? String(d["stageName"] ?? "") : "",
      d ? String(d["meroshareRemark"] ?? "") : "",
    ]
      .map(esc)
      .join(",");
  });
  const csv = [["SN", "Company", "Scrip", "Applied", "Allotted", "Amount", "Status", "Stage", "Remark"].map(esc).join(","), ...rows].join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `application-report-${isoDate(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ReportList({
  items,
  details,
  loadingDetails,
  search,
  onSearch,
}: {
  items: ApplicationReportItem[];
  details: (JsonRecord | null)[];
  loadingDetails: boolean;
  search: string;
  onSearch: (value: string) => void;
}) {
  const shown = useMemo(() => {
    const pairs = items.map((item, idx) => ({ item, detail: details[idx] ?? null }));
    const term = search.trim().toLowerCase();
    const filtered = term ? pairs.filter(({ item, detail }) => matches(item, detail, term)) : pairs;
    return { items: filtered.map((p) => p.item), details: filtered.map((p) => p.detail) };
  }, [items, details, search]);

  if (items.length === 0) {
    return <EmptyBlock title="No applications" description="Applications you submit will be listed here." />;
  }

  return (
    <div className="space-y-4">
      <Summary details={details} />
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search company, scrip, status or remark…"
          className="h-10 rounded-xl pl-9"
        />
      </div>
      {loadingDetails && <p className="text-xs text-muted-foreground">Loading application results…</p>}
      {shown.items.length === 0 ? (
        <EmptyBlock title="No matches" description="Nothing matches your search." />
      ) : (
        <>
          {shown.items.length !== items.length ? (
            <p className="text-xs text-muted-foreground">Showing {shown.items.length} of {items.length} applications.</p>
          ) : null}
          <Accordion type="single" collapsible className="overflow-hidden rounded-2xl border border-border/70 bg-card">
            {shown.items.map((item, idx) => {
              const detail = shown.details[idx] ?? null;
              const outcome = detail ? deriveOutcome(detail) : null;
              return (
                <AccordionItem key={`${item.companyShareId}-${item.applicantFormId ?? 0}`} value={`${item.companyShareId}-${item.applicantFormId ?? 0}`}>
                  <AccordionTrigger className="px-4">
                    <span className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-2">
                      <span className="min-w-0 text-left">
                        <span className="block truncate text-sm font-semibold">{item.companyName}</span>
                        <span className="num block truncate text-xs text-muted-foreground">{item.scrip} · {item.shareTypeName} {item.shareGroupName}</span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${outcome ? outcomeStyles[outcome.kind] : "bg-secondary text-secondary-foreground"}`}>
                        {outcome ? outcome.label : (item.statusName ?? "—")}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="px-4">
                    {detail ? <DetailGrid detail={detail} /> : <p className="text-xs text-muted-foreground">Result not loaded.</p>}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </>
      )}
    </div>
  );
}

function ReportsPage() {
  const current = useQuery(applicationReportsQuery());
  const old = useQuery(oldApplicationReportsQuery());
  const [search, setSearch] = useState("");
  const currentItems = current.data ?? [];
  const oldItems = old.data ?? [];
  const currentDetails = useQuery({
    ...applicationDetailsQuery(currentItems.map((i) => ({ formId: i.applicantFormId ?? 0, old: false }))),
    enabled: currentItems.length > 0,
  });
  const oldDetails = useQuery({
    ...applicationDetailsQuery(oldItems.map((i) => ({ formId: i.applicantFormId ?? 0, old: true }))),
    enabled: oldItems.length > 0,
  });
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Application Report</h1>
          <p className="mt-1 text-sm text-muted-foreground">Status of your ASBA share applications.</p>
        </div>
        <Button variant="outline" size="sm" disabled={currentItems.length === 0} onClick={() => exportCsv(currentItems, currentDetails.data ?? [])}>
          <FileDown /> Export
        </Button>
      </div>
      <Tabs defaultValue="current" onValueChange={() => setSearch("")}>
        <TabsList>
          <TabsTrigger value="current">Current</TabsTrigger>
          <TabsTrigger value="old">Old</TabsTrigger>
        </TabsList>
        <TabsContent value="current" className="mt-4">
          {current.isLoading ? <LoadingBlock label="Loading applications" />
            : current.isError ? <ErrorBlock error={current.error} retry={() => void current.refetch()} />
            : <ReportList items={currentItems} details={currentDetails.data ?? []} loadingDetails={currentDetails.isFetching} search={search} onSearch={setSearch} />}
        </TabsContent>
        <TabsContent value="old" className="mt-4">
          {old.isLoading ? <LoadingBlock label="Loading history" />
            : old.isError ? <ErrorBlock error={old.error} retry={() => void old.refetch()} />
            : <ReportList items={oldItems} details={oldDetails.data ?? []} loadingDetails={oldDetails.isFetching} search={search} onSearch={setSearch} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
