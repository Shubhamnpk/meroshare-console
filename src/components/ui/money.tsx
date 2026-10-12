import { currencySymbol } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Amount plus currency that never splits across lines, rendered with the
 * currency symbol (£5.64, not 5.64 GBP). Use this instead of hand-rolling
 * `${amount} ${currency}` in tables.
 */
export function Money({
  amount,
  currency,
  className,
}: {
  amount: string;
  currency?: string | null | undefined;
  className?: string;
}) {
  const raw = (currency ?? "").trim();
  const sym = raw ? currencySymbol(raw) : "";
  const prefix = ["£", "$", "€", "₹", "रू"].includes(sym);
  return (
    <span className={cn("num whitespace-nowrap", className)}>
      {!raw ? amount : sym === "p" ? `${amount}p` : prefix ? `${sym}${amount}` : `${amount} ${sym}`}
    </span>
  );
}
