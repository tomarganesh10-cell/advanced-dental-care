"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckboxField, Field, Input, Textarea } from "@/components/ui/field";
import { captureAttribution, trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * Contact form.
 *
 * Starts with "what do you want to do" rather than a blank message box. An
 * intent selector routes the enquiry to the right person in the CRM and tells
 * the patient the clinic understood what they are asking about — a generic
 * "Message" field produces generic enquiries that take three calls to qualify.
 */

const INTENTS = [
  { value: "book-appointment", label: "Book an appointment" },
  { value: "dental-implants", label: "Ask about dental implants" },
  { value: "smile-makeover", label: "Ask about a smile makeover" },
  { value: "braces-aligners", label: "Ask about braces or aligners" },
  { value: "root-canal", label: "Ask about root canal treatment" },
  { value: "general", label: "General dentistry / check-up" },
  { value: "international", label: "I am travelling from abroad" },
] as const;

export function ContactForm() {
  const [intent, setIntent] = useState<string>("book-appointment");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [whatsappConsent, setWhatsappConsent] = useState(true);
  const [company, setCompany] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [reference, setReference] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          phone,
          email: email || undefined,
          intent,
          message: message || undefined,
          whatsappConsent,
          company,
          attribution: captureAttribution(),
        }),
      });

      const json = (await response.json()) as {
        ok: boolean;
        data?: { reference: string | null };
        error?: { message: string; details?: { fields?: Record<string, string> } };
      };

      if (!json.ok) {
        setFormError(json.error?.message ?? "We could not send your enquiry. Please try again.");
        setFieldErrors(json.error?.details?.fields ?? {});
        return;
      }

      setReference(json.data?.reference ?? null);
      setDone(true);
      trackEvent("form_submitted", { form: "contact", intent });
    } catch {
      setFormError("We could not reach the clinic. Please call us instead.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-[--radius-card] border border-[--color-teal-200] bg-[--color-teal-50] p-8 text-center">
        <CheckCircle2 className="mx-auto size-10 text-[--color-teal-700]" aria-hidden="true" />
        <h2 className="mt-4 text-xl">Enquiry received</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[--color-ink-muted]">
          Someone from the clinic will be in touch. If it is urgent, please call us rather than
          waiting for a reply.
        </p>
        {reference ? (
          <p className="mt-3 text-sm">
            Your reference: <span className="font-semibold tabular-nums">{reference}</span>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <fieldset>
        <legend className="mb-3 text-sm font-medium text-[--color-ink]">I would like to…</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {INTENTS.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-xl border p-3.5 text-sm transition-colors",
                intent === option.value
                  ? "border-[--color-action] bg-[--color-medical-50] font-medium text-[--color-action]"
                  : "border-[--color-navy-200] text-[--color-ink-muted] hover:bg-[--color-navy-50]",
              )}
            >
              <input
                type="radio"
                name="intent"
                value={option.value}
                checked={intent === option.value}
                onChange={(e) => setIntent(e.target.value)}
                className="size-4 accent-[--color-action]"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="contact-name" required error={fieldErrors.fullName}>
          <Input
            id="contact-name"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            aria-invalid={Boolean(fieldErrors.fullName)}
          />
        </Field>

        <Field label="Mobile number" htmlFor="contact-phone" required error={fieldErrors.phone}>
          <Input
            id="contact-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-invalid={Boolean(fieldErrors.phone)}
          />
        </Field>
      </div>

      <Field label="Email" htmlFor="contact-email" error={fieldErrors.email}>
        <Input
          id="contact-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(fieldErrors.email)}
        />
      </Field>

      <Field
        label="How can we help?"
        htmlFor="contact-message"
        hint="Tell us what is bothering you, or what you would like to change."
      >
        <Textarea
          id="contact-message"
          rows={4}
          maxLength={2000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </Field>

      <CheckboxField
        checked={whatsappConsent}
        onChange={(e) => setWhatsappConsent(e.target.checked)}
        label="You may reply to me on WhatsApp"
        description="We will send at most three follow-up messages over a week, and stop as soon as you reply or ask us to."
      />

      {/* Honeypot — hidden from people, visible to naive bots. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor="company">Company (leave this blank)</label>
        <input
          id="company"
          name="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
      </div>

      {formError ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-800"
        >
          {formError}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={submitting} full>
        {submitting ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <Send aria-hidden="true" />
        )}
        Send enquiry
      </Button>

      <p className="text-xs leading-relaxed text-[--color-ink-subtle]">
        We use your details to answer this enquiry and, if you become a patient, to provide your
        care. We do not sell them. See our{" "}
        <Link href="/privacy-policy" className="underline underline-offset-4">
          privacy policy
        </Link>
        .
      </p>
    </form>
  );
}
