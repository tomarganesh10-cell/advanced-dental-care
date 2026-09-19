import type { NotificationChannel } from "@/lib/db";

/**
 * Built-in message templates.
 *
 * These are seeded into `notification_templates`, where the clinic can edit the
 * wording without a deploy. Code references a template by KEY, never by text,
 * so an edit in admin takes effect everywhere.
 *
 * WhatsApp note: business-initiated messages outside the 24-hour customer
 * service window must use a template Meta has approved, and the approved name
 * goes in `providerTemplateName`. Editing the body here does NOT re-approve it
 * with Meta — the two have to be kept in step, which is why the admin editor
 * warns on templates that carry a provider name.
 */

export const TEMPLATE_KEYS = {
  OTP_VERIFICATION: "otp.verification",
  APPOINTMENT_REQUESTED: "appointment.requested",
  APPOINTMENT_CONFIRMED: "appointment.confirmed",
  APPOINTMENT_REMINDER_24H: "appointment.reminder_24h",
  APPOINTMENT_REMINDER_2H: "appointment.reminder_2h",
  APPOINTMENT_RESCHEDULED: "appointment.rescheduled",
  APPOINTMENT_CANCELLED: "appointment.cancelled",
  APPOINTMENT_FOLLOW_UP: "appointment.follow_up",
  FEEDBACK_REQUEST: "feedback.request",
  PAYMENT_RECEIPT: "payment.receipt",
  INVOICE_ISSUED: "invoice.issued",
  LEAD_ACKNOWLEDGEMENT: "lead.acknowledgement",
  LEAD_FOLLOW_UP_1: "lead.follow_up_1",
  LEAD_FOLLOW_UP_3: "lead.follow_up_3",
  LEAD_FOLLOW_UP_7: "lead.follow_up_7",
  INTERNATIONAL_ACKNOWLEDGEMENT: "international.acknowledgement",
  STAFF_PASSWORD_RESET: "staff.password_reset",
} as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[keyof typeof TEMPLATE_KEYS];

export interface TemplateSeed {
  key: TemplateKey;
  channel: NotificationChannel;
  language: string;
  subject?: string;
  body: string;
  variables: string[];
  description: string;
  /** Meta-approved template name, once the clinic has one. */
  providerTemplateName?: string;
}

const CLINIC = "Advanced Dental Care Centre";

