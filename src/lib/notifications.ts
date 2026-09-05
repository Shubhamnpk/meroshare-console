/**
 * Client-side notifications. CDSC offers no notification/push API, so these
 * are derived from data we already fetch: open/upcoming/closing issues plus
 * password and demat expiry. Read/dismissed state lives in localStorage;
 * anything no longer true (issue closed, password changed) vanishes on its own.
 */
import { daysUntil, formatDate } from "./format";
import type { ApplicableIssue } from "./meroshare/types";

export type NotificationKind = "ipo-open" | "ipo-closing" | "ipo-upcoming" | "password" | "demat";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
  urgent?: boolean;
}

// ---------------------------------------------------------------------------
// Unified notification storage (ms-notif.v1)
// ---------------------------------------------------------------------------

const STORAGE_KEY = "ms-notif.v1";
const MAX_ENTRIES = 200;
const SNOOZE_TTL_MS = 30 * 24 * 60 * 60_000; // 30 days

interface NotifState {
  read: Record<string, number>;
  dismissed: string[];
  toasted: string[];
  snooze: Record<string, number>;
  popups: boolean;
  push: boolean;
}

const DEFAULT_STATE: NotifState = {
  read: {},
  dismissed: [],
  toasted: [],
  snooze: {},
  popups: true,
  push: false,
};

function load(): NotifState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as Partial<NotifState>;
    const now = Date.now();
    return {
      read: parsed.read ?? {},
      dismissed: Array.isArray(parsed.dismissed) ? parsed.dismissed : [],
      toasted: Array.isArray(parsed.toasted) ? parsed.toasted : [],
      snooze: pruneSnooze(parsed.snooze ?? {}, now),
      popups: parsed.popups !== false,
      push: parsed.push === true,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function save(state: NotifState) {
  try {
    // Cap arrays so they can't grow without bound
    const ids = Object.keys(state.read).slice(-MAX_ENTRIES);
    const trimmedRead: Record<string, number> = {};
    for (const id of ids) trimmedRead[id] = state.read[id]!;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...state,
        read: trimmedRead,
        dismissed: state.dismissed.slice(-MAX_ENTRIES),
        toasted: state.toasted.slice(-MAX_ENTRIES),
      }),
    );
  } catch {
    // storage unavailable - notifications just stay unread
  }
}

function pruneSnooze(map: Record<string, number>, now: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, until] of Object.entries(map)) {
    if (typeof until === "number" && until > now && until - now < SNOOZE_TTL_MS) out[id] = until;
  }
  return out;
}

// Migrate legacy individual keys into the unified key
function migrateLegacy(): void {
  try {
    const hasLegacy = [
      "ms-notif-read.v1",
      "ms-notif-dismissed.v1",
      "ms-notif-snooze.v1",
      "ms-notif-toasted.v1",
      "ms-notif-popups.v1",
      "ms-notif-push.v1",
    ].some((k) => localStorage.getItem(k) !== null);
    if (!hasLegacy) return;

    const state = { ...DEFAULT_STATE };

    // Read
    try {
      const raw = JSON.parse(localStorage.getItem("ms-notif-read.v1") ?? "{}");
      if (raw && typeof raw === "object") state.read = raw;
    } catch {
      /* ignore */
    }

    // Dismissed
    try {
      const raw = JSON.parse(localStorage.getItem("ms-notif-dismissed.v1") ?? "[]");
      if (Array.isArray(raw))
        state.dismissed = raw.filter((v): v is string => typeof v === "string");
    } catch {
      /* ignore */
    }

    // Snooze
    try {
      const raw = JSON.parse(localStorage.getItem("ms-notif-snooze.v1") ?? "{}");
      if (raw && typeof raw === "object") state.snooze = raw;
    } catch {
      /* ignore */
    }

    // Toasted
    try {
      const raw = JSON.parse(localStorage.getItem("ms-notif-toasted.v1") ?? "[]");
      if (Array.isArray(raw)) state.toasted = raw.filter((v): v is string => typeof v === "string");
    } catch {
      /* ignore */
    }

    // Popups
    state.popups = localStorage.getItem("ms-notif-popups.v1") !== "0";

    // Push
    state.push = localStorage.getItem("ms-notif-push.v1") === "1";

    save(state);

    // Delete legacy keys
    for (const k of [
      "ms-notif-read.v1",
      "ms-notif-dismissed.v1",
      "ms-notif-snooze.v1",
      "ms-notif-toasted.v1",
      "ms-notif-popups.v1",
      "ms-notif-push.v1",
    ]) {
      localStorage.removeItem(k);
    }
  } catch {
    // migration failed silently - defaults apply
  }
}

