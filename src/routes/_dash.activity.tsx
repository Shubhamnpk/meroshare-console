import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Check,
  Chrome,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  History,
  KeyRound,
  LogIn,
  MapPin,
  MonitorSmartphone,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { BackButton } from "@/components/back-button";
import { SortableTh, sortBy, useSort } from "@/components/sortable-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorBlock, EmptyBlock, LoadingBlock } from "@/components/states";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExportButton, csvRow } from "@/components/export-dialog";
import { activityLogQuery, defaultActivityRange } from "@/lib/queries";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { useIpLocations, type IpLocation } from "@/lib/ip-location";
import { ogImage, canonicalLink } from "@/lib/seo";
import type { ActivityLogItem } from "@/lib/meroshare/types";

export const Route = createFileRoute("/_dash/activity")({
  head: () => ({
    meta: [
      { title: "Activity Log : MeroShare Investor Console" },
      {
        name: "description",
        content: "Recent signins and account activity recorded by MeroShare.",
      },
      { property: "og:title", content: "Activity Log : MeroShare Investor Console" },
      {
        property: "og:description",
        content: "Recent signins and account activity recorded by MeroShare.",
      },
      ogImage(),
    ],
    links: [canonicalLink("/activity")],
  }),
  component: ActivityPage,
});

function clean(value: unknown): string {
  if (typeof value !== "string") return "";
  const v = value.trim();
  if (!v || v === "—" || v === "-" || /^unknown$/i.test(v) || /^null$/i.test(v)) return "";
  return v;
}

function browserLabel(item: ActivityLogItem): string {
  const name = clean(item.browserName);
  const version = clean(item.broswerVersion);
  if (name && version) return `${name} ${version}`;
  return name || "Unknown browser";
}

function osLabel(item: ActivityLogItem): string {
  return clean(item.osName) || "Unknown OS";
}

function activityMeta(item: ActivityLogItem) {
  const text = `${clean(item.description)} ${clean(item.activityType)}`.toLowerCase();
  if (/password|pin|credential|reset/.test(text))
    return {
      Icon: KeyRound,
      chip: "bg-amber-500/12 text-amber-700 dark:text-amber-400",
    };
  if (/ipo|apply|application|share|dividend|portfolio|transaction/.test(text))
    return {
      Icon: FileText,
      chip: "bg-sky-500/12 text-sky-700 dark:text-sky-400",
    };
  if (/login|log in|sign.?in|logout|log out|session/.test(text))
    return {
      Icon: LogIn,
      chip: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
    };
  return {
    Icon: History,
    chip: "bg-muted text-muted-foreground",
  };
}

function relativeTime(value: unknown): string {
  if (!value) return "";
  const raw = String(value);
  const date = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "";
  try {
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return "";
  }
}

function isLoginRecord(item: ActivityLogItem): boolean {
  const text = `${clean(item.description)} ${clean(item.activityType)}`.toLowerCase();
  return /login|log in|sign.?in/.test(text);
}

function activityCsv(items: ActivityLogItem[], locations: Record<string, IpLocation>) {
  const rows = items.map((item, i) => {
    const ip = clean(item.ipAddress);
    const loc = ip ? locations[ip] : undefined;
    return csvRow([
      i + 1,
      String(item.description ?? item.activityType ?? ""),
      String(item.browserName ?? ""),
      String(item.broswerVersion ?? ""),
      String(item.osName ?? ""),
      String(item.ipAddress ?? ""),
      loc?.city ?? "",
      loc?.region ?? "",
      loc?.country ?? "",
      loc?.org ?? "",
      String(item.recordedDate ?? ""),
    ]);
  });
  return [
    csvRow([
      "SN",
      "Activity",
      "Browser",
      "Browser version",
      "OS",
      "IP address",
      "City",
      "Region",
      "Country",
      "Network",
      "Recorded on",
    ]),
    ...rows,
  ].join("\n");
}

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-card px-3.5 py-2">
      <span className="text-muted-foreground">{icon}</span>
      <div className="leading-tight">
        <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="num font-semibold">{value}</p>
      </div>
    </div>
  );
}