export const DEFAULT_TEMPLATES: TemplateSeed[] = [
  {
    key: TEMPLATE_KEYS.OTP_VERIFICATION,
    channel: "WHATSAPP",
    language: "en",
    body: `{{code}} is your verification code for ${CLINIC}. It expires in {{minutes}} minutes. Do not share this code with anyone.`,
    variables: ["code", "minutes"],
    description: "One-time code for patient login and booking verification.",
  },
  {
    key: TEMPLATE_KEYS.OTP_VERIFICATION,
    channel: "SMS",
    language: "en",
    body: `{{code}} is your ${CLINIC} verification code. Valid for {{minutes}} minutes. Do not share it.`,
    variables: ["code", "minutes"],
    description: "SMS fallback for the verification code.",
  },
  {
    key: TEMPLATE_KEYS.APPOINTMENT_REQUESTED,
    channel: "WHATSAPP",
    language: "en",
    body: `Hello {{patientName}}, we have received your appointment request at ${CLINIC}.

Reference: {{reference}}
Requested: {{dateTime}}
Treatment: {{treatment}}

Our team will confirm shortly. If you need to change anything, reply here or call {{clinicPhone}}.`,
    variables: ["patientName", "reference", "dateTime", "treatment", "clinicPhone"],
    description: "Sent the moment a booking request is submitted.",
  },
  {
    key: TEMPLATE_KEYS.APPOINTMENT_CONFIRMED,
    channel: "WHATSAPP",
    language: "en",
    body: `Your appointment at ${CLINIC} is confirmed.

Date: {{date}}
Time: {{time}}
Doctor: {{doctorName}}
Treatment: {{treatment}}
Reference: {{reference}}

{{clinicAddress}}

Please arrive 10 minutes early. To reschedule, call {{clinicPhone}}.`,
    variables: [
      "date",
      "time",
      "doctorName",
      "treatment",
      "reference",
      "clinicAddress",
      "clinicPhone",
    ],
    description: "Sent when staff confirm a requested appointment.",
  },
  {
    key: TEMPLATE_KEYS.APPOINTMENT_CONFIRMED,
    channel: "EMAIL",
    language: "en",
    subject: "Your appointment on {{date}} is confirmed",
    body: `Dear {{patientName}},

Your appointment at ${CLINIC} is confirmed.

Date: {{date}}
Time: {{time}}
Doctor: {{doctorName}}
Treatment: {{treatment}}
Reference: {{reference}}

Where to find us:
{{clinicAddress}}

Please arrive about 10 minutes before your appointment. If you need to reschedule, call {{clinicPhone}} or reply to this email.

{{clinicName}}`,
    variables: [
      "patientName",
      "date",
      "time",
      "doctorName",
      "treatment",
      "reference",
      "clinicAddress",
      "clinicPhone",
      "clinicName",
    ],
    description: "Email version of the confirmation.",
  },
  {
    key: TEMPLATE_KEYS.APPOINTMENT_REMINDER_24H,
    channel: "WHATSAPP",
    language: "en",
    body: `Reminder: your dental appointment at ${CLINIC} is tomorrow.

{{date}} at {{time}}
Doctor: {{doctorName}}

{{clinicAddress}}

If you cannot make it, please let us know on {{clinicPhone}} so we can offer the slot to someone else.`,
    variables: ["date", "time", "doctorName", "clinicAddress", "clinicPhone"],
    description: "Sent 24 hours before the appointment.",
  },
  {
    key: TEMPLATE_KEYS.APPOINTMENT_REMINDER_2H,
    channel: "WHATSAPP",
    language: "en",
    body: `Your appointment at ${CLINIC} is at {{time}} today with {{doctorName}}. See you shortly.

{{clinicAddress}}`,
    variables: ["time", "doctorName", "clinicAddress"],
    description: "Sent 2 hours before the appointment.",
  },
  {
    key: TEMPLATE_KEYS.APPOINTMENT_RESCHEDULED,
    channel: "WHATSAPP",
    language: "en",
    body: `Your appointment at ${CLINIC} has been moved.

New date: {{date}}
New time: {{time}}
Doctor: {{doctorName}}
Reference: {{reference}}

If this does not suit you, call {{clinicPhone}}.`,
    variables: ["date", "time", "doctorName", "reference", "clinicPhone"],
    description: "Sent when an appointment is rescheduled.",
  },
  {
    key: TEMPLATE_KEYS.APPOINTMENT_CANCELLED,
    channel: "WHATSAPP",
    language: "en",
    body: `Your appointment at ${CLINIC} on {{date}} at {{time}} has been cancelled.

To book another time, call {{clinicPhone}} or visit {{bookingUrl}}.`,
    variables: ["date", "time", "clinicPhone", "bookingUrl"],
    description: "Sent on cancellation, by either side.",
  },
  {
    key: TEMPLATE_KEYS.FEEDBACK_REQUEST,
    channel: "WHATSAPP",
    language: "en",
    body: `Thank you for visiting ${CLINIC}, {{patientName}}.

How was your experience? It takes under a minute to tell us: {{feedbackUrl}}

Your feedback helps us improve.`,
    variables: ["patientName", "feedbackUrl"],
    description: "Sent after a completed appointment.",
  },
  {
    key: TEMPLATE_KEYS.PAYMENT_RECEIPT,
    channel: "WHATSAPP",
    language: "en",
    body: `Payment received — thank you.

Amount: {{amount}}
Reference: {{reference}}
Date: {{date}}

Your receipt is available in your patient portal: {{portalUrl}}`,
    variables: ["amount", "reference", "date", "portalUrl"],
    description: "Sent when a payment is verified server-side.",
  },
  {
    key: TEMPLATE_KEYS.INVOICE_ISSUED,
    channel: "EMAIL",
    language: "en",
    subject: "Invoice {{invoiceNumber}} from {{clinicName}}",
    body: `Dear {{patientName}},

Invoice {{invoiceNumber}} for {{amount}} is now available.

You can view and pay it in your patient portal: {{portalUrl}}

{{clinicName}}`,
    variables: ["patientName", "invoiceNumber", "amount", "portalUrl", "clinicName"],
    description: "Sent when an invoice is issued.",
  },
  {
    key: TEMPLATE_KEYS.LEAD_ACKNOWLEDGEMENT,
    channel: "WHATSAPP",
    language: "en",
    body: `Hello {{name}}, thank you for contacting ${CLINIC} about {{treatment}}.

A member of our team will be in touch shortly. If it is urgent, call {{clinicPhone}}.`,
    variables: ["name", "treatment", "clinicPhone"],
    description: "Immediate acknowledgement of a website enquiry.",
  },
  {
    key: TEMPLATE_KEYS.LEAD_FOLLOW_UP_1,
    channel: "WHATSAPP",
    language: "en",
    body: `Hello {{name}}, following up on your enquiry about {{treatment}} at ${CLINIC}.

Would you like help finding a consultation time? Reply here, or book online: {{bookingUrl}}

Reply STOP to stop these messages.`,
    variables: ["name", "treatment", "bookingUrl"],
    description: "Day 1 follow-up for an enquiry that has not booked.",
  },
  {
    key: TEMPLATE_KEYS.LEAD_FOLLOW_UP_3,
    channel: "WHATSAPP",
    language: "en",
    body: `Hello {{name}}, here is some information about {{treatment}} that may help: {{infoUrl}}

If you have questions, reply here or call {{clinicPhone}}.

Reply STOP to stop these messages.`,
    variables: ["name", "treatment", "infoUrl", "clinicPhone"],
    description: "Day 3 informational follow-up.",
  },
  {
    key: TEMPLATE_KEYS.LEAD_FOLLOW_UP_7,
    channel: "WHATSAPP",
    language: "en",
    body: `Hello {{name}}, would you like us to arrange your consultation at ${CLINIC}?

Book online: {{bookingUrl}} or call {{clinicPhone}}.

This is our last message about this enquiry unless you reply.`,
    variables: ["name", "bookingUrl", "clinicPhone"],
    description: "Day 7 final follow-up. The sequence stops here by design.",
  },
  {
    key: TEMPLATE_KEYS.INTERNATIONAL_ACKNOWLEDGEMENT,
    channel: "EMAIL",
    language: "en",
    subject: "Your enquiry to {{clinicName}}",
    body: `Dear {{name}},

Thank you for contacting {{clinicName}} from {{country}} about {{treatment}}.

To prepare a treatment plan we will usually ask for:
- any recent dental X-rays or CBCT scans you have
- photographs of the area that concerns you
- a note of any medical conditions and medications

You can reply to this email with those, or send them on WhatsApp: {{whatsappUrl}}

We will then arrange an online consultation at a time that suits your timezone.

Please note that any treatment plan prepared before an in-person examination is
provisional and may change once you are seen at the clinic.

{{clinicName}}
{{clinicAddress}}`,
    variables: ["name", "country", "treatment", "whatsappUrl", "clinicName", "clinicAddress"],
    description: "Acknowledgement for an international patient enquiry.",
  },
  {
    key: TEMPLATE_KEYS.STAFF_PASSWORD_RESET,
    channel: "EMAIL",
    language: "en",
    subject: "Reset your {{clinicName}} staff password",
    body: `A password reset was requested for your staff account.

Reset link (valid for 30 minutes): {{resetUrl}}

If you did not request this, you can ignore this email — your password has not changed. If you receive several of these, tell your clinic administrator.`,
    variables: ["resetUrl", "clinicName"],
    description: "Staff password reset email.",
  },
];

/** Substitutes {{variable}} placeholders. Missing variables render as empty. */
export function renderTemplate(body: string, variables: Record<string, string | number | undefined>): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, name: string) => {
    const value = variables[name];
    return value === undefined || value === null ? "" : String(value);
  });
}

/** Names referenced in a body but not supplied — surfaced in the admin editor. */
export function missingVariables(
  body: string,
  variables: Record<string, unknown>,
): string[] {
  const used = [...body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1] as string);
  return [...new Set(used)].filter((name) => variables[name] === undefined);
}
