import { prisma } from "@/lib/db";
import { clinicDateString, clinicDayEnd, clinicDayStart } from "@/lib/time";

/**
 * Dashboard aggregates.
 *
 * All counts are computed in the database rather than by loading rows and
 * counting in JavaScript. On a clinic with a few thousand appointments that
 * difference does not matter; on one with a few hundred thousand it is the
 * difference between a dashboard and a timeout, and the query is no harder to
 * write correctly now.
 */

export interface DashboardSummary {
  today: {
    date: string;
    total: number;
    confirmed: number;
    checkedIn: number;
    completed: number;
    noShow: number;
    cancelled: number;
  };
  pipeline: {
    pendingConfirmation: number;
    newLeads: number;
    overdueFollowUps: number;
    unhandledLowFeedback: number;
  };
  month: {
    newPatients: number;
    completedAppointments: number;
    noShowRate: number;
    cancellationRate: number;
    revenuePaise: number;
    outstandingPaise: number;
  };
  messaging: {
    queued: number;
    failed: number;
  };
}

export async function getDashboardSummary(now = new Date()): Promise<DashboardSummary> {
  const today = clinicDateString(now);
  const dayStart = clinicDayStart(today);
  const dayEnd = clinicDayEnd(today);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    todayCounts,
    pendingConfirmation,
    newLeads,
    overdueFollowUps,
    unhandledLowFeedback,
    newPatients,
    monthAppointmentCounts,
    revenue,
    outstanding,
    messaging,
  ] = await Promise.all([
    prisma.appointment.groupBy({
      by: ["status"],
      where: { deletedAt: null, startsAt: { gte: dayStart, lte: dayEnd } },
      _count: { _all: true },
    }),
    prisma.appointment.count({
      where: { deletedAt: null, status: { in: ["REQUESTED", "PENDING_CONFIRMATION"] } },
    }),
    prisma.lead.count({ where: { deletedAt: null, status: "NEW" } }),
    prisma.lead.count({
      where: {
        deletedAt: null,
        nextFollowUpAt: { lte: now },
        status: { notIn: ["WON", "LOST"] },
      },
    }),
    prisma.feedback.count({ where: { needsFollowUp: true, handledAt: null } }),
    prisma.patient.count({ where: { deletedAt: null, createdAt: { gte: monthStart } } }),
    prisma.appointment.groupBy({
      by: ["status"],
      where: { deletedAt: null, startsAt: { gte: monthStart, lte: now } },
      _count: { _all: true },
    }),
    prisma.payment.aggregate({
      where: { status: "SUCCESS", verifiedAt: { not: null }, paidAt: { gte: monthStart } },
      _sum: { amountPaise: true },
    }),
    prisma.invoice.aggregate({
      where: { deletedAt: null, status: { in: ["ISSUED", "PARTIALLY_PAID"] } },
      _sum: { balancePaise: true },
    }),
    prisma.notificationMessage.groupBy({
      by: ["status"],
      where: { status: { in: ["QUEUED", "FAILED"] } },
      _count: { _all: true },
    }),
  ]);

  const countBy = (
    groups: Array<{ status: string; _count: { _all: number } }>,
    status: string,
  ): number => groups.find((g) => g.status === status)?._count._all ?? 0;

  const todayTotal = todayCounts.reduce((sum, g) => sum + g._count._all, 0);

  const monthTotal = monthAppointmentCounts.reduce((sum, g) => sum + g._count._all, 0);
  const monthNoShow = countBy(monthAppointmentCounts, "NO_SHOW");
  const monthCancelled = countBy(monthAppointmentCounts, "CANCELLED");

  return {
    today: {
      date: today,
      total: todayTotal,
      confirmed: countBy(todayCounts, "CONFIRMED"),
      checkedIn: countBy(todayCounts, "CHECKED_IN") + countBy(todayCounts, "IN_PROGRESS"),
      completed: countBy(todayCounts, "COMPLETED"),
      noShow: countBy(todayCounts, "NO_SHOW"),
      cancelled: countBy(todayCounts, "CANCELLED"),
    },
    pipeline: {
      pendingConfirmation,
      newLeads,
      overdueFollowUps,
      unhandledLowFeedback,
    },
    month: {
      newPatients,
      completedAppointments: countBy(monthAppointmentCounts, "COMPLETED"),
      // Percentages are only meaningful with a denominator; 0 rather than NaN
      // when the month has no appointments yet.
      noShowRate: monthTotal > 0 ? Math.round((monthNoShow / monthTotal) * 1000) / 10 : 0,
      cancellationRate: monthTotal > 0 ? Math.round((monthCancelled / monthTotal) * 1000) / 10 : 0,
      revenuePaise: revenue._sum.amountPaise ?? 0,
      outstandingPaise: outstanding._sum.balancePaise ?? 0,
    },
    messaging: {
      queued: countBy(messaging, "QUEUED"),
      failed: countBy(messaging, "FAILED"),
    },
  };
}

/** Appointment volume per day for the trend chart. */
export async function getAppointmentTrend(days = 30, now = new Date()) {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const rows = await prisma.$queryRaw<Array<{ day: Date; total: bigint; completed: bigint }>>`
    SELECT
      date_trunc('day', "startsAt" AT TIME ZONE 'Asia/Kolkata') AS day,
      count(*) AS total,
      count(*) FILTER (WHERE status = 'COMPLETED') AS completed
    FROM appointments
    WHERE "deletedAt" IS NULL AND "startsAt" >= ${since}
    GROUP BY 1
    ORDER BY 1
  `;

  return rows.map((row) => ({
    date: row.day.toISOString().slice(0, 10),
    total: Number(row.total),
    completed: Number(row.completed),
  }));
}

/** Lead volume and conversion by acquisition source. */
export async function getLeadSourcePerformance(days = 90, now = new Date()) {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const rows = await prisma.lead.groupBy({
    by: ["source", "status"],
    where: { deletedAt: null, createdAt: { gte: since } },
    _count: { _all: true },
  });

  const bySource = new Map<
    string,
    { source: string; total: number; booked: number; won: number }
  >();

  for (const row of rows) {
    const entry = bySource.get(row.source) ?? { source: row.source, total: 0, booked: 0, won: 0 };
    entry.total += row._count._all;
    if (["APPOINTMENT_BOOKED", "VISITED", "TREATMENT_STARTED", "WON"].includes(row.status)) {
      entry.booked += row._count._all;
    }
    if (row.status === "WON") entry.won += row._count._all;
    bySource.set(row.source, entry);
  }

  return [...bySource.values()]
    .map((entry) => ({
      ...entry,
      bookingRate: entry.total > 0 ? Math.round((entry.booked / entry.total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}
