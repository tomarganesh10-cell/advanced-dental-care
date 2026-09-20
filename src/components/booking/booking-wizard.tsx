"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  Loader2,
  Phone,
  ShieldCheck,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckboxField, Field, Input, Textarea } from "@/components/ui/field";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { captureAttribution, trackEvent } from "@/lib/analytics";
import { useAsyncData } from "@/lib/hooks/use-async-data";
import { cn } from "@/lib/utils";
import { BOOKABLE_SERVICES } from "@data/services";
import { contact } from "@data/clinic-master-data";

/**
 * Booking wizard.
 *
 * One decision per screen. A dental booking needs treatment, dentist, date,
 * time, contact details and verification — presented as a single long form on
 * a phone that is an abandonment machine, which is why this is stepped, each
 * step fits above the fold, and progress is visible.
 *
 * Nothing is written to the database until the code is verified in step 5.
 */

type Step = 1 | 2 | 3 | 4 | 5 | 6;

interface Doctor {
  id: string;
  slug: string;
  displayName: string;
  specialties: string[];
  isVisiting: boolean;
}

interface Slot {
  startsAt: string;
  endsAt: string;
  label: string;
  doctorId: string;
  doctorName: string;
}

interface AvailabilityResponse {
  date: string;
  timezone: string;
  isClinicClosed: boolean;
  closureReason: string | null;
  durationMinutes: number;
  slots: Slot[];
}

const STEP_LABELS: Record<Step, string> = {
  1: "Treatment",
  2: "Dentist",
  3: "Date & time",
  4: "Your details",
  5: "Verify",
  6: "Booked",
};

/** Next 60 days, as clinic-local date strings. */
function upcomingDates(
  count = 60,
): Array<{ value: string; weekday: string; day: string; month: string }> {
  const formatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  const out: Array<{ value: string; weekday: string; day: string; month: string }> = [];

  for (let i = 0; i < count; i += 1) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    const parts = formatter.formatToParts(date);
    const value = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(date);
    out.push({
      value,
      weekday: parts.find((p) => p.type === "weekday")?.value ?? "",
      day: parts.find((p) => p.type === "day")?.value ?? "",
      month: parts.find((p) => p.type === "month")?.value ?? "",
    });
  }

  return out;
}

