import { Toaster as Sonner } from "sonner";
import { AlertTriangle, Check, Info, Loader2, X } from "lucide-react";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const circle = "flex size-9 shrink-0 items-center justify-center rounded-full shadow-lg";

const infoCircle = (
  <span className={`${circle} bg-info text-white shadow-info/40`}>
    <Info className="size-4" strokeWidth={2.5} />
  </span>
);

const TOAST_ICONS: Record<string, React.ReactNode> = {
  success: (
    <span className={`${circle} bg-gain text-white shadow-gain/40`}>
      <Check className="size-4" strokeWidth={2.5} />
    </span>
  ),
  error: (
    <span className={`${circle} bg-destructive text-white shadow-destructive/40`}>
      <X className="size-4" strokeWidth={2.5} />
    </span>
  ),
  warning: (
    <span className={`${circle} bg-warning text-black shadow-warning/40`}>
      <AlertTriangle className="size-4" strokeWidth={2.5} />
    </span>
  ),
  info: infoCircle,
  loading: (
    <span className={`${circle} bg-primary text-white shadow-primary/40`}>
      <Loader2 className="size-4 animate-spin" />
    </span>
  ),
  default: infoCircle,
};

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-[356px] items-center gap-3 overflow-hidden rounded-xl border border-border bg-secondary py-3 pl-4 pr-1.5 text-[13px] font-sans text-foreground shadow-xl before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-[''] data-[type=success]:before:bg-gain data-[type=error]:before:bg-destructive data-[type=warning]:before:bg-warning data-[type=info]:before:bg-info data-[type=loading]:before:bg-primary data-[type=default]:before:bg-info",
          icon: "relative flex size-9 shrink-0 items-center justify-center",
          content: "flex min-w-0 flex-1 flex-col gap-0.5",
          title: "text-sm font-medium leading-snug text-foreground",
          description: "text-[12.5px] leading-[1.45] text-muted-foreground!",
          closeButton:
            "order-last flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-transparent! text-muted-foreground! transition-colors hover:bg-foreground/10! hover:text-foreground!",
          actionButton:
            "shrink-0 cursor-pointer rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90",
          cancelButton:
            "shrink-0 cursor-pointer rounded-md bg-foreground/10 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/20",
        },
      }}
      icons={TOAST_ICONS}
      {...props}
    />
  );
};

export { Toaster };
