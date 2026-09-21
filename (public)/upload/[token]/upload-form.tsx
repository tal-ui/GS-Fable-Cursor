"use client";

import * as React from "react";
import { CheckCircle2Icon, FileUpIcon, TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

type Uploaded = { filename: string; kind: string; scanStatus: string };

export function UploadForm({ token, kinds, remaining: initialRemaining }: { token: string; kinds: string[]; remaining: number }) {
  const [kind, setKind] = React.useState(kinds[0] ?? "other");
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<Uploaded[]>([]);
  const [remaining, setRemaining] = React.useState(initialRemaining);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", kind);
      const res = await fetch(`/api/upload-links/${encodeURIComponent(token)}`, { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { error?: string; filename?: string; kind?: string; remaining?: number; scanStatus?: string };
      if (!res.ok) throw new Error(body.error ?? "The upload did not go through. Please try again.");
      setDone((d) => [...d, { filename: body.filename ?? file.name, kind: body.kind ?? kind, scanStatus: body.scanStatus ?? "pending" }]);
      setRemaining(body.remaining ?? Math.max(0, remaining - 1));
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "The upload did not go through. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {done.length > 0 ? (
        <ul className="space-y-2">
          {done.map((d, i) => (
            <li key={i} className="flex items-start gap-2 rounded-lg border border-success/30 bg-success-soft/50 px-3 py-2 text-sm">
              <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-success" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{d.filename}</span>
                <span className="block text-xs text-muted-foreground">
                  {d.kind.replace(/_/g, " ")} · received{d.scanStatus === "infected" ? " · flagged by the virus scan, your recruiter will follow up" : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {remaining === 0 ? (
        <Alert>
          <CheckCircle2Icon />
          <AlertTitle>All done</AlertTitle>
          <AlertDescription>Thank you — everything you were asked for has been received. Your recruiter will review it and get back to you. You can close this page.</AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <TriangleAlertIcon />
              <AlertTitle>Upload failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="kind">Document type</Label>
              <Select value={kind} onValueChange={setKind} disabled={busy}>
                <SelectTrigger id="kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {kinds.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="file">File</Label>
              <input
                ref={inputRef}
                id="file"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.docx,.doc,.txt"
                disabled={busy}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary hover:file:bg-primary-soft/80"
              />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={!file || busy}>
            {busy ? <Spinner data-icon="inline-start" /> : <FileUpIcon data-icon="inline-start" />}
            {busy ? "Uploading…" : `Upload ${kind.replace(/_/g, " ")}`}
          </Button>
        </form>
      )}
    </div>
  );
}
