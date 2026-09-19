import { apiSuccess, withApiHandler } from "@/lib/api";
import { recordAudit } from "@/server/audit";
import { getPatientPrincipal, getStaffPrincipal, destroySession } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export const POST = withApiHandler(async () => {
  const staff = await getStaffPrincipal();
  const patient = staff ? null : await getPatientPrincipal();

  if (staff) {
    await destroySession("STAFF");
    await recordAudit({
      actor: { userId: staff.userId, label: staff.fullName, role: staff.role },
      action: "LOGOUT",
      entity: "User",
      entityId: staff.userId,
    });
  } else if (patient) {
    await destroySession("PATIENT");
    await recordAudit({
      actor: { userId: patient.userId, label: patient.fullName, role: "PATIENT" },
      action: "LOGOUT",
      entity: "Patient",
      entityId: patient.patientId,
    });
  } else {
    // Clear both cookies anyway — a logout request from a stale session should
    // still leave the browser signed out.
    await destroySession("STAFF");
    await destroySession("PATIENT");
  }

  return apiSuccess({ signedOut: true });
});
