import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth/viewer";
import { isAppError } from "@/lib/errors";
import { getCandidateDetail } from "@/server/candidates/queries";
import { activeUsers } from "@/server/admin";
import { listSources } from "@/server/sources";
import { canEditRecord } from "@/server/scope";
import { can } from "@/lib/auth/authorize";
import { Page } from "@/components/app/page-header";
import { CandidateDetailView } from "./candidate-detail";

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  let detail;
  try {
    detail = await getCandidateDetail(user, id);
  } catch (error) {
    if (isAppError(error) && error.code === "not_found") notFound();
    throw error;
  }
  const [users, sources, editable] = await Promise.all([activeUsers(), listSources(true), canEditRecord(user, detail.candidate.ownerId)]);
  // An erased profile is a placeholder for its commercial history; nothing on it may be changed.
  const canEdit = can(user, "write") && editable && !detail.candidate.anonymizedAt;

  return (
    <Page wide>
      <CandidateDetailView
        detail={detail}
        users={users.map((u) => ({ value: u.id, label: u.name }))}
        sources={sources.map((s) => ({ value: s.id, label: s.name }))}
        canEdit={canEdit}
        canVerify={can(user, "verify")}
      />
    </Page>
  );
}
