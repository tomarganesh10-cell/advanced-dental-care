import { apiSuccess, withApiHandler } from "@/lib/api";
import { prisma } from "@/lib/db";
import { env, isProduction } from "@/lib/env";
import { logger } from "@/lib/logger";
import { clientKeyFromHeaders } from "@/lib/rate-limit";
import { phoneSchema } from "@/lib/phone";
import { issueOtp } from "@/server/auth/otp";
import { queueNotification } from "@/server/notifications/dispatch";
import { TEMPLATE_KEYS } from "@/server/notifications/templates";
import { z } from "zod";

export const dynamic = "force-dynamic";

const schema = z.object({ phone: phoneSchema });

/**
 * POST /api/auth/patient-otp
 *
 * Sends a login code to a patient's registered mobile.
 *
 * Responds identically whether or not the number belongs to a patient. A
 * response that distinguished the two would turn this endpoint into a way to
 * check whether a given person is a patient of this clinic — which is itself
 * health information about them.
 */
export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const input = schema.parse(body);
  const clientKey = clientKeyFromHeaders(request.headers);

  const patient = await prisma.patient.findFirst({
    where: { phone: input.phone, deletedAt: null },
    select: { id: true },
  });

  if (!patient) {
    logger.info({ clientKey }, "patient OTP requested for unknown number");
    // The rate limiter still counts this attempt, so the endpoint cannot be
    // used to enumerate numbers cheaply.
    return apiSuccess({
      sent: true,
      maskedDestination: maskPhone(input.phone),
      expiresInSeconds: env.OTP_TTL_SECONDS,
    });
  }

  const otp = await issueOtp({
    destination: input.phone,
    purpose: "PATIENT_LOGIN",
    ipAddress: clientKey,
  });

  await queueNotification({
    templateKey: TEMPLATE_KEYS.OTP_VERIFICATION,
    channel: "WHATSAPP",
    recipient: input.phone,
    variables: { code: otp.code, minutes: Math.round(env.OTP_TTL_SECONDS / 60) },
    patientId: patient.id,
  });

  await queueNotification({
    templateKey: TEMPLATE_KEYS.OTP_VERIFICATION,
    channel: "SMS",
    recipient: input.phone,
    variables: { code: otp.code, minutes: Math.round(env.OTP_TTL_SECONDS / 60) },
    patientId: patient.id,
  });

  return apiSuccess({
    sent: true,
    maskedDestination: maskPhone(input.phone),
    expiresInSeconds: env.OTP_TTL_SECONDS,
    ...(otp.devCode && !isProduction ? { devCode: otp.devCode } : {}),
  });
});

function maskPhone(e164: string): string {
  return `•••••• ${e164.slice(-4)}`;
}
