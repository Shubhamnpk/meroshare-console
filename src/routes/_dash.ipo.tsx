import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Rocket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorBlock, LoadingBlock, EmptyBlock } from "@/components/states";
import { applicableIssuesQuery, banksQuery } from "@/lib/queries";
import { applyForIpo } from "@/lib/meroshare/ipo.functions";
import { getBankDetail } from "@/lib/meroshare/account.functions";
import { errorMessage, formatDate, formatNumber, toNumber } from "@/lib/format";
import type { ApplicableIssue } from "@/lib/meroshare/types";

export const Route = createFileRoute("/_dash/ipo")({
  head: () => ({
    meta: [
      { title: "Apply for Issue — MeroShare Investor Console" },
      { name: "description", content: "Browse open IPO, FPO and right share issues and submit your ASBA application." },
      { property: "og:title", content: "Apply for Issue — MeroShare Investor Console" },
      { property: "og:description", content: "Browse open IPO, FPO and right share issues and submit your ASBA application." },
    ],
  }),
  component: IpoPage,
});

function IpoPage() {
  const queryClient = useQueryClient();
  const issues = useQuery(applicableIssuesQuery());
  const banks = useQuery(banksQuery());
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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Apply for Issue</h1>
        <p className="mt-1 text-sm text-muted-foreground">Open issues you are eligible to apply for.</p>
      </div>

      {issues.isLoading ? (
        <LoadingBlock label="Loading open issues" />
      ) : issues.isError ? (
        <ErrorBlock error={issues.error} retry={() => void issues.refetch()} />
      ) : list.length === 0 ? (
        <EmptyBlock title="No open issues" description="Check back when a new issue opens." icon={<Rocket className="size-6" />} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((issue) => (
            <li key={issue.companyShareId} className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4">
              <div>
                <p className="font-display text-base font-semibold">{issue.companyName}</p>
                <p className="num text-xs text-muted-foreground">{issue.scrip} · {issue.shareTypeName} {issue.shareGroupName}</p>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div><dt className="text-muted-foreground">Opens</dt><dd>{formatDate(issue.issueOpenDate)}</dd></div>
                <div><dt className="text-muted-foreground">Closes</dt><dd>{formatDate(issue.issueCloseDate)}</dd></div>
                <div><dt className="text-muted-foreground">Price / unit</dt><dd className="num">Rs {formatNumber(issue.sharePerUnit)}</dd></div>
                <div><dt className="text-muted-foreground">Units</dt><dd className="num">{formatNumber(issue.minUnit)} – {formatNumber(issue.maxUnit)}</dd></div>
              </dl>
              <Button
                className="mt-auto"
                onClick={() => { setActive(issue); setKitta(String(issue.minUnit ?? 10)); }}
              >
                Apply
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={Boolean(active)} onOpenChange={(open) => { if (!open) setActive(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{active?.companyName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Bank</Label>
              <Select value={bankId} onValueChange={setBankId}>
                <SelectTrigger><SelectValue placeholder="Select your ASBA bank" /></SelectTrigger>
                <SelectContent>
                  {(banks.data ?? []).map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {bankDetail.data ? (
                <p className="num text-xs text-muted-foreground">
                  A/C {String(bankDetail.data.accountNumber ?? "")} · CRN {String(bankDetail.data.crnNumber ?? "")}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="kitta">Applied units</Label>
              <Input id="kitta" inputMode="numeric" value={kitta} onChange={(e) => setKitta(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin">Transaction PIN</Label>
              <Input id="pin" type="password" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActive(null)}>Cancel</Button>
            <Button onClick={submit} disabled={apply.isPending || !bankDetail.data || pin.length < 4}>
              {apply.isPending ? <><Loader2 className="size-4 animate-spin" /> Submitting…</> : "Confirm application"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
