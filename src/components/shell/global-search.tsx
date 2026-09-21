"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BriefcaseIcon, Building2Icon, ContactIcon, GitBranchIcon, HandshakeIcon, SearchIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Spinner } from "@/components/ui/spinner";
import { globalSearchAction } from "@/actions/lookups";
import type { SearchHit } from "@/server/search";

const ICONS = { candidate: UsersIcon, account: Building2Icon, requisition: BriefcaseIcon, contact: ContactIcon, submission: GitBranchIcon, placement: HandshakeIcon };
const GROUP_LABEL = { candidate: "Candidates", account: "Accounts", requisition: "Requisitions", contact: "Contacts", submission: "Submissions", placement: "Placements" };

export function GlobalSearch() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [result, setResult] = React.useState<{ q: string; hits: SearchHit[] }>({ q: "", hits: [] });
  const trimmed = query.trim();
  const hits = trimmed.length < 2 ? [] : result.q === trimmed ? result.hits : [];
  const loading = open && trimmed.length >= 2 && result.q !== trimmed;
  const router = useRouter();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (!open || trimmed.length < 2) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      const response = await globalSearchAction({ q: trimmed });
      if (!cancelled) setResult({ q: trimmed, hits: response.ok ? response.data : [] });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [trimmed, open]);

  const grouped = hits.reduce<Record<string, SearchHit[]>>((acc, h) => {
    (acc[h.type] ??= []).push(h);
    return acc;
  }, {});

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="hidden w-64 justify-start gap-2 text-muted-foreground md:inline-flex lg:w-80">
        <SearchIcon className="size-4" />
        <span className="flex-1 text-left text-sm">Search candidates, accounts, requisitions…</span>
        <kbd className="rounded border bg-muted px-1.5 text-[10px] font-medium">⌘K</kbd>
      </Button>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} className="md:hidden" aria-label="Search">
        <SearchIcon />
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Global search" description="Search across candidates, accounts, requisitions, contacts, submissions and placements">
        <Command shouldFilter={false}>
        <CommandInput placeholder="Type at least two characters…" value={query} onValueChange={setQuery} />
        <CommandList>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner />
            </div>
          ) : (
            <>
              <CommandEmpty>{query.trim().length < 2 ? "Search across every major record." : "No matches found."}</CommandEmpty>
              {(Object.keys(grouped) as SearchHit["type"][]).map((type) => (
                <CommandGroup key={type} heading={GROUP_LABEL[type]}>
                  {grouped[type]!.map((hit) => {
                    const Icon = ICONS[hit.type];
                    return (
                      <CommandItem
                        key={`${hit.type}:${hit.id}`}
                        value={`${hit.type}:${hit.id}`}
                        onSelect={() => {
                          setOpen(false);
                          setQuery("");
                          router.push(hit.href);
                        }}
                      >
                        <Icon className="size-4 text-muted-foreground" />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate">{hit.title}</span>
                          {hit.subtitle ? <span className="truncate text-xs text-muted-foreground">{hit.subtitle}</span> : null}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
            </>
          )}
        </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
