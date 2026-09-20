import { z } from "zod";
import { apiSuccess, withApiHandler } from "@/lib/api";
import { UnauthorizedError } from "@/lib/errors";
import { phoneSchema } from "@/lib/phone";
import { clientKeyFromHeaders } from "@/lib/rate-limit";
import { verifyOtp } from "@/server/auth/otp";
import { completePatientLogin } from "@/server/auth/login";

export const dynamic = "force-dynamic";

const schema = z.object({
  phone: phoneSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code."),
});

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const input = schema.parse(body);

  await verifyOtp(input.phone, input.code, "PATIENT_LOGIN");

  const result = await completePatientLogin({
    phone: input.phone,
    ipAddress: clientKeyFromHeaders(request.headers),
    userAgent: request.headers.get("user-agent"),
  });

  // A verified code for a number with no patient record: the OTP endpoint
  // pretends to send for unknown numbers, so this is where that path ends.
  // It cannot actually happen — no code was issued — but the branch is
  // explicit rather than relying on that.
  if (!result) throw new UnauthorizedError("We could not find a patient record for that number.");

  return apiSuccess({ signedIn: true });
});
