import { type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type PanelPadding = "none" | "sm" | "md" | "lg";

interface PanelProps {
  children: ReactNode;
  className?: string;
  padding?: PanelPadding;
  shadow?: boolean;
  interactive?: boolean;
  as?: ElementType;
}

const PADDING: Record<PanelPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4 sm:p-5",
  lg: "p-6",
};

export function Panel({
  children,
  className,
  padding = "md",
  shadow = false,
  interactive = false,
  as: Tag = "div",
  ...rest
}: PanelProps & Record<string, unknown>) {
  return (
    <Tag
      className={cn(
        "rounded-2xl border border-border/70 bg-card",
        PADDING[padding],
        shadow && "shadow-sm",
        interactive &&
          "transition-colors hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
