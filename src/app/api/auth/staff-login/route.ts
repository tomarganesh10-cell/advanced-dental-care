import { z } from "zod";
import { apiSuccess, withApiHandler } from "@/lib/api";
import { clientKeyFromHeaders } from "@/lib/rate-limit";
import { loginStaff } from "@/server/auth/login";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.email("Enter your work email address."),
  password: z.string().min(1, "Enter your password."),
});

export const POST = withApiHandler(async (request) => {
  const body = await request.json();
  const input = schema.parse(body);

  const result = await loginStaff({
    email: input.email,
    password: input.password,
    ipAddress: clientKeyFromHeaders(request.headers),
    userAgent: request.headers.get("user-agent"),
  });

  return apiSuccess({
    signedIn: !result.requiresMfa,
    requiresMfa: result.requiresMfa,
    fullName: result.fullName,
    role: result.role,
  });
});
