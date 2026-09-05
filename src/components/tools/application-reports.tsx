import { useQuery } from "@tanstack/react-query";
import { ErrorBlock, LoadingBlock, EmptyBlock } from "@/components/states";
import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Lock,
  Search,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExportButton, csvRow } from "@/components/export-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  applicationDetailsQuery,
  applicationReportsQuery,
  oldApplicationReportsQuery,
} from "@/lib/queries";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { formatDateTime, formatQty, toNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ApplicationReportItem, JsonRecord, JsonValue } from "@/lib/meroshare/types";

type Outcome = { kind: "allotted" | "not-allotted" | "blocked" | "pending"; label: string };

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * Classify an application's allotment state from its raw MeroShare fields.
 * Status is authoritative ("Alloted" / "Not Alloted" / "Allotted" / "Not
 * Allotted" / "Rejected"); Stage/Remark/Reason only fill in blocked / released
 * / pending states. Note "Not Alloted" must not match the allotted branch.
 */
function deriveOutcome(d: JsonRecord): Outcome {
  const rk = toNumber(d["receivedKitta"]);
  const status = (str(d["statusName"]) ?? "").toUpperCase().replace(/\s+/g, " ").trim();
  const stage = (str(d["stageName"]) ?? "").toUpperCase();
  const remark = (str(d["meroshareRemark"]) ?? "").toUpperCase();
  const reason = (str(d["reasonOrRemark"]) ?? "").toUpperCase();
  const hay = [stage, remark, reason].join(" | ");

  if (rk > 0) return { kind: "allotted", label: "Allotted" };
  if (/^ALLOTED$/.test(status) || /^ALLOTTED$/.test(status)) {
    return { kind: "allotted", label: "Allotted" };
  }
  if (/^NOT ALLOTED$/.test(status) || /^NOT ALLOTTED$/.test(status) || /REJECTED/.test(status)) {
    return { kind: "not-allotted", label: "Not allotted" };
  }
  if (/\bBLOCKED\b|BLOCK AMOUNT/.test(hay) && !/RELEASED/.test(hay)) {
    return { kind: "blocked", label: "Amount blocked" };
  }
  if (/AMOUNT RELEASED/.test(hay)) {
    return { kind: "not-allotted", label: "Not allotted" };
  }
  if (/ALLOTMENT_RESULT_UPLOADED|ALLOTMENT_RESULT_PUBLISHED/.test(stage)) {
    return { kind: "not-allotted", label: "Not allotted" };
  }
  if (/PENDING|RESULT NOT PUBLISHED/.test(hay)) {
    return { kind: "pending", label: "Pending" };
  }
  return { kind: "pending", label: "Pending result" };
}

const outcomeStyles: Record<Outcome["kind"], string> = {
  allotted: "bg-gain/15 text-gain",
  "not-allotted": "bg-loss/15 text-loss",
  blocked: "bg-warning/15 text-warning",
  pending: "bg-muted text-muted-foreground",
};

function StatusBadge({ outcome }: { outcome: Outcome }) {
  const icon =
    outcome.kind === "allotted" ? (
      <CheckCircle2 className="size-3.5" />
    ) : outcome.kind === "not-allotted" ? (
      <XCircle className="size-3.5" />
    ) : outcome.kind === "blocked" ? (
      <Lock className="size-3.5" />
    ) : (
      <Clock className="size-3.5" />
    );
  return (
    <span
      className={cn(
        "num inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[0.68rem] font-semibold",
        outcomeStyles[outcome.kind],
      )}
    >
      {icon}
      {outcome.label}
    </span>
  );
}

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
  const counts = { allotted: 0, "not-allotted": 0, blocked: 0, pending: 0 };
  for (const o of outcomes) counts[o.kind] += 1;
  const kittaApplied = valid.reduce((s, d) => s + Math.max(0, toNumber(d["appliedKitta"])), 0);
  const kittaAllotted = valid.reduce((s, d) => s + Math.max(0, toNumber(d["receivedKitta"])), 0);
  return (
    <div className="flex flex-wrap gap-2">
      <Chip label="Applied" value={String(valid.length)} />
      <Chip label="Allotted" value={String(counts.allotted)} valueClass="text-gain" />
      <Chip label="Not allotted" value={String(counts["not-allotted"])} valueClass="text-loss" />
      <Chip label="Amount blocked" value={String(counts.blocked)} valueClass="text-warning" />
      <Chip label="Awaiting result" value={String(counts.pending)} />
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
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const HIDDEN_FIELDS = new Set([
  "remarks",
  "statusDescription",
  "suspectStatusName",
  "meroShareId",
  "accountNumber",
  "accountTypeName",
  "registeredBranchName",
  "reasonOrRemark",
  "stageName",
  "companyShareId",
  "demat",
]);

function DetailGrid({ detail }: { detail: JsonRecord }) {
  const known = new Set(Object.keys(knownFields));
  const skipped = new Set(HIDDEN_FIELDS);
  const rows: [string, string][] = [];
  for (const k of Object.keys(knownFields)) {
    if (skipped.has(k)) continue;
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
  const extraRows = Object.entries(detail).filter(
    ([k, v]) =>
      !known.has(k) &&
      !skipped.has(k) &&
      v !== null &&
      v !== undefined &&
      v !== "" &&
      !(typeof v === "object" && Object.keys(v as object).length === 0),
  );
  for (const [k, v] of extraRows) rows.push([humanize(k), renderValue(v)]);
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="truncate text-sm font-medium" title={value}>
            {value}
          </dd>
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
    detail ? (str(detail["stageName"]) ?? "") : "",
    detail ? (str(detail["meroshareRemark"]) ?? "") : "",
    detail ? (str(detail["applicantFormId"]) ?? "") : "",
  ];
  return haystack.some((s) => s && s.toLowerCase().includes(term));
}

type SortKey = "appliedDate" | "companyName" | "scrip" | "appliedKitta" | "status" | "amount";
type SortCycle = "default" | "asc" | "desc";

const SORT_LABELS: Record<SortKey, string> = {
  appliedDate: "Date",
  companyName: "Company",
  scrip: "Scrip",
  appliedKitta: "Kitta",
  status: "Status",
  amount: "Amount",
};

function sortValue(
  pair: { item: ApplicationReportItem; detail: JsonRecord | null },
  key: SortKey,
): string | number {
  const { item, detail } = pair;
  switch (key) {
    case "companyName":
      return item.companyName ?? "";
    case "scrip":
      return item.scrip ?? "";
    case "status":
      return (detail ? (str(detail["statusName"]) ?? "") : "") || item.statusName || "";
    case "appliedKitta":
      return detail ? toNumber(detail["appliedKitta"]) : 0;
    case "amount":
      return detail ? toNumber(detail["amount"]) : 0;
    default:
      return detail ? String(detail["appliedDate"] ?? "") : "";
  }
}

function comparePairs(
  a: { item: ApplicationReportItem; detail: JsonRecord | null },
  b: { item: ApplicationReportItem; detail: JsonRecord | null },
  key: SortKey,
  dir: "asc" | "desc",
): number {
  const av = sortValue(a, key);
  const bv = sortValue(b, key);
  const cmp =
    typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv));
  return dir === "asc" ? cmp : -cmp;
}

