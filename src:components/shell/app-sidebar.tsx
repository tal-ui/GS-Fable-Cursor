"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArchiveIcon, ArchiveRestoreIcon, BarChart3Icon, BriefcaseIcon, Building2Icon, ChevronRightIcon, ClipboardListIcon, DatabaseIcon, FileSpreadsheetIcon, GitBranchIcon, HandshakeIcon, LayoutDashboardIcon, ListChecksIcon, MegaphoneIcon, MessageSquareTextIcon, ScrollTextIcon, SettingsIcon, ShieldCheckIcon, TagsIcon, UsersIcon, UserSquare2Icon, WorkflowIcon, type LucideIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarRail } from "@/components/ui/sidebar";
import { useViewer } from "./viewer-context";
import { ROLE_LABEL } from "@/lib/viewer";
import { StatusBadge } from "@/components/app/status-badge";

type Item = { title: string; href: string; icon: LucideIcon; badge?: number; exact?: boolean };
type Group = { label: string; items: Item[]; adminOnly?: boolean };

export function AppSidebar({ counts }: { counts: { workQueue: number; reviewSubmissions: number; pendingUsers: number; failedJobs: number } }) {
  const pathname = usePathname();
  const viewer = useViewer();

  const groups: Group[] = [
    {
      label: "Workspace",
      items: [
        { title: "Dashboard", href: "/dashboard", icon: LayoutDashboardIcon },
        { title: "Work queue", href: "/work-queue", icon: ListChecksIcon, badge: counts.workQueue },
      ],
    },
    {
      label: "Talent",
      items: [
        { title: "Candidates", href: "/candidates", icon: UsersIcon },
        { title: "Imports", href: "/imports", icon: FileSpreadsheetIcon },
        { title: "Sources", href: "/sources", icon: MegaphoneIcon },
      ],
    },
    {
      label: "Customers",
      items: [
        { title: "Accounts", href: "/accounts", icon: Building2Icon },
        { title: "Requisitions", href: "/requisitions", icon: BriefcaseIcon },
      ],
    },
    {
      label: "Pipeline",
      items: [
        { title: "Submissions", href: "/submissions", icon: GitBranchIcon, badge: counts.reviewSubmissions },
        { title: "Placements", href: "/placements", icon: HandshakeIcon },
      ],
    },
    {
      label: "Insights",
      items: [{ title: "Reports", href: "/reports", icon: BarChart3Icon }],
    },
    {
      label: "Setup",
      adminOnly: true,
      items: [
        { title: "Overview", href: "/admin", icon: SettingsIcon, exact: true },
        { title: "Users & roles", href: "/admin/users", icon: UserSquare2Icon, badge: counts.pendingUsers },
        { title: "Skills taxonomy", href: "/admin/taxonomy", icon: TagsIcon },
        { title: "Automations", href: "/admin/automations", icon: WorkflowIcon },
        { title: "Message templates", href: "/admin/templates", icon: MessageSquareTextIcon },
        { title: "Jobs & integrations", href: "/admin/jobs", icon: DatabaseIcon, badge: counts.failedJobs },
        { title: "Audit logs", href: "/admin/logs", icon: ScrollTextIcon },
        { title: "Retention & erasure", href: "/admin/retention", icon: ArchiveIcon },
        { title: "Archived records", href: "/admin/archived", icon: ArchiveRestoreIcon },
        { title: "Settings", href: "/admin/settings", icon: ClipboardListIcon },
      ],
    },
  ];

  const isActive = (item: Item) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="px-3 py-3">
        <Link href="/dashboard" className="flex items-center gap-2.5 rounded-lg px-1 py-1">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-soft">
            <ShieldCheckIcon className="size-4" />
          </span>
          <span className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold tracking-tight">Staffing CRM</span>
            <span className="text-[11px] text-muted-foreground">Talent · Customers · Placements</span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {groups
          .filter((g) => !g.adminOnly || viewer.role === "super_admin")
          .map((group) => (
            <Collapsible key={group.label} defaultOpen className="group/collapsible">
              <SidebarGroup>
                <SidebarGroupLabel asChild>
                  <CollapsibleTrigger className="flex w-full items-center">
                    {group.label}
                    <ChevronRightIcon className="ml-auto size-3.5 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                  </CollapsibleTrigger>
                </SidebarGroupLabel>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.items.map((item) => (
                        <SidebarMenuItem key={item.href}>
                          <SidebarMenuButton asChild isActive={isActive(item)} tooltip={item.title}>
                            <Link href={item.href}>
                              <item.icon />
                              <span>{item.title}</span>
                            </Link>
                          </SidebarMenuButton>
                          {item.badge ? <SidebarMenuBadge className="bg-primary-soft text-primary">{item.badge > 99 ? "99+" : item.badge}</SidebarMenuBadge> : null}
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          ))}
      </SidebarContent>
      <SidebarFooter className="border-t px-3 py-3 group-data-[collapsible=icon]:hidden">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">{viewer.email}</span>
          <StatusBadge value={viewer.role} label={ROLE_LABEL[viewer.role]} />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
