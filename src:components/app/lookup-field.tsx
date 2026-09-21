"use client";

import * as React from "react";
import { Controller, useFormContext, type FieldPath, type FieldValues } from "react-hook-form";
import { CheckIcon, ChevronsUpDownIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import type { ActionResult } from "@/lib/actions";
import { FieldShell } from "./form";

export type LookupOption = { id: string; label: string; sub?: string | null };

/** Any lookup server action: takes `{ q }`, returns rows with at least id/label. */
type Fetcher = (input: { q: string }) => Promise<ActionResult<readonly LookupOption[]>>;

/** Typeahead lookup backed by a server action. Works standalone (`value`/`onChange`) or inside a form (`name`). */
export function Lookup({
  value,
  onChange,
  fetcher,
  placeholder = "Search…",
  initialLabel,
  disabled,
  clearable = true,
  className,
  staticOptions,
}: {
  value: string | null;
  onChange: (id: string | null, option: LookupOption | null) => void;
  fetcher?: Fetcher;
  placeholder?: string;
  initialLabel?: string | null;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
  staticOptions?: LookupOption[];
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [options, setOptions] = React.useState<LookupOption[]>(staticOptions ?? []);
  const [loading, setLoading] = React.useState(false);
  const [label, setLabel] = React.useState<string | null>(initialLabel ?? null);

  React.useEffect(() => {
    if (!open || staticOptions) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      if (!fetcher) return;
      setLoading(true);
      const result = await fetcher({ q: query });
      if (!cancelled) {
        setOptions(result.ok ? [...result.data] : []);
        setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, open, fetcher, staticOptions]);

  const filtered = staticOptions ? staticOptions.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())) : options;
  const display = label ?? (value ? staticOptions?.find((o) => o.id === value)?.label ?? "Selected" : null);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn("flex items-center gap-1", className)}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className="w-full justify-between font-normal">
            <span className={cn("truncate", !display && "text-muted-foreground")}>{display ?? placeholder}</span>
            <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        {clearable && value && !disabled ? (
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Clear" onClick={() => { onChange(null, null); setLabel(null); }}>
            <XIcon />
          </Button>
        ) : null}
      </div>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Spinner />
              </div>
            ) : (
              <>
                <CommandEmpty>{query ? "No matches." : "Type to search."}</CommandEmpty>
                <CommandGroup>
                  {filtered.map((o) => (
                    <CommandItem
                      key={o.id}
                      value={o.id}
                      onSelect={() => {
                        onChange(o.id, o);
                        setLabel(o.label);
                        setOpen(false);
                      }}
                    >
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{o.label}</span>
                        {o.sub ? <span className="truncate text-xs text-muted-foreground">{o.sub}</span> : null}
                      </div>
                      {value === o.id ? <CheckIcon className="size-4" /> : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function LookupField<T extends FieldValues>({
  name,
  label,
  required,
  hint,
  fetcher,
  placeholder,
  initialLabel,
  disabled,
  staticOptions,
  onSelected,
  className,
}: {
  name: FieldPath<T>;
  label: string;
  required?: boolean;
  hint?: string;
  fetcher?: Fetcher;
  placeholder?: string;
  initialLabel?: string | null;
  disabled?: boolean;
  staticOptions?: LookupOption[];
  onSelected?: (option: LookupOption | null) => void;
  className?: string;
}) {
  const { control, formState, getFieldState } = useFormContext<T>();
  const error = getFieldState(name, formState).error?.message as string | undefined;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <FieldShell label={label} required={required} hint={hint} error={error} className={className}>
          <Lookup
            value={(field.value as string) || null}
            onChange={(id, option) => {
              field.onChange(id ?? "");
              field.onBlur();
              onSelected?.(option);
            }}
            fetcher={fetcher}
            placeholder={placeholder}
            initialLabel={initialLabel}
            disabled={disabled}
            staticOptions={staticOptions}
          />
        </FieldShell>
      )}
    />
  );
}
