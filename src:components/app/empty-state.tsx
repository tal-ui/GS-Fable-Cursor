import type { LucideIcon } from "lucide-react";
import { InboxIcon } from "lucide-react";
import { cn } from "cn";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export function EmptyState({
  icon: Icon = InboxIcon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <Empty className={cn("border bg-card/60", compact ? "py-8" : "py-14", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-11 rounded-2xl bg-primary-soft text-primary [&_svg]:size-5">
          <Icon />
        </EmptyMedia>
        <EmptyTitle className="text-base">{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
