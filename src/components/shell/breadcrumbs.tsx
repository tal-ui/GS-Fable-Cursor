"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";

const LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  "work-queue": "Work queue",
  candidates: "Candidates",
  imports: "Imports",
  sources: "Sources",
  accounts: "Accounts",
  requisitions: "Requisitions",
  match: "Matching",
  submissions: "Submissions",
  placements: "Placements",
  reports: "Reports",
  profile: "My profile",
  admin: "Setup",
  users: "Users & roles",
  taxonomy: "Skills taxonomy",
  automations: "Automations",
  templates: "Message templates",
  jobs: "Jobs & integrations",
  logs: "Audit logs",
  settings: "Settings",
};

type Ctx = { labels: Record<string, string>; setLabel: (segment: string, label: string) => void };
const BreadcrumbContext = React.createContext<Ctx | null>(null);

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [labels, setLabels] = React.useState<Record<string, string>>({});
  const setLabel = React.useCallback((segment: string, label: string) => {
    setLabels((prev) => (prev[segment] === label ? prev : { ...prev, [segment]: label }));
  }, []);
  return <BreadcrumbContext.Provider value={{ labels, setLabel }}>{children}</BreadcrumbContext.Provider>;
}

/** Detail pages register a human-readable label for their id segment. */
export function BreadcrumbLabel({ segment, label }: { segment: string; label: string }) {
  const ctx = React.useContext(BreadcrumbContext);
  React.useEffect(() => {
    ctx?.setLabel(segment, label);
  }, [ctx, segment, label]);
  return null;
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const ctx = React.useContext(BreadcrumbContext);
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  const crumbs = segments.map((seg, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const label = ctx?.labels[seg] ?? LABELS[seg] ?? (seg.length > 20 ? "Record" : seg.replace(/-/g, " "));
    return { href, label, last: i === segments.length - 1 };
  });
  return (
    <Breadcrumb>
      <BreadcrumbList className="text-sm">
        {crumbs.map((c) => (
          <React.Fragment key={c.href}>
            <BreadcrumbItem>
              {c.last ? (
                <BreadcrumbPage className="max-w-[240px] truncate font-medium">{c.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link href={c.href} className="max-w-[200px] truncate">
                    {c.label}
                  </Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {!c.last ? <BreadcrumbSeparator /> : null}
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
