import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth/viewer";
import { isAppError } from "@/lib/errors";
import { getPlacementDetail } from "@/server/pipeline/placements";
import { activeUsers } from "@/server/admin";
import { canEditRecord } from "@/server/scope";
import { can } from "@/lib/auth/authorize";
import { Page } from "@/components/app/page-header";
import { PlacementDetailView } from "./placement-detail";

export default async function PlacementPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  let detail;
  try {
    detail = await getPlacementDetail(user, id);
  } catch (error) {
    if (isAppError(error) && error.code === "not_found") notFound();
    throw error;
  }
  const [users, editable] = await Promise.all([activeUsers(), canEditRecord(user, detail.placement.ownerId)]);
  return (
    <Page wide>
      <PlacementDetailView detail={detail} users={users.map((u) => ({ value: u.id, label: u.name }))} canEdit={can(user, "write") && editable} />
    </Page>
  );
}
