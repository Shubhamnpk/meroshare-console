import {
  Banknote,
  BedDouble,
  Building2,
  ChartPie,
  Droplets,
  Factory,
  FileText,
  HeartPulse,
  Landmark,
  Layers,
  Package,
  ShieldCheck,
  Sprout,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { normalizeSectorKey } from "@/lib/nepse/sectors";
import { cn } from "@/lib/utils";

const SECTOR_ICONS: Record<string, LucideIcon> = {
  "commercial banks": Landmark,
  "development bank": Building2,
  "development bank limited": Building2,
  "development banks": Building2,
  microfinance: Sprout,
  finance: Wallet,
  "life insurance": HeartPulse,
  "non life insurance": ShieldCheck,
  "hydro power": Droplets,
  "manufacturing and processing": Factory,
  tradings: Truck,
  trading: Truck,
  "hotels and tourism": BedDouble,
  "hotel and tourism": BedDouble,
  investment: TrendingUp,
  "mutual fund": ChartPie,
  others: Package,
  "corporate debenture": FileText,
  "government bond": Banknote,
  "promotor share": Users,
  "promoter share": Users,
};

/** Representative Lucide icon for a sector name (falls back to Layers). */
export function sectorIconFor(sector: string | null | undefined): LucideIcon {
  return SECTOR_ICONS[normalizeSectorKey(sector)] ?? Layers;
}

/** Small tinted tile with the sector's icon — consistent everywhere. */
export function SectorBadge({
  sector,
  className,
  iconClassName,
}: {
  sector: string;
  className?: string | undefined;
  iconClassName?: string | undefined;
}) {
  const Icon = sectorIconFor(sector);
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary",
        className,
      )}
      aria-hidden
    >
      <Icon className={cn("size-3.5", iconClassName)} />
    </span>
  );
}
