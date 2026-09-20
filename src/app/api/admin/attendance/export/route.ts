import { NextResponse } from "next/server";
import { z } from "zod";
import { PERMISSIONS } from "@/lib/rbac";
import { recordAudit } from "@/server/audit";
import { requireStaffApi } from "@/server/auth/guards";
import { attendanceToCsv, getMonthlySummary } from "@/server/attendance";

export const dynamic = "force-dynamic";

const schema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

/**
 * GET /api/admin/attendance/export?year=&month=
 *
 * CSV for payroll. Exporting staff records is itself an event worth recording,
 * so the audit entry is written before the file is returned.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const principal = await requireStaffApi(PERMISSIONS.ATTENDANCE_EXPORT);

  const url = new URL(request.url);
  const parsed = schema.safeParse({
    year: url.searchParams.get("year"),
    month: url.searchParams.get("month"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { message: "Provide a valid year and month." } },
      { status: 422 },
    );
  }

  const rows = await getMonthlySummary(parsed.data.year, parsed.data.month);
  const csv = attendanceToCsv(rows);

  await recordAudit({
    actor: { userId: principal.userId, label: principal.fullName, role: principal.role },
    action: "EXPORT",
    entity: "Attendance",
    metadata: { year: parsed.data.year, month: parsed.data.month, rows: rows.length },
  });

  const filename = `attendance-${parsed.data.year}-${String(parsed.data.month).padStart(2, "0")}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
