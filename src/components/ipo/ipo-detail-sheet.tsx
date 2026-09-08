import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SkeletonLines } from "@/components/states";
import { useDocViewer } from "@/components/ui/use-doc-viewer";
import { applyForIpo, editIpoApply, getIssueDetail } from "@/lib/meroshare/ipo.functions";
import { getBankCustomers, getBankDetail, getBankRequest } from "@/lib/meroshare/account.functions";
import { banksQuery } from "@/lib/queries";
import { daysUntil, errorMessage, formatDate, formatNumber } from "@/lib/format";

export interface IpoSheetIssue {
  companyShareId: number;
  companyName?: string | undefined;
  scrip?: string | undefined;
  shareTypeName?: string | undefined;
  shareGroupName?: string | undefined;
  issueOpenDate?: string | undefined;
  issueCloseDate?: string | undefined;
  sharePerUnit?: number | string | undefined;
  minUnit?: number | undefined;
  maxUnit?: number | undefined;
}

export interface IpoSheetEdit {
  applicantFormId: number;
  appliedKitta?: number | undefined;
  bankId?: number | undefined;
  accountNumber?: string | undefined;
  crnNumber?: string | undefined;
}

function friendlyCountdown(closeDate: string | undefined): {
  label: string;
  urgent: boolean;
  closed: boolean;
} {
  const days = daysUntil(closeDate);
  if (days === null) return { label: "Dates TBA", urgent: false, closed: false };
  if (days < 0) return { label: `Closed ${formatDate(closeDate)}`, urgent: false, closed: true };
  if (days === 0) return { label: "Closes today. Apply now", urgent: true, closed: false };
  if (days === 1) return { label: "1 day left", urgent: true, closed: false };
  if (days <= 3) return { label: `${days} days left. Hurry`, urgent: true, closed: false };
  return { label: `${days} days left`, urgent: false, closed: false };
}

/** Walk a path like ["companyIssue","assignedToClient","name"] safely. */
function deepStr(record: Record<string, unknown>, paths: string[][]): string {
  for (const path of paths) {
    let cur: unknown = record;
    for (const key of path) {
      if (typeof cur !== "object" || cur === null) {
        cur = undefined;
        break;
      }
      cur = (cur as Record<string, unknown>)[key];
    }
    if (cur !== null && cur !== undefined && String(cur).trim() !== "") return String(cur).trim();
  }
  return "";
}

/** Keys never shown, even in the on-demand dump (internal identifiers). */
const NEVER_SHOW = new Set([
  "id",
  "companyshareid",
  "companyid",
  "companycode",
  "clientid",
  "capitalid",
  "bankid",
  "demat",
  "boid",
  "clientcode",
  "username",
  "password",
  "transactionpin",
]);

function isDocKey(key: string): boolean {
  return /prospectus|document|attachment|filepath|fileurl|notice/i.test(key);
}

function docHref(value: string): string | null {
  const v = value.trim();
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith("/")) return `https://webbackend.cdsc.com.np${v}`;
  return null;
}

/** Remaining scalar fields (one nesting level flattened) for the on-demand dump. */
function extraRows(detail: Record<string, unknown>, shown: Set<string>): [string, string][] {
  const rows: [string, string][] = [];
  const labelOf = (k: string) =>
    k.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
  const pushScalar = (label: string, v: unknown) => {
    if (v === null || v === undefined || String(v).trim() === "") return;
    if (typeof v === "object") return;
    rows.push([label, /date/i.test(label) ? formatDate(String(v)) : String(v)]);
  };
  for (const [k, v] of Object.entries(detail)) {
    if (shown.has(k.toLowerCase()) || NEVER_SHOW.has(k.toLowerCase())) continue;
    if (isDocKey(k)) continue;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      for (const [nk, nv] of Object.entries(v as Record<string, unknown>)) {
        if (NEVER_SHOW.has(nk.toLowerCase())) continue;
        pushScalar(`${labelOf(k)} / ${labelOf(nk)}`, nv);
      }
      continue;
    }
    pushScalar(labelOf(k), v);
  }
  return rows;
}

