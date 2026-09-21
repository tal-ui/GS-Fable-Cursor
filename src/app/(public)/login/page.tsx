import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { ShieldCheckIcon, TriangleAlertIcon } from "lucide-react";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { ensureBootstrapped } from "@/server/bootstrap";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatusBadge } from "@/components/app/status-badge";
import { ROLE_LABEL } from "@/lib/viewer";
import { GoogleIcon } from "./google-icon";

export const metadata = { title: "Sign in" };
// Reads the session cookie and, in development, the seeded user list: never prerendered.
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const db = await ensureBootstrapped();
  const current = await getCurrentUser();
  if (current) redirect(current.status === "active" ? "/dashboard" : "/pending");
  const error = typeof params.error === "string" ? params.error : null;
  const next = typeof params.next === "string" && params.next.startsWith("/") ? params.next : "/dashboard";

  const devUsers = env.devLoginEnabled
    ? await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, status: users.status, canVerify: users.canVerify }).from(users).where(and(eq(users.isDeleted, false))).orderBy(asc(users.role), asc(users.name)).limit(12)
    : [];

  return (
    <main className="page-gradient flex min-h-svh items-center justify-center p-6">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border bg-card shadow-float lg:grid-cols-[1.1fr_1fr]">
        <section className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-white/15">
              <ShieldCheckIcon className="size-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight">Staffing CRM</span>
          </div>
          <div className="space-y-4">
            <h1 className="text-3xl font-semibold leading-tight tracking-tight">One trusted record for every candidate, customer and placement.</h1>
            <ul className="space-y-2 text-sm text-primary-foreground/85">
              <li>Verified skills, work authorization and dated availability.</li>
              <li>Explainable matching: pass, fail, or “needs review” — never a black box.</li>
              <li>Seats reserved atomically. Permissions checked before anything is shared.</li>
            </ul>
          </div>
          <p className="text-xs text-primary-foreground/70">Access is granted by a Super Admin after your first sign-in.</p>
        </section>
        <section className="flex flex-col gap-6 p-8 sm:p-10">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
            <p className="text-sm text-muted-foreground">Use your company Google account. No passwords are stored here.</p>
          </div>
          {error ? (
            <Alert variant="destructive">
              <TriangleAlertIcon />
              <AlertTitle>Sign-in failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {env.googleOAuthEnabled ? (
            <Button asChild size="lg" className="w-full">
              <a href={`/api/auth/google?next=${encodeURIComponent(next)}`}>
                <GoogleIcon data-icon="inline-start" />
                Continue with Google
              </a>
            </Button>
          ) : (
            <Alert>
              <TriangleAlertIcon />
              <AlertTitle>Google sign-in not configured</AlertTitle>
              <AlertDescription>Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable production sign-in. Local development can use a seeded account below.</AlertDescription>
            </Alert>
          )}
          {env.devLoginEnabled && devUsers.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Local development</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <p className="text-xs text-muted-foreground">Sign in as a seeded user to explore each role. Disabled automatically in production.</p>
              <ul className="grid gap-2">
                {devUsers.map((u) => (
                  <li key={u.id}>
                    <form action="/api/auth/dev" method="post">
                      <input type="hidden" name="userId" value={u.id} />
                      <button type="submit" className="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:border-primary/40 hover:bg-primary-soft/40">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{u.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          {u.canVerify ? <StatusBadge value="verified" label="Verifier" /> : null}
                          {u.status !== "active" ? <StatusBadge value={u.status} /> : null}
                          <StatusBadge value={u.role} label={ROLE_LABEL[u.role]} />
                        </span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
