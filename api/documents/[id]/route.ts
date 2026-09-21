import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/authorize";
import { AppError, userFacingMessage } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { readDocumentForDownload } from "@/server/documents/service";

/**
 * Private document download. Authorisation is enforced by the document service
 * (visibility scope + sensitivity rules) and every read is written to document_access_log.
 */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const user = await requirePermission("read", "document");
    const { doc, data } = await readDocumentForDownload(user, id);
    const body = new Uint8Array(data);
    return new NextResponse(body, {
      headers: {
        "content-type": doc.mimeType,
        "content-length": String(body.byteLength),
        "content-disposition": `attachment; filename="${doc.filename.replace(/"/g, "")}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
    logger.error("documents.download_failed", { error: String(error) });
    return NextResponse.json({ error: userFacingMessage(error) }, { status: 500 });
  }
}
