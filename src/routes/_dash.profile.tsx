import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ErrorBlock, LoadingBlock } from "@/components/states";
import { ownDetailQuery } from "@/lib/queries";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_dash/profile")({
  head: () => ({
    meta: [
      { title: "My Profile — MeroShare Investor Console" },
      { name: "description", content: "Your MeroShare demat account details, contact information and renewal dates." },
      { property: "og:title", content: "My Profile — MeroShare Investor Console" },
      { property: "og:description", content: "Your MeroShare demat account details, contact information and renewal dates." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const q = useQuery(ownDetailQuery());
  const d = q.data;
  const rows: Array<[string, string]> = d
    ? [
        ["Name", String(d.name ?? "—")],
        ["Username", String(d.username ?? "—")],
        ["Demat / BOID", String(d.demat ?? "—")],
        ["Client code", String(d.clientCode ?? "—")],
        ["Email", String(d.meroShareEmail ?? d.email ?? "—")],
        ["Contact", String(d.contact ?? "—")],
        ["Address", String(d.address ?? "—")],
        ["Gender", String(d.gender ?? "—")],
        ["Demat expiry", formatDate(d.dematExpiryDate)],
        ["Account expiry", formatDate(d.expiredDate)],
        ["Password changed", String(d.passwordChangeDateStr ?? "—")],
        ["Password expires", String(d.passwordExpiryDateStr ?? "—")],
      ]
    : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">My Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">Details registered with your depository participant.</p>
      </div>
      {q.isLoading ? (
        <LoadingBlock label="Loading profile" />
      ) : q.isError ? (
        <ErrorBlock error={q.error} retry={() => void q.refetch()} />
      ) : (
        <dl className="grid gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/70 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="bg-card px-4 py-3">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 break-words text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
