"use client";

import * as React from "react";
import { ActivityIcon, MailIcon, MessageCircleIcon, PhoneIcon, StickyNoteIcon, UsersIcon, ZapIcon, RefreshCwIcon, PlusIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { fmtRelative, fmtDateTime } from "@/lib/format";
import { addActivityAction } from "@/actions/crm";
import { useAction } from "./use-action";
import { Form, SelectField, TextField, TextareaField, SubmitButton, useZodForm } from "./form";
import { activityNoteSchema } from "@/lib/schemas/crm";
import { SlideOver } from "./slide-over";
import { RichText } from "./rich-text";
import { EmptyState } from "./empty-state";

export type ActivityItem = {
  id: string;
  type: string;
  subject: string;
  body?: string | null;
  occurredAt: Date | string;
  actorName?: string | null;
};

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  note: StickyNoteIcon,
  call: PhoneIcon,
  email: MailIcon,
  whatsapp: MessageCircleIcon,
  meeting: UsersIcon,
  system: ZapIcon,
  status_change: RefreshCwIcon,
};

export function ActivityTimeline({ items, link, canWrite, limit = 30 }: { items: ActivityItem[]; link: { candidateId?: string; accountId?: string; requisitionId?: string; submissionId?: string; placementId?: string }; canWrite: boolean; limit?: number }) {
  const [open, setOpen] = React.useState(false);
  const [showAll, setShowAll] = React.useState(false);
  const shown = showAll ? items : items.slice(0, limit);
  return (
    <div className="flex flex-col gap-3">
      {canWrite ? (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="self-start">
          <PlusIcon data-icon="inline-start" />
          Log activity
        </Button>
      ) : null}
      {items.length === 0 ? (
        <EmptyState compact icon={ActivityIcon} title="No activity yet" description={canWrite ? "Log a call, note or meeting to start the timeline." : "Activity will appear here as the record moves."} className="border-dashed" />
      ) : (
        <ol className="relative flex flex-col gap-4 border-l pl-5">
          {shown.map((item) => {
            const Icon = ICONS[item.type] ?? ActivityIcon;
            return (
              <li key={item.id} className="relative">
                <span className={cn("absolute -left-[29px] flex size-6 items-center justify-center rounded-full border bg-card", item.type === "system" && "text-muted-foreground", item.type === "status_change" && "text-primary")}>
                  <Icon className="size-3" />
                </span>
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-medium leading-tight">{item.subject}</p>
                  {item.body ? <RichText html={item.body} className="text-muted-foreground" /> : null}
                  <p className="text-xs text-muted-foreground" title={fmtDateTime(item.occurredAt)}>
                    {item.actorName ? `${item.actorName} · ` : "System · "}
                    {fmtRelative(item.occurredAt)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {items.length > limit && !showAll ? (
        <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
          Show all {items.length}
        </Button>
      ) : null}
      <LogActivitySlideOver open={open} onOpenChange={setOpen} link={link} />
    </div>
  );
}

export function LogActivitySlideOver({ open, onOpenChange, link }: { open: boolean; onOpenChange: (o: boolean) => void; link: Record<string, string | undefined> }) {
  const form = useZodForm(activityNoteSchema, { type: "note", subject: "", body: "", ...link });
  const { run, pending, fieldErrors } = useAction(addActivityAction, {
    successMessage: "Activity logged",
    onSuccess: () => {
      onOpenChange(false);
      form.reset({ type: "note", subject: "", body: "", ...link });
    },
  });
  return (
    <SlideOver open={open} onOpenChange={onOpenChange} title="Log activity" description="Notes, calls and meetings are visible to everyone who can see this record." size="sm">
      <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
        <SelectField name="type" label="Type" options={[{ value: "note", label: "Note" }, { value: "call", label: "Call" }, { value: "email", label: "Email" }, { value: "whatsapp", label: "WhatsApp" }, { value: "meeting", label: "Meeting" }]} required />
        <TextField name="subject" label="Subject" placeholder="e.g. Screening call — confirmed availability" required />
        <TextareaField name="body" label="Details" placeholder="What was discussed, next steps…" rows={5} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Save activity</SubmitButton>
        </div>
      </Form>
    </SlideOver>
  );
}