// Run migration on module load
if (typeof window !== "undefined") migrateLegacy();

// ---------------------------------------------------------------------------
// Read / dismiss
// ---------------------------------------------------------------------------

export function isRead(id: string): boolean {
  const state = load();
  return state.read[id] !== undefined || state.dismissed.includes(id);
}

export function markRead(id: string): void {
  const state = load();
  state.read[id] = Date.now();
  save(state);
}

export function markAllRead(ids: string[]): void {
  const state = load();
  const now = Date.now();
  for (const id of ids) state.read[id] = now;
  save(state);
}

export function dismiss(id: string): void {
  const state = load();
  if (!state.dismissed.includes(id)) state.dismissed.push(id);
  save(state);
}

// ---------------------------------------------------------------------------
// Snooze
// ---------------------------------------------------------------------------

export function snooze(id: string, untilMs: number): void {
  const state = load();
  state.snooze[id] = untilMs;
  save(state);
}

export function snoozedUntil(id: string): number | null {
  const state = load();
  return state.snooze[id] ?? null;
}

export function snoozedCount(): number {
  const state = load();
  return Object.keys(state.snooze).length;
}

export function clearSnoozed(): void {
  const state = load();
  state.snooze = {};
  save(state);
}

// ---------------------------------------------------------------------------
// Popups / push toggles
// ---------------------------------------------------------------------------

export function arePopupsEnabled(): boolean {
  return load().popups;
}

export function setPopupsEnabled(on: boolean): void {
  const state = load();
  state.popups = on;
  save(state);
}

export const SNOOZE_TOMORROW_MS = 24 * 60 * 60_000;
export const SNOOZE_WEEK_MS = 7 * 24 * 60 * 60_000;

// ---------------------------------------------------------------------------
// Toasted tracking
// ---------------------------------------------------------------------------

export function wasToasted(id: string): boolean {
  return load().toasted.includes(id);
}

export function markToasted(ids: string[]): void {
  const state = load();
  const seen = new Set(state.toasted);
  for (const id of ids) seen.add(id);
  state.toasted = [...seen].slice(-MAX_ENTRIES);
  save(state);
}

// ---------------------------------------------------------------------------
// Browser (device) notifications via the Notification API.
// ---------------------------------------------------------------------------

export type PushState = "unsupported" | "denied" | "granted" | "default";

export function pushState(): PushState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as PushState;
}

export function isPushEnabled(): boolean {
  return load().push;
}

export function setPushEnabled(on: boolean): void {
  const state = load();
  state.push = on;
  save(state);
}

export async function requestPushPermission(): Promise<PushState> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  try {
    const result = await Notification.requestPermission();
    if (result === "granted") setPushEnabled(true);
    return result as PushState;
  } catch {
    return pushState();
  }
}

export function sendBrowserNotification(title: string, body: string, tag: string): void {
  if (!isPushEnabled()) return;
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag });
  } catch {
    // ignore (e.g. blocked in some contexts)
  }
}

// ---------------------------------------------------------------------------
// Notification builders (unchanged)
// ---------------------------------------------------------------------------

function issueName(issue: ApplicableIssue): string {
  return issue.companyName || issue.scrip || `Issue #${issue.companyShareId}`;
}

/** Loose company-name match so CDSC and archive rows for one IPO dedupe. */
export function sameCompany(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\b(ltd|limited|pvt|private)\b\.?/g, "")
      .replace(/[^a-z0-9]/g, "");
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x);
}

