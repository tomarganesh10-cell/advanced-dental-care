"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac";
import { recordAudit } from "@/server/audit";
import { requireStaffApi } from "@/server/auth/guards";

export interface ActionResult {
  ok: boolean;
  message: string;
}

const verifySchema = z.object({
  key: z.string().min(1).max(200),
  label: z.string().min(1).max(200),
  value: z.string().max(2000),
  source: z.string().max(500),
  status: z.enum(["VERIFIED", "NEEDS_VERIFICATION", "ARCHIVED"]),
  evidence: z.string().max(1000).optional(),
  notes: z.string().max(1000).optional(),
  asOf: z.string().optional(),
});

/**
 * Records a verification decision for one public claim.
 *
 * The rule enforced here is the whole point of the content audit: a claim
 * cannot be marked VERIFIED without naming the evidence. Without that, the
 * screen becomes a row of green ticks that means nothing, and the old site's
 * "25 years / 18 years" problem comes straight back.
 */
export async function verifyClaimAction(formData: FormData): Promise<ActionResult> {
  try {
    const principal = await requireStaffApi(PERMISSIONS.CONTENT_VERIFY_CLAIMS);

    const input = verifySchema.parse({
      key: formData.get("key"),
      label: formData.get("label"),
      value: formData.get("value") ?? "",
      source: formData.get("source") ?? "",
      status: formData.get("status"),
      evidence: formData.get("evidence") || undefined,
      notes: formData.get("notes") || undefined,
      asOf: formData.get("asOf") || undefined,
    });

    if (input.status === "VERIFIED" && !input.evidence?.trim()) {
      return {
        ok: false,
        message:
          "To mark a claim verified, record what evidence you saw — a certificate, an invoice, a licence or a system report.",
      };
    }

    const existing = await prisma.contentClaim.findUnique({ where: { key: input.key } });

    // The value is stored as JSON so numbers stay numbers; a patient count that
    // becomes the string "20000" cannot be formatted or compared.
    const parsedValue: unknown = (() => {
      const trimmed = input.value.trim();
      if (trimmed === "") return null;
      const asNumber = Number(trimmed);
      return Number.isFinite(asNumber) && /^-?\d+(\.\d+)?$/.test(trimmed) ? asNumber : trimmed;
    })();

    const data = {
      label: input.label,
      value: parsedValue as never,
      status: input.status,
      source: input.source,
      evidence: input.evidence ?? null,
      notes: input.notes ?? null,
      asOf: input.asOf ? new Date(input.asOf) : null,
      verifiedById: input.status === "VERIFIED" ? principal.staffId : null,
      verifiedAt: input.status === "VERIFIED" ? new Date() : null,
    };

    await prisma.contentClaim.upsert({
      where: { key: input.key },
      create: { key: input.key, ...data },
      update: data,
    });

    await recordAudit({
      actor: { userId: principal.userId, label: principal.fullName, role: principal.role },
      action: "UPDATE",
      entity: "ContentClaim",
      entityId: input.key,
      before: existing ? { status: existing.status, value: existing.value } : null,
      after: { status: input.status, value: parsedValue },
      metadata: { evidence: input.evidence ?? null },
    });

    // A verified claim changes what the public site renders, so the affected
    // pages are revalidated immediately rather than waiting for their ISR
    // window.
    revalidatePath("/admin/content-verification");
    revalidatePath("/", "layout");

    return {
      ok: true,
      message:
        input.status === "VERIFIED"
          ? "Claim verified. It will now appear on the public site."
          : "Claim updated. It will not appear on the public site.",
    };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    if (error instanceof z.ZodError) {
      return { ok: false, message: error.issues[0]?.message ?? "Please check the details." };
    }
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}
