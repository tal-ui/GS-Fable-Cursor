import { redirect } from "next/navigation";
import { ClockIcon, ShieldCheckIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Awaiting activation" };

export default async function PendingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.status === "active") redirect("/dashboard");
  const deactivated = user.status === "deactivated";
  return (
    <main className="page-gradient flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6 rounded-2xl border bg-card p-8 text-center shadow-float">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">{deactivated ? <ShieldCheckIcon className="size-6" /> : <ClockIcon className="size-6" />}</span>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">{deactivated ? "Your account is deactivated" : "Almost there"}</h1>
          <p className="text-sm text-muted-foreground">
            {deactivated
              ? "A Super Admin has deactivated this account. Contact your administrator if you believe this is a mistake."
              : `You signed in as ${user.email}. A Super Admin needs to activate your account and assign a role before you can access the platform. You will get an in-app notification once that happens.`}
          </p>
        </div>
        <form action="/api/auth/logout" method="post">
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  );
}