function CopyIpButton({ ip }: { ip: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy IP ${ip}`}
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(ip);
        setCopied(true);
        toast.success("IP address copied");
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
    </button>
  );
}

function LocationCell({
  ip,
  loc,
  locating,
}: {
  ip: string;
  loc?: IpLocation | undefined;
  locating: boolean;
}) {
  if (!ip) return <span className="text-muted-foreground">-</span>;
  if (locating && !loc) {
    return (
      <div className="space-y-1">
        <p className="flex animate-pulse items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="size-3.5" /> Locating…
        </p>
        <p className="num text-[11px] text-muted-foreground">{ip}</p>
      </div>
    );
  }
  if (!loc || loc.label === "Unknown location") {
    return (
      <div className="space-y-0.5">
        <p className="text-xs font-medium">Unknown location</p>
        <p className="num flex items-center gap-1 text-[11px] text-muted-foreground">
          {ip} <CopyIpButton ip={ip} />
        </p>
      </div>
    );
  }
  if (loc.private) {
    return (
      <div className="space-y-0.5">
        <p className="text-xs font-medium">Local network</p>
        <p className="num flex items-center gap-1 text-[11px] text-muted-foreground">
          {ip} <CopyIpButton ip={ip} />
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium">
        {loc.flag ? (
          <span className="mr-1">{loc.flag}</span>
        ) : (
          <MapPin className="mr-1 inline size-3 text-muted-foreground" />
        )}
        {loc.label}
      </p>
      <p
        className="num flex items-center gap-1 text-[11px] text-muted-foreground"
        title={loc.org ? `Network: ${loc.org}` : ip}
      >
        {ip} <CopyIpButton ip={ip} />
      </p>
    </div>
  );
}

function ActivityPage() {
  const range = defaultActivityRange();
  const q = useQuery(activityLogQuery(range.startDate, range.endDate));
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ActivityLogItem | null>(null);
  const { sort, toggle } = useSort<"activity" | "device" | "location" | "date">(
    {
      key: "date",
      dir: "desc",
    },
    { activity: "text", device: "text", location: "text", date: "number" },
  );
  const all = q.data?.items ?? [];

  const { locations, isLocating } = useIpLocations(all.map((i) => String(i.ipAddress ?? "")));

  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return all;
    return all.filter((item) => {
      const ip = clean(item.ipAddress);
      const loc = ip ? locations[ip] : undefined;
      return [
        item.description,
        item.activityType,
        item.browserName,
        item.broswerVersion,
        item.osName,
        item.ipAddress,
        loc?.label,
        loc?.country,
        loc?.city,
        loc?.org,
      ]
        .filter((v): v is string => typeof v === "string" && v.trim() !== "")
        .some((v) => v.toLowerCase().includes(term));
    });
  }, [all, search, locations]);

  const sorted = useMemo(() => {
    const getter = (item: ActivityLogItem): string => {
      const ip = clean(item.ipAddress);
      const loc = ip ? locations[ip] : undefined;
      switch (sort.key) {
        case "activity":
          return clean(item.description) || clean(item.activityType);
        case "device":
          return `${browserLabel(item)} ${osLabel(item)}`;
        case "location":
          return loc && !loc.private ? `${loc.label} ${ip}` : ip;
        default:
          return String(item.recordedDate ?? "");
      }
    };
    return sortBy(items, getter, sort.dir);
  }, [items, locations, sort]);

  const uniqueIps = useMemo(
    () => new Set(all.map((i) => clean(i.ipAddress)).filter(Boolean)).size,
    [all],
  );
  const uniqueBrowsers = useMemo(
    () => new Set(all.map((i) => clean(i.browserName).toLowerCase()).filter(Boolean)).size,
    [all],
  );
  const uniqueCountries = useMemo(() => {
    const set = new Set<string>();
    for (const item of all) {
      const ip = clean(item.ipAddress);
      const loc = ip ? locations[ip] : undefined;
      if (loc?.country) set.add(loc.country);
    }
    return set.size;
  }, [all, locations]);

  /** Records grouped by IP (newest first), ranked by volume. */
  const ipGroups = useMemo(() => {
    const map = new Map<string, ActivityLogItem[]>();
    for (const record of all) {
      const ip = clean(record.ipAddress);
      if (!ip) continue;
      const arr = map.get(ip);
      if (arr) arr.push(record);
      else map.set(ip, [record]);
    }
    return [...map.entries()]
      .map(([ip, records]) => {
        const sorted = [...records].sort((a, b) =>
          String(b.recordedDate ?? "").localeCompare(String(a.recordedDate ?? "")),
        );
        return {
          ip,
          records: sorted,
          count: records.length,
          logins: records.filter(isLoginRecord).length,
          latest: sorted[0] as ActivityLogItem,
          earliest: sorted[sorted.length - 1] as ActivityLogItem,
          loc: locations[ip] as IpLocation | undefined,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [all, locations]);

  const selectedIp = selected ? clean(selected.ipAddress) : "";
  const selectedGroup = selectedIp ? ipGroups.find((g) => g.ip === selectedIp) : undefined;
  const selectedLoc = selectedIp ? locations[selectedIp] : undefined;
  const selectedMeta = selected ? activityMeta(selected) : null;
  const otherGroups = selectedIp ? ipGroups.filter((g) => g.ip !== selectedIp).slice(0, 5) : [];
  const typeBreakdown = useMemo(() => {
    if (!selectedGroup) return [];
    const counts = new Map<string, number>();
    for (const record of selectedGroup.records) {
      const key = clean(record.activityType) || clean(record.description) || "Other";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [selectedGroup]);
  const mapUrl = selectedLoc
    ? selectedLoc.latitude !== undefined && selectedLoc.longitude !== undefined
      ? `https://www.openstreetmap.org/?mlat=${selectedLoc.latitude}&mlon=${selectedLoc.longitude}#map=8/${selectedLoc.latitude}/${selectedLoc.longitude}`
      : selectedLoc.label !== "Unknown location" && selectedLoc.label !== "Local network"
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedLoc.label)}`
        : null
    : null;

  return (
    <div className="space-y-5">
      <BackButton />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Activity Log</h1>
          <p className="mt-1 hidden text-sm text-muted-foreground sm:block">
            Last 30 days of account activity.
          </p>
        </div>
        <ExportButton
          disabled={items.length === 0}
          formats={[
            {
              title: "CSV",
              description: "Activity, device, IP and location per row",
              filename: "activity-log",
              extension: "csv",
              build: () => activityCsv(items, locations),
            },
            {
              title: "JSON",
              description: "Raw sign-in and account activity records",
              filename: "activity-log",
              extension: "json",
              build: () => JSON.stringify(items, null, 2),
            },
            {
              title: "PDF",
              description: "Formatted activity log for printing or sharing",
              filename: "activity-log",
              extension: "pdf",
              build: () => "",
              pdf: () => ({
                title: "Account activity log",
                head: ["SN", "Activity", "Device", "Location", "Recorded on"],
                body: items.map((item, i) => {
                  const ip = clean(item.ipAddress);
                  const loc = ip ? locations[ip] : undefined;
                  return [
                    i + 1,
                    String(item.description ?? item.activityType ?? ""),
                    `${browserLabel(item)} · ${osLabel(item)}`,
                    loc && !loc.private ? `${loc.label} · ${ip || "-"}` : ip || "-",
                    String(item.recordedDate ?? ""),
                  ];
                }),
              }),
            },
          ]}
        />
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search activity, browser, IP, city or country…"
          className="h-10 rounded-xl pl-9"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <StatChip
          icon={<History className="size-4" />}
          label="Records"
          value={formatNumber(all.length)}
        />
        <StatChip
          icon={<Globe className="size-4" />}
          label="Unique IPs"
          value={formatNumber(uniqueIps)}
        />
        <StatChip
          icon={<MapPin className="size-4" />}
          label="Countries"
          value={formatNumber(uniqueCountries)}
        />
        <StatChip
          icon={<MonitorSmartphone className="size-4" />}
          label="Browsers"
          value={formatNumber(uniqueBrowsers)}
        />
      </div>

      {q.isLoading ? (
        <LoadingBlock label="Loading activity" />
      ) : q.isError ? (
        <ErrorBlock error={q.error} retry={() => void q.refetch()} />
      ) : all.length === 0 ? (
        <EmptyBlock title="No activity" description="Nothing recorded in this period." />
      ) : items.length === 0 ? (
        <EmptyBlock title="No matches" description="Nothing matches your search." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-10 pl-4">SN</TableHead>
                  <SortableTh
                    label="Activity"
                    active={sort.key === "activity"}
                    dir={sort.dir}
                    onClick={() => toggle("activity")}
                    align="left"
                    kind="text"
                  />
                  <SortableTh
                    label="Device"
                    active={sort.key === "device"}
                    dir={sort.dir}
                    onClick={() => toggle("device")}
                    align="left"
                    kind="text"
                  />
                  <SortableTh
                    label="Location"
                    active={sort.key === "location"}
                    dir={sort.dir}
                    onClick={() => toggle("location")}
                    align="left"
                    kind="text"
                  />
                  <SortableTh
                    label="Recorded on"
                    active={sort.key === "date"}
                    dir={sort.dir}
                    onClick={() => toggle("date")}
                    align="right"
                    className="pr-4"
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((item, idx) => {
                  const { Icon, chip } = activityMeta(item);
                  const ip = clean(item.ipAddress);
                  const loc = ip ? locations[ip] : undefined;
                  const browser = clean(item.browserName);
                  const BrowserIcon = /chrome/i.test(browser) ? Chrome : Globe;
                  const ago = relativeTime(item.recordedDate);
                  return (
                    <TableRow
                      key={`${String(item.recordedDate)}-${item.ipAddress}-${idx}`}
                      className="cursor-pointer"
                      title="View details"
                      onClick={() => setSelected(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelected(item);
                        }
                      }}
                      tabIndex={0}
                    >
                      <TableCell className="pl-4 align-top text-xs text-muted-foreground">
                        {idx + 1}
                      </TableCell>
                      <TableCell className="max-w-56 align-top">
                        <div className="flex items-start gap-2">
                          <span
                            className={`mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full ${chip}`}
                          >
                            <Icon className="size-3.5" />
                          </span>
                          <div className="min-w-0 leading-snug">
                            <p
                              className="truncate text-[13px] font-medium"
                              title={String(item.description ?? item.activityType ?? "")}
                            >
                              {item.description ?? item.activityType ?? "-"}
                            </p>
                            {item.activityType && item.description !== item.activityType ? (
                              <p className="truncate text-[11px] text-muted-foreground">
                                {item.activityType}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap align-top">
                        <p className="flex items-center gap-1.5 text-xs font-medium">
                          <BrowserIcon className="size-3.5 text-muted-foreground" />
                          {browserLabel(item)}
                        </p>
                        <p className="mt-0.5 pl-5 text-[11px] text-muted-foreground">
                          {osLabel(item)}
                        </p>
                      </TableCell>
                      <TableCell className="min-w-44 align-top">
                        <LocationCell ip={ip} loc={loc} locating={isLocating} />
                      </TableCell>
                      <TableCell className="num whitespace-nowrap pr-4 text-right align-top">
                        <p className="text-xs">{formatDateTime(item.recordedDate)}</p>
                        {ago ? (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{ago}</p>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="border-t border-border/70 px-4 py-2.5 text-[11px] text-muted-foreground">
            Locations are estimated from the IP address and may be approximate. Click a row for
            details.
          </p>
        </div>
      )}

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        {selected && selectedMeta ? (
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full ${selectedMeta.chip}`}
                >
                  <selectedMeta.Icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <DialogTitle className="truncate">
                    {String(selected.description ?? selected.activityType ?? "Activity")}
                  </DialogTitle>
                  <DialogDescription>
                    {formatDateTime(selected.recordedDate)}
                    {relativeTime(selected.recordedDate)
                      ? ` · ${relativeTime(selected.recordedDate)}`
                      : null}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/70 p-3.5">
                <p className="flex items-center gap-1.5 text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">
                  <MonitorSmartphone className="size-3.5" /> Device
                </p>
                <p className="mt-1.5 text-sm font-semibold">{browserLabel(selected)}</p>
                <p className="text-xs text-muted-foreground">{osLabel(selected)}</p>
                {clean(selected.activityType) ? (
                  <p className="mt-2 inline-block rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    {clean(selected.activityType)}
                  </p>
                ) : null}
              </div>
              <div className="rounded-xl border border-border/70 p-3.5">
                <p className="flex items-center gap-1.5 text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">
                  <MapPin className="size-3.5" /> Location
                </p>
                <p className="mt-1.5 text-sm font-semibold">
                  {selectedLoc?.flag ? <span className="mr-1">{selectedLoc.flag}</span> : null}
                  {selectedLoc && !selectedLoc.private
                    ? selectedLoc.label
                    : selectedLoc?.private
                      ? "Local network"
                      : "Unknown location"}
                </p>
                <p className="num flex items-center gap-1 text-xs text-muted-foreground">
                  {selectedIp || "-"}
                  {selectedIp ? <CopyIpButton ip={selectedIp} /> : null}
                </p>
                {selectedLoc?.org ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">{selectedLoc.org}</p>
                ) : null}
                {mapUrl ? (
                  <a
                    href={mapUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    View on map <ExternalLink className="size-3" />
                  </a>
                ) : null}
              </div>
            </div>

            {selectedGroup ? (
              <div className="rounded-xl border border-border/70 p-3.5">
                <p className="text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">
                  From this IP address
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-lg bg-muted/50 px-2.5 py-2">
                    <p className="num text-lg font-semibold">{formatNumber(selectedGroup.count)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {selectedGroup.count === 1 ? "record" : "records"}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 px-2.5 py-2">
                    <p className="num text-lg font-semibold">
                      {formatNumber(selectedGroup.logins)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">logins</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 px-2.5 py-2">
                    <p className="num text-[13px] font-semibold leading-7">
                      {formatDate(selectedGroup.earliest.recordedDate)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">first seen</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 px-2.5 py-2">
                    <p className="num text-[13px] font-semibold leading-7">
                      {formatDate(selectedGroup.latest.recordedDate)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">last seen</p>
                  </div>
                </div>
                {typeBreakdown.length > 1 ? (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {typeBreakdown.map(([type, count]) => (
                      <span
                        key={type}
                        className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {type} · <span className="num font-semibold">{count}</span>
                      </span>
                    ))}
                  </div>
                ) : null}

                <p className="mb-1.5 mt-3 text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">
                  History from this IP
                </p>
                <ul className="max-h-48 space-y-1 overflow-y-auto pr-1">
                  {selectedGroup.records.slice(0, 10).map((record, i) => {
                    const meta = activityMeta(record);
                    const isCurrent = record === selected;
                    return (
                      <li
                        key={`${String(record.recordedDate)}-${i}`}
                        className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${
                          isCurrent ? "bg-primary/10 font-medium" : "hover:bg-muted/60"
                        }`}
                      >
                        <span
                          className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full ${meta.chip}`}
                        >
                          <meta.Icon className="size-3" />
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {String(record.description ?? record.activityType ?? "-")}
                        </span>
                        <span className="num shrink-0 text-[11px] text-muted-foreground">
                          {formatDateTime(record.recordedDate)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {otherGroups.length > 0 ? (
              <div>
                <p className="mb-1.5 text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground">
                  Other locations
                </p>
                <ul className="space-y-1">
                  {otherGroups.map((group) => (
                    <li key={group.ip}>
                      <button
                        type="button"
                        onClick={() => setSelected(group.latest)}
                        className="flex w-full items-center gap-2 rounded-xl border border-border/70 px-3 py-2 text-left text-xs transition-colors hover:border-primary/40 hover:bg-muted/40"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {group.loc?.flag ? (
                              <span className="mr-1">{group.loc.flag}</span>
                            ) : null}
                            {group.loc && !group.loc.private
                              ? group.loc.label
                              : (group.loc?.label ?? "Unknown location")}
                          </span>
                          <span className="num block truncate text-[11px] text-muted-foreground">
                            {group.ip}
                          </span>
                        </span>
                        <span className="num shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {group.count}×
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
