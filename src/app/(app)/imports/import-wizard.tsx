"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangleIcon, ArrowLeftIcon, ArrowRightIcon, CheckCircle2Icon, FileSpreadsheetIcon, UploadCloudIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SlideOver } from "@/components/app/slide-over";
import { useAction } from "@/components/app/use-action";
import { previewImportAction } from "@/actions/imports";
import { CANDIDATE_IMPORT_FIELDS, autoMap, parseCsv, type ParsedCsv } from "@/lib/imports/csv";

type Opt = { value: string; label: string };
type Step = 1 | 2 | 3;

const MAX_BYTES = 5_000_000;
const SKIP = "__skip";

/**
 * Three-step import wizard: choose file + source → map columns → review and create the preview batch.
 * Parsing happens in the browser so the user sees headers and sample values immediately; the server
 * re-parses and validates the same text when the preview batch is created.
 */
export function ImportWizard({ open, onOpenChange, sources }: { open: boolean; onOpenChange: (o: boolean) => void; sources: Opt[] }) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>(1);
  const [file, setFile] = React.useState<{ name: string; text: string; size: number } | null>(null);
  const [parsed, setParsed] = React.useState<ParsedCsv | null>(null);
  const [sourceId, setSourceId] = React.useState<string>("");
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [dragging, setDragging] = React.useState(false);
  const [reading, setReading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const preview = useAction(previewImportAction, {
    successMessage: "Preview created — review errors and duplicates before importing",
    onSuccess: (data) => {
      onOpenChange(false);
      router.push(`/imports/${data.id}`);
    },
  });

  const reset = () => {
    setStep(1);
    setFile(null);
    setParsed(null);
    setSourceId("");
    setMapping({});
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const loadFile = (f: File) => {
    if (!/\.(csv|txt)$/i.test(f.name) && !f.type.includes("csv") && !f.type.includes("text")) {
      toast.error("Choose a CSV file (.csv). Export your spreadsheet as CSV first.");
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error("The file is larger than 5 MB. Split it into smaller files.");
      return;
    }
    setReading(true);
    const reader = new FileReader();
    reader.onerror = () => {
      setReading(false);
      toast.error("The file could not be read.");
    };
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const result = parseCsv(text);
      setReading(false);
      if (result.headers.length === 0 || result.rows.length === 0) {
        toast.error("No data rows were found. The first line must contain column headers.");
        return;
      }
      setFile({ name: f.name, text, size: f.size });
      setParsed(result);
      setMapping(autoMap(result.headers));
    };
    reader.readAsText(f, "utf-8");
  };

  const mappedFields = new Set(Object.values(mapping).filter(Boolean));
  const missingRequired = CANDIDATE_IMPORT_FIELDS.filter((f) => f.required && !mappedFields.has(f.key));
  const hasIdentifier = mappedFields.has("email") || mappedFields.has("phone");
  const sample = parsed?.rows[0] ?? {};

  const setField = (header: string, key: string) =>
    setMapping((prev) => {
      const next = { ...prev };
      // One target field per column: unmap any other header currently pointing at the chosen field.
      for (const [h, k] of Object.entries(next)) if (k === key && h !== header) delete next[h];
      if (key === SKIP) delete next[header];
      else next[header] = key;
      return next;
    });

  const submit = () => {
    if (!file) return;
    void preview.run({ filename: file.name, csvText: file.text, sourceId: sourceId || null, mapping });
  };

  return (
    <SlideOver
      open={open}
      onOpenChange={handleOpenChange}
      size="lg"
      title="Import candidates"
      description={<Stepper step={step} />}
      footer={
        <>
          {step > 1 ? (
            <Button variant="ghost" onClick={() => setStep((s) => (s - 1) as Step)} disabled={preview.pending}>
              <ArrowLeftIcon data-icon="inline-start" />
              Back
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
          )}
          {step === 1 ? (
            <Button onClick={() => setStep(2)} disabled={!parsed}>
              Map columns
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          ) : step === 2 ? (
            <Button onClick={() => setStep(3)} disabled={missingRequired.length > 0}>
              Review
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={preview.pending || !file}>
              {preview.pending ? <Spinner data-icon="inline-start" /> : <UploadCloudIcon data-icon="inline-start" />}
              Create preview
            </Button>
          )}
        </>
      }
    >
      {step === 1 ? (
        <div className="flex flex-col gap-5">
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) loadFile(f);
            }}
            className={cn("flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors", dragging ? "border-primary bg-primary-soft/50" : "border-border hover:border-primary/50 hover:bg-muted/40")}
          >
            <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])} />
            <span className="flex size-11 items-center justify-center rounded-2xl bg-primary-soft text-primary">{reading ? <Spinner /> : <UploadCloudIcon className="size-5" />}</span>
            {file ? (
              <>
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB · {parsed?.rows.length.toLocaleString()} rows · {parsed?.headers.length} columns
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    setParsed(null);
                    setMapping({});
                  }}
                >
                  <XIcon data-icon="inline-start" />
                  Choose another file
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">Drop a CSV here or click to browse</p>
                <p className="text-xs text-muted-foreground">UTF-8 CSV with a header row · up to 5 MB / 5,000 rows per file</p>
              </>
            )}
          </div>

          {parsed?.parseErrors.length ? (
            <div className="rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning-foreground">
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangleIcon className="size-3.5" />
                {parsed.parseErrors.length} parsing warning{parsed.parseErrors.length === 1 ? "" : "s"}
              </p>
              <ul className="mt-1 list-inside list-disc">
                {parsed.parseErrors.slice(0, 5).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="import-source">Source of these candidates</Label>
            <Select value={sourceId || "__none"} onValueChange={(v) => setSourceId(v === "__none" ? "" : v)}>
              <SelectTrigger id="import-source" className="w-full">
                <SelectValue placeholder="Choose a source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">No source (not recommended)</SelectItem>
                {sources.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Every imported or re-referred candidate gets a source event for attribution and conversion reporting. Duplicates keep their original source and gain a re-referral event.</p>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">What happens next</p>
            <ol className="mt-1 list-inside list-decimal space-y-0.5">
              <li>Columns are matched to the candidate dictionary; you can correct any mapping.</li>
              <li>A preview batch validates each row and proposes duplicates by email or phone — never by name alone.</li>
              <li>Nothing is written to the pool until you commit. Completed batches can be rolled back.</li>
              <li>Imported records carry processing permission only; contact permission stays restricted until confirmed.</li>
            </ol>
          </div>
        </div>
      ) : null}

      {step === 2 && parsed ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{parsed.headers.length} columns detected.</span>
            <span className="text-muted-foreground">
              {mappedFields.size} mapped · {parsed.headers.length - Object.keys(mapping).length} skipped
            </span>
            <Button variant="ghost" size="xs" className="ml-auto" onClick={() => setMapping(autoMap(parsed.headers))}>
              Re-detect
            </Button>
          </div>
          {missingRequired.length ? (
            <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger-foreground">
              <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Map a column to {missingRequired.map((f) => `"${f.label}"`).join(" and ")} to continue.
              </span>
            </div>
          ) : !hasIdentifier ? (
            <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning-foreground">
              <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
              <span>Neither email nor phone is mapped, so duplicates cannot be detected. Every row will be created as a new candidate.</span>
            </div>
          ) : null}
          <div className="surface overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">CSV column</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sample</TableHead>
                  <TableHead className="w-64 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Imports as</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsed.headers.map((header) => {
                  const current = mapping[header] ?? SKIP;
                  const field = CANDIDATE_IMPORT_FIELDS.find((f) => f.key === current);
                  return (
                    <TableRow key={header}>
                      <TableCell className="font-medium">{header || <span className="italic text-muted-foreground">(blank header)</span>}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground" title={sample[header]}>
                        {sample[header] || <span className="italic">empty</span>}
                      </TableCell>
                      <TableCell>
                        <Select value={current} onValueChange={(v) => setField(header, v)}>
                          <SelectTrigger className={cn("h-8 w-full", current === SKIP && "text-muted-foreground")} aria-label={`Field for ${header}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="max-h-80">
                            <SelectItem value={SKIP}>Skip this column</SelectItem>
                            {CANDIDATE_IMPORT_FIELDS.map((f) => (
                              <SelectItem key={f.key} value={f.key} disabled={mappedFields.has(f.key) && current !== f.key}>
                                {f.label}
                                {f.required ? " *" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {field?.hint ? <p className="mt-1 text-[11px] text-muted-foreground">{field.hint}</p> : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}

      {step === 3 && parsed && file ? (
        <div className="flex flex-col gap-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="File" value={file.name} icon={FileSpreadsheetIcon} />
            <Stat label="Rows to validate" value={parsed.rows.length.toLocaleString()} />
            <Stat label="Source" value={sources.find((s) => s.value === sourceId)?.label ?? "None"} />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Column mapping</p>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {Object.entries(mapping).map(([header, key]) => (
                <li key={header} className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs">
                  <span className="truncate text-muted-foreground">{header}</span>
                  <span className="shrink-0 font-medium">{CANDIDATE_IMPORT_FIELDS.find((f) => f.key === key)?.label ?? key}</span>
                </li>
              ))}
            </ul>
            {parsed.headers.length - Object.keys(mapping).length > 0 ? <p className="text-xs text-muted-foreground">{parsed.headers.length - Object.keys(mapping).length} column(s) will be ignored.</p> : null}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">First rows</p>
            <div className="surface overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs text-muted-foreground">#</TableHead>
                    {Object.entries(mapping).map(([header, key]) => (
                      <TableHead key={header} className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {CANDIDATE_IMPORT_FIELDS.find((f) => f.key === key)?.label ?? key}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.rows.slice(0, 5).map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                      {Object.keys(mapping).map((header) => (
                        <TableCell key={header} className="max-w-[180px] truncate text-sm" title={row[header]}>
                          {row[header] || <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <CheckCircle2Icon className="mt-0.5 size-3.5 shrink-0 text-success" />
            Creating the preview validates every row and proposes duplicates. You will confirm each duplicate decision and start the import on the next screen — nothing is written yet.
          </div>
        </div>
      ) : null}
    </SlideOver>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps = ["Choose file", "Map columns", "Review"];
  return (
    <span className="mt-1 flex items-center gap-2 text-xs">
      {steps.map((label, i) => {
        const n = (i + 1) as Step;
        return (
          <React.Fragment key={label}>
            <span className={cn("inline-flex items-center gap-1.5", n === step ? "font-medium text-foreground" : n < step ? "text-success-foreground" : "text-muted-foreground")}>
              <span className={cn("flex size-4 items-center justify-center rounded-full text-[10px] font-semibold", n === step ? "bg-primary text-primary-foreground" : n < step ? "bg-success-soft" : "bg-muted")}>{n < step ? "✓" : n}</span>
              {label}
            </span>
            {i < steps.length - 1 ? <span className="h-px w-6 bg-border" /> : null}
          </React.Fragment>
        );
      })}
    </span>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm font-medium" title={value}>
        {Icon ? <Icon className="size-3.5 shrink-0 text-muted-foreground" /> : null}
        <span className="truncate">{value}</span>
      </p>
    </div>
  );
}
