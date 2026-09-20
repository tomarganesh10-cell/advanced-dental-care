import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/lib/rbac";
import { formatClinicDate, formatClinicTime } from "@/lib/time";
import { recordAudit } from "@/server/audit";
import { requireStaffApi } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

const schema = z.object({
  report: z.enum(["appointments", "leads"]).default("appointments"),
  days: z.coerce.number().int().min(1).max(365).default(90),
});

/**
 * GET /api/admin/reports/export?report=&days=
 *
 * CSV export.
 *
 * Deliberately excludes clinical content. An exported spreadsheet leaves every
 * access control behind the moment it lands in someone's downloads folder, so
 * it carries what the clinic needs for scheduling and reporting and nothing
 * about a diagnosis.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const principal = await requireStaffApi(PERMISSIONS.REPORT_EXPORT);

  const url = new URL(request.url);
  const parsed = schema.safeParse({
    report: url.searchParams.get("report") ?? undefined,
    days: url.searchParams.get("days") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { message: "Invalid report parameters." } },
      { status: 422 },
    );
  }

  const { report, days } = parsed.data;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  let csv: string;
  let rowCount: number;

  if (report === "appointments") {
    const appointments = await prisma.appointment.findMany({
      where: { deletedAt: null, startsAt: { gte: since } },
      orderBy: { startsAt: "asc" },
      select: {
        reference: true,
        startsAt: true,
        durationMinutes: true,
        status: true,
        channel: true,
        serviceName: true,
        isNewPatient: true,
        cancellationReason: true,
        patient: { select: { patientNumber: true, fullName: true, phone: true } },
        doctor: { select: { displayName: true } },
      },
    });

    rowCount = appointments.length;

    csv = toCsv(
      [
        "Reference",
        "Date",
        "Time",
        "Minutes",
        "Patient number",
        "Patient",
        "Phone",
        "Treatment",
        "Dentist",
        "Status",
        "Channel",
        "New patient",
        "Cancellation reason",
      ],
      appointments.map((appointment) => [
        appointment.reference,
        formatClinicDate(appointment.startsAt, "yyyy-MM-dd"),
        formatClinicTime(appointment.startsAt, "HH:mm"),
        appointment.durationMinutes,
        appointment.patient.patientNumber,
        appointment.patient.fullName,
        appointment.patient.phone,
        appointment.serviceName ?? "",
        appointment.doctor?.displayName ?? "",
        appointment.status,
        appointment.channel,
        appointment.isNewPatient ? "Yes" : "No",
        appointment.cancellationReason ?? "",
      ]),
    );
  } else {
    const leads = await prisma.lead.findMany({
      where: { deletedAt: null, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      select: {
        reference: true,
        createdAt: true,
        fullName: true,
        phone: true,
        email: true,
        country: true,
        treatmentInterest: true,
        source: true,
        status: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
        lostReason: true,
        assignedTo: { select: { fullName: true } },
      },
    });

    rowCount = leads.length;

    csv = toCsv(
      [
        "Reference",
        "Date",
        "Name",
        "Phone",
        "Email",
        "Country",
        "Interest",
        "Source",
        "Status",
        "UTM source",
        "UTM medium",
        "UTM campaign",
        "Owner",
        "Lost reason",
      ],
      leads.map((lead) => [
        lead.reference,
        formatClinicDate(lead.createdAt, "yyyy-MM-dd"),
        lead.fullName,
        lead.phone,
        lead.email ?? "",
        lead.country ?? "",
        lead.treatmentInterest ?? "",
        lead.source,
        lead.status,
        lead.utmSource ?? "",
        lead.utmMedium ?? "",
        lead.utmCampaign ?? "",
        lead.assignedTo?.fullName ?? "",
        lead.lostReason ?? "",
      ]),
    );
  }

  await recordAudit({
    actor: { userId: principal.userId, label: principal.fullName, role: principal.role },
    action: "EXPORT",
    entity: report === "appointments" ? "Appointment" : "Lead",
    metadata: { report, days, rows: rowCount },
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${report}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function toCsv(header: string[], rows: Array<Array<string | number>>): string {
  return [header.map(escapeCsv).join(","), ...rows.map((row) => row.map(escapeCsv).join(","))].join(
    "\n",
  );
}

/**
 * Escapes a CSV cell, and neutralises formula injection.
 *
 * A patient name beginning with `=`, `+`, `-` or `@` is executed by Excel when
 * the export is opened. Names are user-controlled data, so this is not
 * theoretical.
 */
function escapeCsv(value: string | number): string {
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
