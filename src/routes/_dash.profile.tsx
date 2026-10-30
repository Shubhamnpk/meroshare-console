import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  Building2,
  CalendarClock,
  Check,
  Copy,
  Eye,
  EyeOff,
  FileText,
  History,
  Landmark,
  Lock,
  LogOut,
  MapPin,
  Phone,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExportButton, type ExportFormat } from "@/components/export-dialog";
import { ErrorBlock, LoadingBlock } from "@/components/states";
import {
  accountProfileQuery,
  brokerBanksQuery,
  brokerConnectionsQuery,
  brokerDocUrlsQuery,
  brokerGeoLabelsQuery,
  brokerHoldingsQuery,
  brokerKycBundleQuery,
} from "@/lib/queries";
import { useSettings } from "@/lib/settings";
import { logout } from "@/lib/meroshare/auth.functions";
import { ogImage, canonicalLink } from "@/lib/seo";
import type { BrokerId } from "@/lib/brokers/types";
import type { AccountBank, AccountProfile, JsonRecord } from "@/lib/meroshare/types";
import { formatNpr, formatQty } from "@/lib/format";

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
        content: "Complete MeroShare account record: identity, citizenship, contact, demat, DP and linked ASBA banks.",
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

/** Safe record cast for loosely-shaped broker KYC payloads. */
function rec(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function list(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((v): v is JsonRecord => Boolean(v) && typeof v === "object") : [];
}

/** Map pin from a broker address record ([lat, lng] order, like their map). */
function pinOf(info: JsonRecord): { lat: number; lng: number } | null {
  const coords = rec(info["location"])["coordinates"];
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lat, lng] = coords as unknown[];
  return typeof lat === "number" && typeof lng === "number" && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat, lng }
    : null;
}

/** Street-level bits that are already human (IDs resolve via the pin). */
function streetLine(info: JsonRecord): string | undefined {
  const bits = [
    info["houseNumber"] ? `House ${text(info["houseNumber"])}` : undefined,
    text(info["tole"] ?? info["street"]),
    (info["wardNumber"] ?? info["ward"]) ? `Ward ${text(info["wardNumber"] ?? info["ward"])}` : undefined,
  ].filter(Boolean);
  return bits.length > 0 ? bits.join(", ") : undefined;
}

/**
 * Verified bootstrap: KYC-Mongo branch IDs have no public master table, so
 * IDs confirmed against the broker site live here. Extend when another
 * account shows a new ID. Unknown IDs stay hidden (never raw blobs).
 */
const KNOWN_BRANCH_NAMES: Record<string, string> = {
  "66a34ca80061da946faf1b01": "Kathmandu",
};

function branchName(
  branches: { id: string; code: string; name: string; city: string }[],
  officeBranch: string | undefined,
): string | undefined {
  if (!officeBranch) return undefined;
  const hit = branches.find((b) => b.id === officeBranch || b.code.toLowerCase() === officeBranch.toLowerCase());
  if (hit) return hit.city || hit.name || hit.code || undefined;
  return KNOWN_BRANCH_NAMES[officeBranch];
}

