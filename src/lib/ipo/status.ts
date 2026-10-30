import { sameCompany } from "@/lib/notifications";
import { bsToAd } from "@/lib/nepali-dates";
import { daysUntil } from "@/lib/format";
import type { ApplicableIssue } from "@/lib/meroshare/types";
import type { IpoArchiveRow } from "@/lib/nepse/types";

export function statusGroup(issue: ApplicableIssue): "open" | "upcoming" | "closed" {
  const closes = daysUntil(issue.issueCloseDate);
  if (closes !== null && closes < 0) return "closed";
  const opens = daysUntil(issue.issueOpenDate);
  const status = String(issue.statusName ?? "").toLowerCase();
  if (/closed|expired|over/i.test(status)) return "closed";
  if (/upcoming|announced|coming/i.test(status)) return opens !== null && opens > 0 ? "upcoming" : "open";
  if (/open|active|apply/i.test(status)) return "open";
  if (closes === null) return "open";
  return closes >= 0 ? "open" : "closed";
}

const BS_MONTH_PREFIX: Record<string, number> = {
  bai: 1,
  jes: 2,
  asa: 3,
  ash: 3,
  shr: 4,
  saw: 4,
  bha: 5,
  asw: 6,
  kar: 7,
  man: 8,
  pou: 9,
  mag: 10,
  fal: 11,
  cha: 12,
};

export function parseBsRange(raw: string): { start: Date; end: Date } | null {
  const m = raw.match(/(\d{1,2})(?:st|nd|rd|th)?\s*(?:-\s*(\d{1,2})(?:st|nd|rd|th)?)?\s*([A-Za-z]{3,})\s*,?\s*(\d{4})/);
  if (!m) return null;
  const month = BS_MONTH_PREFIX[m[3]!.slice(0, 3).toLowerCase()];
  const year = Number(m[4]);
  if (!month || year < 2000 || year > 2090) return null;
  const startDay = Number(m[1]);
  const endDay = m[2] ? Number(m[2]) : startDay;
  const start = bsToAd(year, month, startDay);
  const end = bsToAd(year, month, endDay);
  if (!start || !end) return null;
  return { start, end };
}

export function archiveEndPassed(row: { dateRange?: string | null }): boolean {
  const raw = String(row.dateRange ?? "");
  if (!raw) return false;
  const bs = parseBsRange(raw);
  if (bs?.end) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return bs.end.getTime() < today.getTime();
  }
  const candidates = raw.match(
    /\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}\s+[A-Za-z]{3,9}\s*,?\s*\d{4}|[A-Za-z]{3,9}\s+\d{1,2},?\s*\d{4}/g,
  );
  if (!candidates || candidates.length === 0) return false;
  const end = new Date(candidates[candidates.length - 1]!);
  if (Number.isNaN(end.getTime()) || end.getFullYear() >= 2080) return false;
  return end.getTime() < new Date(new Date().toDateString()).getTime();
}

export type IpoAudienceKey = "general" | "foreign" | "local";

/**
 * Which public an issue is for, derived from fields we already fetch —
 * no extra calls. CDSC separates quotas into their own issue rows, so the
 * share group names it (foreign-employment and project-affected locals
 * never read "Ordinary Share"). Archive rows only carry free text, so those
 * match on explicit markers and default to general.
 */
export function ipoAudience(input: {
  shareGroupName?: unknown;
  shareTypeName?: unknown;
  companyName?: unknown;
  company?: unknown;
  /** Upstream audience text — wins over every heuristic when present. */
  reservedFor?: unknown;
  fullText?: unknown;
}): { key: IpoAudienceKey; label: string; detail?: string } {
  const stated = String(input.reservedFor ?? "").trim();
  const text = [input.shareGroupName, input.shareTypeName, stated, input.fullText, input.companyName, input.company]
    .map((v) => String(v ?? ""))
    .join(" | ");
  const genericGroup =
    [input.shareGroupName, input.shareTypeName]
      .map((v) => String(v ?? ""))
      .join(" ")
      .trim() === "" ||
    /^[\s|()]*ordinary shares?[\s|()]*$/i.test(
      [input.shareGroupName, input.shareTypeName].map((v) => String(v ?? "")).join(" | "),
    );
  const tl = text.toLowerCase();
  const foreign =
    /foreign|employment|abroad|migrant|pravasi|bidesh/.test(tl) &&
    (stated !== "" || /foreign employment|working abroad|for (nepalis )?abroad/.test(tl));
  if (foreign)
    return {
      key: "foreign",
      label: "Foreign employment",
      ...(stated ? { detail: stated } : {}),
    };
  const local =
    /project affected|affected local|local residents?|for locals|displaced|rehab/.test(tl) ||
    (!genericGroup && /local/.test(tl));
  if (local) return { key: "local", label: "Locals", ...(stated ? { detail: stated } : {}) };
  return { key: "general", label: "General public" };
}

export const IPO_AUDIENCE_TONE: Record<IpoAudienceKey, string> = {
  general: "border-border/60 bg-muted text-muted-foreground",
  foreign: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  local: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

export function upcomingMerged(open: ApplicableIssue[], calendarList: ApplicableIssue[], archived: IpoArchiveRow[]) {
  const listedNames = [...open, ...calendarList].map((i) => i.companyName || i.scrip || "");
  const cdscUpcoming = calendarList.filter((i) => statusGroup(i) === "upcoming");
  const known = [...listedNames, ...cdscUpcoming.map((i) => i.companyName || i.scrip || "")];
  const closedNames = calendarList
    .filter((i) => statusGroup(i) === "closed")
    .map((i) => i.companyName || i.scrip || "");
  const archUpcoming: IpoArchiveRow[] = [];
  const archClosed: IpoArchiveRow[] = [];
  for (const row of archived) {
    if (
      known.some((name) => sameCompany(name, row.company)) ||
      closedNames.some((name) => sameCompany(name, row.company))
    )
      continue;
    if (archiveEndPassed(row)) archClosed.push(row);
    else archUpcoming.push(row);
  }
  return { cdscUpcoming, archUpcoming, archClosed };
}
