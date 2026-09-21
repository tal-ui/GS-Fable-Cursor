"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, CopyIcon, LinkIcon, ShieldCheckIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { createUploadLinkAction, revokeUploadLinkAction } from "@/actions/documents";
import { Form, NumberField, SelectField, SubmitButton, TextField, useZodForm } from "@/components/app/form";
import { SlideOver } from "@/components/app/slide-over";
import { StatusBadge } from "@/components/app/status-badge";
import { useAction } from "@/components/app/use-action";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtDateTime, fmtRelative, humanize } from "@/lib/format";
import type { CandidateDetail } from "@/server/candidates/queries";

type LinkRow = CandidateDetail["uploadLinks"][number];
type RequestableKind = "passport" | "id_document" | "certificate" | "license" | "photo" | "transcript" | "other";

const KIND_OPTIONS: { value: RequestableKind; label: string; hint: string }[] = [
  { value: "passport", label: "Passport", hint: "Sensitive — visible to the owner, verifiers and admins only" },
  { value: "id_document", label: "ID document", hint: "Sensitive — same restrictions as passport" },
  { value: "certificate", label: "Certificate", hint: "Training, safety or trade certificates" },
  { value: "license", label: "License", hint: "Driving, plant or firearms licenses" },
  { value: "transcript", label: "Transcript", hint: "Course or military record extracts" },
  { value: "photo", label: "Photo", hint: "Only when a customer requires one" },
  { value: "other", label: "Other", hint: "Anything else you asked for" },
];

const EXPIRY_OPTIONS = [
  { value: "24", label: "24 hours" },
  { value: "72", label: "3 days" },
  { value: "168", label: "7 days" },
  { value: "336", label: "14 days" },
];

const schema = z.object({
  expiresInHours: z.string(),
  maxFiles: z.coerce.number().int().min(1).max(10),
  purpose: z.string().trim().max(200).optional(),
});

export function RequestDocumentsSheet({ open, onOpenChange, candidateId, candidateName, links, canEdit }: { open: boolean; onOpenChange: (o: boolean) => void; candidateId: string; candidateName: string; links: LinkRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [kinds, setKinds] = React.useState<RequestableKind[]>(["passport"]);
  const [issued, setIssued] = React.useState<{ url: string; expiresAt: Date; kinds: string[] } | null>(null);
  const [copied, setCopied] = React.useState(false);
  const form = useZodForm(schema, { expiresInHours: "72", maxFiles: 3, purpose: "" });
  const create = useAction(createUploadLinkAction, {
    successMessage: "Secure link created — copy it and send it through a permitted channel",
    onSuccess: (r) => {
      setIssued({ url: r.url, expiresAt: r.expiresAt, kinds: r.kinds });
      router.refresh();
    },
  });
  const revoke = useAction(revokeUploadLinkAction, { successMessage: "Link revoked", onSuccess: () => router.refresh() });

  const toggle = (k: RequestableKind) => setKinds((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  const copy = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.url);
      setCopied(true);
      toast.success("Link copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy automatically — select the link and copy it manually");
    }
  };

  const reset = () => {
    setIssued(null);
    setCopied(false);
    form.reset({ expiresInHours: "72", maxFiles: 3, purpose: "" });
    setKinds(["passport"]);
  };

  const active = links.filter((l) => l.state === "active");
  const past = links.filter((l) => l.state !== "active");

  return (
    <SlideOver
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      title="Request documents from the candidate"
      description={`${candidateName} gets a private link and uploads the files themselves. Nothing sensitive travels over chat.`}
      size="md"
    >
      <div className="space-y-6">
        {issued ? (
          <div className="space-y-3">
            <Alert>
              <ShieldCheckIcon />
              <AlertTitle>Link ready</AlertTitle>
              <AlertDescription>
                Send it through a channel the candidate has agreed to (WhatsApp, email or read it out on a call). It works until {fmtDateTime(issued.expiresAt)} and is shown only once — the platform keeps just a fingerprint.
              </AlertDescription>
            </Alert>
            <div className="flex gap-2">
              <Input readOnly value={issued.url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" aria-label="Secure upload link" />
              <Button type="button" variant="outline" onClick={copy} className="shrink-0">
                {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Requested: {issued.kinds.map((k) => humanize(k)).join(", ")}. Each upload raises a verification task for you.</p>
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              Create another link
            </Button>
          </div>
        ) : canEdit ? (
          <Form form={form} onSubmit={(v) => create.run({ candidateId, kinds, expiresInHours: Number(v.expiresInHours), maxFiles: v.maxFiles, purpose: v.purpose || null })} fieldErrors={create.fieldErrors}>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                What should they upload? <span className="text-destructive">*</span>
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {KIND_OPTIONS.map((o) => (
                  <label key={o.value} className="flex items-start gap-2.5 rounded-lg border px-3 py-2 text-sm has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-primary-soft/40">
                    <Checkbox checked={kinds.includes(o.value)} onCheckedChange={() => toggle(o.value)} className="mt-0.5" />
                    <span>
                      <span className="block font-medium">{o.label}</span>
                      <span className="block text-xs text-muted-foreground">{o.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              {kinds.length === 0 ? <p className="text-xs text-destructive">Choose at least one document type.</p> : null}
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField name="expiresInHours" label="Link stays open for" options={EXPIRY_OPTIONS} required />
              <NumberField name="maxFiles" label="Maximum files" min={1} required hint="Up to 10. One per document is usually enough." />
            </div>
            <TextField name="purpose" label="Why you need it (shown to the candidate)" placeholder="Nordsee Werft needs a passport copy before the visa application" />
            <SubmitButton pending={create.pending} disabled={kinds.length === 0}>
              <LinkIcon data-icon="inline-start" />
              Create secure link
            </SubmitButton>
          </Form>
        ) : null}

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Links for this candidate {links.length ? `(${links.length})` : ""}
          </Label>
          {links.length === 0 ? (
            <p className="text-sm text-muted-foreground">No links yet.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {[...active, ...past].map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{l.kinds.map((k) => humanize(k)).join(", ")}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.usedCount}/{l.maxFiles} files · {l.state === "active" ? `expires ${fmtRelative(l.expiresAt)}` : l.state === "expired" ? `expired ${fmtRelative(l.expiresAt)}` : l.state === "revoked" ? `revoked ${fmtRelative(l.revokedAt)}` : "all files received"} · by {l.createdByName ?? "—"}
                      {l.lastUsedAt ? ` · last upload ${fmtRelative(l.lastUsedAt)}` : ""}
                    </p>
                    {l.purpose ? <p className="truncate text-xs text-muted-foreground">{l.purpose}</p> : null}
                  </div>
                  <StatusBadge value={l.state} />
                  {canEdit && l.state === "active" ? (
                    <Button variant="ghost" size="icon-sm" aria-label="Revoke link" disabled={revoke.pending} onClick={() => revoke.run({ id: l.id, candidateId })}>
                      <XIcon />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SlideOver>
  );
}
