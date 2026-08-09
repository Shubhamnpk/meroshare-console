import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorBlock, LoadingBlock } from "@/components/states";
import { ipoResultCompaniesQuery } from "@/lib/queries";
import { getIpoResult } from "@/lib/meroshare/ipo.functions";
import { errorMessage } from "@/lib/format";

export const Route = createFileRoute("/_dash/results")({
  head: () => ({
    meta: [
      { title: "IPO Result — MeroShare Investor Console" },
      { name: "description", content: "Check allotment results for your BOID against any listed issue." },
      { property: "og:title", content: "IPO Result — MeroShare Investor Console" },
      { property: "og:description", content: "Check allotment results for your BOID against any listed issue." },
    ],
  }),
  component: ResultsPage,
});

function ResultsPage() {
  const companies = useQuery(ipoResultCompaniesQuery());
  const [companyShareId, setCompanyShareId] = useState("");
  const check = useMutation({ mutationFn: getIpoResult });
  const message = check.data ? String(check.data["message"] ?? JSON.stringify(check.data)) : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">IPO Result</h1>
        <p className="mt-1 text-sm text-muted-foreground">Checked against the BOID of your signed-in account.</p>
      </div>
      {companies.isLoading ? (
        <LoadingBlock label="Loading companies" rows={2} />
      ) : companies.isError ? (
        <ErrorBlock error={companies.error} retry={() => void companies.refetch()} />
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4 sm:flex-row sm:items-center">
          <Select value={companyShareId} onValueChange={setCompanyShareId}>
            <SelectTrigger className="sm:w-96"><SelectValue placeholder="Select a company" /></SelectTrigger>
            <SelectContent>
              {(companies.data ?? []).map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            disabled={!companyShareId || check.isPending}
            onClick={() => check.mutate({ data: { companyShareId: Number(companyShareId) } })}
          >
            {check.isPending ? <><Loader2 className="size-4 animate-spin" /> Checking…</> : <><Trophy className="size-4" /> Check result</>}
          </Button>
        </div>
      )}
      {check.isError ? <ErrorBlock error={check.error} /> : null}
      {message ? (
        <div className="rounded-2xl border border-primary/40 bg-primary/10 p-4 text-sm font-medium">{message}</div>
      ) : null}
      {check.isError ? <p className="text-xs text-muted-foreground">{errorMessage(check.error)}</p> : null}
    </div>
  );
}
