import pino from "pino";
import { env, isProduction } from "./env";

/**
 * Structured logging.
 *
 * `redact` is not cosmetic here: this application handles patient data, and a
 * log line containing an OTP, a session token or a medical note is a breach.
 * Anything added to a log context must be assumed to be persisted somewhere.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "password",
      "passwordHash",
      "*.password",
      "*.passwordHash",
      "otp",
      "code",
      "codeHash",
      "*.otp",
      "*.code",
      "token",
      "tokenHash",
      "*.token",
      "*.tokenHash",
      "authorization",
      "cookie",
      "req.headers.authorization",
      "req.headers.cookie",
      "gatewaySignature",
      "mfaSecret",
      "privateNote",
      "diagnosis",
      "chiefComplaint",
      "allergies",
      "medicalConditions",
    ],
    censor: "[redacted]",
  },
  ...(isProduction
    ? {}
    : { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } } }),
});

/** Child logger bound to a request id, so one request's lines can be grouped. */
export function requestLogger(requestId: string, extra: Record<string, unknown> = {}) {
  return logger.child({ requestId, ...extra });
}
