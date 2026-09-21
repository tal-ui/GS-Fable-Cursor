import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { Card } from "@/components/ui/card";

export function KpiCard({
  label,
  value,
  delta,
  deltaLabel = "vs prior 30 days",
  icon: Icon,
  hint,
  invert,
  href,
}: {
  label: string;
  value: React.ReactNode;
  delta?: number | null;
  deltaLabel?: string;
  icon?: LucideIcon;
  hint?: string;
  /** When true, a decrease is good (e.g. time-to-fill). */
  invert?: boolean;
  href?: string;
}) {
  const positive = delta !== null && delta !== undefined && (invert ? delta < 0 : delta > 0);
  const negative = delta !== null && delta !== undefined && (invert ? delta > 0 : delta < 0);
  const Wrapper = href ? "a" : "div";
  return (
    <Card className={cn("gap-0 p-0 shadow-card transition-shadow", href && "hover:shadow-soft")}>
      <Wrapper href={href} className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          {Icon ? (
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <Icon className="size-4" />
            </span>
          ) : null}
        </div>
        <div className="text-3xl font-semibold tracking-tight">{value}</div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {delta === null || delta === undefined ? (
            hint ? <span>{hint}</span> : <span>&nbsp;</span>
          ) : (
            <>
              <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium", positive && "bg-success-soft text-success-foreground", negative && "bg-danger-soft text-danger-foreground", !positive && !negative && "bg-neutral-soft text-neutral-strong")}>
                {delta > 0 ? <ArrowUpRightIcon className="size-3" /> : delta < 0 ? <ArrowDownRightIcon className="size-3" /> : <MinusIcon className="size-3" />}
                {Math.abs(delta) === Infinity ? "new" : `${delta > 0 ? "+" : ""}${Math.round(delta)}%`}
              </span>
              <span>{deltaLabel}</span>
            </>
          )}
        </div>
      </Wrapper>
    </Card>
  );
}
