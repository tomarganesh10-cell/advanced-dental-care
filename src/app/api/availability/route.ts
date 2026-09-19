import { apiSuccess, withApiHandler } from "@/lib/api";
import { availabilityQuerySchema } from "@/lib/validation/booking";
import { getDayAvailability } from "@/server/booking/availability";
import { getService } from "@data/services";

export const dynamic = "force-dynamic";

/**
 * GET /api/availability?date=YYYY-MM-DD&serviceSlug=&doctorId=
 *
 * Public. Returns bookable slots for one clinic-local day.
 *
 * Deliberately does not reveal WHY a slot is unavailable — a response that
 * distinguished "doctor on leave" from "already booked" would leak the
 * clinic's diary to anyone who polled it.
 */
export const GET = withApiHandler(async (request) => {
  const url = new URL(request.url);

  const query = availabilityQuerySchema.parse({
    date: url.searchParams.get("date") ?? "",
    serviceSlug: url.searchParams.get("serviceSlug") ?? undefined,
    doctorId: url.searchParams.get("doctorId") ?? undefined,
  });

  // Appointment length comes from the treatment, not from the client. A client
  // that could name its own duration could book a 10-minute slot for an
  // implant surgery and wreck the diary.
  const service = query.serviceSlug ? getService(query.serviceSlug) : undefined;
  const durationMinutes = service ? durationForService(service.slug) : 30;

  const availability = await getDayAvailability({
    date: query.date,
    serviceSlug: query.serviceSlug ?? null,
    doctorId: query.doctorId ?? null,
    durationMinutes,
  });

  return apiSuccess({
    date: availability.date,
    timezone: availability.timezone,
    isClinicClosed: availability.isClinicClosed,
    closureReason: availability.closureReason,
    durationMinutes,
    slots: availability.slots.map((slot) => ({
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      label: slot.label,
      doctorId: slot.doctorId,
      doctorName: slot.doctorName,
    })),
  });
});

/**
 * Chair time per treatment.
 *
 * Consultations are short; surgery is not. Getting this wrong in either
 * direction costs real money — too short and the day runs late, too long and
 * the diary wastes capacity.
 */
export function durationForService(slug: string): number {
  const durations: Record<string, number> = {
    "general-dentistry": 30,
    "teeth-whitening": 60,
    "root-canal": 60,
    "gum-treatment": 45,
    veneers: 45,
    "smile-design": 45,
    "crowns-bridges": 45,
    invisalign: 45,
    braces: 45,
    "dental-implants": 45,
    "all-on-4": 60,
    "bone-grafting": 45,
    "wisdom-tooth-removal": 45,
    extractions: 30,
    "pediatric-dentistry": 30,
    "full-mouth-rehabilitation": 60,
  };
  return durations[slug] ?? 30;
}
