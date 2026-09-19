import { apiSuccess, withApiHandler } from "@/lib/api";
import { ValidationError } from "@/lib/errors";
import { clientKeyFromHeaders } from "@/lib/rate-limit";
import { formatClinicDate, formatClinicTime } from "@/lib/time";
import { confirmBookingSchema } from "@/lib/validation/booking";
import { verifyOtp } from "@/server/auth/otp";
import { bookAppointment } from "@/server/booking/service";

export const dynamic = "force-dynamic";

interface PendingBooking {
  fullName: string;
  phone: string;
  email: string | null;
  isNewPatient: boolean;
  serviceSlug: string;
  doctorId: string;
  startsAt: string;
  durationMinutes: number;
  patientNote: string | null;
  whatsappConsent: boolean;
  attribution: Record<string, string | undefined>;
}

/**
 * POST /api/booking/confirm
 *
 * Step two. Verifies the code and creates the appointment from the payload
 * stored on the challenge — NOT from anything the client sends now. The client
 * supplies only a phone number and a code; every detail of what gets booked
 * came from the verified step-one request.
 *
 * That separation is what stops a caller from passing verification for a
 * cheap consultation slot and then swapping in a different doctor or time.
 */
export const POST = withApiHandler(async (request) => {
  const clientKey = clientKeyFromHeaders(request.headers);
  const body = await request.json();
  const input = confirmBookingSchema.parse(body);

  const verification = await verifyOtp(input.phone, input.code, "BOOKING_VERIFICATION");

  const pending = verification.payload as unknown as PendingBooking | null;
  if (!pending) {
    throw new ValidationError("That booking session has expired. Please start again.");
  }

  // Defence in depth: the payload was written by us, but a mismatch here would
  // mean the challenge was tampered with.
  if (pending.phone !== verification.destination) {
    throw new ValidationError("That booking session is not valid. Please start again.");
  }

  const result = await bookAppointment({
    fullName: pending.fullName,
    phone: pending.phone,
    email: pending.email,
    isNewPatient: pending.isNewPatient,
    serviceSlug: pending.serviceSlug,
    doctorId: pending.doctorId,
    startsAt: new Date(pending.startsAt),
    durationMinutes: pending.durationMinutes,
    patientNote: pending.patientNote,
    channel: "WEBSITE",
    consents: { whatsapp: pending.whatsappConsent },
    attribution: {
      utmSource: pending.attribution?.utmSource ?? null,
      utmMedium: pending.attribution?.utmMedium ?? null,
      utmCampaign: pending.attribution?.utmCampaign ?? null,
      utmContent: pending.attribution?.utmContent ?? null,
      utmTerm: pending.attribution?.utmTerm ?? null,
      landingPage: pending.attribution?.landingPage ?? null,
      referrerUrl: pending.attribution?.referrer ?? null,
      gclid: pending.attribution?.gclid ?? null,
    },
    actor: {
      label: pending.fullName,
      ipAddress: clientKey,
      userAgent: request.headers.get("user-agent"),
    },
  });

  return apiSuccess({
    reference: result.reference,
    status: result.status,
    startsAt: result.startsAt.toISOString(),
    dateLabel: formatClinicDate(result.startsAt),
    timeLabel: formatClinicTime(result.startsAt),
  });
});
