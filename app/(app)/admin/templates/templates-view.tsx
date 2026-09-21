"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CopyIcon, MailIcon, MessageCircleIcon, MessageSquareTextIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { cn } from "cn";
import { deleteTemplateAction, upsertTemplateAction } from "@/actions/admin";
import { ConfirmButton } from "@/components/app/confirm-button";
import { EmptyState } from "@/components/app/empty-state";
import { Form, FormRow, LANGUAGE_OPTIONS, SelectField, SubmitButton, TextField, TextareaField, useFieldValue, useZodForm } from "@/components/app/form";
import { KpiCard } from "@/components/app/kpi-card";
import { SlideOver } from "@/components/app/slide-over";
import { StatusBadge } from "@/components/app/status-badge";
import { useAction } from "@/components/app/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { messageTemplateSchema } from "@/lib/schemas/admin";
import { fmtRelative, humanize } from "@/lib/format";

type Channel = "whatsapp" | "email" | "sms" | "manual";
type Status = "draft" | "approved" | "rejected";
type Template = { id: string; name: string; channel: Channel; language: string; providerTemplateId: string | null; subject: string | null; body: string; variables: string[]; status: Status; category: string | null; updatedAt: Date };

const STANDARD_VARS: { key: string; hint: string }[] = [
  { key: "first_name", hint: "Candidate first name" },
  { key: "last_name", hint: "Candidate last name" },
  { key: "role_title", hint: "Requisition title (when sent from a submission)" },
  { key: "location", hint: "Requisition city, country" },
  { key: "start_date", hint: "Requisition start date" },
  { key: "recruiter_name", hint: "Owner of the candidate" },
];

const SAMPLE: Record<string, string> = { first_name: "Marek", last_name: "Nowak", role_title: "TIG Welder — Offshore", location: "Rotterdam, Netherlands", start_date: "2026-10-05", recruiter_name: "Dana Levi" };

const CHANNEL_ICON: Record<Channel, typeof MailIcon> = { whatsapp: MessageCircleIcon, email: MailIcon, sms: MessageSquareTextIcon, manual: MessageSquareTextIcon };

