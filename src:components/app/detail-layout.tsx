"use client";

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "cn";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

/** Sticky toolbar + 70/30 layout: main form on the left, contextual panel on the right. */
export function DetailLayout({ toolbar, main, side }: { toolbar: React.ReactNode; main: React.ReactNode; side: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="sticky top-14 z-20 -mx-4 border-b bg-background/85 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:-mx-page md:px-page">{toolbar}</div>
      <div className="grid gap-6 pt-6 lg:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)]">
        <div className="flex min-w-0 flex-col gap-5">{main}</div>
        <aside className="flex min-w-0 flex-col gap-5">{side}</aside>
      </div>
    </div>
  );
}

export function DetailSection({
  title,
  description,
  actions,
  children,
  defaultOpen = true,
  count,
  className,
  id,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  count?: number;
  className?: string;
  id?: string;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("surface", className)} id={id}>
      <div className="flex items-center gap-2 px-5 py-3">
        <CollapsibleTrigger asChild>
          <button type="button" className="flex flex-1 items-center gap-2 text-left">
            <ChevronDownIcon className={cn("size-4 text-muted-foreground transition-transform", !open && "-rotate-90")} />
            <span className="font-semibold">{title}</span>
            {count !== undefined ? <span className="rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">{count}</span> : null}
          </button>
        </CollapsibleTrigger>
        {actions ? <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>{actions}</div> : null}
      </div>
      <CollapsibleContent>
        {description ? <p className="px-5 pb-2 text-sm text-muted-foreground">{description}</p> : null}
        <div className="border-t px-5 py-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function FieldGrid({ children, cols = 2 }: { children: React.ReactNode; cols?: 1 | 2 | 3 }) {
  return <dl className={cn("grid gap-x-6 gap-y-4", cols === 2 && "sm:grid-cols-2", cols === 3 && "sm:grid-cols-3")}>{children}</dl>;
}

export function FieldRow({ label, children, className, hint }: { label: string; children: React.ReactNode; className?: string; hint?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function SidePanel({ title, children, action, className }: { title: string; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <section className={cn("surface", className)}>
      <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </header>
      <div className="px-4 py-3 text-sm">{children}</div>
    </section>
  );
}
