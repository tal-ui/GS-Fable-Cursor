"use client";

import { Button } from "@/components/ui/button";
import { SlideOver } from "./slide-over";
import { DateField, Form, FormRow, SelectField, SubmitButton, TextField, TextareaField, enumOptions, useZodForm } from "./form";
import { useAction } from "./use-action";
import { createTaskAction } from "@/actions/tasks";
import { manualTaskSchema } from "@/lib/schemas/tasks";

type Opt = { value: string; label: string };
type Link = { candidateId?: string; accountId?: string; requisitionId?: string; submissionId?: string; placementId?: string };

export function CreateTaskSheet({ open, onOpenChange, link, users }: { open: boolean; onOpenChange: (o: boolean) => void; link: Link; users: Opt[] }) {
  const form = useZodForm(manualTaskSchema, { title: "", description: "", priority: "medium", dueAt: "", ownerId: "", ...link });
  const { run, pending, fieldErrors } = useAction(createTaskAction, {
    successMessage: "Task created",
    onSuccess: () => {
      onOpenChange(false);
      form.reset({ title: "", description: "", priority: "medium", dueAt: "", ownerId: "", ...link });
    },
  });
  return (
    <SlideOver open={open} onOpenChange={onOpenChange} title="New task" description="Tasks show up in the owner's work queue and turn overdue automatically." size="sm">
      <Form form={form} onSubmit={(v) => run(v)} fieldErrors={fieldErrors}>
        <TextField name="title" label="Title" placeholder="e.g. Call to reconfirm availability" required autoFocus />
        <TextareaField name="description" label="Details" placeholder="Context for whoever picks this up" />
        <FormRow>
          <SelectField name="priority" label="Priority" options={enumOptions(["low", "medium", "high", "urgent"])} />
          <DateField name="dueAt" label="Due" withTime />
        </FormRow>
        <SelectField name="ownerId" label="Owner" options={users} allowEmpty emptyLabel="Me" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>Create task</SubmitButton>
        </div>
      </Form>
    </SlideOver>
  );
}