export function TemplatesView({ rows, channels }: { rows: Template[]; channels: { whatsapp: boolean; email: boolean } }) {
  const router = useRouter();
  const [tab, setTab] = React.useState<"all" | Channel>("all");
  const [q, setQ] = React.useState("");
  const [sheet, setSheet] = React.useState<{ open: boolean; template: Template | null; duplicate?: boolean }>({ open: false, template: null });
  const remove = useAction(deleteTemplateAction, { successMessage: "Template deleted", onSuccess: () => router.refresh() });

  const visible = rows.filter((t) => (tab === "all" || t.channel === tab) && (!q || t.name.toLowerCase().includes(q.toLowerCase()) || (t.category ?? "").toLowerCase().includes(q.toLowerCase())));
  const approved = rows.filter((t) => t.status === "approved");
  const pairs = new Set(approved.filter((t) => t.channel === "whatsapp").map((t) => t.name)).size;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Approved templates" value={approved.length} hint={`${rows.filter((t) => t.status === "draft").length} drafts · ${rows.filter((t) => t.status === "rejected").length} rejected`} icon={MessageSquareTextIcon} />
        <KpiCard label="WhatsApp approved" value={approved.filter((t) => t.channel === "whatsapp").length} hint={channels.whatsapp ? `${pairs} name(s) usable for business-initiated messages` : "WhatsApp provider not configured"} />
        <KpiCard label="Email approved" value={approved.filter((t) => t.channel === "email").length} hint={channels.email ? "SMTP connected" : "SMTP not configured — falls back to manual"} />
        <KpiCard label="Languages" value={new Set(rows.map((t) => t.language)).size} hint="Same name in several languages/channels forms one logical template" />
      </div>

      <div className="surface">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates…" className="h-9 w-64" />
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
              <TabsTrigger value="email">Email</TabsTrigger>
              <TabsTrigger value="manual">Manual</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button className="ml-auto" size="sm" onClick={() => setSheet({ open: true, template: null })}>
            <PlusIcon data-icon="inline-start" />
            New template
          </Button>
        </div>

        {visible.length === 0 ? (
          <EmptyState icon={MessageSquareTextIcon} title={rows.length === 0 ? "No templates yet" : "No templates match"} description={rows.length === 0 ? "Create the first outreach template — e.g. an interest check for a new role — then approve it so automations can use it." : "Try another search or channel."} action={rows.length === 0 ? <Button onClick={() => setSheet({ open: true, template: null })}>Create a template</Button> : undefined} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Variables</TableHead>
                <TableHead>Provider ID</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((t) => {
                const Icon = CHANNEL_ICON[t.channel];
                return (
                  <TableRow key={t.id} className={cn(t.status === "rejected" && "opacity-60")}>
                    <TableCell>
                      <p className="font-medium">{t.name}</p>
                      <p className="max-w-md truncate text-xs text-muted-foreground">{t.subject ? `${t.subject} — ` : ""}{t.body}</p>
                      {t.category ? <span className="mt-0.5 inline-block rounded bg-muted px-1.5 text-[11px]">{t.category}</span> : null}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5 text-sm">
                        <Icon className="size-3.5 text-muted-foreground" />
                        {humanize(t.channel)} · {t.language.toUpperCase()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={t.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-xs flex-wrap gap-1">
                        {t.variables.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : t.variables.map((v) => <code key={v} className="rounded bg-muted px-1 text-[11px]">{`{{${v}}}`}</code>)}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{t.providerTemplateId ?? (t.channel === "whatsapp" ? <span className="text-warning-foreground">missing</span> : "—")}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtRelative(t.updatedAt)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" aria-label={`Duplicate ${t.name}`} onClick={() => setSheet({ open: true, template: t, duplicate: true })}>
                          <CopyIcon />
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${t.name}`} onClick={() => setSheet({ open: true, template: t })}>
                          <PencilIcon />
                        </Button>
                        <ConfirmButton title={`Delete “${t.name}” (${humanize(t.channel)})?`} description="Automations referencing this template by name will fall back to other channels or a manual task." confirmLabel="Delete" variant="ghost" size="icon-sm" destructive pending={remove.pending} onConfirm={() => remove.run({ id: t.id })}>
                          <Trash2Icon />
                        </ConfirmButton>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {sheet.open ? <TemplateSheet key={`${sheet.template?.id ?? "new"}-${sheet.duplicate ? "dup" : "edit"}`} template={sheet.template} duplicate={sheet.duplicate} onClose={() => setSheet({ open: false, template: null })} /> : null}
    </>
  );
}

function TemplateSheet({ template, duplicate, onClose }: { template: Template | null; duplicate?: boolean; onClose: () => void }) {
  const router = useRouter();
  const editing = template && !duplicate;
  const form = useZodForm(messageTemplateSchema, {
    id: editing ? template.id : "",
    name: template?.name ?? "",
    channel: duplicate ? (template?.channel === "whatsapp" ? "email" : "whatsapp") : template?.channel ?? "whatsapp",
    language: template?.language ?? "en",
    providerTemplateId: duplicate ? "" : template?.providerTemplateId ?? "",
    subject: template?.subject ?? "",
    body: template?.body ?? "",
    status: duplicate ? "draft" : template?.status ?? "draft",
    category: template?.category ?? "",
  });
  const { run, pending, fieldErrors } = useAction(upsertTemplateAction, {
    successMessage: editing ? "Template updated" : "Template created",
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });
  const channel = useFieldValue(form, "channel");
  const status = useFieldValue(form, "status");
  const body = String(useFieldValue(form, "body") ?? "");
  const subject = String(useFieldValue(form, "subject") ?? "");
  const used = [...new Set([...body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]!))];
  const unknown = used.filter((v) => !STANDARD_VARS.some((s) => s.key === v));
  const preview = (text: string) => text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => SAMPLE[k] ?? `[${k}]`);
  const insertVar = (key: string) => form.setValue("body", `${body}${body && !body.endsWith(" ") ? " " : ""}{{${key}}}`, { shouldDirty: true, shouldValidate: true });

  return (
    <SlideOver open onOpenChange={(o) => !o && onClose()} title={editing ? `Edit ${template.name}` : duplicate ? `Duplicate ${template?.name}` : "New template"} description="Give the same name to WhatsApp and email variants; outreach picks the best channel for the candidate at send time." size="lg">
      <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
        <FormRow cols={3}>
          <TextField name="name" label="Name" placeholder="e.g. interest_check" hint="Automations reference this name." required autoFocus />
          <SelectField name="channel" label="Channel" options={[{ value: "whatsapp", label: "WhatsApp" }, { value: "email", label: "Email" }, { value: "sms", label: "SMS" }, { value: "manual", label: "Manual (script for a call)" }]} required />
          <SelectField name="language" label="Language" options={LANGUAGE_OPTIONS} required />
        </FormRow>
        <FormRow>
          <SelectField name="status" label="Status" options={[{ value: "draft", label: "Draft" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }]} hint="Only approved templates can be sent or used by automations." required />
          <TextField name="category" label="Category" placeholder="e.g. outreach, interview, onboarding" />
        </FormRow>
        {channel === "whatsapp" ? <TextField name="providerTemplateId" label="Provider template ID" placeholder="e.g. interest_check_v2" hint="The approved template name/ID in WhatsApp Business Manager. Required to approve a WhatsApp template." required={status === "approved"} /> : null}
        {channel === "email" ? <TextField name="subject" label="Subject" placeholder="e.g. {{first_name}}, a {{role_title}} role in {{location}}" required /> : null}
        <TextareaField name="body" label="Body" rows={6} placeholder="Hi {{first_name}}, we have a {{role_title}} position in {{location}} starting {{start_date}}. Are you available? — {{recruiter_name}}" required />
        <div className="flex flex-wrap gap-1.5">
          {STANDARD_VARS.map((v) => (
            <Button key={v.key} type="button" variant="outline" size="xs" title={v.hint} onClick={() => insertVar(v.key)}>
              {`{{${v.key}}}`}
            </Button>
          ))}
        </div>
        {unknown.length ? <p className="text-xs text-warning-foreground">Custom variables ({unknown.join(", ")}) must be supplied when the message is sent, otherwise they render empty.</p> : null}
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview with sample data</p>
          {channel === "email" && subject ? <p className="font-medium">{preview(subject)}</p> : null}
          <p className="whitespace-pre-wrap">{body ? preview(body) : <span className="text-muted-foreground">Start typing to see the preview.</span>}</p>
        </div>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>{editing ? "Save" : "Create template"}</SubmitButton>
        </div>
      </Form>
    </SlideOver>
  );
}