function AddressCard({
  title,
  line,
  lat,
  lng,
  mapUrl,
}: {
  title: string;
  line?: string | undefined;
  lat?: number | undefined;
  lng?: number | undefined;
  mapUrl?: string | undefined;
}) {
  const d = 0.02;
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      <header className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
        <MapPin className="size-4 text-muted-foreground" />
        <h3 className="truncate text-sm font-semibold">{title}</h3>
        {mapUrl ? (
          <a
            href={mapUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto shrink-0 whitespace-nowrap text-xs font-medium text-primary hover:underline"
          >
            Open map
          </a>
        ) : null}
      </header>
      {line ? <p className="px-4 pt-3 text-sm font-medium">{line}</p> : null}
      {lat !== undefined && lng !== undefined ? (
        <div className="p-4">
          <iframe
            title={`${title} map`}
            loading="lazy"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${lng - d}%2C${lat - d}%2C${lng + d}%2C${lat + d}&layer=mapnik&marker=${lat}%2C${lng}`}
            className="block h-44 w-full min-w-0 rounded-xl border border-border/60"
          />
        </div>
      ) : null}
    </div>
  );
}

const DOC_LABELS: Record<string, string> = {
  recentPhoto: "Recent photo",
  nidSelfie: "NID selfie",
  citizenshipFront: "Citizenship front",
  citizenshipBack: "Citizenship back",
  citizenshipSelfie: "Citizenship selfie",
  signature: "Signature",
  thumbPrint: "Thumbprint",
  pancard: "PAN card",
  nidDocumentFront: "NID front",
  nidDocumentBack: "NID back",
  birthCertificate: "Birth certificate",
  locationMap: "Location map",
  proofOfResidence: "Proof of residence",
  dematConfirmationLetter: "Demat confirmation letter",
  nomineeCitizenshipFront: "Nominee citizenship front",
  nomieeeCitizenshipBack: "Nominee citizenship back",
  nomineePassportSizePhoto: "Nominee photo",
  nomineeSignature: "Nominee signature",
  nomineeThumbPrint: "Nominee thumbprint",
  guardianCitizenshipFront: "Guardian citizenship front",
  guardianCitizenshipBack: "Guardian citizenship back",
  guardianPhoto: "Guardian photo",
  guardianSignature: "Guardian signature",
  guardianThumbPrint: "Guardian thumbprint",
  guardianPancard: "Guardian PAN",
  nrnCardDocument: "NRN card",
  nrnCitizenshipDocument: "NRN citizenship",
  nrnPhoto: "NRN photo",
};

function presentDocs(info: JsonRecord): string | undefined {
  const names = Object.keys(info).filter((k) => {
    const v = info[k];
    if (typeof v === "string") return v.trim() !== "";
    return v !== null && typeof v === "object" && Object.keys(v as JsonRecord).length > 0;
  });
  if (names.length === 0) return undefined;
  return names.map((k) => DOC_LABELS[k] ?? k.replace(/([A-Z])/g, " $1").trim()).join(", ");
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
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">{row.label}</dt>
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

function toneFor(value: string): string {
  const t = value.toLowerCase();
  if (/approv|active|allow|valid|verif|success|complet|enabl|paid/.test(t))
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
  if (/pend|wait|review|progress|partial/.test(t)) return "border-amber-500/40 bg-amber-500/10 text-amber-500";
  if (/reject|fail|expir|block|suspend|invalid/.test(t)) return "border-red-500/40 bg-red-500/10 text-red-500";
  return "border-border/60 bg-muted text-muted-foreground";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 flex items-start text-sm font-medium break-words">{children}</dd>
    </div>
  );
}

function Chip({ value, label }: { value?: string | undefined; label: string }) {
  if (!value) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneFor(value)}`}
    >
      <span className="num">
        {label}: {value}
      </span>
    </span>
  );
}

function BrokerKycHero({
  ssa,
  client,
  photoUrl,
  reveal,
}: {
  ssa: JsonRecord;
  client: JsonRecord;
  photoUrl?: string | undefined;
  reveal: boolean;
}) {
  const name = text(client["fullName"]) ?? text(ssa["name"]) ?? "Broker account";
  const code = text(client["clientCode"]) ?? text(ssa["clientCode"]);
  const demat = text(client["dematNumber"]) ?? text(ssa["boid"]);
  const kyc = text(client["kycStatus"]);
  const pct = Number(client["completionPercentage"] ?? 0);

  const mobiles = list(client["contactInfo"])
    .map((e) => ({
      value: text(e["number"]),
      primary: e["isPrimary"] === true,
      verified: e["isVerified"] === true,
    }))
    .filter((e) => e.value);
  const emails = list(client["emailInfo"])
    .map((e) => ({
      value: text(e["email"]),
      primary: e["isPrimary"] === true,
      verified: e["isVerified"] === true,
    }))
    .filter((e) => e.value);

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
        <div className="flex flex-wrap items-center gap-4 p-5">
          {photoUrl ? (
            <img src={photoUrl} alt={name} className="size-16 shrink-0 rounded-2xl object-cover" />
          ) : (
            <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-info font-display text-xl font-bold text-primary-foreground">
              {initials(name)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-xl font-semibold">{name}</p>
            <p className="num mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {code ? (
                <span className="inline-flex items-center">
                  Client code <b className="ml-1 text-foreground">{code}</b>
                  <CopyButton value={code} label="Client code" />
                </span>
              ) : null}
              {demat ? (
                <span className="inline-flex items-center">
                  Demat <b className="ml-1 text-foreground">{demat}</b>
                  <CopyButton value={demat} label="Demat number" />
                </span>
              ) : null}
            </p>
            <div className="mt-2 space-y-1 text-xs">
              {mobiles.map((m) => (
                <p key={m.value} className="flex flex-wrap items-center gap-1.5">
                  <Phone className="size-3 text-muted-foreground" />
                  <span className="num font-medium">{reveal ? m.value : mask(m.value!)}</span>
                  {m.primary ? <span className="text-muted-foreground">· Primary</span> : null}
                  {m.verified ? <BadgeCheck className="size-3.5 text-emerald-500" /> : null}
                </p>
              ))}
              {emails.map((m) => (
                <p key={m.value} className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">{m.value}</span>
                  {m.primary ? <span className="text-muted-foreground">· Primary</span> : null}
                  {m.verified ? <BadgeCheck className="size-3.5 text-emerald-500" /> : null}
                </p>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            {kyc ? (
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneFor(kyc)}`}>{kyc}</span>
            ) : null}
            {Number.isFinite(pct) && pct > 0 ? (
              <span className="num text-xs text-muted-foreground">{pct}% complete</span>
            ) : null}
          </div>
        </div>
        {Number.isFinite(pct) && pct > 0 ? (
          <div className="h-1 bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BrokerKycDetails({
  client,
  guardLine,
  branches,
  reveal,
}: {
  client: JsonRecord;
  guardLine?: string | undefined;
  branches: { id: string; code: string; name: string; city: string }[];
  reveal: boolean;
}) {
  const citizen = rec(client["citizenshipInfo"]);
  const pan = rec(client["panInfo"]);
  const pass = rec(client["passportInfo"]);
  const family = rec(client["familyInfo"]);
  const nominee = rec(client["nomineeInfo"]);
  const g = rec(client["guardianInfo"]);
  const flags = rec(client["flags"]);
  const acct = rec(client["accountTypeInfo"]);
  const occ = rec(client["occupationInfo"]);

  const secret = (value: string | undefined) =>
    value ? (
      <span className="num">
        {reveal ? value : mask(value)} <CopyButton value={value} label="Copy" />
      </span>
    ) : (
      <span className="text-muted-foreground">—</span>
    );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Identity & IDs */}
        <div className="rounded-2xl border border-border/70 bg-card p-5 lg:col-span-2">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Identity & IDs
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Field label="Born (AD)">{text(client["dobAd"]) ?? <span className="text-muted-foreground">—</span>}</Field>
            <Field label="Born (BS)">{text(client["dobBs"]) ?? <span className="text-muted-foreground">—</span>}</Field>
            <Field label="Gender">{text(client["gender"]) ?? <span className="text-muted-foreground">—</span>}</Field>
            <Field label="Nationality">
              {text(client["nationality"]) ?? <span className="text-muted-foreground">—</span>}
            </Field>
            <Field label="Marital status">
              {text(client["maritalStatus"]) ?? <span className="text-muted-foreground">—</span>}
            </Field>
            <Field label="Occupation">
              {text(occ["occupationDetails"]) ?? <span className="text-muted-foreground">—</span>}
            </Field>
            <Field label="Citizenship">{secret(text(citizen["citizenshipNumber"]))}</Field>
            <Field label="PAN">{secret(text(pan["panNumber"] ?? client["panNumber"]))}</Field>
            <Field label="Passport">{secret(text(pass["passportNumber"]))}</Field>
          </dl>
        </div>

        {/* Standing */}
        <div className="rounded-2xl border border-border/70 bg-card p-5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Standing</p>
          <div className="flex flex-wrap gap-1.5">
            <Chip label="Trade" value={text(flags["isAllowedToTrade"])} />
            <Chip label="Demat" value={text(acct["isDematAccount"])} />
            <Chip label="Trading A/C" value={text(acct["isTradingAccount"])} />
            <Chip label="Margin" value={text(acct["isMarginLendingAccount"])} />
            <Chip label="Docs" value={text(flags["isDocumentsCompleted"])} />
            <Chip label="AML" value={text(flags["isAMLCompleted"])} />
            <Chip label="Agreement" value={text(flags["isAgreementCompleted"])} />
            <Chip label="Nominee" value={text(flags["hasNominee"])} />
            <Chip label="Physical KYC" value={text(flags["isPhysicalKYC"])} />
          </div>
          <div className="mt-4 border-t border-border/60 pt-3">
            <dl className="grid grid-cols-2 gap-2">
              <Field label="Demat status">
                {text(client["dematStatus"]) ?? <span className="text-muted-foreground">—</span>}
              </Field>
              <Field label="Trading status">
                {text(client["tradingStatus"]) ?? <span className="text-muted-foreground">—</span>}
              </Field>
            </dl>
            {branchName(branches, text(client["officeBranch"])) ? (
              <div className="mt-2">
                <Field label="Branch">{branchName(branches, text(client["officeBranch"]))}</Field>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* People */}
      <div className="rounded-2xl border border-border/70 bg-card p-5">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">People</p>
        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold">Family</p>
            <p className="mt-1 text-sm">{text(family["fatherName"]) ?? "—"}</p>
            <p className="text-xs text-muted-foreground">Father</p>
            <p className="mt-1.5 text-sm">{text(family["motherName"]) ?? "—"}</p>
            <p className="text-xs text-muted-foreground">Mother</p>
            <p className="mt-1.5 text-sm">{text(family["grandFatherName"]) ?? "—"}</p>
            <p className="text-xs text-muted-foreground">Grandfather</p>
          </div>
          <div>
            <p className="text-xs font-semibold">Nominee</p>
            <p className="mt-1 text-sm font-medium">
              {text(nominee["name"]) ?? "—"}
              {text(nominee["relation"]) ? (
                <span className="font-normal text-muted-foreground"> · {text(nominee["relation"])}</span>
              ) : null}
            </p>
            <p className="num mt-1 text-xs text-muted-foreground">
              {secret(text(nominee["contact"]))} · {secret(text(nominee["citizenshipNumber"]))}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold">Guardian</p>
            <p className="mt-1 text-sm font-medium">
              {text(g["fullName"]) ?? "—"}
              {text(g["relation"]) ? (
                <span className="font-normal text-muted-foreground"> · {text(g["relation"])}</span>
              ) : null}
            </p>
            <p className="num mt-1 text-xs text-muted-foreground">{secret(text(g["citizenshipNumber"]))}</p>
            {guardLine ? <p className="mt-1 text-xs text-muted-foreground">{guardLine}</p> : null}
          </div>
        </div>
      </div>
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
  const connections = useQuery(brokerConnectionsQuery());
  const realBrokerId = (connections.data?.find((c) => c.brokerId !== "yobroker")?.brokerId ?? null) as BrokerId | null;
  const brokerHoldings = useQuery(brokerHoldingsQuery(realBrokerId));
  const brokerKyc = useQuery(brokerKycBundleQuery(realBrokerId));
  const brokerBanks = useQuery(brokerBanksQuery(realBrokerId));
  const [tab, setTab] = useState<"meroshare" | "broker">("meroshare");
  /** Stored document keys (signable paths only) for the vault gallery. */
  const docFiles = useMemo(() => {
    const info = rec(rec(brokerKyc.data?.client)["documentInfo"]);
    return Object.keys(info)
      .filter((k) => typeof info[k] === "string" && (info[k] as string).trim() !== "")
      .map((k) => ({
        key: info[k] as string,
        label: DOC_LABELS[k] ?? k.replace(/([A-Z])/g, " $1").trim(),
      }))
      .filter((d) => /^latest-kyc\//.test(d.key));
  }, [brokerKyc.data]);
  const docKeys = useMemo(() => docFiles.map((d) => d.key), [docFiles]);
  const docUrls = useQuery(brokerDocUrlsQuery(realBrokerId, docKeys, tab === "broker"));
  const [lightbox, setLightbox] = useState<{ label: string; url: string } | null>(null);

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
      ["Session expires", data.session.expiresAt ? new Date(data.session.expiresAt).toLocaleString() : undefined],
    ]);

    return [
      { id: "identity", title: "Identity", icon: UserRound, items: [...identity, ...documents] },
      { id: "demat", title: "Demat / BOID", icon: Landmark, items: [...demat, ...dp] },
      { id: "banks", title: "ASBA banks", icon: Building2, items: banks },
      { id: "account", title: "MeroShare account", icon: ShieldCheck, items: account },
    ].filter((section) => section.items.length > 0);
  }, [data]);

  const geoPoints = useMemo(() => {
    const c = rec(brokerKyc.data?.client);
    const defs = [
      { key: "perm", info: rec(c["permanentAddressInfo"]) },
      { key: "temp", info: rec(c["temporaryAddressInfo"]) },
      { key: "guard", info: rec(rec(c["guardianInfo"])["correspondenceAddress"]) },
    ];
    return defs.flatMap((d) => {
      const pin = pinOf(d.info);
      return pin ? [{ key: d.key, lat: pin.lat, lng: pin.lng }] : [];
    });
  }, [brokerKyc.data]);
  const geo = useQuery(brokerGeoLabelsQuery(realBrokerId, geoPoints, tab === "broker"));

  const kycSections = useMemo(() => {
    const s = rec(brokerKyc.data?.ssa);
    const c = rec(brokerKyc.data?.client);
    if (Object.keys(s).length === 0 && Object.keys(c).length === 0) return [];
    const out: { id: string; title: string; icon: typeof UserRound; items: Row[] }[] = [];

    const identity = rows([
      ["Full name", text(c["fullName"]) ?? text(s["name"])],
      ["Client code", text(c["clientCode"]) ?? text(s["clientCode"]), { copy: true }],
      ["Demat number", text(c["dematNumber"]) ?? text(s["boid"]), { copy: true }],
      ["Date of birth (AD)", text(c["dobAd"])],
      ["Date of birth (BS)", text(c["dobBs"])],
      ["Gender", text(c["gender"])],
      ["Nationality", text(c["nationality"])],
      ["Marital status", text(c["maritalStatus"])],
      ["Occupation", text(rec(c["occupationInfo"])["occupationDetails"])],
      ["Branch", text(c["officeBranch"])],
      ["KYC status", text(c["kycStatus"])],
      ["Demat status", text(c["dematStatus"])],
      ["Trading status", text(c["tradingStatus"])],
      ["Profile completion", text(c["completionPercentage"]) ? `${text(c["completionPercentage"])}%` : undefined],
    ]);
    if (identity.length > 0)
      out.push({ id: "broker-identity", title: "Broker identity", icon: UserRound, items: identity });

    const contacts: Row[] = [];
    list(c["contactInfo"]).forEach((entry, i) => {
      const value = text(entry["number"]);
      if (!value) return;
      const tags = [
        entry["isPrimary"] === true ? "Primary" : null,
        entry["isVerified"] === true ? "Verified" : null,
      ].filter(Boolean);
      contacts.push({
        label:
          `Mobile ${list(c["contactInfo"]).length > 1 ? i + 1 : ""}${tags.length > 0 ? ` · ${tags.join(" · ")}` : ""}`.trim(),
        value,
        sensitive: true,
        copy: true,
      });
    });
    list(c["emailInfo"]).forEach((entry, i) => {
      const value = text(entry["email"]);
      if (!value) return;
      const tags = [
        entry["isPrimary"] === true ? "Primary" : null,
        entry["isVerified"] === true ? "Verified" : null,
      ].filter(Boolean);
      contacts.push({
        label:
          `Email ${list(c["emailInfo"]).length > 1 ? i + 1 : ""}${tags.length > 0 ? ` · ${tags.join(" · ")}` : ""}`.trim(),
        value,
        copy: true,
      });
    });
    const ssaContact = rows([
      ["SSA email", text(s["email"]), { copy: true }],
      ["SSA phone", text(s["phoneNumber"]), { sensitive: true, copy: true }],
    ]);
    if (contacts.length > 0 || ssaContact.length > 0)
      out.push({ id: "broker-contact", title: "Broker contact", icon: Phone, items: [...contacts, ...ssaContact] });

    const family = rec(c["familyInfo"]);
    const nominee = rec(c["nomineeInfo"]);
    const kin = rows([
      ["Father's name", text(family["fatherName"])],
      ["Mother's name", text(family["motherName"])],
      ["Grandfather's name", text(family["grandFatherName"])],
      ["Spouse's name", text(rec(c["maritalInfo"])["spouseName"])],
      ["Nominee name", text(nominee["name"])],
      ["Nominee relation", text(nominee["relation"])],
      ["Nominee contact", text(nominee["contact"]), { sensitive: true, copy: true }],
      ["Nominee citizenship", text(nominee["citizenshipNumber"]), { sensitive: true, copy: true }],
      ["Nominee citizenship district", text(nominee["citizenshipIssuedDistrict"])],
      ["Nominee age", text(nominee["age"])],
      ["Nominee PAN", text(nominee["panNumber"]), { sensitive: true, copy: true }],
      ["Nominee email", text(nominee["email"]), { copy: true }],
      ["Nominee address", streetLine(rec(nominee["nomineeAddressInfo"]))],
    ]);
    if (kin.length > 0) out.push({ id: "broker-family", title: "Family & nominee", icon: Users, items: kin });

    const citizen = rec(c["citizenshipInfo"]);
    const pan = rec(c["panInfo"]);
    const pass = rec(c["passportInfo"]);
    const docs = rows([
      ["Citizenship number", text(citizen["citizenshipNumber"]), { sensitive: true, copy: true }],
      ["Citizenship issued (AD)", text(citizen["issuedDateAd"])],
      ["Citizenship issued (BS)", text(citizen["issuedDateBs"])],
      ["Citizenship district", text(citizen["issuedDistrict"])],
      ["PAN", text(pan["panNumber"] ?? c["panNumber"]), { sensitive: true, copy: true }],
      ["PAN issue district", text(pan["issuedDistrict"])],
      ["Passport number", text(pass["passportNumber"]), { sensitive: true }],
      ["Passport issued (AD)", text(pass["issuedDateAd"])],
      ["Passport expiry (AD)", text(pass["expiryDateAd"])],
      ["Documents on file", presentDocs(rec(c["documentInfo"]))],
    ]);
    if (docs.length > 0) out.push({ id: "broker-documents", title: "IDs & documents", icon: FileText, items: docs });

    const g = rec(c["guardianInfo"]);
    const gAddr = rec(g["correspondenceAddress"]);
    const gGeo = (geo.data?.labels["guard"]?.line as string | undefined) ?? undefined;
    const guardian = rows([
      ["Guardian name", text(g["fullName"])],
      ["Relation", text(g["relation"])],
      ["Guardian's father", text(g["guardianFatherName"])],
      ["Guardian's grandfather", text(g["guardianGrandFatherName"])],
      ["Guardian citizenship", text(g["citizenshipNumber"]), { sensitive: true, copy: true }],
      ["Citizenship issued (BS)", text(g["citizenshipIssuedDateBs"])],
      ["Citizenship issued (AD)", text(g["citizenshipIssuedDateAd"])],
      ["Guardian NID", text(g["nid"]), { sensitive: true, copy: true }],
      ["Correspondence", [streetLine(gAddr), gGeo].filter(Boolean).join(", ") || undefined],
    ]);
    if (guardian.length > 0) out.push({ id: "broker-guardian", title: "Guardian", icon: Users, items: guardian });

    const flags = rec(c["flags"]);
    const acct = rec(c["accountTypeInfo"]);
    const standing = rows([
      ["Allowed to trade", text(flags["isAllowedToTrade"])],
      ["Trading rejected", flags["isTradingRejected"] === true ? "Yes" : undefined],
      ["Demat account", text(acct["isDematAccount"])],
      ["Trading account", text(acct["isTradingAccount"])],
      ["Margin lending account", text(acct["isMarginLendingAccount"])],
      ["Minor account", flags["isMinor"] === true ? "Yes" : undefined],
      ["Has nominee", text(flags["hasNominee"])],
      ["NRN", flags["isNrn"] === true ? "Yes" : undefined],
      ["Rental income", flags["isRental"] === true ? "Yes" : undefined],
      ["Physically verified KYC", text(flags["isPhysicalKYC"])],
      ["Docs completed", text(flags["isDocumentsCompleted"])],
      ["AML completed", text(flags["isAMLCompleted"])],
      ["Agreement completed", text(flags["isAgreementCompleted"])],
    ]);
    if (standing.length > 0)
      out.push({ id: "broker-standing", title: "Standing & consents", icon: ShieldCheck, items: standing });

    const kycBanks = list(c["bankInfo"])
      .map((b) => {
        const value = text(b["accountNumber"]);
        if (!value) return null;
        const bits = [`A/C ${value}`, text(b["branchName"]), b["isValidated"] === true ? "Verified" : null].filter(
          Boolean,
        );
        return {
          label: `${text(b["bankName"]) ?? "Bank"}${b["isPrimary"] === true ? " · Primary" : ""}`,
          value: bits.join(" · "),
          sensitive: true,
          copy: false,
        } as Row;
      })
      .filter((r): r is Row => r !== null);
    if (kycBanks.length > 0)
      out.push({ id: "broker-bank-accounts", title: "Broker bank accounts", icon: Building2, items: kycBanks });

    return out;
  }, [brokerKyc.data, geo.data]);

  const addressCards = useMemo(() => {
    const c = rec(brokerKyc.data?.client);
    const labels = geo.data?.labels ?? {};
    const defs = [
      { key: "perm", title: "Permanent address", info: rec(c["permanentAddressInfo"]) },
      { key: "temp", title: "Temporary address", info: rec(c["temporaryAddressInfo"]) },
      {
        key: "guard",
        title: "Guardian correspondence",
        info: rec(rec(c["guardianInfo"])["correspondenceAddress"]),
      },
    ];
    return defs
      .map((d) => {
        const pin = pinOf(d.info);
        const hit = labels[d.key];
        const line = [streetLine(d.info), hit?.line].filter(Boolean).join(", ") || undefined;
        if (!line && !pin) return null;
        return { title: d.title, line, lat: pin?.lat, lng: pin?.lng, mapUrl: hit?.mapUrl };
      })
      .filter(
        (
          x,
        ): x is {
          title: string;
          line: string | undefined;
          lat: number | undefined;
          lng: number | undefined;
          mapUrl: string | undefined;
        } => x !== null,
      );
  }, [brokerKyc.data, geo.data]);

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
          ...kycSections.map((s) => ({ title: `Broker KYC: ${s.title}`, items: s.items })),
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
        JSON.stringify({ own: data.own, detail: data.detail, banks: data.banks, brokerKyc: brokerKyc.data }, null, 2),
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
            s.items.map((row) => [s.title, row.label, row.sensitive && !reveal ? mask(row.value) : row.value]),
          ),
          ...kycSections.flatMap((s) =>
            s.items.map((row) => [
              `Broker KYC: ${s.title}`,
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
          <img src={avatarUrl} alt={`${name} profile photo`} className="size-14 shrink-0 rounded-2xl object-cover" />
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

      {realBrokerId ? (
        <Tabs value={tab} onValueChange={(v) => setTab(v as "meroshare" | "broker")} className="self-start">
          <TabsList className="gap-1">
            <TabsTrigger value="meroshare">MeroShare profile</TabsTrigger>
            <TabsTrigger value="broker">Broker profile</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}

      {(!realBrokerId || tab === "meroshare") && (
        <>
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
        </>
      )}

      {realBrokerId &&
        tab === "broker" &&
        (() => {
          const s = rec(brokerKyc.data?.ssa);
          const c = rec(brokerKyc.data?.client);
          const empty = Object.keys(s).length === 0 && Object.keys(c).length === 0;
          const photoKey = docFiles.find((d) => /recent ?photo/i.test(d.label))?.key;
          const photoUrl = photoKey ? docUrls.data?.urls[photoKey] : undefined;
          const guardLine = (geo.data?.labels["guard"]?.line as string | undefined) ?? undefined;
          return (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold">Broker KYC · {realBrokerId}</h2>
              {brokerKyc.isLoading ? (
                <LoadingBlock label="Loading broker KYC" rows={2} />
              ) : brokerKyc.isError ? (
                <ErrorBlock error={brokerKyc.error} retry={() => void brokerKyc.refetch()} />
              ) : empty ? (
                <p className="rounded-2xl border border-border/70 bg-card px-4 py-6 text-sm text-muted-foreground">
                  No KYC record returned for your connected broker account. Reconnect the broker in Settings, then
                  reload.
                </p>
              ) : (
                <>
                  <BrokerKycHero ssa={s} client={c} photoUrl={photoUrl} reveal={reveal} />
                  <BrokerKycDetails
                    client={c}
                    guardLine={guardLine}
                    branches={brokerKyc.data?.branches ?? []}
                    reveal={reveal}
                  />
                </>
              )}
            </div>
          );
        })()}

      {realBrokerId && tab === "broker" && addressCards.length > 0 && (
        <div className="min-w-0 space-y-3">
          <h2 className="text-sm font-semibold">Addresses</h2>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {addressCards.map((a) => (
              <div key={a.title} className="min-w-0">
                <AddressCard title={a.title} line={a.line} lat={a.lat} lng={a.lng} mapUrl={a.mapUrl} />
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog
        open={lightbox !== null}
        onOpenChange={(o) => {
          if (!o) setLightbox(null);
        }}
      >
        <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-3xl overflow-y-auto p-4">
          <DialogHeader className="text-left">
            <DialogTitle className="text-sm">{lightbox?.label ?? "Document"}</DialogTitle>
          </DialogHeader>
          {lightbox && (
            <img
              src={lightbox.url}
              alt={lightbox.label}
              className="max-h-[70vh] w-full rounded-xl bg-muted/40 object-contain"
            />
          )}
          {lightbox && (
            <a
              href={lightbox.url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
            >
              Open original in a new tab
            </a>
          )}
        </DialogContent>
      </Dialog>

      {realBrokerId && tab === "broker" && (
        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
          {docFiles.length > 0 && (
            <div className="min-w-0 space-y-3">
              <h2 className="text-sm font-semibold">Documents · {docFiles.length}</h2>
              <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
                <div className="flex snap-x gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {docFiles.map((d) => {
                    const url = docUrls.data?.urls[d.key];
                    const isPhoto = /recent ?photo/i.test(d.label);
                    const open = isPhoto ? url : reveal && url ? url : undefined;
                    return open ? (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => setLightbox({ label: d.label, url: open })}
                        title={`Open ${d.label}`}
                        className="w-20 shrink-0 cursor-pointer snap-start text-left"
                      >
                        <img
                          src={open}
                          alt={d.label}
                          loading="lazy"
                          className="aspect-square w-full rounded-xl border border-border/60 object-cover transition-colors hover:border-primary/50"
                        />
                        <p className="mt-1 truncate text-[10px] text-muted-foreground">{d.label}</p>
                      </button>
                    ) : (
                      <div key={d.key} title={d.label} className="w-20 shrink-0 snap-start">
                        <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/70 bg-muted/30 text-muted-foreground">
                          <Lock className="size-4" />
                        </div>
                        <p className="mt-1 truncate text-[10px] text-muted-foreground">{d.label}</p>
                      </div>
                    );
                  })}
                </div>
                {!reveal ? (
                  <p className="px-4 pb-3 text-[11px] text-muted-foreground">Reveal sensitive to unlock all.</p>
                ) : null}
              </div>
            </div>
          )}
          <div className="min-w-0 space-y-3">
            <h2 className="text-sm font-semibold">Broker bank accounts</h2>
            {brokerBanks.isLoading ? (
              <LoadingBlock label="Loading broker banks" rows={2} />
            ) : brokerBanks.isError ? (
              <ErrorBlock error={brokerBanks.error} retry={() => void brokerBanks.refetch()} />
            ) : !brokerBanks.data || brokerBanks.data.length === 0 ? (
              <p className="rounded-2xl border border-border/70 bg-card px-4 py-6 text-sm text-muted-foreground">
                No bank accounts returned for your connected broker account.
              </p>
            ) : (
              <Section
                id="broker-banks"
                icon={Building2}
                title="Linked bank accounts"
                reveal={reveal}
                items={brokerBanks.data.map((bank) => ({
                  label: `${bank.bankName}${bank.branchName ? ` · ${bank.branchName}` : ""}${bank.isPrimary ? " · Primary" : ""}`,
                  value: bank.accountNumber,
                  sensitive: true,
                  copy: true,
                }))}
              />
            )}
          </div>
        </div>
      )}

      {/* Connected broker holdings — like paper trading holdings in Portfolio, but for real broker. No Yo Broker promo here. */}
      {realBrokerId && tab === "broker" && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Broker holdings · {realBrokerId}</h2>
          {brokerHoldings.isLoading ? (
            <LoadingBlock label="Loading broker holdings" rows={2} />
          ) : brokerHoldings.isError ? (
            <ErrorBlock error={brokerHoldings.error} retry={() => void brokerHoldings.refetch()} />
          ) : !brokerHoldings.data || brokerHoldings.data.length === 0 ? (
            <p className="rounded-2xl border border-border/70 bg-card px-4 py-6 text-sm text-muted-foreground">
              No holdings found in your connected broker account.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {brokerHoldings.data.map((h) => (
                <div key={h.symbol} className="rounded-xl border border-border/60 bg-card px-3 py-2.5">
                  <p className="truncate text-sm font-semibold">{h.symbol}</p>
                  <p className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{formatQty(h.availableQty)} units</span>
                    <span className="num font-medium">{formatNpr(h.closePrice)}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Value {formatNpr(h.marketValue)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarClock className="size-3.5" />
        Renew your demat and MeroShare account before the expiry dates to keep applying for issues.
      </p>
    </div>
  );
}
