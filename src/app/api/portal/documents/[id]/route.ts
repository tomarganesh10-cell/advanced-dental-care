import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { requirePatientApi } from "@/server/auth/guards";
import { getPortalDocumentForDownload } from "@/server/portal";
import { getSignedDownloadUrl } from "@/server/storage";

export const dynamic = "force-dynamic";

/**
 * GET /api/portal/documents/[id]
 *
 * Issues a short-lived signed download URL for one of the signed-in patient's
 * own documents, then redirects to it.
 *
 * The order of checks matters:
 *   1. is there a valid patient session?
 *   2. does this document belong to that patient AND is it marked visible?
 *   3. log the access
 *   4. only then mint a URL that expires in minutes
 *
 * A "not yours" and a "does not exist" both return 404, so the endpoint cannot
 * be used to discover which document ids are real.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;

  try {
    const principal = await requirePatientApi();
    const document = await getPortalDocumentForDownload(principal, id);

    if (!document) {
      return NextResponse.json({ ok: false, error: { message: "Not found." } }, { status: 404 });
    }

    const url = await getSignedDownloadUrl(document.storageKey, {
      filename: document.title,
      // Long enough to start a download on a slow connection, short enough that
      // a URL copied out of history is useless.
      expiresInSeconds: 120,
    });

    const response = NextResponse.redirect(url, 302);
    // A redirect to a signed URL must never be cached by a proxy or a CDN.
    response.headers.set("Cache-Control", "no-store, private");
    return response;
  } catch (error) {
    const status = (error as { status?: number })?.status;

    if (status === 401) {
      return NextResponse.redirect(new URL("/patient-login", request.url));
    }

    logger.error({ err: (error as Error).message, documentId: id }, "document download failed");

    return NextResponse.json(
      { ok: false, error: { message: "We could not fetch that document. Please try again." } },
      { status: 500 },
    );
  }
}
