import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Messaging provider abstraction.
 *
 * Every channel has a `console` implementation that logs instead of sending.
 * That is not a stub standing in for missing work — it is the configuration the
 * clinic runs on until Meta approves their WhatsApp templates, and it lets the
 * whole notification pipeline (outbox, retries, delivery status, suppression)
 * be exercised end to end before a single real message goes out.
 *
 * Credentials come from the environment only. Nothing here is hardcoded.
 */

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
  /** True when retrying could plausibly succeed (timeout, 5xx, rate limit). */
  retryable?: boolean;
}

export interface WhatsAppMessage {
  to: string;
  body: string;
  /** Meta-approved template name, required outside the 24h service window. */
  templateName?: string;
  templateLanguage?: string;
  templateVariables?: string[];
}

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
}

export interface SmsMessage {
  to: string;
  body: string;
}

// --- WhatsApp ---------------------------------------------------------------

async function sendWhatsAppViaMeta(message: WhatsAppMessage): Promise<SendResult> {
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    return { ok: false, error: "WhatsApp is not configured", retryable: false };
  }

  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  // A template message is required for business-initiated conversations. Free
  // text only works inside the 24-hour window after the patient messages us.
  const payload = message.templateName
    ? {
        messaging_product: "whatsapp",
        to: message.to.replace(/\D/g, ""),
        type: "template",
        template: {
          name: message.templateName,
          language: { code: message.templateLanguage ?? "en" },
          components: message.templateVariables?.length
            ? [
                {
                  type: "body",
                  parameters: message.templateVariables.map((text) => ({ type: "text", text })),
                },
              ]
            : undefined,
        },
      }
    : {
        messaging_product: "whatsapp",
        to: message.to.replace(/\D/g, ""),
        type: "text",
        text: { preview_url: false, body: message.body },
      };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    const json = (await response.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string; code?: number };
    };

    if (!response.ok) {
      return {
        ok: false,
        error: json.error?.message ?? `WhatsApp API returned ${response.status}`,
        // 4xx other than 429 means the message itself is wrong; retrying will
        // fail identically and just burn quota.
        retryable: response.status === 429 || response.status >= 500,
      };
    }

    return { ok: true, providerMessageId: json.messages?.[0]?.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message, retryable: true };
  }
}

export async function sendWhatsApp(message: WhatsAppMessage): Promise<SendResult> {
  switch (env.WHATSAPP_PROVIDER) {
    case "meta":
      return sendWhatsAppViaMeta(message);
    case "console":
      logger.info({ channel: "whatsapp", to: message.to, body: message.body }, "WhatsApp (console)");
      return { ok: true, providerMessageId: `console-${Date.now()}` };
    case "disabled":
    default:
      return { ok: false, error: "WhatsApp is disabled", retryable: false };
  }
}

/**
 * Verifies the X-Hub-Signature-256 header on an inbound Meta webhook.
 * Without this, anyone who learns the callback URL can post fake delivery
 * receipts — or worse, fake inbound patient messages.
 */
export function verifyWhatsAppSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!env.WHATSAPP_APP_SECRET || !signatureHeader) return false;

  const expected = `sha256=${createHmac("sha256", env.WHATSAPP_APP_SECRET).update(rawBody).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// --- Email ------------------------------------------------------------------

async function sendEmailViaResend(message: EmailMessage): Promise<SendResult> {
  if (!env.EMAIL_PROVIDER_KEY) {
    return { ok: false, error: "Email provider key is not configured", retryable: false };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.EMAIL_PROVIDER_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.body,
        reply_to: message.replyTo,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const json = (await response.json().catch(() => ({}))) as { id?: string; message?: string };

    if (!response.ok) {
      return {
        ok: false,
        error: json.message ?? `Email API returned ${response.status}`,
        retryable: response.status === 429 || response.status >= 500,
      };
    }

    return { ok: true, providerMessageId: json.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message, retryable: true };
  }
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  switch (env.EMAIL_PROVIDER) {
    case "resend":
      return sendEmailViaResend(message);
    case "smtp":
      // Intentionally not implemented: the clinic uses a hosted provider.
      // Wiring nodemailer here is a contained change if that ever changes.
      return { ok: false, error: "SMTP transport is not configured", retryable: false };
    case "console":
      logger.info(
        { channel: "email", to: message.to, subject: message.subject, body: message.body },
        "Email (console)",
      );
      return { ok: true, providerMessageId: `console-${Date.now()}` };
    case "disabled":
    default:
      return { ok: false, error: "Email is disabled", retryable: false };
  }
}

// --- SMS --------------------------------------------------------------------

async function sendSmsViaMsg91(message: SmsMessage): Promise<SendResult> {
  if (!env.SMS_PROVIDER_KEY) {
    return { ok: false, error: "SMS provider key is not configured", retryable: false };
  }

  try {
    const response = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: { authkey: env.SMS_PROVIDER_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: env.SMS_SENDER_ID,
        short_url: "0",
        recipients: [{ mobiles: message.to.replace(/\D/g, ""), body: message.body }],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return {
        ok: false,
        error: `SMS API returned ${response.status}`,
        retryable: response.status === 429 || response.status >= 500,
      };
    }

    const json = (await response.json().catch(() => ({}))) as { request_id?: string };
    return { ok: true, providerMessageId: json.request_id };
  } catch (err) {
    return { ok: false, error: (err as Error).message, retryable: true };
  }
}

export async function sendSms(message: SmsMessage): Promise<SendResult> {
  switch (env.SMS_PROVIDER) {
    case "msg91":
      return sendSmsViaMsg91(message);
    case "console":
      logger.info({ channel: "sms", to: message.to, body: message.body }, "SMS (console)");
      return { ok: true, providerMessageId: `console-${Date.now()}` };
    case "disabled":
    default:
      return { ok: false, error: "SMS is disabled", retryable: false };
  }
}
