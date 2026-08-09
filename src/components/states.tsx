import type { ReactNode } from "react";
import { AlertCircle, Inbox, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

export function LoadingBlock({ label = "Loading", rows = 4 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {label}…
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function ErrorBlock({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
      <div className="flex items-start gap-2 text-destructive">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        <span>{errorMessage(error)}</span>
      </div>
      {retry ? (
        <button
          type="button"
          onClick={retry}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent/10"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyBlock({
  title,
  description,
  icon,
  className,
  children,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="text-muted-foreground">{icon ?? <Inbox className="size-6" />}</div>
      <p className="font-medium text-foreground">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {children}
    </div>
  );
}
