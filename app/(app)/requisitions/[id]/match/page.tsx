import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth/viewer";
import { isAppError } from "@/lib/errors";
import { getRequisition } from "@/server/requisitions";
import { feedbackForRequisition, runMatching } from "@/server/matching";
import { Page } from "@/components/app/page-header";
import { MatchingWorkspaceView } from "./matching-workspace";

export const metadata = { title: "Matching" };

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  let requisition;
  try {
    requisition = await getRequisition(user, id);
  } catch (error) {
    if (isAppError(error) && error.code === "not_found") notFound();
    throw error;
  }
  const [workspace, feedback] = await Promise.all([runMatching(user, id), feedbackForRequisition(id)]);
  const latestFeedback: Record<string, { action: string; reason: string | null; at: string }> = {};
  for (const f of [...feedback].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    latestFeedback[f.candidateId] = { action: f.action, reason: f.reason, at: f.createdAt.toISOString() };
  }
  return (
    <Page wide>
      <MatchingWorkspaceView
        requisition={{ id: requisition.id, title: requisition.title, status: requisition.status, locationCountry: requisition.locationCountry, startDate: requisition.startDate, headcount: requisition.headcountApproved }}
        workspace={workspace}
        latestFeedback={latestFeedback}
      />
    </Page>
  );
}
