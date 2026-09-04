import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bell,
  BellRing,
  CheckCheck,
  PiggyBank,
  KeyRound,
  Wallet,
  Flame,
  Clock,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { currentIssuesQuery, ipoArchiveQuery, ownDetailQuery, sessionQuery } from "@/lib/queries";
import {
  SNOOZE_TOMORROW_MS,
  arePopupsEnabled,
  buildNotifications,
  dismiss,
  isPushEnabled,
  isRead,
  markAllRead,
  markRead,
  markToasted,
  pushState,
  requestPushPermission,
  sendBrowserNotification,
  setPushEnabled,
  snooze,
  wasToasted,
  type AppNotification,
  type PushState,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";

const KIND_ICON = {
  "ipo-open": PiggyBank,
  "ipo-closing": Flame,
  "ipo-upcoming": PiggyBank,
  password: KeyRound,
  demat: Wallet,
} as const;

function Row({
  item,
  unread,
  onOpen,
  onDismiss,
  onSnooze,
}: {
  item: AppNotification;
  unread: boolean;
  onOpen: () => void;
  onDismiss: () => void;
  onSnooze: () => void;
}) {
  const Icon = KIND_ICON[item.kind];
  return (
    <div
      className={cn(
        "group flex items-start gap-2.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-accent/60",
        item.urgent && "bg-destructive/5",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
      >
        <span
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
            item.urgent ? "bg-destructive/15 text-destructive" : "bg-primary/10 text-primary",
          )}
        >
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold leading-snug">
            <span className="truncate">{item.title}</span>
            {unread ? <span className="size-1.5 shrink-0 rounded-full bg-primary" /> : null}
          </span>
          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
            {item.body}
          </span>
        </span>
      </button>
      <div className="mt-1 flex shrink-0 flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          aria-label="Remind me tomorrow"
          title="Remind me tomorrow"
          onClick={onSnooze}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Clock className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const [push, setPush] = useState<PushState>(() => pushState());
  const navigate = useNavigate();
  const issues = useQuery(currentIssuesQuery());
  const archive = useQuery(ipoArchiveQuery());
  const session = useQuery(sessionQuery());
  const own = useQuery(ownDetailQuery());

  const all = useMemo(
    () =>
      buildNotifications({
        issues: issues.data ?? [],
        archiveUpcoming: archive.data?.upcoming ?? [],
        passwordExpiryDate: session.data?.passwordExpiryDate ?? null,
        dematExpiryDate: (own.data as { dematExpiryDate?: string } | null)?.dematExpiryDate ?? null,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [issues.data, archive.data, session.data, own.data, tick],
  );
  const unread = all.filter((n) => !isRead(n.id));

  const refresh = () => {
    setTick((t) => t + 1);
    setPush(pushState());
  };

  // Pop a toast + device alert the first time an urgent item appears.
  useEffect(() => {
    const fresh = all.filter((n) => n.urgent && !isRead(n.id) && !wasToasted(n.id)).slice(0, 2);
    if (fresh.length === 0) return;
    markToasted(fresh.map((n) => n.id));
    const popups = arePopupsEnabled();
    for (const n of fresh) {
      sendBrowserNotification(n.title, n.body, n.id);
      if (!popups) continue;
      toast(n.title, {
        description: n.body,
        action: {
          label: "View",
          onClick: () => {
            markRead(n.id);
            navigate({ to: n.href });
          },
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all]);

  const openItem = (item: AppNotification) => {
    markRead(item.id);
    refresh();
    setOpen(false);
    navigate({ to: item.href });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell className="size-4" />
          {unread.length > 0 ? (
            <span className="num absolute right-1 top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.6rem] font-bold text-primary-foreground">
              {unread.length > 9 ? "9+" : unread.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2 sm:w-96">
        <div className="flex items-center justify-between px-2 py-1.5">
          <p className="font-display text-sm font-semibold">Notifications</p>
          {unread.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                markAllRead(all.map((n) => n.id));
                refresh();
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          ) : null}
        </div>
        {push === "default" ? (
          <button
            type="button"
            onClick={() => void requestPushPermission().then(() => refresh())}
            className="mb-1 flex w-full items-center gap-2.5 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5 text-left transition-colors hover:bg-primary/10"
          >
            <BellRing className="size-4 shrink-0 text-primary" />
            <span>
              <span className="block text-[13px] font-semibold">Alerts on this device</span>
              <span className="block text-xs text-muted-foreground">
                Tap to allow browser notifications for urgent items.
              </span>
            </span>
          </button>
        ) : push === "granted" && !isPushEnabled() ? (
          <button
            type="button"
            onClick={() => {
              setPushEnabled(true);
              refresh();
            }}
            className="mb-1 flex w-full items-center gap-2.5 rounded-xl border border-border/60 bg-surface px-3 py-2 text-left transition-colors hover:bg-accent/60"
          >
            <BellRing className="size-4 shrink-0 text-muted-foreground" />
            <span className="block text-xs text-muted-foreground">
              Browser alerts are off: <span className="font-semibold text-primary">turn on</span>
            </span>
          </button>
        ) : push === "denied" ? (
          <p className="mb-1 rounded-xl border border-border/60 bg-surface px-3 py-2 text-[11px] text-muted-foreground">
            Browser alerts are blocked. Allow notifications in your browser's site settings to get
            them on this device.
          </p>
        ) : null}
        {issues.isLoading ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">Checking…</p>
        ) : all.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            All caught up. New IPOs, closing dates and expiry warnings land here.
          </p>
        ) : (
          <div className="max-h-80 space-y-0.5 overflow-y-auto">
            {all.map((item) => (
              <Row
                key={item.id}
                item={item}
                unread={!isRead(item.id)}
                onOpen={() => openItem(item)}
                onDismiss={() => {
                  dismiss(item.id);
                  refresh();
                }}
                onSnooze={() => {
                  snooze(item.id, Date.now() + SNOOZE_TOMORROW_MS);
                  refresh();
                }}
              />
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
