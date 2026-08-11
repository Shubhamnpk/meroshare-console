import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  Building2,
  CalendarClock,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  IdCard,
  Landmark,
  LogOut,
  Mail,
  ShieldCheck,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBlock, LoadingBlock } from "@/components/states";
import { accountProfileQuery } from "@/lib/queries";
import { useSettings } from "@/lib/settings";
import { logout } from "@/lib/meroshare/auth.functions";
import type { AccountBank, AccountProfile, JsonRecord } from "@/lib/meroshare/types";

export const Route = createFileRoute("/_dash/profile")({
  head: () => ({
    meta: [
      { title: "My Account | MeroShare Investor Console" },
      {
        name: "description",
        content:
          "Complete MeroShare account record: identity, citizenship, contact, demat, depository participant and linked ASBA banks.",
      },
      { property: "og:title", content: "My Account | MeroShare Investor Console" },
      {
        property: "og:description",
        content:
          "Complete MeroShare account record: identity, citizenship, contact, demat, DP and linked ASBA banks.",
      },
    ],
  }),
  component: ProfilePage,
});

type Row = { label: string; value: string; sensitive?: boolean; copy?: boolean };

function initials(name?: string): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function text(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return undefined;
}

/** First non-empty value across the given records/keys. */
function first(records: JsonRecord[], keys: string[]): string | undefined {
  for (const key of keys) {
    for (const record of records) {
      const value = text(record[key]);
      if (value) return value;
    }
  }
  return undefined;
}

function rows(entries: [string, string | undefined, Partial<Row>?][]): Row[] {
  return entries
    .filter(([, value]) => Boolean(value))
    .map(([label, value, extra]) => ({ label, value: value as string, ...extra }));
}

function mask(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 4) return "••••";
  return `${"•".repeat(Math.max(4, trimmed.length - 4))}${trimmed.slice(-4)}`;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      className="ml-1 inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
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