function IssueDetailsBox({
  issue,
  detail,
  onOpenDoc,
}: {
  issue: IpoSheetIssue;
  detail: Record<string, unknown> | null;
  onOpenDoc: (label: string, href: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const d: Record<string, unknown> = detail ?? {};
  const shown = new Set<string>();

  const rows: { label: string; value: string; doc?: string }[] = [];
  const push = (label: string, value: string, keys: string[], doc?: string) => {
    if (value || doc) {
      rows.push({ label, value, ...(doc ? { doc } : {}) });
      for (const k of keys) shown.add(k.toLowerCase());
    }
  };

  // Crucial info first, always visible, with list-known fallbacks.
  const issuer = deepStr(d, [["companyName"]]) || issue.companyName || "";
  push("Issuer", issuer, ["companyname"]);
  push(
    "Issue manager",
    deepStr(d, [
      ["issueManagerName"],
      ["assignedToClientName"],
      ["issueManager"],
      ["assignedToClient", "name"],
      ["companyIssue", "assignedToClient", "name"],
      ["companyIssue", "issueManagerName"],
      ["managerName"],
    ]),
    ["issuemanagername", "assignedtoclientname", "issuemanager", "assignedtoclient", "managername"],
  );
  push(
    "Registrar",
    deepStr(d, [
      ["shareRegistrarName"],
      ["registrarName"],
      ["registrar"],
      ["shareRegistrar", "name"],
      ["companyIssue", "shareRegistrarName"],
    ]),
    ["shareregistrarname", "registrarname", "registrar", "shareregistrar"],
  );
  push(
    "Share type",
    [issue.shareTypeName ?? "", issue.shareGroupName ?? ""].filter(Boolean).join(" · ") ||
      deepStr(d, [
        ["shareTypeName"],
        ["shareGroupName"],
        ["issueType"],
        ["subGroup"],
        ["companyIssue", "shareTypeName"],
      ]),
    ["sharetypename", "sharegroupname", "issuetype", "subgroup"],
  );
  push(
    "ISIN",
    deepStr(d, [["isin"], ["companyISIN"], ["companyIssue", "companyISIN", "isin"], ["isinNo"]]),
    ["isin", "companyisin", "isinno"],
  );
  const note = deepStr(d, [["remarks"], ["description"]]);
  if (note && note !== issuer) push("Note", note, ["remarks", "description"]);

  // Prospectus / notice documents render as a real document link, not raw text.
  for (const [k, v] of Object.entries(d)) {
    if (typeof v !== "string" || v.trim() === "") continue;
    if (!isDocKey(k)) continue;
    shown.add(k.toLowerCase());
    const href = docHref(v);
    if (href) {
      const label = /prospectus/i.test(k) ? "Prospectus" : /notice/i.test(k) ? "Notice" : "Document";
      rows.push({ label, value: "", doc: href });
    }
  }

  const rest = detail ? extraRows(d, shown) : [];

  return (
    <div className="rounded-2xl border border-border/60 bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Issue details
      </p>
      {rows.length === 0 && rest.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {detail
            ? "No extra details published for this issue."
            : "Could not load full issue details. Core dates and units above are still valid."}
        </p>
      ) : (
        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
          {rows.map(({ label, value, doc }) => (
            <div key={label} className="flex justify-between gap-3 text-xs">
              <dt className="shrink-0 text-muted-foreground">{label}</dt>
              <dd className="truncate text-right font-medium" title={value || label}>
                {doc ? (
                  <button
                    type="button"
                    onClick={() => onOpenDoc(label, doc)}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <FileText className="size-3.5" /> View {label.toLowerCase()}
                  </button>
                ) : (
                  value
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {rest.length > 0 ? (
        <div className="mt-2 border-t border-border/60 pt-2">
          <button
            type="button"
            onClick={() => setShowAll((s) => !s)}
            className="text-xs font-medium text-primary hover:underline"
          >
            {showAll ? "Hide all details" : `Show all details (${rest.length})`}
          </button>
          {showAll ? (
            <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
              {rest.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 text-xs">
                  <dt className="shrink-0 text-muted-foreground">{k}</dt>
                  <dd className="truncate text-right font-medium" title={v}>
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function IpoDetailSheet({
  issue,
  edit,
  onOpenChange,
}: {
  issue: IpoSheetIssue | null;
  edit?: IpoSheetEdit | null | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const banks = useQuery(banksQuery());
  const viewer = useDocViewer();
  const [bankId, setBankId] = useState("");
  const [kitta, setKitta] = useState("10");
  const [crn, setCrn] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountBranchId, setAccountBranchId] = useState<number | null>(null);
  const [accountTypeId, setAccountTypeId] = useState<number | null>(null);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [pin, setPin] = useState("");

  const shareId = issue?.companyShareId ?? 0;
  const editFormId = edit?.applicantFormId ?? null;

  // Reset the form every time a different issue is opened.
  useEffect(() => {
    if (!issue) return;
    setKitta(String(edit?.appliedKitta ?? issue.minUnit ?? 10));
    setBankId(edit?.bankId ? String(edit.bankId) : "");
    setAccountNumber(edit?.accountNumber ?? "");
    setCrn(edit?.crnNumber ?? "");
    setAccountBranchId(null);
    setAccountTypeId(null);
    setCustomerId(null);
    setPin("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareId]);

  // Default to the first ASBA bank, like the real MeroShare site.
  useEffect(() => {
    if (!bankId && banks.data?.[0]) setBankId(String(banks.data[0].id));
  }, [bankId, banks.data]);

  const bankDetail = useQuery({
    queryKey: ["bank-detail", bankId],
    queryFn: () => getBankDetail({ data: { bankId: Number(bankId) } }),
    enabled: Boolean(bankId),
  });
  const bankCustomers = useQuery({
    queryKey: ["bank-customers", bankId],
    queryFn: () => getBankCustomers({ data: { bankId: Number(bankId) } }),
    enabled: Boolean(bankId),
  });
  const selectedBank = banks.data?.find((b) => String(b.id) === String(bankId));
  const bankRequest = useQuery({
    queryKey: ["bank-request", selectedBank?.code ?? ""],
    queryFn: () => getBankRequest({ data: { bankCode: String(selectedBank?.code ?? "") } }),
    enabled: Boolean(selectedBank?.code),
  });

  const customers = (bankCustomers.data ?? []) as unknown as Array<Record<string, unknown>>;
  const customerOf = (acc: string) =>
    customers.find((x) => String(x["accountNumber"]) === acc) as Record<string, unknown> | undefined;

  // Auto-pick the only account, and re-resolve branch/customer for edit flows
  // once the bank's customer list arrives.
  useEffect(() => {
    if (!bankId || customers.length === 0) return;
    if (accountNumber) {
      const c = customerOf(accountNumber);
      if (c && !customerId) {
        setCustomerId(c["id"] != null ? Number(c["id"]) : null);
        setAccountBranchId(
          c["accountBranchId"] != null ? Number(c["accountBranchId"]) : ((c["branchId"] as number) ?? null),
        );
        setAccountTypeId(c["accountTypeId"] != null ? Number(c["accountTypeId"]) : null);
      }
      return;
    }
    if (customers.length === 1 && !editFormId) {
      const c = customers[0] as Record<string, unknown>;
      const acc = c["accountNumber"] ? String(c["accountNumber"]) : "";
      if (acc) {
        setAccountNumber(acc);
        setCustomerId(c["id"] != null ? Number(c["id"]) : null);
        setAccountBranchId(
          c["accountBranchId"] != null ? Number(c["accountBranchId"]) : ((c["branchId"] as number) ?? null),
        );
        setAccountTypeId(c["accountTypeId"] != null ? Number(c["accountTypeId"]) : null);
        const crnFromReq = bankRequest.data?.["crnNumber"] ? String(bankRequest.data["crnNumber"]) : "";
        if (crnFromReq) setCrn(crnFromReq);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankId, bankCustomers.data, bankRequest.data]);

  const onAccountChange = (acc: string) => {
    setAccountNumber(acc);
    const c = customerOf(acc);
    if (c) {
      setCustomerId(c["id"] != null ? Number(c["id"]) : null);
      setAccountBranchId(
        c["accountBranchId"] != null ? Number(c["accountBranchId"]) : ((c["branchId"] as number) ?? null),
      );
      setAccountTypeId(c["accountTypeId"] != null ? Number(c["accountTypeId"]) : null);
    }
  };

  const close = () => onOpenChange(false);
  const afterWrite = (message: string) => {
    toast.success(message);
    close();
    void queryClient.invalidateQueries({ queryKey: ["applicable-issues"] });
    void queryClient.invalidateQueries({ queryKey: ["application-reports"] });
    void queryClient.invalidateQueries({ queryKey: ["application-details"] });
  };

  const apply = useMutation({
    mutationFn: applyForIpo,
    onSuccess: () => afterWrite("Application submitted to MeroShare."),
    onError: (error) => toast.error(errorMessage(error, "Could not submit the application.")),
  });
  const editApply = useMutation({
    mutationFn: editIpoApply,
    onSuccess: () => afterWrite("Application updated."),
    onError: (error) => toast.error(errorMessage(error, "Could not update the application.")),
  });

  const submit = () => {
    if (!issue || !bankId) {
      toast.error("Select your ASBA bank.");
      return;
    }
    if (!accountNumber.trim()) {
      toast.error("Select your bank account number.");
      return;
    }
    if (!crn.trim()) {
      toast.error("Enter your CRN number. You can find it on your bank cheque or ASBA form.");
      return;
    }
    if (!customerId || !accountBranchId) {
      toast.error("Pick your account number first. Branch and customer are filled from that account.");
      return;
    }
    if (minUnits && Number(kitta) < minUnits) {
      toast.error(`Minimum ${formatNumber(minUnits)} units required.`);
      return;
    }
    if (maxUnits && Number(kitta) > maxUnits) {
      toast.error(`Maximum ${formatNumber(maxUnits)} units allowed.`);
      return;
    }
    const payload: Record<string, unknown> = {
      companyShareId: issue.companyShareId,
      appliedKitta: Number(kitta),
      bankId: Number(bankId),
      accountBranchId,
      accountNumber: accountNumber.trim(),
      customerId,
      crnNumber: crn.trim(),
      transactionPIN: pin,
    };
    if (accountTypeId != null) payload["accountTypeId"] = accountTypeId;
    if (editFormId) {
      editApply.mutate({ data: { ...payload, applicantFormId: editFormId } });
    } else {
      apply.mutate({ data: payload });
    }
  };

  const issueDetail = useQuery({
    queryKey: ["issue-detail", shareId],
    queryFn: () => getIssueDetail({ data: { companyShareId: shareId } }),
    enabled: shareId > 0,
  });
  const detailRec = (issueDetail.data ?? null) as Record<string, unknown> | null;

  // Tiles prefer the list-known values, falling back to the full detail when
  // the list row carries no dates / price / units, so they never go blank.
  const openDate =
    issue?.issueOpenDate || (detailRec ? deepStr(detailRec, [["issueOpenDate"], ["minIssueOpenDate"]]) : "");
  const closeDate =
    issue?.issueCloseDate || (detailRec ? deepStr(detailRec, [["issueCloseDate"], ["maxIssueCloseDate"]]) : "");
  const pricePerUnit =
    issue?.sharePerUnit ??
    (detailRec ? deepStr(detailRec, [["sharePerUnit"], ["rate"], ["faceValue"]]) : "");
  const minUnits =
    issue?.minUnit ?? (detailRec ? Number(deepStr(detailRec, [["minUnit"]]) || 0) || undefined : undefined);
  const maxUnits =
    issue?.maxUnit ?? (detailRec ? Number(deepStr(detailRec, [["maxUnit"]]) || 0) || undefined : undefined);

  const countdown = friendlyCountdown(closeDate || issue?.issueCloseDate);
  const busy = apply.isPending || editApply.isPending;
  const canSubmit =
    Boolean(bankId) &&
    accountNumber.trim().length > 0 &&
    crn.trim().length > 0 &&
    kitta.trim().length > 0 &&
    Number(kitta) >= 1 &&
    pin.length >= 4 &&
    !bankCustomers.isLoading;

  return (
    <Sheet
      open={Boolean(issue)}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-xl">
        {issue ? (
          <div className="space-y-4 px-4 pb-6 pt-6">
            <SheetHeader className="p-0 text-left">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="num flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary"
                >
                  {String(issue.companyName ?? issue.scrip ?? "?").trim().charAt(0).toUpperCase() || "?"}
                </span>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="font-display text-xl leading-tight">
                    {issue.companyName ?? issue.scrip ?? "Issue"}
                  </SheetTitle>
                  <SheetDescription className="num mt-0.5">
                    {issue.scrip ? `${issue.scrip} · ` : ""}
                    {issue.shareTypeName ?? ""} {issue.shareGroupName ?? ""}
                  </SheetDescription>
                  <p className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span
                      className={
                        countdown.closed
                          ? "num rounded-full bg-muted px-2.5 py-1 text-[0.7rem] font-semibold text-muted-foreground"
                          : countdown.urgent
                            ? "num rounded-full bg-loss/15 px-2.5 py-1 text-[0.7rem] font-semibold text-loss"
                            : "num rounded-full bg-primary/15 px-2.5 py-1 text-[0.7rem] font-semibold text-primary"
                      }
                    >
                      {countdown.label}
                    </span>
                    {editFormId ? (
                      <span className="num inline-flex items-center gap-1 rounded-full bg-gain/15 px-2.5 py-1 text-[0.7rem] font-semibold text-gain">
                        <CheckCircle2 className="size-3" /> Already applied. You can edit
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>
            </SheetHeader>

            <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="rounded-2xl border border-border/60 bg-surface px-3 py-2.5">
                <dt className="text-muted-foreground">Opens</dt>
                <dd className="num mt-0.5 font-semibold">{openDate ? formatDate(openDate) : "-"}</dd>
              </div>
              <div className="rounded-2xl border border-border/60 bg-surface px-3 py-2.5">
                <dt className="text-muted-foreground">Closes</dt>
                <dd className="num mt-0.5 font-semibold">{closeDate ? formatDate(closeDate) : "-"}</dd>
              </div>
              <div className="rounded-2xl border border-border/60 bg-surface px-3 py-2.5">
                <dt className="text-muted-foreground">Price / unit</dt>
                <dd className="num mt-0.5 font-semibold">
                  {pricePerUnit ? `Rs ${formatNumber(pricePerUnit)}` : "-"}
                </dd>
              </div>
              <div className="rounded-2xl border border-border/60 bg-surface px-3 py-2.5">
                <dt className="text-muted-foreground">Min-Max</dt>
                <dd className="num mt-0.5 font-semibold">
                  {minUnits || maxUnits
                    ? `${formatNumber(minUnits)}-${formatNumber(maxUnits)}`
                    : "-"}
                </dd>
              </div>
            </dl>

            {issueDetail.isLoading ? (
              <div className="rounded-2xl border border-border/60 bg-surface p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Issue details
                </p>
                <SkeletonLines rows={4} className="mt-2" />
              </div>
            ) : (
              <IssueDetailsBox
                issue={issue}
                detail={detailRec}
                onOpenDoc={(label, href) => viewer.openPreview(`${issue.companyName ?? issue.scrip ?? "Issue"} ${label}`, href)}
              />
            )}

            <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {editFormId ? "Your application (edit and update)" : "Your application"}
              </p>
              <div className="space-y-2">
                <Label>ASBA bank *</Label>
                <Select
                  value={bankId}
                  onValueChange={(v) => {
                    setBankId(v);
                    setAccountNumber("");
                    setCrn("");
                    setAccountBranchId(null);
                    setAccountTypeId(null);
                    setCustomerId(null);
                  }}
                >
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
                {bankCustomers.isLoading || bankRequest.isLoading ? (
                  <SkeletonLines rows={2} className="pt-1" />
                ) : customers.length > 0 ? (
                  <p className="num rounded-lg border border-border/60 bg-surface px-3 py-2 text-xs text-muted-foreground">
                    {(() => {
                      const c = customerOf(accountNumber);
                      const name =
                        (c?.["branchName"] as string) ||
                        (c?.["branch"] as string) ||
                        (bankRequest.data?.["branch"] as string) ||
                        "";
                      return name ? `Branch ${name}` : "Pick an account to see branch";
                    })()}
                    {customerId ? ` · Customer ID ${customerId}` : ""}
                  </p>
                ) : bankDetail.data ? (
                  <p className="num rounded-lg border border-border/60 bg-surface px-3 py-2 text-xs text-muted-foreground">
                    Branch {String(bankDetail.data?.branchName ?? "-")}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="ipo-sheet-account">Bank account number *</Label>
                {customers.length > 0 ? (
                  <Select value={accountNumber} onValueChange={onAccountChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => {
                        const acc = String(c["accountNumber"] ?? "");
                        const type = c["accountType"] ? ` - ${c["accountType"]}` : "";
                        return (
                          <SelectItem key={acc} value={acc}>
                            {acc}
                            {type}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="ipo-sheet-account"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="Enter account number"
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="ipo-sheet-crn">CRN number *</Label>
                <Input
                  id="ipo-sheet-crn"
                  value={crn}
                  onChange={(e) => setCrn(e.target.value)}
                  placeholder={
                    bankDetail.data?.crnNumber ? String(bankDetail.data.crnNumber) : "Enter CRN from your bank"
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Your 15-digit CRN from your bank cheque or ASBA form.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="ipo-sheet-kitta">Applied units *</Label>
                  <Input
                    id="ipo-sheet-kitta"
                    inputMode="numeric"
                    value={kitta}
                    onChange={(e) => setKitta(e.target.value.replace(/[^0-9]/g, ""))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ipo-sheet-pin">Transaction PIN *</Label>
                  <Input
                    id="ipo-sheet-pin"
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="4 digit PIN"
                  />
                </div>
              </div>
              {minUnits || maxUnits ? (
                <p className="-mt-2 text-[11px] text-muted-foreground">
                  Allowed: {formatNumber(minUnits)}-{formatNumber(maxUnits)} units
                  {pricePerUnit ? ` · Rs ${formatNumber(pricePerUnit)}/unit` : ""}
                </p>
              ) : null}
              {editFormId ? (
                <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-muted-foreground">
                  You are editing your existing application. You can change units, bank, account and
                  CRN while the issue is still open.
                </p>
              ) : null}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={busy || !canSubmit}>
                  {busy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Submitting…
                    </>
                  ) : editFormId ? (
                    "Update application"
                  ) : (
                    "Confirm application"
                  )}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </SheetContent>
      {viewer.modal}
    </Sheet>
  );
}
