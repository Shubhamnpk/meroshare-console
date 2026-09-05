import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  CalendarClock,
  Check,
  Copy,
  Eye,
  EyeOff,
  History,
  Landmark,
  LogOut,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExportButton, type ExportFormat } from "@/components/export-dialog";
import { ErrorBlock, LoadingBlock } from "@/components/states";
import { accountProfileQuery } from "@/lib/queries";
import { useSettings } from "@/lib/settings";
import { logout } from "@/lib/meroshare/auth.functions";
import { ogImage, canonicalLink } from "@/lib/seo";
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
      ogImage(),
    ],
    links: [canonicalLink("/profile")],
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
    <section
      id={id}
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-border/70 bg-card"
    >
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
                <span className="num">
                  {row.sensitive && !reveal ? mask(row.value) : row.value}
                </span>
                {row.copy ? <CopyButton value={row.value} label={row.label} /> : null}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
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

    const banks = rows(data.banks.map((bank) => [bank.name, bank.code || undefined]));

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
      { id: "identity", title: "Identity", icon: UserRound, items: [...identity, ...documents] },
      { id: "demat", title: "Demat / BOID", icon: Landmark, items: [...demat, ...dp] },
      { id: "banks", title: "ASBA banks", icon: Building2, items: banks },
      { id: "account", title: "MeroShare account", icon: ShieldCheck, items: account },
    ].filter((section) => section.items.length > 0);
  }, [data]);

  if (q.isLoading) return <LoadingBlock label="Loading account" />;
  if (q.isError || !data) return <ErrorBlock error={q.error} retry={() => void q.refetch()} />;

  const own = data.own as JsonRecord;
  const name = text(own["name"]) ?? data.session.username;
  const avatarUrl = text(own["imagePath"]) ?? null;

  const exportFormats: ExportFormat[] = [
    {
      title: "CSV",
      description: "Spreadsheet-friendly rows of every field and value",
      filename: `meroshare-account-${data.session.demat || "profile"}`,
      extension: "csv",
      build: () =>
        toCsv([
          ...sections.map((s) => ({ title: s.title, items: s.items })),
          ...data.banks.map((bank) => ({
            title: `Bank: ${bank.name}`,
            items: rows([
              ["Account number", bank.accountNumber],
              ["Branch", bank.branchName],
              ["CRN", bank.crnNumber],
              ["Account status", bank.accountStatus],
              ["KYC", bank.kycStatus],
            ]),
          })),
        ]),
    },
    {
      title: "JSON",
      description: "Raw API response: banks and all detail records",
      filename: `meroshare-account-${data.session.demat || "profile"}`,
      extension: "json",
      build: () =>
        JSON.stringify({ own: data.own, detail: data.detail, banks: data.banks }, null, 2),
    },
    {
      title: "PDF",
      description: "Formatted record for printing or sharing",
      filename: `meroshare-account-${data.session.demat || "profile"}`,
      extension: "pdf",
      build: () => "",
      pdf: () => ({
        title: "Account profile summary",
        head: ["Section", "Field", "Value"],
        body: [
          ...sections.flatMap((s) =>
            s.items.map((row) => [
              s.title,
              row.label,
              row.sensitive && !reveal ? mask(row.value) : row.value,
            ]),
          ),
          ...data.banks.flatMap((bank) => [
            ["Bank", "Name", bank.name],
            ["Bank", "Account number", bank.accountNumber ?? ""],
            ["Bank", "Branch", bank.branchName ?? ""],
            ["Bank", "CRN", bank.crnNumber ?? ""],
            ["Bank", "KYC", bank.kycStatus ?? ""],
          ]),
        ],
      }),
    },
  ];

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
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
            Every detail MeroShare and your depository participant hold about you.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setReveal((r) => !r)}>
            {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {reveal ? "Hide sensitive" : "Reveal sensitive"}
          </Button>
          <ExportButton formats={exportFormats} />
          <Button size="sm" variant="ghost" onClick={() => void signOut()}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </div>

      <div className="relative flex flex-wrap items-center gap-4 rounded-2xl border border-border/70 bg-card p-5">
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
        <div className="min-w-0 flex-1 pr-10">
          <p className="truncate font-display text-xl font-semibold">{name}</p>
          <p className="num truncate text-sm text-muted-foreground">
            {data.session.username} · {data.session.demat}
          </p>
        </div>
        <Link
          to="/activity"
          title="Activity log: recent sign-ins, devices and locations"
          aria-label="View activity log"
          className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-xl border border-border/70 bg-secondary px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          <History className="size-3.5" />
          Recent activity
        </Link>
      </div>

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

      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Bank account details</h2>
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
