"use client";

import * as React from "react";
import { CheckIcon, PencilIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions";
import { FieldRow } from "./detail-layout";

type Kind = "text" | "textarea" | "number" | "date" | "select" | "boolean" | "currency";

type Props = {
  label: string;
  value: string | number | boolean | null | undefined;
  display?: React.ReactNode;
  kind?: Kind;
  options?: { value: string; label: string }[];
  placeholder?: string;
  readOnly?: boolean;
  currency?: string;
  hint?: string;
  onSave: (value: string | number | boolean | null) => Promise<ActionResult<unknown> | null>;
  className?: string;
};

/** Click-to-edit field for detail pages. Saves on blur / Enter, cancels on Escape. */
export function InlineField({ label, value, display, kind = "text", options, placeholder, readOnly, currency, hint, onSave, className }: Props) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<string>(value === null || value === undefined ? "" : String(value));
  const [saving, setSaving] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const begin = () => {
    if (readOnly) return;
    setDraft(value === null || value === undefined ? "" : String(value));
    setEditing(true);
  };

  const commit = async (next: string) => {
    const current = value === null || value === undefined ? "" : String(value);
    if (next === current) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const parsed = kind === "number" || kind === "currency" ? (next === "" ? null : Number(next)) : next === "" ? null : next;
    const result = await onSave(parsed);
    setSaving(false);
    if (result?.ok) {
      toast.success(`${label} updated`);
      setEditing(false);
    } else if (result) {
      const first = result.fieldErrors ? Object.values(result.fieldErrors)[0] : null;
      toast.error(first ?? result.error);
    }
  };

  const toggleBoolean = async (checked: boolean) => {
    setSaving(true);
    const result = await onSave(checked);
    setSaving(false);
    if (result?.ok) toast.success(`${label} updated`);
    else if (result) toast.error(result.error);
  };

  const renderDisplay = () => {
    if (display !== undefined) return display;
    if (kind === "select") return options?.find((o) => o.value === String(value))?.label ?? <span className="text-muted-foreground">—</span>;
    // Placeholders invite an edit; a viewer who cannot edit should just see that the field is empty.
    if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">{!readOnly && placeholder ? placeholder : "—"}</span>;
    if (kind === "currency") return `${currency ?? ""} ${Number(value).toLocaleString()}`.trim();
    return String(value);
  };

  if (kind === "boolean") {
    return (
      <FieldRow label={label} hint={hint} className={className}>
        <div className="flex items-center gap-2">
          <Switch checked={Boolean(value)} onCheckedChange={toggleBoolean} disabled={readOnly || saving} aria-label={label} />
          <span className="text-sm text-muted-foreground">{value ? "Yes" : "No"}</span>
          {saving ? <Spinner className="size-3.5" /> : null}
        </div>
      </FieldRow>
    );
  }

  return (
    <FieldRow label={label} hint={hint} className={className}>
      {editing ? (
        <div className="flex items-start gap-1.5">
          {kind === "select" ? (
            <Select
              value={draft || "__none"}
              onValueChange={(v) => {
                const next = v === "__none" ? "" : v;
                setDraft(next);
                void commit(next);
              }}
              open
              onOpenChange={(open) => !open && setEditing(false)}
            >
              <SelectTrigger className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">—</SelectItem>
                {options?.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : kind === "textarea" ? (
            <Textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={draft}
              rows={3}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commit(draft)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditing(false);
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit(draft);
              }}
              className="text-sm"
            />
          ) : (
            <Input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              value={draft}
              type={kind === "date" ? "date" : kind === "number" || kind === "currency" ? "number" : "text"}
              step={kind === "currency" ? "0.01" : kind === "number" ? "any" : undefined}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commit(draft)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditing(false);
                if (e.key === "Enter") commit(draft);
              }}
              className="h-8"
              placeholder={placeholder}
            />
          )}
          {kind !== "select" ? (
            <>
              <Button type="button" size="icon-sm" variant="ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => commit(draft)} disabled={saving} aria-label="Save">
                {saving ? <Spinner /> : <CheckIcon />}
              </Button>
              <Button type="button" size="icon-sm" variant="ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => setEditing(false)} aria-label="Cancel">
                <XIcon />
              </Button>
            </>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={begin}
          disabled={readOnly}
          className={cn("group/inline -mx-1.5 flex w-full items-center gap-2 rounded-md px-1.5 py-0.5 text-left text-sm", !readOnly && "hover:bg-muted", kind === "textarea" && "items-start whitespace-pre-wrap")}
        >
          <span className="min-w-0 flex-1 break-words">{renderDisplay()}</span>
          {!readOnly ? <PencilIcon className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/inline:opacity-100" /> : null}
        </button>
      )}
    </FieldRow>
  );
}
