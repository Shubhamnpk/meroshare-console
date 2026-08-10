import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Check, Copy, Landmark, Mail, ShieldCheck, UserRound } from "lucide-react";
import { ErrorBlock, LoadingBlock } from "@/components/states";
import { ownDetailQuery } from "@/lib/queries";
import { formatDate } from "@/lib/format";
import type { OwnDetail } from "@/lib/meroshare/types";

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

function initials(name?: string): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  if (!value || value === "—") return null;
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      className="ml-1 inline-flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        toast.success(`${label} copied`);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-3.5 text-gain" /> : <Copy className="size-3.5" />}
    </button>
  );
}

function InfoBadge({ label, value, tone }: { label: string; value?: string; tone?: "ok" | "warn" | "muted" }) {
  if (!value) return null;
  const tones = {
    ok: "bg-emerald-500/10 text-emerald-600",
    warn: "bg-amber-500/10 text-amber-600",
    muted: "bg-secondary text-secondary-foreground",
  };
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${tones[tone ?? "muted"]}`}>{value}</span>
    </div>
  );
}

function Section({ icon: Icon, title, rows }: { icon: typeof UserRound; title: string; rows: [string, string, string][] }) {
  if (rows.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      <header className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
        <Icon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </header>
      <dl className="grid gap-px bg-border/70 sm:grid-cols-2">
        {rows.map(([label, value, copy]) => (
          <div key={label} className="bg-card px-4 py-3">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 break-words text-sm font-medium">
              {value}
              {copy === "demat" && <CopyButton value={value} label="Demat" />}
              {copy === "email" && <CopyButton value={value} label="Email" />}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ProfilePage() {
  const q = useQuery(ownDetailQuery());
  const d = q.data;

  if (q.isLoading) return <LoadingBlock label="Loading profile" />;
  if (q.isError || !d) return <ErrorBlock error={q.error} retry={() => void q.refetch()} />;

  const s = (v: unknown): string => (typeof v === "string" && v.trim() !== "" ? v : "—");
  const name = s(d.name);
  const demat = s(d.demat);
  const meroShareEmail = s(d.meroShareEmail);
  const email = s(d.email);

  const identity: [string, string, string][] = [
    ["Name", name, ""],
    ...(s(d.profileName) !== name ? [["Profile name", s(d.profileName), ""] as [string, string, string]] : []),
    ["Gender", s(d.gender), ""],
    ["PAN", s(d.panNumber), ""],
    ["Client code", s(d.clientCode), ""],
    ["Demat / BOID", demat === "—" ? s(d.boid) : `${demat}${d.boid && d.boid !== demat ? ` · ${d.boid}` : ""}`, "demat"],
  ];
  const contact: [string, string, string][] = [
    ["MeroShare email", meroShareEmail, "email"],
    ...(email !== meroShareEmail ? [["Email", email, ""] as [string, string, string]] : []),
    ["Contact", s(d.contact), ""],
    ["Address", s(d.address), ""],
  ];
  const account: [string, string, string][] = [
    ["Account number", s(d.accountNumber), ""],
    ["Capital", s(d.capital), ""],
    ["Customer type", s(d.customerTypeCode), ""],
    ["Username", s(d.username), ""],
    ["Last renewed", s(d.renewedDateStr), ""],
  ];
  const security: [string, string, string][] = [
    ["Demat expiry", s(d.dematExpiryDate), ""],
    ["Account expiry", s(d.expiredDate), ""],
    ["Password changed", s(d.passwordChangeDateStr), ""],
    ["Password expires", s(d.passwordExpiryDateStr), ""],
  ];

  const avatarUrl = typeof d.imagePath === "string" && d.imagePath.trim() !== "" ? d.imagePath : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">My Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">Details registered with your depository participant.</p>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border/70 bg-card p-5">
        {avatarUrl ? (
          <img src={avatarUrl} alt="Profile avatar" className="size-14 shrink-0 rounded-2xl object-cover" />
        ) : (
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand via-brand-mid to-brand-dark font-display text-lg font-bold text-white">
            {initials(d.name)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xl font-semibold">{name}</p>
          <p className="num truncate text-sm text-muted-foreground">
            {s(d.username)} · {demat}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <InfoBadge label="Dashboard" value={d.renderDashboard ? "Enabled" : "Disabled"} tone={d.renderDashboard ? "ok" : "muted"} />
          <InfoBadge label="Demat expiry" value={s(d.dematExpiryDate)} tone="ok" />
          <InfoBadge label="Account expiry" value={s(d.expiredDate)} tone="ok" />
          <InfoBadge label="Password expires" value={s(d.passwordExpiryDateStr)} tone="warn" />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section icon={UserRound} title="Identity" rows={identity} />
        <Section icon={Mail} title="Contact" rows={contact} />
        <Section icon={Landmark} title="Account" rows={account} />
        <Section icon={ShieldCheck} title="Renewals & security" rows={security} />
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarClock className="size-3.5" />
        Renew your demat account before the expiry date to keep trading.
      </p>
    </div>
  );
}