function statusGroup(issue: ApplicableIssue): "open" | "upcoming" | "closed" {
  const status = String(issue.statusName ?? "").toLowerCase();
  if (/open|active|apply/i.test(status)) return "open";
  if (/upcoming|announced|coming/i.test(status)) return "upcoming";
  if (/closed|expired|over/i.test(status)) return "closed";
  const closes = daysUntil(issue.issueCloseDate);
  if (closes === null) return "open";
  return closes >= 0 ? "open" : "closed";
}

export function buildNotifications(args: {
  issues: ApplicableIssue[];
  archiveUpcoming?: { company: string; units?: string | null; dateRange?: string | null }[];
  passwordExpiryDate?: string | null;
  dematExpiryDate?: string | null;
}): AppNotification[] {
  const out: AppNotification[] = [];

  for (const issue of args.issues) {
    const group = statusGroup(issue);
    const name = issueName(issue);
    if (group === "upcoming") {
      out.push({
        id: `ipo-upcoming-${issue.companyShareId}`,
        kind: "ipo-upcoming",
        title: `${name} announced`,
        body: `Opens ${formatDate(issue.issueOpenDate)} · Rs ${issue.sharePerUnit ?? "-"}/unit`,
        href: "/ipo?tab=calendar",
      });
    } else if (group === "open") {
      const closes = daysUntil(issue.issueCloseDate);
      if (closes !== null && closes <= 3 && closes >= 0) {
        out.push({
          id: `ipo-closing-${issue.companyShareId}`,
          kind: "ipo-closing",
          title: `${name} closes ${closes === 0 ? "today" : closes === 1 ? "tomorrow" : `in ${closes} days`}`,
          body: `Last chance to apply · closes ${formatDate(issue.issueCloseDate)}`,
          href: "/ipo?tab=calendar",
          urgent: true,
        });
      } else {
        out.push({
          id: `ipo-open-${issue.companyShareId}`,
          kind: "ipo-open",
          title: `${name} is open`,
          body: `Apply by ${formatDate(issue.issueCloseDate)} · Rs ${issue.sharePerUnit ?? "-"}/unit`,
          href: "/ipo",
        });
      }
    }
  }

  // Archive announcements CDSC doesn't list yet (deduped by company).
  const listed = args.issues.map((i) => issueName(i));
  for (const row of args.archiveUpcoming ?? []) {
    if (!row.company || listed.some((name) => sameCompany(name, row.company))) continue;
    out.push({
      id: `ipo-upcoming-arch-${row.company.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      kind: "ipo-upcoming",
      title: `${row.company} announced`,
      body: [row.units ? `${row.units} units` : null, row.dateRange ?? null]
        .filter(Boolean)
        .join(" · "),
      href: "/ipo?tab=calendar",
    });
  }

  const pwdDays = daysUntil(args.passwordExpiryDate);
  if (pwdDays !== null && pwdDays >= 0 && pwdDays <= 30) {
    out.push({
      id: `pwd-expiry-${String(args.passwordExpiryDate)}`,
      kind: "password",
      title: pwdDays === 0 ? "Password expires today" : `Password expires in ${pwdDays}d`,
      body: "Change it in Settings → Account & Security before you're locked out.",
      href: "/settings",
      urgent: pwdDays <= 7,
    });
  }

  const dematDays = daysUntil(args.dematExpiryDate);
  if (dematDays !== null && dematDays >= 0 && dematDays <= 90) {
    out.push({
      id: `demat-expiry-${String(args.dematExpiryDate)}`,
      kind: "demat",
      title: `DEMAT expires in ${dematDays}d`,
      body: `Renew by ${formatDate(args.dematExpiryDate)} via your DP to keep trading.`,
      href: "/profile",
      urgent: dematDays <= 30,
    });
  }

  // Snoozed items stay hidden until their time passes, then repeat.
  const visible = out.filter((n) => snoozedUntil(n.id) == null);
  // Urgent first, then IPO activity.
  const weight = (n: AppNotification) =>
    n.urgent ? 0 : n.kind === "ipo-closing" ? 1 : n.kind === "ipo-open" ? 2 : 3;
  return visible.sort((a, b) => weight(a) - weight(b));
}
