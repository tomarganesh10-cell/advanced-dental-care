import { redirect } from "next/navigation";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import type { Permission } from "@/lib/rbac";
import {
  getPatientPrincipal,
  getStaffPrincipal,
  staffCan,
  type PatientPrincipal,
  type StaffPrincipal,
} from "./session";

/**
 * Guards for server components and route handlers.
 *
 * Page guards redirect; API guards throw. Both exist because a redirect in a
 * fetch response is useless to a client expecting JSON, and a 401 body is
 * useless to a browser navigating to a page.
 *
 * Every protected surface calls one of these. Relying on the middleware alone
 * would be a mistake: middleware sees the URL, not the row being read.
 */

// --- page guards (redirect) -------------------------------------------------

export async function requireStaffPage(permission?: Permission): Promise<StaffPrincipal> {
  const principal = await getStaffPrincipal();
  if (!principal) redirect("/staff-login");
  if (permission && !staffCan(principal, permission)) redirect("/admin/no-access");
  return principal;
}

export async function requirePatientPage(): Promise<PatientPrincipal> {
  const principal = await getPatientPrincipal();
  if (!principal) redirect("/patient-login");
  return principal;
}

// --- API guards (throw) -----------------------------------------------------

export async function requireStaffApi(permission?: Permission): Promise<StaffPrincipal> {
  const principal = await getStaffPrincipal();
  if (!principal) throw new UnauthorizedError();
  if (permission && !staffCan(principal, permission)) {
    throw new ForbiddenError("You do not have permission to do that.");
  }
  return principal;
}

export async function requirePatientApi(): Promise<PatientPrincipal> {
  const principal = await getPatientPrincipal();
  if (!principal) throw new UnauthorizedError();
  return principal;
}

/**
 * Asserts that a patient-scoped resource belongs to the signed-in patient.
 *
 * This is the check that keeps one patient out of another's chart. It is
 * deliberately a separate, explicit call rather than something inferred from
 * the session, because the failure mode — querying by id without scoping — is
 * easy to write and invisible in review.
 */
export function assertOwnedByPatient(principal: PatientPrincipal, resourcePatientId: string): void {
  if (principal.patientId !== resourcePatientId) {
    // Deliberately a 404, not a 403: confirming the row exists would leak that
    // a given appointment or document id is real.
    throw new ForbiddenError("Not found.");
  }
}
