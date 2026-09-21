"use client";

import * as React from "react";
import { MessageCircleIcon, MailIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Spinner } from "@/components/ui/spinner";
import { SlideOver } from "./slide-over";
import { EmptyState } from "./empty-state";
import { useAction } from "./use-action";
import { approvedTemplatesAction } from "@/actions/lookups";
import { sendOutreachAction } from "@/actions/pipeline";

type Template = { id: string; name: string; channel: string; language: string; subject: string | null; body: string; category: string | null };

const VAR_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/**
 * WhatsApp-first outreach with email fallback. Messages are queued through the persistent job
 * queue; if neither channel is possible the server creates a manual task instead of failing silently.
 */
export function SendMessageSheet({ open, onOpenChange, candidateId, submissionId, candidateName, canCommunicate, defaults = {} }: { open: boolean; onOpenChange: (o: boolean) => void; candidateId: string; submissionId?: string | null; candidateName: string; canCommunicate: boolean; defaults?: Record<string, string> }) {
  const [templates, setTemplates] = React.useState<Template[] | null>(null);
  const [templateId, setTemplateId] = React.useState<string>("");
  const [channel, setChannel] = React.useState<"whatsapp" | "email">("whatsapp");
  const [overrides, setOverrides] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open || templates) return;
    approvedTemplatesAction({}).then((r) => setTemplates(r.ok ? (r.data as Template[]) : []));
  }, [open, templates]);

  const template = templates?.find((t) => t.id === templateId) ?? null;
  const variables = React.useMemo(() => {
    if (!template) return [];
    const found = new Set<string>();
    for (const m of `${template.subject ?? ""} ${template.body}`.matchAll(VAR_RE)) found.add(m[1]!);
    return Array.from(found);
  }, [template]);

  // Values are derived: user edits win, then caller-supplied defaults, then what we know about the candidate.
  const vars = React.useMemo(() => {
    const next: Record<string, string> = {};
    for (const v of variables) next[v] = overrides[v] ?? defaults[v] ?? (v === "candidate_first_name" || v === "first_name" ? candidateName.split(" ")[0]! : v === "candidate_name" ? candidateName : "");
    return next;
  }, [variables, overrides, defaults, candidateName]);

  const chooseTemplate = (id: string) => {
    setTemplateId(id);
    const chosen = templates?.find((t) => t.id === id);
    if (chosen && (chosen.channel === "email" || chosen.channel === "whatsapp")) setChannel(chosen.channel);
  };

  const preview = template ? template.body.replace(VAR_RE, (_, k: string) => vars[k] || `{{${k}}}`) : "";
  const missing = variables.filter((v) => !vars[v]);

  const { run, pending } = useAction(sendOutreachAction, {
    successMessage: (r) => (r.status === "manual_required" ? `No channel available — a manual follow-up task was created (${r.note})` : `Message queued via ${r.channel}`),
    onSuccess: () => {
      onOpenChange(false);
      setTemplateId("");
    },
  });

  return (
    <SlideOver
      open={open}
      onOpenChange={onOpenChange}
      title={`Message ${candidateName}`}
      description="Only approved templates can be sent. WhatsApp is tried first; email is the fallback; otherwise a manual task is created."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!template || missing.length > 0 || pending || !canCommunicate} onClick={() => template && run({ candidateId, submissionId: submissionId ?? undefined, templateId: template.id, preferredChannel: channel, variables: vars })}>
            {pending ? <Spinner data-icon="inline-start" /> : channel === "whatsapp" ? <MessageCircleIcon data-icon="inline-start" /> : <MailIcon data-icon="inline-start" />}
            Queue message
          </Button>
        </>
      }
    >
      {!canCommunicate ? (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger-foreground">This candidate has not given (or has withdrawn) permission to be contacted. Record a communication consent on their profile first.</div>
      ) : null}
      {templates === null ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : templates.length === 0 ? (
        <EmptyState compact title="No approved templates" description="A Super Admin needs to approve at least one message template in Setup → Message templates." />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="space-y-1.5">
            <Label>Template</Label>
            <Select value={templateId} onValueChange={chooseTemplate}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose an approved template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} <span className="text-muted-foreground">· {t.channel} · {t.language.toUpperCase()}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Preferred channel</Label>
            <ToggleGroup type="single" value={channel} onValueChange={(v) => v && setChannel(v as "whatsapp" | "email")} variant="outline" className="justify-start">
              <ToggleGroupItem value="whatsapp" className="gap-1.5 px-3">
                <MessageCircleIcon className="size-4" /> WhatsApp
              </ToggleGroupItem>
              <ToggleGroupItem value="email" className="gap-1.5 px-3">
                <MailIcon className="size-4" /> Email
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          {variables.length ? (
            <div className="space-y-3">
              <Label>Fill in the template</Label>
              {variables.map((v) => (
                <div key={v} className="grid grid-cols-[160px_1fr] items-center gap-2">
                  <span className="truncate font-mono text-xs text-muted-foreground">{`{{${v}}}`}</span>
                  <Input value={vars[v] ?? ""} onChange={(e) => setOverrides((prev) => ({ ...prev, [v]: e.target.value }))} placeholder={v.replace(/_/g, " ")} className="h-8" />
                </div>
              ))}
            </div>
          ) : null}
          {template ? (
            <div className="space-y-1.5">
              <Label>Preview</Label>
              {template.subject ? <p className="text-sm font-medium">{template.subject.replace(VAR_RE, (_, k: string) => vars[k] || `{{${k}}}`)}</p> : null}
              <div className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-sm">{preview}</div>
            </div>
          ) : null}
        </div>
      )}
    </SlideOver>
  );
}
