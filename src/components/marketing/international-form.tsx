"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckboxField, Field, Input, Select, Textarea } from "@/components/ui/field";
import { trackEvent } from "@/lib/analytics";
import { BOOKABLE_SERVICES } from "@data/services";

/**
 * International patient enquiry form.
 *
 * Asks for the timezone so the coordinator can offer a consultation slot that
 * is not the middle of the patient's night — a small thing that decides whether
 * a dental-tourism enquiry converts.
 *
 * Document upload is deliberately NOT in this first form. Asking someone to
 * upload an X-ray before they have spoken to anyone is a conversion killer, and
 * it means accepting medical images from an unauthenticated stranger. Records
 * are requested by reply, over email or WhatsApp.
 */
export function InternationalForm() {
  const [values, setValues] = useState({
    fullName: "",
    email: "",
    phone: "",
    whatsapp: "",
    country: "",
    city: "",
    treatmentInterest: "",
    serviceSlug: "",
    message: "",
    preferredTravelFrom: "",
    preferredTravelTo: "",
  });
  const [consent, setConsent] = useState(false);
  const [company, setCompany] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [reference, setReference] = useState<string | null>(null);

  function update(key: keyof typeof values) {
    return (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setValues((prev) => ({ ...prev, [key]: event.target.value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const response = await fetch("/api/international", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          whatsapp: values.whatsapp || undefined,
          serviceSlug: values.serviceSlug || undefined,
          // Resolved in the browser so the coordinator can offer a sensible
          // consultation time without asking.
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          consentToContact: consent,
          company,
        }),
      });

      const json = (await response.json()) as {
        ok: boolean;
        data?: { reference: string | null };
        error?: { message: string; details?: { fields?: Record<string, string> } };
      };

      if (!json.ok) {
        setFormError(json.error?.message ?? "We could not send your enquiry.");
        setFieldErrors(json.error?.details?.fields ?? {});
        return;
      }

      setReference(json.data?.reference ?? "received");
      trackEvent("international_enquiry", { country: values.country });
    } catch {
      setFormError("We could not reach the clinic. Please email us instead.");
    } finally {
      setSubmitting(false);
    }
  }

  if (reference) {
    return (
      <div className="rounded-(--radius-card) border border-(--color-teal-200) bg-(--color-teal-50) p-8 text-center">
        <CheckCircle2 className="mx-auto size-10 text-(--color-teal-700)" aria-hidden="true" />
        <h2 className="mt-4 text-xl">Enquiry received</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-(--color-ink-muted)">
          We have emailed you a list of the records that help us assess your case — recent X-rays or
          a CBCT scan, photographs, and your medical history. Send those back and we will arrange an
          online consultation in your timezone.
        </p>
        {reference !== "received" ? (
          <p className="mt-3 text-sm">
            Reference: <span className="font-semibold tabular-nums">{reference}</span>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="intl-name" required error={fieldErrors.fullName}>
          <Input
            id="intl-name"
            autoComplete="name"
            value={values.fullName}
            onChange={update("fullName")}
          />
        </Field>

        <Field label="Email" htmlFor="intl-email" required error={fieldErrors.email}>
          <Input
            id="intl-email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={update("email")}
          />
        </Field>

        <Field
          label="Phone"
          htmlFor="intl-phone"
          required
          error={fieldErrors.phone}
          hint="Include your country code."
        >
          <Input id="intl-phone" type="tel" value={values.phone} onChange={update("phone")} />
        </Field>

        <Field label="WhatsApp" htmlFor="intl-whatsapp" hint="If different from your phone number.">
          <Input
            id="intl-whatsapp"
            type="tel"
            value={values.whatsapp}
            onChange={update("whatsapp")}
          />
        </Field>

        <Field
          label="Country you are travelling from"
          htmlFor="intl-country"
          required
          error={fieldErrors.country}
        >
          <Input
            id="intl-country"
            autoComplete="country-name"
            value={values.country}
            onChange={update("country")}
          />
        </Field>

        <Field label="City" htmlFor="intl-city">
          <Input id="intl-city" value={values.city} onChange={update("city")} />
        </Field>
      </div>

      <Field
        label="Treatment you are asking about"
        htmlFor="intl-service"
        required
        error={fieldErrors.treatmentInterest}
      >
        <Select
          id="intl-service"
          value={values.serviceSlug}
          onChange={(e) => {
            const slug = e.target.value;
            const service = BOOKABLE_SERVICES.find((s) => s.slug === slug);
            setValues((prev) => ({
              ...prev,
              serviceSlug: slug,
              treatmentInterest: service?.name ?? prev.treatmentInterest,
            }));
          }}
        >
          <option value="">Please choose…</option>
          {BOOKABLE_SERVICES.map((service) => (
            <option key={service.slug} value={service.slug}>
              {service.name}
            </option>
          ))}
          <option value="other">Something else</option>
        </Select>
      </Field>

      {values.serviceSlug === "other" ? (
        <Field label="Please describe the treatment" htmlFor="intl-other" required>
          <Input
            id="intl-other"
            value={values.treatmentInterest}
            onChange={update("treatmentInterest")}
          />
        </Field>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Earliest travel date" htmlFor="intl-from">
          <Input
            id="intl-from"
            type="date"
            value={values.preferredTravelFrom}
            onChange={update("preferredTravelFrom")}
          />
        </Field>
        <Field label="Latest travel date" htmlFor="intl-to">
          <Input
            id="intl-to"
            type="date"
            value={values.preferredTravelTo}
            onChange={update("preferredTravelTo")}
          />
        </Field>
      </div>

      <Field
        label="Tell us about your case"
        htmlFor="intl-message"
        hint="What is troubling you, any previous treatment, and what you are hoping to achieve."
      >
        <Textarea
          id="intl-message"
          rows={4}
          maxLength={3000}
          value={values.message}
          onChange={update("message")}
        />
      </Field>

      <CheckboxField
        checked={consent}
        onChange={(e) => setConsent(e.target.checked)}
        label="You may contact me about this enquiry by email, phone or WhatsApp"
        description="Required so we can reply. We will not add you to any marketing list."
      />
      {fieldErrors.consentToContact ? (
        <p role="alert" className="text-xs font-medium text-(--color-danger)">
          {fieldErrors.consentToContact}
        </p>
      ) : null}

      <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor="intl-company">Company (leave blank)</label>
        <input
          id="intl-company"
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
        Request an international consultation
      </Button>

      <p className="text-xs leading-relaxed text-(--color-ink-subtle)">
        Any plan or estimate we prepare before examining you in person is provisional and may
        change. We will say clearly what is fixed and what is not.
      </p>
    </form>
  );
}
