import { SearchXIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import { Page } from "@/components/app/page-header";

export default function NotFound() {
  return (
    <Page>
      <EmptyState
        icon={SearchXIcon}
        title="Record not found"
        description="It may have been merged, archived, or you may not have access to it."
        action={
          <Button asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        }
      />
    </Page>
  );
}
