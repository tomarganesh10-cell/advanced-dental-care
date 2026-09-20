import { z } from "zod";
import { phoneSchema } from "@/lib/phone";
import { BOOKABLE_SERVICES } from "@data/services";

/**
 * Booking request validation.
 *
 * Shared by the client form and the API route so the two cannot drift. Every
 * field is validated server-side regardless of what the client checked — the
 * client-side pass exists for the error message, not for safety.
 */

const bookableSlugs = BOOKABLE_SERVICES.map((s) => s.slug) as [string, ...string[]];

export const nameSchema = z
  .string()
  .trim()
  .min(2, "Please enter your full name.")
  .max(120, "That name is too long.")
  // Allows the range of names actually seen in Chandigarh, including
  // Devanagari and Gurmukhi, while rejecting obvious injection payloads.
  .regex(/^[\p{L}\p{M}\s.'\-]+$/u, "Please use letters only.");

export const emailSchema = z
  .email("Enter a valid email address.")
  .max(254)
  .transform((v) => v.toLowerCase().trim());

export const attributionSchema = z
  .object({
    utmSource: z.string().max(120).optional(),
    utmMedium: z.string().max(120).optional(),
    utmCampaign: z.string().max(200).optional(),
    utmContent: z.string().max(200).optional(),
    utmTerm: z.string().max(200).optional(),
    gclid: z.string().max(200).optional(),
    landingPage: z.string().max(500).optional(),
    referrer: z.string().max(500).optional(),
  })
  .partial()
  .optional();

/** Step 1: request a verification code for the booking. */
export const startBookingSchema = z.object({
  fullName: nameSchema,
  phone: phoneSchema,
  email: emailSchema.optional().or(z.literal("")),
  isNewPatient: z.boolean(),
  serviceSlug: z.enum(bookableSlugs),
  doctorId: z.uuid("Please choose a dentist."),
  startsAt: z.iso.datetime({ message: "Please choose an appointment time." }),
  durationMinutes: z.number().int().min(10).max(480),
  patientNote: z.string().trim().max(1000).optional().or(z.literal("")),
  whatsappConsent: z.boolean().default(false),
  attribution: attributionSchema,
});

export type StartBookingInput = z.infer<typeof startBookingSchema>;

/** Step 2: confirm with the code. */
export const confirmBookingSchema = z.object({
  phone: phoneSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code."),
});

export type ConfirmBookingInput = z.infer<typeof confirmBookingSchema>;

export const availabilityQuerySchema = z.object({
  date: z.iso.date("Choose a valid date."),
  serviceSlug: z.string().max(80).optional(),
  doctorId: z.uuid().optional(),
});

export const contactEnquirySchema = z.object({
  fullName: nameSchema,
  phone: phoneSchema,
  email: emailSchema.optional().or(z.literal("")),
  /** The "I want to…" selector on the contact page. */
  intent: z.enum([
    "book-appointment",
    "dental-implants",
    "smile-makeover",
    "braces-aligners",
    "root-canal",
    "general",
    "international",
  ]),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
  whatsappConsent: z.boolean().default(false),
  attribution: attributionSchema,
  /**
   * Honeypot. A real user never sees or fills this; a naive bot fills every
   * field it finds. Cheap, and it does not punish people using screen readers
   * the way a CAPTCHA does (the field is aria-hidden and off-screen).
   */
  company: z.string().max(0, "").optional(),
});

export type ContactEnquiryInput = z.infer<typeof contactEnquirySchema>;

export const internationalEnquirySchema = z.object({
  fullName: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  whatsapp: phoneSchema.optional(),
  country: z
    .string()
    .trim()
    .min(2, "Please tell us which country you are travelling from.")
    .max(80),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  timezone: z.string().max(60).optional(),
  treatmentInterest: z
    .string()
    .trim()
    .min(2, "Please tell us what treatment you are asking about.")
    .max(200),
  serviceSlug: z.string().max(80).optional(),
  message: z.string().trim().max(3000).optional().or(z.literal("")),
  preferredTravelFrom: z.iso.date().optional().or(z.literal("")),
  preferredTravelTo: z.iso.date().optional().or(z.literal("")),
  consentToContact: z.literal(true, {
    message: "Please confirm we may contact you about your enquiry.",
  }),
  company: z.string().max(0, "").optional(),
});

export type InternationalEnquiryInput = z.infer<typeof internationalEnquirySchema>;
