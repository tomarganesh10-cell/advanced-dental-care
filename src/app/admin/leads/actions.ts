"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { PERMISSIONS } from "@/lib/rbac";
import { recordAudit } from "@/server/audit";
import { requireStaffApi } from "@/server/auth/guards";
import { cancelLeadFollowUps } from "@/server/crm/leads";

export interface ActionResult {
  ok: boolean;
  message: string;
}

const updateSchema = z.object({
  leadId: z.uuid(),
  status: z
    .enum([
      "NEW",
      "CONTACTED",
      "QUALIFIED",
      "APPOINTMENT_BOOKED",
      "VISITED",
      "TREATMENT_STARTED",
      "WON",
      "LOST",
      "FOLLOW_UP",
    ])
    .optional(),
  assignedToId: z.uuid().nullable().optional(),
  nextFollowUpAt: z.string().optional(),
  lostReason: z.string().max(500).optional(),
  note: z.string().max(2000).optional(),
});

/**
 * Updates a lead and records what changed.
 *
 * Two behaviours that matter operationally:
 *  - moving a lead out of NEW cancels the automated follow-up sequence. A
 *    patient who has already spoken to someone should not keep receiving
 *    "would you like help booking?" messages.
 *  - marking a lead LOST requires a reason, because a pipeline full of
 *    unexplained losses tells the clinic nothing about what to change.
 */
export async function updateLeadAction(formData: FormData): Promise<ActionResult> {
  try {
    const principal = await requireStaffApi(PERMISSIONS.LEAD_UPDATE);

    const input = updateSchema.parse({
      leadId: formData.get("leadId"),
      status: formData.get("status") || undefined,
      assignedToId: formData.get("assignedToId") === "" ? null : (formData.get("assignedToId") ?? undefined),
      nextFollowUpAt: formData.get("nextFollowUpAt") || undefined,
      lostReason: formData.get("lostReason") || undefined,
      note: formData.get("note") || undefined,
    });

    if (input.status === "LOST" && !input.lostReason?.trim()) {
      return { ok: false, message: "Please record why this enquiry was lost." };
    }

    const existing = await prisma.lead.findUnique({
      where: { id: input.leadId },
      select: { id: true, status: true, assignedToId: true, nextFollowUpAt: true },
    });

    if (!existing) return { ok: false, message: "That enquiry no longer exists." };

    await prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: input.leadId },
        data: {
          ...(input.status ? { status: input.status } : {}),
          ...(input.assignedToId !== undefined ? { assignedToId: input.assignedToId } : {}),
          ...(input.nextFollowUpAt ? { nextFollowUpAt: new Date(input.nextFollowUpAt) } : {}),
          ...(input.lostReason ? { lostReason: input.lostReason } : {}),
        },
      });

      if (input.status && input.status !== existing.status) {
        await tx.leadActivity.create({
          data: {
            leadId: input.leadId,
            type: "STATUS_CHANGE",
            summary: `Status changed from ${existing.status} to ${input.status}`,
            detail: input.lostReason ?? null,
            staffId: principal.staffId,
          },
        });
      }

      if (input.assignedToId !== undefined && input.assignedToId !== existing.assignedToId) {
        await tx.leadActivity.create({
          data: {
            leadId: input.leadId,
            type: "ASSIGNMENT",
            summary: input.assignedToId ? "Assigned to a team member" : "Unassigned",
            staffId: principal.staffId,
          },
        });
      }

      if (input.note?.trim()) {
        await tx.leadActivity.create({
          data: {
            leadId: input.leadId,
            type: "NOTE",
            summary: "Note added",
            detail: input.note,
            staffId: principal.staffId,
          },
        });
      }
    });

    // Any status beyond NEW means a human is now handling it.
    if (input.status && input.status !== "NEW") {
      await cancelLeadFollowUps(input.leadId, `Lead moved to ${input.status}`);
    }

    await recordAudit({
      actor: { userId: principal.userId, label: principal.fullName, role: principal.role },
      action: "UPDATE",
      entity: "Lead",
      entityId: input.leadId,
      before: { status: existing.status, assignedToId: existing.assignedToId },
      after: { status: input.status ?? existing.status, assignedToId: input.assignedToId },
    });

    revalidatePath("/admin/leads");
    revalidatePath(`/admin/leads/${input.leadId}`);
    revalidatePath("/admin");

    return { ok: true, message: "Enquiry updated." };
  } catch (error) {
    return { ok: false, message: toMessage(error) };
  }
}

const logContactSchema = z.object({
  leadId: z.uuid(),
  type: z.enum(["CALL", "WHATSAPP", "EMAIL", "SMS", "NOTE"]),
  summary: z.string().min(2, "Describe what happened.").max(200),
  detail: z.string().max(2000).optional(),
  nextFollowUpAt: z.string().optional(),
});

export async function logLeadContactAction(formData: FormData): Promise<ActionResult> {
  try {
    const principal = await requireStaffApi(PERMISSIONS.LEAD_UPDATE);

    const input = logContactSchema.parse({
      leadId: formData.get("leadId"),
      type: formData.get("type"),
      summary: formData.get("summary"),
      detail: formData.get("detail") || undefined,
      nextFollowUpAt: formData.get("nextFollowUpAt") || undefined,
    });

    await prisma.$transaction(async (tx) => {
      await tx.leadActivity.create({
        data: {
          leadId: input.leadId,
          type: input.type,
          summary: input.summary,
          detail: input.detail ?? null,
          staffId: principal.staffId,
        },
      });

      await tx.lead.update({
        where: { id: input.leadId },
        data: {
          status: "CONTACTED",
          ...(input.nextFollowUpAt ? { nextFollowUpAt: new Date(input.nextFollowUpAt) } : {}),
        },
      });
    });

    await cancelLeadFollowUps(input.leadId, "Contacted by a team member");

    revalidatePath(`/admin/leads/${input.leadId}`);
    revalidatePath("/admin/leads");

    return { ok: true, message: "Contact logged." };
  } catch (error) {
    return { ok: false, message: toMessage(error) };
  }
}

function toMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "Please check the details and try again.";
  }
  return "Something went wrong. Please try again.";
}
