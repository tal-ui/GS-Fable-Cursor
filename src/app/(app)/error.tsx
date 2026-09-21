"use client";

import { useEffect } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import { Page } from "@/components/app/page-header";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // The server already logged the failure; this is only for local debugging.
    console.error(error);
  }, [error]);
  return (
    <Page>
      <EmptyState
        icon={TriangleAlertIcon}
        title="This page could not be loaded"
        description={`Something went wrong on our side and has been logged${error.digest ? ` (ref ${error.digest})` : ""}. You can retry, or head back to the dashboard.`}
        action={
          <div className="flex gap-2">
            <Button onClick={reset}>Try again</Button>
            <Button variant="outline" asChild>
              <a href="/dashboard">Dashboard</a>
            </Button>
          </div>
        }
      />
    </Page>
  );
}
