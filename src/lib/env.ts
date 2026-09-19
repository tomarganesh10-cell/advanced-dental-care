import { z } from "zod";

/**
 * Environment validation.
 *
 * Parsed once at module load. A production boot with a missing or placeholder
 * secret fails loudly here rather than failing quietly at the first request —
 * an app that silently runs with `AUTH_SECRET` unset is an app with forgeable
 * sessions.
 */

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const int = (def: number) =>
  z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === "") return def;
      const n = typeof v === "number" ? v : Number.parseInt(v, 10);
      return Number.isFinite(n) ? n : def;
    });

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  TEST_DATABASE_URL: optionalString,
  REDIS_URL: optionalString,

  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  AUTH_STAFF_SESSION_TTL: int(8 * 60 * 60),
  AUTH_PATIENT_SESSION_TTL: int(7 * 24 * 60 * 60),
  AUTH_REQUIRE_STAFF_MFA: bool.default(false),

  OTP_TTL_SECONDS: int(300),
  OTP_MAX_ATTEMPTS: int(5),
  OTP_RESEND_COOLDOWN_SECONDS: int(60),
  OTP_DEV_ECHO: bool.default(false),

  WHATSAPP_PROVIDER: z.enum(["meta", "console", "disabled"]).default("console"),
  WHATSAPP_TOKEN: optionalString,
  WHATSAPP_PHONE_NUMBER_ID: optionalString,
  WHATSAPP_BUSINESS_ACCOUNT_ID: optionalString,
  WHATSAPP_API_VERSION: z.string().default("v21.0"),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: optionalString,
  WHATSAPP_APP_SECRET: optionalString,

  EMAIL_PROVIDER: z.enum(["resend", "smtp", "console", "disabled"]).default("console"),
  EMAIL_FROM: z.string().default("Advanced Dental Care Centre <noreply@localhost>"),
  EMAIL_PROVIDER_KEY: optionalString,
  SMTP_HOST: optionalString,
  SMTP_PORT: int(587),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,

  SMS_PROVIDER: z.enum(["msg91", "console", "disabled"]).default("console"),
  SMS_PROVIDER_KEY: optionalString,
  SMS_SENDER_ID: optionalString,

  NEXT_PUBLIC_RAZORPAY_KEY_ID: optionalString,
  RAZORPAY_KEY_SECRET: optionalString,
  RAZORPAY_WEBHOOK_SECRET: optionalString,
  CONSULTATION_FEE_PAISE: int(0),

  STORAGE_ENDPOINT: optionalString,
  STORAGE_REGION: z.string().default("ap-south-1"),
  STORAGE_BUCKET: optionalString,
  STORAGE_ACCESS_KEY: optionalString,
  STORAGE_SECRET_KEY: optionalString,
  STORAGE_FORCE_PATH_STYLE: bool.default(false),
  STORAGE_SIGNED_URL_TTL: int(300),

  NEXT_PUBLIC_GOOGLE_MAPS_KEY: optionalString,
  GOOGLE_PLACES_API_KEY: optionalString,
  GOOGLE_PLACE_ID: optionalString,
  GOOGLE_PLACES_CACHE_TTL: int(21600),

  NEXT_PUBLIC_GA_ID: optionalString,
  NEXT_PUBLIC_GTM_ID: optionalString,
  GOOGLE_SITE_VERIFICATION: optionalString,

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  SENTRY_DSN: optionalString,

  RATE_LIMIT_BOOKING_PER_HOUR: int(10),
  RATE_LIMIT_OTP_PER_HOUR: int(8),
  RATE_LIMIT_LOGIN_PER_15MIN: int(10),

  SEED_ADMIN_EMAIL: z.string().default("admin@example.com"),
  SEED_ADMIN_PASSWORD: optionalString,
});

export type Env = z.infer<typeof schema>;

/** Values that are obviously placeholders and must never reach production. */
const PLACEHOLDER_PATTERNS = [/change-?me/i, /replace-?with/i, /your-?secret/i, /^dev-only/i, /xxxx/i];

function looksLikePlaceholder(value: string | undefined): boolean {
  if (!value) return false;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(value));
}

function parseEnv(): Env {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill in the required values.`,
    );
  }

  const env = parsed.data;

  if (env.NODE_ENV === "production") {
    const problems: string[] = [];

    if (looksLikePlaceholder(env.AUTH_SECRET) || Buffer.from(env.AUTH_SECRET).length < 32) {
      problems.push("AUTH_SECRET is a placeholder or too short. Generate one: openssl rand -base64 48");
    }
    if (env.NEXT_PUBLIC_SITE_URL.startsWith("http://")) {
      problems.push("NEXT_PUBLIC_SITE_URL must be https in production — session cookies are Secure-only.");
    }
    if (env.OTP_DEV_ECHO) {
      problems.push("OTP_DEV_ECHO must be false in production. It logs one-time codes.");
    }
    if (env.WHATSAPP_PROVIDER === "meta" && !(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID)) {
      problems.push("WHATSAPP_PROVIDER=meta requires WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID.");
    }
    if (env.NEXT_PUBLIC_RAZORPAY_KEY_ID && !env.RAZORPAY_KEY_SECRET) {
      problems.push("RAZORPAY_KEY_SECRET is required whenever a Razorpay key ID is configured.");
    }
    if (env.NEXT_PUBLIC_RAZORPAY_KEY_ID && !env.RAZORPAY_WEBHOOK_SECRET) {
      problems.push(
        "RAZORPAY_WEBHOOK_SECRET is required — without it, webhook payloads cannot be authenticated.",
      );
    }
    if (env.STORAGE_BUCKET && !(env.STORAGE_ACCESS_KEY && env.STORAGE_SECRET_KEY)) {
      problems.push("STORAGE_BUCKET is set but storage credentials are missing.");
    }

    if (problems.length > 0) {
      throw new Error(`Refusing to start in production:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    }
  }

  return env;
}

export const env: Env = parseEnv();

export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";

/** True when a feature's configuration is complete enough to use it. */
export const features = {
  whatsapp: env.WHATSAPP_PROVIDER !== "disabled",
  email: env.EMAIL_PROVIDER !== "disabled",
  sms: env.SMS_PROVIDER !== "disabled",
  payments: Boolean(env.NEXT_PUBLIC_RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET),
  storage: Boolean(env.STORAGE_BUCKET && env.STORAGE_ACCESS_KEY && env.STORAGE_SECRET_KEY),
  googleReviews: Boolean(env.GOOGLE_PLACES_API_KEY && env.GOOGLE_PLACE_ID),
  maps: Boolean(env.NEXT_PUBLIC_GOOGLE_MAPS_KEY),
  analytics: Boolean(env.NEXT_PUBLIC_GA_ID || env.NEXT_PUBLIC_GTM_ID),
  redis: Boolean(env.REDIS_URL),
} as const;