export function BookingWizard({ initialServiceSlug }: { initialServiceSlug?: string }) {
  const [step, setStep] = useState<Step>(1);

  const [serviceSlug, setServiceSlug] = useState(initialServiceSlug ?? "");
  const [doctorId, setDoctorId] = useState("");

  const dates = useMemo(() => upcomingDates(), []);
  const [selectedDate, setSelectedDate] = useState(dates[0]?.value ?? "");
  /**
   * The chosen slot, stored with a key describing the treatment, dentist and
   * date it was chosen under.
   *
   * Validity is decided by comparing that key against the current inputs, NOT
   * by looking the slot up in the currently loaded availability list. The list
   * only exists while step 3 is on screen, and an earlier version that checked
   * against it made `activeSlot` null on step 4 — so "Send verification code"
   * silently did nothing. Caught by the end-to-end test.
   */
  const [selectedSlot, setSelectedSlot] = useState<{ slot: Slot; contextKey: string } | null>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [isNewPatient, setIsNewPatient] = useState(true);
  const [patientNote, setPatientNote] = useState("");
  const [whatsappConsent, setWhatsappConsent] = useState(true);

  const [code, setCode] = useState("");
  const [maskedDestination, setMaskedDestination] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState<{
    reference: string;
    dateLabel: string;
    timeLabel: string;
    status: string;
  } | null>(null);

  const selectedService = BOOKABLE_SERVICES.find((s) => s.slug === serviceSlug);

  useEffect(() => {
    trackEvent("booking_started");
  }, []);

  // --- load dentists once a treatment is chosen -------------------------
  const doctorsQuery = useAsyncData<Doctor[]>(
    async (signal) => {
      const response = await fetch(`/api/doctors?serviceSlug=${encodeURIComponent(serviceSlug)}`, {
        signal,
      });
      const json = (await response.json()) as { ok: boolean; data?: { doctors: Doctor[] } };
      if (!json.ok || !json.data) throw new Error("Could not load dentists.");
      return json.data.doctors;
    },
    [serviceSlug],
    { enabled: Boolean(serviceSlug) },
  );

  const doctors = doctorsQuery.state.data ?? [];
  const doctorsLoading = doctorsQuery.state.status === "loading";

  // Skip the dentist step entirely when there is only one — an extra tap that
  // offers no choice is friction, not reassurance.
  const onlyDoctorId = doctors.length === 1 ? doctors[0]?.id : undefined;
  const effectiveDoctorId = doctorId || onlyDoctorId || "";
  const selectedDoctor = doctors.find((d) => d.id === effectiveDoctorId);

  // --- load slots -------------------------------------------------------
  const availabilityQuery = useAsyncData<AvailabilityResponse>(
    async (signal) => {
      const params = new URLSearchParams({ date: selectedDate, serviceSlug });
      if (effectiveDoctorId) params.set("doctorId", effectiveDoctorId);

      const response = await fetch(`/api/availability?${params.toString()}`, { signal });
      const json = (await response.json()) as {
        ok: boolean;
        data?: AvailabilityResponse;
        error?: { message: string };
      };
      if (!json.ok || !json.data) {
        throw new Error(json.error?.message ?? "Could not load available times.");
      }
      return json.data;
    },
    [selectedDate, serviceSlug, effectiveDoctorId, step],
    { enabled: step === 3 && Boolean(selectedDate && serviceSlug) },
  );

  // A slot selected for one date must not survive a change of date or dentist.
  // Validating it against the current results is a render-time derivation, so
  // it needs no effect and cannot briefly show a stale selection.
  const availability = availabilityQuery.state.data;
  const slotsLoading = availabilityQuery.state.status === "loading";
  const slotsError =
    availabilityQuery.state.status === "error" ? availabilityQuery.state.error : null;
  const loadSlots = availabilityQuery.reload;

  /** Changing any of these invalidates a slot chosen under the old values. */
  const slotContextKey = `${serviceSlug}|${effectiveDoctorId}|${selectedDate}`;

  const activeSlot =
    selectedSlot && selectedSlot.contextKey === slotContextKey ? selectedSlot.slot : null;

  // --- submit -----------------------------------------------------------
  async function handleStartBooking() {
    // Should be unreachable — Continue is disabled without a slot — but a
    // silent return here is exactly how the previous bug hid itself.
    if (!activeSlot || !selectedService) {
      setFormError("Please choose an appointment time before continuing.");
      setStep(3);
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const response = await fetch("/api/booking/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          phone,
          email: email || undefined,
          isNewPatient,
          serviceSlug,
          doctorId: activeSlot.doctorId,
          startsAt: activeSlot.startsAt,
          durationMinutes: availability?.durationMinutes ?? 30,
          patientNote: patientNote || undefined,
          whatsappConsent,
          attribution: captureAttribution(),
        }),
      });

      const json = (await response.json()) as {
        ok: boolean;
        data?: { maskedDestination: string; devCode?: string };
        error?: { message: string; details?: { fields?: Record<string, string> } };
      };

      if (!json.ok || !json.data) {
        setFormError(json.error?.message ?? "Something went wrong. Please try again.");
        setFieldErrors(json.error?.details?.fields ?? {});
        return;
      }

      setMaskedDestination(json.data.maskedDestination);
      setDevCode(json.data.devCode ?? null);
      setStep(5);
      trackEvent("booking_step_completed", { step: "details" });
    } catch {
      setFormError("We could not reach the clinic's booking service. Please try again or call us.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm() {
    setSubmitting(true);
    setFormError(null);

    try {
      const response = await fetch("/api/booking/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });

      const json = (await response.json()) as {
        ok: boolean;
        data?: { reference: string; dateLabel: string; timeLabel: string; status: string };
        error?: { message: string };
      };

      if (!json.ok || !json.data) {
        setFormError(json.error?.message ?? "That code was not accepted.");
        return;
      }

      setConfirmation(json.data);
      setStep(6);
      trackEvent("booking_completed", { treatment: serviceSlug });
    } catch {
      setFormError("We could not confirm your booking. Please try again or call the clinic.");
    } finally {
      setSubmitting(false);
    }
  }

  const canAdvance: Record<Step, boolean> = {
    1: Boolean(serviceSlug),
    /**
     * Step 2 is advanceable as soon as the list has loaded.
     *
     * "First available" is a valid choice and deliberately leaves `doctorId`
     * empty, so requiring a truthy id here left anyone taking the recommended
     * option with a permanently disabled Continue button — a dead end in the
     * middle of the booking flow. Caught by the end-to-end test.
     */
    2: !doctorsLoading,
    3: Boolean(activeSlot),
    4: fullName.trim().length >= 2 && phone.trim().length >= 6,
    5: code.length === 6,
    6: false,
  };

  return (
    <div className="mx-auto max-w-3xl">
      <ProgressBar current={step} />

      <div className="mt-8 rounded-(--radius-card) border border-(--color-hairline) bg-white p-6 shadow-(--shadow-subtle) md:p-8">
        {/* Step 1 — treatment */}
        {step === 1 ? (
          <div>
            <StepHeading
              icon={<Stethoscope className="size-5" />}
              title="What do you need to see us about?"
              description="If you are not sure, choose a general check-up — we will work it out at the examination."
            />

            <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
              {BOOKABLE_SERVICES.map((service) => (
                <button
                  key={service.slug}
                  type="button"
                  data-testid="booking-treatment"
                  data-slug={service.slug}
                  onClick={() => {
                    setServiceSlug(service.slug);
                    setDoctorId("");
                  }}
                  aria-pressed={serviceSlug === service.slug}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-colors",
                    serviceSlug === service.slug
                      ? "border-(--color-action) bg-(--color-medical-50) ring-1 ring-(--color-action)"
                      : "border-(--color-navy-200) hover:border-(--color-medical-300) hover:bg-(--color-navy-50)",
                  )}
                >
                  <span className="block text-sm font-semibold text-(--color-primary)">
                    {service.name}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-(--color-ink-subtle)">
                    {service.summary}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Step 2 — dentist */}
        {step === 2 ? (
          <div>
            <StepHeading
              icon={<UserRound className="size-5" />}
              title="Who would you like to see?"
              description="If you have no preference, choose the first available and we will assign the right clinician."
            />

            {doctorsLoading ? (
              <div className="mt-6 flex items-center gap-2 text-sm text-(--color-ink-subtle)">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Loading dentists…
              </div>
            ) : doctors.length === 0 ? (
              <EmptyState
                className="mt-6"
                title="No online availability for this treatment"
                description="Please call the clinic and we will arrange a time with you."
                action={
                  <Button asChild variant="outline">
                    <a href={`tel:${contact.phone.e164}`}>Call {contact.phone.display}</a>
                  </Button>
                }
              />
            ) : (
              <div className="mt-6 space-y-2.5">
                <button
                  type="button"
                  onClick={() => setDoctorId("")}
                  aria-pressed={doctorId === ""}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                    doctorId === ""
                      ? "border-(--color-action) bg-(--color-medical-50) ring-1 ring-(--color-action)"
                      : "border-(--color-navy-200) hover:bg-(--color-navy-50)",
                  )}
                >
                  <CalendarDays
                    className="mt-0.5 size-5 shrink-0 text-(--color-action)"
                    aria-hidden="true"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-(--color-primary)">
                      First available
                    </span>
                    <span className="mt-0.5 block text-xs text-(--color-ink-subtle)">
                      Usually the soonest appointment
                    </span>
                  </span>
                </button>

                {doctors.map((doctor) => (
                  <button
                    key={doctor.id}
                    type="button"
                    onClick={() => setDoctorId(doctor.id)}
                    aria-pressed={doctorId === doctor.id}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                      doctorId === doctor.id
                        ? "border-(--color-action) bg-(--color-medical-50) ring-1 ring-(--color-action)"
                        : "border-(--color-navy-200) hover:bg-(--color-navy-50)",
                    )}
                  >
                    <UserRound
                      className="mt-0.5 size-5 shrink-0 text-(--color-navy-400)"
                      aria-hidden="true"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-(--color-primary)">
                        {doctor.displayName}
                        {doctor.isVisiting ? (
                          <span className="ml-2 rounded-full bg-(--color-navy-100) px-2 py-0.5 text-[10px] font-medium tracking-wide text-(--color-navy-700) uppercase">
                            Visiting
                          </span>
                        ) : null}
                      </span>
                      {doctor.specialties.length > 0 ? (
                        <span className="mt-0.5 block text-xs text-(--color-ink-subtle)">
                          {doctor.specialties.join(", ")}
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* Step 3 — date & time */}
        {step === 3 ? (
          <div>
            <StepHeading
              icon={<Clock className="size-5" />}
              title="Choose a date and time"
              description="All times are Chandigarh time (IST)."
            />

            <div className="-mx-1 mt-6 overflow-x-auto pb-2">
              <div className="flex gap-2 px-1">
                {dates.slice(0, 30).map((date) => (
                  <button
                    key={date.value}
                    type="button"
                    data-testid="booking-date"
                    data-date={date.value}
                    onClick={() => setSelectedDate(date.value)}
                    aria-pressed={selectedDate === date.value}
                    className={cn(
                      "flex w-16 shrink-0 flex-col items-center gap-0.5 rounded-xl border px-2 py-3 transition-colors",
                      selectedDate === date.value
                        ? "border-(--color-action) bg-(--color-action) text-white"
                        : "border-(--color-navy-200) hover:bg-(--color-navy-50)",
                    )}
                  >
                    <span className="text-[10px] font-medium tracking-wide uppercase opacity-80">
                      {date.weekday}
                    </span>
                    <span className="text-lg leading-none font-semibold">{date.day}</span>
                    <span className="text-[10px] opacity-80">{date.month}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5">
              {slotsLoading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-(--color-ink-subtle)">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Checking availability…
                </div>
              ) : slotsError ? (
                <ErrorState
                  title="Could not load times"
                  description={slotsError}
                  onRetry={() => void loadSlots()}
                />
              ) : availability?.isClinicClosed ? (
                <EmptyState
                  title="The clinic is closed that day"
                  description={availability.closureReason ?? "Please choose another date."}
                />
              ) : availability && availability.slots.length === 0 ? (
                <EmptyState
                  title="No times left on this date"
                  description="Try another day, or call the clinic — we sometimes have slots that are not released online."
                  action={
                    <Button asChild variant="outline" size="sm">
                      <a href={`tel:${contact.phone.e164}`}>
                        <Phone aria-hidden="true" />
                        Call the clinic
                      </a>
                    </Button>
                  }
                />
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {availability?.slots.map((slot) => (
                    <button
                      key={`${slot.startsAt}-${slot.doctorId}`}
                      type="button"
                      data-testid="booking-slot"
                      onClick={() => setSelectedSlot({ slot, contextKey: slotContextKey })}
                      aria-pressed={
                        activeSlot?.startsAt === slot.startsAt &&
                        activeSlot?.doctorId === slot.doctorId
                      }
                      className={cn(
                        "rounded-lg border px-2 py-2.5 text-center transition-colors",
                        activeSlot?.startsAt === slot.startsAt &&
                          activeSlot?.doctorId === slot.doctorId
                          ? "border-(--color-action) bg-(--color-action) text-white"
                          : "border-(--color-navy-200) hover:border-(--color-medical-300) hover:bg-(--color-navy-50)",
                      )}
                    >
                      <span className="block text-sm font-semibold tabular-nums">{slot.label}</span>
                      {!doctorId ? (
                        <span className="mt-0.5 block truncate text-[10px] opacity-75">
                          {slot.doctorName}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Step 4 — details */}
        {step === 4 ? (
          <div>
            <StepHeading
              icon={<UserRound className="size-5" />}
              title="Your details"
              description="We need a working mobile number — reception will use it if anything changes."
            />

            <div className="mt-6 space-y-4">
              <div className="flex gap-2">
                {[
                  { value: true, label: "I am a new patient" },
                  { value: false, label: "I have been here before" },
                ].map((option) => (
                  <button
                    key={String(option.value)}
                    type="button"
                    onClick={() => setIsNewPatient(option.value)}
                    aria-pressed={isNewPatient === option.value}
                    className={cn(
                      "flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
                      isNewPatient === option.value
                        ? "border-(--color-action) bg-(--color-medical-50) text-(--color-action)"
                        : "border-(--color-navy-200) text-(--color-ink-muted) hover:bg-(--color-navy-50)",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <Field label="Full name" htmlFor="fullName" required error={fieldErrors.fullName}>
                <Input
                  id="fullName"
                  name="name"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.fullName)}
                  placeholder="As it should appear on your record"
                />
              </Field>

              <Field
                label="Mobile number"
                htmlFor="phone"
                required
                error={fieldErrors.phone}
                hint="We will send a 6-digit code to confirm this booking."
              >
                <Input
                  id="phone"
                  name="tel"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.phone)}
                  placeholder="98551 23236"
                />
              </Field>

              <Field
                label="Email"
                htmlFor="email"
                error={fieldErrors.email}
                hint="For your confirmation and invoice."
              >
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.email)}
                />
              </Field>

              <Field
                label="Anything we should know?"
                htmlFor="note"
                hint="Pain, swelling, anxiety about treatment, or a medication we should be aware of."
              >
                <Textarea
                  id="note"
                  value={patientNote}
                  onChange={(e) => setPatientNote(e.target.value)}
                  rows={3}
                  maxLength={1000}
                />
              </Field>

              <CheckboxField
                checked={whatsappConsent}
                onChange={(e) => setWhatsappConsent(e.target.checked)}
                label="Send my appointment confirmation and reminders on WhatsApp"
                description="You can opt out at any time by replying STOP. We do not send marketing messages without asking separately."
              />
            </div>
          </div>
        ) : null}

        {/* Step 5 — verify */}
        {step === 5 ? (
          <div>
            <StepHeading
              icon={<ShieldCheck className="size-5" />}
              title="Confirm your number"
              description={`We sent a 6-digit code to ${maskedDestination}.`}
            />

            <div className="mt-6 max-w-xs">
              <Field label="Verification code" htmlFor="code" required>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="text-center text-xl tracking-[0.5em] tabular-nums"
                  placeholder="000000"
                />
              </Field>

              {devCode ? (
                <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                  <strong>Development mode:</strong> your code is {devCode}. This is shown only
                  because OTP_DEV_ECHO is enabled outside production.
                </p>
              ) : null}
            </div>

            <p className="mt-5 text-sm text-(--color-ink-subtle)">
              Did not receive it?{" "}
              <button
                type="button"
                onClick={() => void handleStartBooking()}
                className="font-medium text-(--color-action) underline underline-offset-4"
              >
                Send a new code
              </button>{" "}
              or call{" "}
              <a href={`tel:${contact.phone.e164}`} className="font-medium text-(--color-action)">
                {contact.phone.display}
              </a>
              .
            </p>
          </div>
        ) : null}

        {/* Step 6 — done */}
        {step === 6 && confirmation ? (
          <div className="py-4 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-(--color-teal-100)">
              <CheckCircle2 className="size-7 text-(--color-teal-700)" aria-hidden="true" />
            </div>

            <h2 className="mt-5 text-2xl">Appointment requested</h2>

            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-(--color-ink-muted)">
              Reception will confirm your appointment shortly — you will get a WhatsApp message when
              they do. Until then this time is held for you.
            </p>

            <dl className="mx-auto mt-6 max-w-sm space-y-2.5 rounded-xl bg-(--color-surface-sunken) p-5 text-left text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-(--color-ink-subtle)">Reference</dt>
                <dd className="font-semibold tabular-nums">{confirmation.reference}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-(--color-ink-subtle)">Date</dt>
                <dd className="font-medium">{confirmation.dateLabel}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-(--color-ink-subtle)">Time</dt>
                <dd className="font-medium">{confirmation.timeLabel} IST</dd>
              </div>
              {selectedService ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-(--color-ink-subtle)">Treatment</dt>
                  <dd className="text-right font-medium">{selectedService.name}</dd>
                </div>
              ) : null}
              {activeSlot ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-(--color-ink-subtle)">Dentist</dt>
                  <dd className="text-right font-medium">{activeSlot.doctorName}</dd>
                </div>
              ) : null}
            </dl>

            <p className="mt-5 text-xs text-(--color-ink-subtle)">
              Please arrive about 10 minutes early. To change or cancel, call{" "}
              {contact.phone.display}.
            </p>
          </div>
        ) : null}

        {/* Error banner */}
        {formError ? (
          <p
            role="alert"
            className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-800"
          >
            {formError}
          </p>
        ) : null}

        {/* Navigation */}
        {step < 6 ? (
          <div className="mt-8 flex items-center justify-between gap-3 border-t border-(--color-hairline) pt-6">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => Math.max(1, s - 1) as Step)}
              disabled={step === 1 || submitting}
            >
              <ArrowLeft aria-hidden="true" />
              Back
            </Button>

            {step === 4 ? (
              <Button
                onClick={() => void handleStartBooking()}
                disabled={!canAdvance[4] || submitting}
                size="lg"
              >
                {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                Send verification code
              </Button>
            ) : step === 5 ? (
              <Button
                onClick={() => void handleConfirm()}
                disabled={!canAdvance[5] || submitting}
                size="lg"
              >
                {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                Confirm booking
              </Button>
            ) : (
              <Button
                onClick={() => setStep((s) => Math.min(6, s + 1) as Step)}
                disabled={!canAdvance[step]}
                size="lg"
              >
                Continue
                <ArrowRight aria-hidden="true" />
              </Button>
            )}
          </div>
        ) : null}
      </div>

      {/* Running summary, so the patient always knows what they are booking. */}
      {step > 1 && step < 6 && selectedService ? (
        <div className="mt-4 rounded-xl border border-(--color-hairline) bg-(--color-surface-sunken) px-5 py-3.5 text-sm">
          <span className="font-medium text-(--color-ink)">{selectedService.name}</span>
          {selectedDoctor ? (
            <span className="text-(--color-ink-subtle)"> · {selectedDoctor.displayName}</span>
          ) : null}
          {activeSlot ? (
            <span className="text-(--color-ink-subtle)">
              {" "}
              · {activeSlot.label} on {dates.find((d) => d.value === selectedDate)?.weekday}{" "}
              {dates.find((d) => d.value === selectedDate)?.day}{" "}
              {dates.find((d) => d.value === selectedDate)?.month}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ProgressBar({ current }: { current: Step }) {
  const steps: Step[] = [1, 2, 3, 4, 5];

  return (
    <ol className="flex items-center gap-1.5" aria-label="Booking progress">
      {steps.map((step) => (
        <li key={step} className="flex-1">
          <div
            className={cn(
              "h-1 rounded-full transition-colors",
              current >= step ? "bg-(--color-action)" : "bg-(--color-navy-200)",
            )}
          />
          <p
            className={cn(
              "mt-1.5 hidden text-[11px] font-medium sm:block",
              current >= step ? "text-(--color-action)" : "text-(--color-ink-subtle)",
            )}
          >
            {STEP_LABELS[step]}
          </p>
        </li>
      ))}
    </ol>
  );
}

function StepHeading({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3.5">
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--color-medical-50) text-(--color-action)"
        aria-hidden="true"
      >
        {icon}
      </span>
      <div>
        <h2 className="text-xl">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-(--color-ink-subtle)">{description}</p>
      </div>
    </div>
  );
}
