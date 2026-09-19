import { apiSuccess, withApiHandler } from "@/lib/api";
import { env, isProduction } from "@/lib/env";
import { RateLimitError, SlotUnavailableError } from "@/lib/errors";
import { clientKeyFromHeaders, rateLimit } from "@/lib/rate-limit";
import { startBookingSchema } from "@/lib/validation/booking";
import { checkSlotBookable } from "@/server/booking/availability";
import { issueOtp } from "@/server/auth/otp";
import { queueNotification } from "@/server/notifications/dispatch";
import { TEMPLATE_KEYS } from "@/server/notifications/templates";
import { durationForService } from "@/app/api/availability/route";

export const dynamic = "force-dynamic";

/**
 * POST /api/booking/start
 *
 * Step one of the two-step booking. Validates the request, confirms the slot is
 * still free, then sends a verification code. NOTHING is written to the
 * appointments table here.
 *
 * Why verify before booking rather than after: an unverified booking endpoint
 * is a free way to fill a clinic's diary with fake appointments from a script.
 * The OTP ties the booking to a working phone, which is also the number
 * reception will call if anything changes.
 *
 * The pending booking is carried inside the OTP challenge payload, server-side,
 * so the client cannot alter the slot or the treatment between the two steps.
 */
export const POST = withApiHandler(async (request) => {
  const clientKey = clientKeyFromHeaders(request.headers);

  const limit = await rateLimit(`booking:start:${clientKey}`, env.RATE_LIMIT_BOOKING_PER_HOUR, 3600);
  if (!limit.allowed) {
    throw new RateLimitError(
      limit.retryAfterSeconds,
      "Too many booking attempts. Please try again later, or call the clinic.",
    );
  }

  const body = await request.json();
  const input = startBookingSchema.parse(body);

  const startsAt = new Date(input.startsAt);
  // Duration is derived from the treatment server-side; the submitted value is
  // only a hint and is not trusted.
  const durationMinutes = durationForService(input.serviceSlug);
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);

  const slotCheck = await checkSlotBookable({
    doctorId: input.doctorId,
    startsAt,
    endsAt,
    serviceSlug: input.serviceSlug,
  });

  if (!slotCheck.ok) throw new SlotUnavailableError(slotCheck.reason);

  const otp = await issueOtp({
    destination: input.phone,
    purpose: "BOOKING_VERIFICATION",
    ipAddress: clientKey,
    payload: {
      fullName: input.fullName,
      phone: input.phone,
      email: input.email || null,
      isNewPatient: input.isNewPatient,
      serviceSlug: input.serviceSlug,
      doctorId: input.doctorId,
      startsAt: startsAt.toISOString(),
      durationMinutes,
      patientNote: input.patientNote || null,
      whatsappConsent: input.whatsappConsent,
      attribution: input.attribution ?? {},
    },
  });

  await queueNotification({
    templateKey: TEMPLATE_KEYS.OTP_VERIFICATION,
    channel: "WHATSAPP",
    recipient: input.phone,
    variables: { code: otp.code, minutes: Math.round(env.OTP_TTL_SECONDS / 60) },
  });

  // SMS as a fallback: a patient without WhatsApp still needs to be able to
  // book, and WhatsApp template approval can lapse.
  await queueNotification({
    templateKey: TEMPLATE_KEYS.OTP_VERIFICATION,
    channel: "SMS",
    recipient: input.phone,
    variables: { code: otp.code, minutes: Math.round(env.OTP_TTL_SECONDS / 60) },
  });

  return apiSuccess({
    challengeIssued: true,
    expiresAt: otp.expiresAt.toISOString(),
    // The masked number lets the UI say "sent to ••••• 3236" without the client
    // having to hold the full number.
    maskedDestination: maskPhone(input.phone),
    // Development only — env.ts refuses to boot production with OTP_DEV_ECHO on.
    ...(otp.devCode && !isProduction ? { devCode: otp.devCode } : {}),
  });
});

function maskPhone(e164: string): string {
  const tail = e164.slice(-4);
  return `•••••• ${tail}`;
}