function SortBar({
  sortKey,
  cycle,
  onKey,
  onCycle,
}: {
  sortKey: SortKey;
  cycle: SortCycle;
  onKey: (key: SortKey) => void;
  onCycle: () => void;
}) {
  return (
    <>
      <Select value={sortKey} onValueChange={(v) => onKey(v as SortKey)}>
        <SelectTrigger className="h-8 w-32 text-xs" aria-label="Sort applications by">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <SelectItem key={k} value={k}>
              {SORT_LABELS[k]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        onClick={onCycle}
        aria-label="Cycle sort direction"
        title={
          cycle === "asc"
            ? "Ascending: tap to sort descending"
            : cycle === "desc"
              ? "Descending: tap to reset to default order"
              : "Default order: tap to sort ascending"
        }
      >
        {cycle === "asc" ? (
          <ArrowUp className="size-4" />
        ) : cycle === "desc" ? (
          <ArrowDown className="size-4" />
        ) : (
          <ArrowUpDown className="size-4" />
        )}
      </Button>
    </>
  );
}

function reportCsv(items: ApplicationReportItem[], details: (JsonRecord | null)[]) {
  const rows = items.map((item, idx) => {
    const d = details[idx] ?? null;
    return csvRow([
      idx + 1,
      String(item.companyName ?? ""),
      String(item.scrip ?? ""),
      d ? String(toNumber(d["appliedKitta"])) : "",
      d ? String(toNumber(d["receivedKitta"])) : "",
      d ? String(toNumber(d["amount"])) : "",
      d ? String(d["statusName"] ?? "") : String(item.statusName ?? ""),
      d ? String(d["stageName"] ?? "") : "",
      d ? String(d["meroshareRemark"] ?? "") : "",
    ]);
  });
  return [
    csvRow([
      "SN",
      "Company",
      "Scrip",
      "Applied",
      "Allotted",
      "Amount",
      "Status",
      "Stage",
      "Remark",
    ]),
    ...rows,
  ].join("\n");
}

function ReportList({
  items,
  details,
  loadingDetails,
  search,
  onSearch,
  sortKey,
  sortCycle,
}: {
  items: ApplicationReportItem[];
  details: (JsonRecord | null)[];
  loadingDetails: boolean;
  search: string;
  onSearch: (value: string) => void;
  sortKey: SortKey;
  sortCycle: SortCycle;
}) {
  const shown = useMemo(() => {
    const pairs = items.map((item, idx) => ({ item, detail: details[idx] ?? null }));
    const term = search.trim().toLowerCase();
    const filtered = term ? pairs.filter(({ item, detail }) => matches(item, detail, term)) : pairs;
    filtered.sort((a, b) => comparePairs(a, b, sortKey, sortCycle === "asc" ? "asc" : "desc"));
    return { items: filtered.map((p) => p.item), details: filtered.map((p) => p.detail) };
  }, [items, details, search, sortKey, sortCycle]);

  if (items.length === 0) {
    return (
      <EmptyBlock
        title="No applications"
        description="Applications you submit will be listed here."
      />
    );
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
      {loadingDetails && (
        <p className="text-xs text-muted-foreground">Loading application results…</p>
      )}
      {shown.items.length === 0 ? (
        <EmptyBlock title="No matches" description="Nothing matches your search." />
      ) : (
        <>
          {shown.items.length !== items.length ? (
            <p className="text-xs text-muted-foreground">
              Showing {shown.items.length} of {items.length} applications.
            </p>
          ) : null}
          <Accordion
            type="single"
            collapsible
            className="overflow-hidden rounded-2xl border border-border/70 bg-card"
          >
            {shown.items.map((item, idx) => {
              const detail = shown.details[idx] ?? null;
              const outcome = detail ? deriveOutcome(detail) : null;
              return (
                <AccordionItem
                  key={`${item.companyShareId}-${item.applicantFormId ?? 0}`}
                  value={`${item.companyShareId}-${item.applicantFormId ?? 0}`}
                >
                  <AccordionTrigger className="px-4">
                    <span className="flex min-w-0 flex-1 items-center justify-between gap-3 pr-2">
                      <span className="min-w-0 text-left">
                        <span className="block truncate text-sm font-semibold">
                          {item.companyName}
                        </span>
                        <span className="num block truncate text-xs text-muted-foreground">
                          {item.scrip} · {item.shareTypeName} {item.shareGroupName}
                        </span>
                      </span>
                      {outcome ? (
                        <StatusBadge outcome={outcome} />
                      ) : (
                        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[0.68rem] font-semibold text-muted-foreground">
                          {item.statusName ?? "-"}
                        </span>
                      )}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="px-4">
                    {detail ? (
                      <DetailGrid detail={detail} />
                    ) : (
                      <p className="text-xs text-muted-foreground">Result not loaded.</p>
                    )}
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

export function ApplicationReports() {
  const current = useQuery(applicationReportsQuery());
  const old = useQuery(oldApplicationReportsQuery());
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("appliedDate");
  const [sortCycle, setSortCycle] = useState<SortCycle>("default");
  const cycleSort = () =>
    setSortCycle((c) => (c === "asc" ? "desc" : c === "desc" ? "default" : "asc"));
  const currentItems = current.data ?? [];
  const oldItems = old.data ?? [];
  const currentDetails = useQuery({
    ...applicationDetailsQuery(
      currentItems.map((i) => ({ formId: i.applicantFormId ?? 0, old: false })),
    ),
    enabled: currentItems.length > 0,
  });
  const oldDetails = useQuery({
    ...applicationDetailsQuery(
      oldItems.map((i) => ({ formId: i.applicantFormId ?? 0, old: true })),
    ),
    enabled: oldItems.length > 0,
  });
  return (
    <div className="space-y-5">
      <Tabs defaultValue="current" onValueChange={() => setSearch("")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="current">Current</TabsTrigger>
            <TabsTrigger value="old">Old</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <SortBar sortKey={sortKey} cycle={sortCycle} onKey={setSortKey} onCycle={cycleSort} />
            <ExportButton
              disabled={currentItems.length === 0}
              formats={[
                {
                  title: "CSV",
                  description: "Applied, allotted, amount and status per application",
                  filename: "application-report",
                  extension: "csv",
                  build: () => reportCsv(currentItems, currentDetails.data ?? []),
                },
                {
                  title: "JSON",
                  description: "Raw application and detail records",
                  filename: "application-report",
                  extension: "json",
                  build: () =>
                    JSON.stringify(
                      (currentItems ?? []).map((item, idx) => ({
                        application: item,
                        detail: currentDetails.data?.[idx] ?? null,
                      })),
                      null,
                      2,
                    ),
                },
                {
                  title: "PDF",
                  description: "Formatted report for printing or sharing",
                  filename: "application-report",
                  extension: "pdf",
                  build: () => "",
                  pdf: () => ({
                    title: "IPO application history",
                    head: ["SN", "Company", "Scrip", "Applied", "Allotted", "Amount", "Status"],
                    body: currentItems.map((item, idx) => {
                      const d = currentDetails.data?.[idx] ?? null;
                      return [
                        idx + 1,
                        String(item.companyName ?? ""),
                        String(item.scrip ?? ""),
                        d ? toNumber(d["appliedKitta"]) : "",
                        d ? toNumber(d["receivedKitta"]) : "",
                        d ? toNumber(d["amount"]) : "",
                        d ? String(d["statusName"] ?? "") : String(item.statusName ?? ""),
                      ];
                    }),
                  }),
                },
              ]}
            />
          </div>
        </div>
        <TabsContent value="current" className="mt-4">
          {current.isLoading ? (
            <LoadingBlock label="Loading applications" />
          ) : current.isError ? (
            <ErrorBlock error={current.error} retry={() => void current.refetch()} />
          ) : (
            <ReportList
              items={currentItems}
              details={currentDetails.data ?? []}
              loadingDetails={currentDetails.isFetching}
              search={search}
              onSearch={setSearch}
              sortKey={sortKey}
              sortCycle={sortCycle}
            />
          )}
        </TabsContent>
        <TabsContent value="old" className="mt-4">
          {old.isLoading ? (
            <LoadingBlock label="Loading history" />
          ) : old.isError ? (
            <ErrorBlock error={old.error} retry={() => void old.refetch()} />
          ) : (
            <ReportList
              items={oldItems}
              details={oldDetails.data ?? []}
              loadingDetails={oldDetails.isFetching}
              search={search}
              onSearch={setSearch}
              sortKey={sortKey}
              sortCycle={sortCycle}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
