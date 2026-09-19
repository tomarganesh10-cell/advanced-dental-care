import { apiSuccess, withApiHandler } from "@/lib/api";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/doctors
 *
 * Public list of bookable dentists for the booking form. Returns only what the
 * form needs — no registration numbers, no internal ids beyond the one needed
 * to book, no schedule detail.
 */
export const GET = withApiHandler(async (request) => {
  const url = new URL(request.url);
  const serviceSlug = url.searchParams.get("serviceSlug");

  const doctors = await prisma.doctor.findMany({
    where: {
      deletedAt: null,
      isBookable: true,
      ...(serviceSlug
        ? {
            schedules: {
              some: {
                isActive: true,
                OR: [{ serviceSlugs: { isEmpty: true } }, { serviceSlugs: { has: serviceSlug } }],
              },
            },
          }
        : {}),
    },
    orderBy: [{ displayOrder: "asc" }, { displayName: "asc" }],
    select: {
      id: true,
      slug: true,
      displayName: true,
      specialties: true,
      isVisiting: true,
    },
  });

  return apiSuccess({ doctors });
});
