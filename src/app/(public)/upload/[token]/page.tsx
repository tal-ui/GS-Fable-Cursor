import { LinkIcon, ShieldCheckIcon } from "lucide-react";
import { resolveUploadLink } from "@/server/documents/upload-links";
import { fmtDateTime } from "@/lib/format";
import { UploadForm } from "./upload-form";

export const metadata = { title: "Secure document upload", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Candidate-facing page behind a secure upload link. No staff shell, no navigation, no data beyond
 * the candidate's first name and what was requested. The token is the only credential.
 */
export default async function UploadLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await resolveUploadLink(token);

  return (
    <main className="page-gradient flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6 rounded-2xl border bg-card p-8 shadow-float">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <ShieldCheckIcon className="size-5" />
          </span>
          <span className="text-base font-semibold tracking-tight">Staffing CRM · secure upload</span>
        </div>

        {link ? (
          <>
            <div className="space-y-2">
              <h1 className="text-xl font-semibold tracking-tight">Hi {link.candidateFirstName}, please upload your documents</h1>
              <p className="text-sm text-muted-foreground">
                Your recruiter asked for: <strong className="text-foreground">{link.kinds.map((k) => k.replace(/_/g, " ")).join(", ")}</strong>
                {link.purpose ? <> — {link.purpose}</> : null}. Files go straight to your private record; only the team working on your placement can open them, and every access is logged.
              </p>
              <p className="text-xs text-muted-foreground">
                This link accepts {link.remaining} more file{link.remaining === 1 ? "" : "s"} and stops working on {fmtDateTime(link.expiresAt)}.
              </p>
            </div>
            <UploadForm token={token} kinds={link.kinds} remaining={link.remaining} />
            <p className="text-xs text-muted-foreground">PDF, JPG, PNG, DOCX or TXT up to 15 MB. Please make sure the whole document is readable and nothing is cropped.</p>
          </>
        ) : (
          <div className="space-y-4 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <LinkIcon className="size-6" />
            </span>
            <div className="space-y-2">
              <h1 className="text-xl font-semibold tracking-tight">This link is no longer valid</h1>
              <p className="text-sm text-muted-foreground">It may have expired, been used already, or been withdrawn by your recruiter. Please ask them for a new link — for your protection we cannot reopen this one.</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