function Section({
  icon: Icon,
  title,
  id,
  items,
  reveal,
  action,
}: {
  icon: typeof UserRound;
  title: string;
  id: string;
  items: Row[];
  reveal: boolean;
  action?: React.ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <section id={id} className="scroll-mt-24 overflow-hidden rounded-2xl border border-border/70 bg-card">
      <header className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
        <Icon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="ml-auto">{action}</div>
      </header>
      <dl className="grid gap-px bg-border/70 sm:grid-cols-2">
        {items.map((row) => (
          <div key={row.label} className="bg-card px-4 py-3">
            <dt className="text-xs uppercase tracking-wider text-muted-foreground">{row.label}</dt>
            <dd className="mt-0.5 flex items-start break-words text-sm font-medium">
              <span className={row.sensitive || row.copy ? "num" : undefined}>
                {row.sensitive && !reveal ? mask(row.value) : row.value}
              </span>
              {row.copy ? <CopyButton value={row.value} label={row.label} /> : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return null;
}

function daysUntil(value?: string): number | null {
  const date = parseDate(value);
  if (!date) return null;
  return Math.round((date.getTime() - Date.now()) / 86_400_000);
}

function HealthPanel({
  data,
  onPassword,
  onPin,
}: {
  data: AccountProfile;
  onPassword: () => void;
  onPin: () => void;
}) {
  const own = data.own as JsonRecord;
  const items: { tone: "warn" | "bad" | "ok"; text: string; action?: () => void; cta?: string }[] =
    [];

  const passwordDays = daysUntil(text(own["passwordExpiryDateStr"]));
  if (passwordDays !== null && passwordDays <= 15) {
    items.push({
      tone: passwordDays <= 0 ? "bad" : "warn",
      text:
        passwordDays <= 0
          ? "Your MeroShare password has expired."
          : `Your password expires in ${passwordDays} day${passwordDays === 1 ? "" : "s"}.`,
      action: onPassword,
      cta: "Change password",
    });
  }

  const dematDays = daysUntil(text(own["dematExpiryDate"]));
  if (dematDays !== null && dematDays <= 45) {
    items.push({
      tone: dematDays <= 0 ? "bad" : "warn",
      text:
        dematDays <= 0
          ? "Your demat account has expired — renew it with your DP."
          : `Demat account expires in ${dematDays} days — renew it with your DP.`,
    });
  }

  const accountDays = daysUntil(text(own["expiredDate"]));
  if (accountDays !== null && accountDays <= 45) {
    items.push({
      tone: accountDays <= 0 ? "bad" : "warn",
      text:
        accountDays <= 0
          ? "Your MeroShare account has expired — renew it to keep applying for issues."
          : `MeroShare account expires in ${accountDays} days.`,
    });
  }

  for (const bank of data.banks) {
    if (!bank.crnNumber) {
      items.push({
        tone: "warn",
        text: `${bank.name} has no CRN on file — IPO applications through this bank will fail.`,
      });
    }
    const kyc = bank.kycStatus?.toLowerCase();
    if (kyc && !/approved|yes|true|complete/.test(kyc)) {
      items.push({ tone: "warn", text: `${bank.name} KYC is ${bank.kycStatus}.` });
    }
  }

  if (data.banks.length === 0) {
    items.push({
      tone: "warn",
      text: "No ASBA bank is linked to this account — link one to apply for IPOs.",
    });
  }

  if (items.length === 0) {
    items.push({ tone: "ok", text: "Everything looks good. No action needed right now." });
  }

  const toneClass = {
    ok: "border-emerald-500/30 bg-emerald-500/5 text-emerald-600",
    warn: "border-amber-500/30 bg-amber-500/5 text-amber-600",
    bad: "border-destructive/30 bg-destructive/5 text-destructive",
  } as const;

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-4">
      <header className="mb-3 flex items-center gap-2">
        <BadgeCheck className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Account health</h2>
      </header>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li
            key={`${item.text}-${index}`}
            className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs ${toneClass[item.tone]}`}
          >
            {item.tone === "ok" ? (
              <Check className="size-3.5 shrink-0" />
            ) : (
              <TriangleAlert className="size-3.5 shrink-0" />
            )}
            <span className="flex-1 text-foreground/90">{item.text}</span>
            {item.action ? (
              <Button size="sm" variant="outline" className="h-7" onClick={item.action}>
                {item.cta}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onPassword}>
          Change password
        </Button>
        <Button size="sm" variant="outline" onClick={onPin}>
          Change transaction PIN
        </Button>
      </div>
    </section>
  );
}

function BankCard({ bank, reveal }: { bank: AccountBank; reveal: boolean }) {
  const items = rows([
    ["Account number", bank.accountNumber, { sensitive: true, copy: true }],
    ["Branch", bank.branchName],
    ["CRN", bank.crnNumber, { sensitive: true, copy: true }],
    ["Account status", bank.accountStatus],
    ["KYC", bank.kycStatus],
    ["Bank code", bank.code],
  ]);
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      <header className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
        <Building2 className="size-4 text-muted-foreground" />
        <h3 className="truncate text-sm font-semibold">{bank.name}</h3>
      </header>
      {items.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">No detail returned for this bank.</p>
      ) : (
        <dl className="grid gap-px bg-border/70 sm:grid-cols-2">
          {items.map((row) => (
            <div key={row.label} className="bg-card px-4 py-3">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                {row.label}
              </dt>
              <dd className="mt-0.5 flex items-start break-words text-sm font-medium">
                <span className="num">{row.sensitive && !reveal ? mask(row.value) : row.value}</span>
                {row.copy ? <CopyButton value={row.value} label={row.label} /> : null}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function toCsv(sections: { title: string; items: Row[] }[]): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = ["Section,Field,Value"];
  for (const section of sections) {
    for (const row of section.items) {
      lines.push([section.title, row.label, row.value].map(escape).join(","));
    }
  }
  return lines.join("\n");
}

function ProfilePage() {
  const q = useQuery(accountProfileQuery());
  const { openPassword, openPin } = useSettings();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reveal, setReveal] = useState(false);

  const data = q.data;
  const sections = useMemo(() => {
    if (!data) return [];
    const own = data.own as JsonRecord;
    const detail = data.detail;
    const src = [own, detail];

    const identity = rows([
      ["Full name", first(src, ["name", "fullName", "profileName"])],
      ["Gender", first(src, ["gender", "genderCode"])],
      ["Date of birth (AD)", first(src, ["dateOfBirth", "dobAD", "dob"])],
      ["Date of birth (BS)", first(src, ["dateOfBirthBS", "dobBS"])],
      ["Nationality", first(src, ["nationality", "nationalityName", "country"])],
      ["Father's name", first(src, ["fatherName", "father", "fatherFullName"])],
      ["Mother's name", first(src, ["motherName", "mother"])],
      ["Grandfather's name", first(src, ["grFatherName", "grandFatherName", "grandfatherName"])],
      ["Spouse's name", first(src, ["spouseName", "husbandWifeName"])],
      ["Occupation", first(src, ["occupation", "occupationName"])],
      ["Customer type", first(src, ["customerTypeCode", "customerType"])],
    ]);

    const documents = rows([
      [
        "Citizenship number",
        first(src, ["citizenshipNumber", "citizenshipNo", "identityNumber"]),
        { sensitive: true, copy: true },
      ],
      ["Citizenship issue date", first(src, ["citizenshipIssueDate", "identityIssueDate"])],
      [
        "Citizenship issue district",
        first(src, ["citizenshipIssueDistrict", "issuedDistrict", "identityIssueDistrict"]),
      ],
      ["PAN", first(src, ["panNumber", "pan"]), { sensitive: true, copy: true }],
      ["Passport number", first(src, ["passportNumber"]), { sensitive: true }],
      ["Identity type", first(src, ["identityType", "identityTypeName"])],
    ]);

    const contact = rows([
      ["MeroShare email", first(src, ["meroShareEmail"]), { copy: true }],
      ["Registered email", first(src, ["email"]), { copy: true }],
      ["Mobile", first(src, ["contact", "mobileNumber", "mobile", "phone"]), { copy: true }],
      ["Address", first(src, ["address", "permanentAddress"])],
      ["Temporary address", first(src, ["temporaryAddress", "currentAddress"])],
      ["District", first(src, ["district", "districtName", "permanentDistrict"])],
      ["Municipality / VDC", first(src, ["municipality", "vdc", "municipalityName"])],
      ["Ward", first(src, ["wardNumber", "ward", "wardNo"])],
      ["Street / Tole", first(src, ["street", "tole", "streetName"])],
    ]);

    const demat = rows([
      ["Demat number", first(src, ["demat"]) ?? data.session.demat, { copy: true }],
      ["BOID", first(src, ["boid"]) ?? data.session.boid, { copy: true }],
      ["Client code", first(src, ["clientCode"]) ?? data.session.clientCode, { copy: true }],
      ["Account number", first(src, ["accountNumber"]) ?? data.session.accountNumber],
      ["Account opened", first(src, ["createdApproveDateStr", "createdDate", "openDate"])],
      ["Last renewed", first(src, ["renewedDateStr", "renewedDate"])],
      ["Demat expiry", first(src, ["dematExpiryDate"])],
      ["Account expiry", first(src, ["expiredDateStr", "expiredDate"])],
      ["Account status", first(src, ["accountStatus", "statusName", "dematStatus"])],
      ["Blocked / suspended", first(src, ["isBlocked", "blocked", "isSuspended", "suspended"])],
    ]);

    const dp = rows([
      ["Depository participant", first(src, ["capital", "dpName", "participantName"])],
      ["DP code", first(src, ["capitalCode", "dpCode", "participantCode"])],
      ["DP branch", first(src, ["dpBranch", "branchName"])],
      ["DP contact", first(src, ["dpContact", "participantContact"])],
    ]);

    const account = rows([
      ["Username", first(src, ["username"]) ?? data.session.username],
      ["Dashboard", own["renderDashboard"] ? "Enabled" : "Disabled"],
      ["Password changed", first(src, ["passwordChangeDateStr"])],
      ["Password expires", first(src, ["passwordExpiryDateStr"])],
      ["KYC status", first(src, ["kycStatus", "kycStatusName", "isKycApproved"])],
      [
        "Session expires",
        data.session.expiresAt ? new Date(data.session.expiresAt).toLocaleString() : undefined,
      ],
    ]);

    return [
      { id: "identity", title: "Identity", icon: UserRound, items: identity },
      { id: "documents", title: "Citizenship & documents", icon: IdCard, items: documents },
      { id: "contact", title: "Contact & address", icon: Mail, items: contact },
      { id: "demat", title: "Demat / BOID", icon: Landmark, items: demat },
      { id: "dp", title: "Depository participant", icon: Building2, items: dp },
      { id: "account", title: "MeroShare account", icon: ShieldCheck, items: account },
    ].filter((section) => section.items.length > 0);
  }, [data]);

  if (q.isLoading) return <LoadingBlock label="Loading account" />;
  if (q.isError || !data) return <ErrorBlock error={q.error} retry={() => void q.refetch()} />;

  const own = data.own as JsonRecord;
  const name = text(own["name"]) ?? data.session.username;
  const avatarUrl = text(own["imagePath"]) ?? null;

  const exportJson = () => {
    download(
      `meroshare-account-${data.session.demat || "profile"}.json`,
      JSON.stringify({ own: data.own, detail: data.detail, banks: data.banks }, null, 2),
      "application/json",
    );
    toast.success("Account data exported");
  };

  const exportCsv = () => {
    download(
      `meroshare-account-${data.session.demat || "profile"}.csv`,
      toCsv([
        ...sections.map((s) => ({ title: s.title, items: s.items })),
        ...data.banks.map((bank) => ({
          title: `Bank — ${bank.name}`,
          items: rows([
            ["Account number", bank.accountNumber],
            ["Branch", bank.branchName],
            ["CRN", bank.crnNumber],
            ["Account status", bank.accountStatus],
            ["KYC", bank.kycStatus],
          ]),
        })),
      ]),
      "text/csv",
    );
    toast.success("Account data exported");
  };

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await logout();
    navigate({ to: "/", replace: true });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">My Account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every detail MeroShare and your depository participant hold about you.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setReveal((r) => !r)}>
            {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {reveal ? "Hide sensitive" : "Reveal sensitive"}
          </Button>
          <Button size="sm" variant="outline" onClick={exportJson}>
            <Download className="size-4" /> JSON
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="size-4" /> CSV
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void signOut()}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border/70 bg-card p-5">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={`${name} profile photo`}
            className="size-14 shrink-0 rounded-2xl object-cover"
          />
        ) : (
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-info font-display text-lg font-bold text-primary-foreground">
            {initials(name)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xl font-semibold">{name}</p>
          <p className="num truncate text-sm text-muted-foreground">
            {data.session.username} · {data.session.demat}
          </p>
        </div>
      </div>

      <HealthPanel data={data} onPassword={openPassword} onPin={openPin} />

      <nav className="flex flex-wrap gap-2">
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {section.title}
          </a>
        ))}
      </nav>

      <div className="grid gap-5 lg:grid-cols-2">
        {sections.map((section) => (
          <Section
            key={section.id}
            id={section.id}
            icon={section.icon}
            title={section.title}
            items={section.items}
            reveal={reveal}
          />
        ))}
      </div>

      <div id="banks" className="scroll-mt-24 space-y-3">
        <h2 className="text-sm font-semibold">Linked ASBA banks</h2>
        {data.banks.length === 0 ? (
          <p className="rounded-2xl border border-border/70 bg-card px-4 py-6 text-sm text-muted-foreground">
            No bank is linked to this MeroShare account.
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.banks.map((bank) => (
              <BankCard key={bank.id} bank={bank} reveal={reveal} />
            ))}
          </div>
        )}
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarClock className="size-3.5" />
        Renew your demat and MeroShare account before the expiry dates to keep applying for issues.
      </p>
    </div>
  );
}
