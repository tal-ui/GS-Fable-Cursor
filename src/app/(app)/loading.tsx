import { Skeleton } from "@/components/ui/skeleton";
import { Page } from "@/components/app/page-header";
import { TableSkeleton } from "@/components/app/data-table";

export default function Loading() {
  return (
    <Page>
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <TableSkeleton />
    </Page>
  );
}
