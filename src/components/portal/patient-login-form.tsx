"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Loader2, LogIn, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { contact } from "@data/clinic-master-data";

/**
 * Patient portal sign-in.
 *
 * OTP to the registered mobile, no password. The number is already verified at
 * booking and is already how the clinic reaches the patient, so a password
 * would add a credential to forget and reset without adding security.
 *
 * Note the deliberate lack of an "account not found" state: the API responds
 * identically for a registered and an unregistered number, because telling a
 * stranger that a given mobile belongs to a dental patient is disclosure.
 */
export function PatientLoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [masked, setMasked] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(event?: React.FormEvent) {
    event?.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/patient-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });

      const json = (await response.json()) as {
        ok: boolean;
        data?: { maskedDestination: string; devCode?: string };
        error?: { message: string };
      };

      if (!json.ok || !json.data) {
        setError(json.error?.message ?? "We could not send a code. Please try again.");
        return;
      }

      setMasked(json.data.maskedDestination);
      setDevCode(json.data.devCode ?? null);
      setStep("code");
    } catch {
      setError("We could not reach the clinic's system. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/patient-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });

      const json = (await response.json()) as { ok: boolean; error?: { message: string } };

      if (!json.ok) {
        setError(json.error?.message ?? "That code was not accepted.");
        return;
      }

      router.push("/patient-dashboard");
      router.refresh();
    } catch {
      setError("We could not sign you in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="rounded-[--radius-card] border border-[--color-hairline] bg-white p-7 shadow-[--shadow-subtle] md:p-8">
        <div className="flex size-11 items-center justify-center rounded-xl bg-[--color-medical-50] text-[--color-action]">
          {step === "phone" ? (
            <Smartphone className="size-5" aria-hidden="true" />
          ) : (
            <ShieldCheck className="size-5" aria-hidden="true" />
          )}
        </div>

        <h1 className="mt-5 text-2xl">
          {step === "phone" ? "Patient login" : "Enter your code"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[--color-ink-subtle]">
          {step === "phone"
            ? "Sign in with the mobile number registered at the clinic. We will send you a 6-digit code — no password needed."
            : `We sent a 6-digit code to ${masked}. It expires in a few minutes.`}
        </p>

        {step === "phone" ? (
          <form onSubmit={sendCode} className="mt-6 space-y-4" noValidate>
            <Field label="Mobile number" htmlFor="phone" required>
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                autoFocus
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="98551 23236"
              />
            </Field>

            {error ? (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {error}
              </p>
            ) : null}

            <Button type="submit" size="lg" full disabled={submitting || phone.trim().length < 6}>
              {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <LogIn aria-hidden="true" />}
              Send me a code
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-6 space-y-4" noValidate>
            <Field label="Verification code" htmlFor="code" required>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="text-center text-xl tracking-[0.5em] tabular-nums"
                placeholder="000000"
              />
            </Field>

            {devCode ? (
              <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                <strong>Development mode:</strong> your code is {devCode}.
              </p>
            ) : null}

            {error ? (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {error}
              </p>
            ) : null}

            <Button type="submit" size="lg" full disabled={submitting || code.length !== 6}>
              {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Sign in
            </Button>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => {
                  setStep("phone");
                  setCode("");
                  setError(null);
                }}
                className="inline-flex items-center gap-1 text-[--color-ink-subtle] hover:text-[--color-ink]"
              >
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                Change number
              </button>

              <button
                type="button"
                onClick={() => void sendCode()}
                disabled={submitting}
                className="font-medium text-[--color-action] hover:underline"
              >
                Resend code
              </button>
            </div>
          </form>
        )}
      </div>

      <p className="mt-5 text-center text-sm text-[--color-ink-subtle]">
        Trouble signing in? Call the clinic on{" "}
        <a href={`tel:${contact.phone.e164}`} className="font-medium text-[--color-action]">
          {contact.phone.display}
        </a>
        .
      </p>
    </div>
  );
}
