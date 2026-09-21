import { cn } from "cn";
import { humanize } from "@/lib/format";

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "primary";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-neutral-soft text-neutral-strong",
  info: "bg-info-soft text-info-foreground",
  success: "bg-success-soft text-success-foreground",
  warning: "bg-warning-soft text-warning-foreground",
  danger: "bg-danger-soft text-danger-foreground",
  primary: "bg-primary-soft text-primary",
};

const TONES: Record<string, Tone> = {
  // candidates
  new: "info",
  screening: "info",
  active: "success",
  placed: "primary",
  unavailable: "warning",
  withdrawn: "neutral",
  archived: "neutral",
  // requisitions / accounts
  draft: "neutral",
  open: "success",
  on_hold: "warning",
  filled: "primary",
  closed: "neutral",
  cancelled: "danger",
  prospect: "info",
  inactive: "neutral",
  blocked: "danger",
  // submissions
  sourced: "neutral",
  contacted: "info",
  interested: "info",
  interviewing: "info",
  presented: "primary",
  customer_review: "primary",
  offered: "warning",
  accepted: "success",
  declined_by_candidate: "danger",
  rejected_by_customer: "danger",
  not_eligible: "danger",
  // placements
  reserved: "warning",
  started: "success",
  extended: "success",
  completed: "neutral",
  replaced: "warning",
  // eligibility / verification
  eligible: "success",
  review: "warning",
  ineligible: "danger",
  verified: "success",
  unverified: "neutral",
  pending_review: "warning",
  rejected: "danger",
  expired: "danger",
  pass: "success",
  fail: "danger",
  unknown: "warning",
  hold: "warning",
  revoked: "neutral",
  used_up: "neutral",
  // tasks / jobs / messages
  in_progress: "info",
  done: "success",
  queued: "info",
  running: "info",
  failed: "danger",
  dead: "danger",
  sent: "success",
  delivered: "success",
  read: "success",
  manual_required: "warning",
  pending: "warning",
  deactivated: "neutral",
  approved: "success",
  // roles
  super_admin: "primary",
  standard: "info",
  read_only: "neutral",
  // priorities
  low: "neutral",
  medium: "info",
  high: "warning",
  urgent: "danger",
  mandatory: "danger",
  preferred: "info",
  imported: "success",
  previewed: "info",
  importing: "info",
  rolled_back: "neutral",
  infected: "danger",
  clean: "success",
  skipped: "neutral",
  succeeded: "success",
  manual_pending: "warning",
  suppressed: "neutral",
  // retention
  permission_withdrawn: "danger",
  erased: "neutral",
  eligible_for_erasure: "danger",
  in_grace_period: "warning",
};

export function StatusBadge({ value, tone, className, label }: { value: string | null | undefined; tone?: Tone; className?: string; label?: string }) {
  const resolved = tone ?? (value ? TONES[value] ?? "neutral" : "neutral");
  return (
    <span className={cn("inline-flex h-5 items-center whitespace-nowrap rounded-full px-2 text-xs font-medium", TONE_CLASS[resolved], className)}>
      {label ?? humanize(value)}
    </span>
  );
}

export function Dot({ tone = "neutral", className }: { tone?: Tone; className?: string }) {
  const color = { neutral: "bg-neutral-strong", info: "bg-info", success: "bg-success", warning: "bg-warning", danger: "bg-danger", primary: "bg-primary" }[tone];
  return <span className={cn("inline-block size-2 rounded-full", color, className)} />;
}
