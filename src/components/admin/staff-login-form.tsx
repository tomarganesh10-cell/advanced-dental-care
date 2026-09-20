"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { KeyRound, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function StaffLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/staff-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const json = (await response.json()) as {
        ok: boolean;
        data?: { signedIn: boolean; requiresMfa: boolean };
        error?: { message: string };
      };

      if (!json.ok || !json.data) {
        setError(json.error?.message ?? "We could not sign you in.");
        return;
      }

      if (json.data.requiresMfa) {
        // The account has a second factor enrolled. Rather than letting login
        // through, we stop here — a half-implemented MFA step that can be
        // skipped is worse than no MFA, because it looks like protection.
        setMfaRequired(true);
        return;
      }

      // Redirect target is validated as a same-site path, so `?next=` cannot be
      // used to bounce a signed-in staff member to an external site.
      const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/admin";
      router.push(target);
      router.refresh();
    } catch {
      setError("We could not reach the system. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (mfaRequired) {
    return (
      <div className="w-full max-w-md rounded-(--radius-card) border border-amber-200 bg-amber-50 p-7">
        <Lock className="size-6 text-amber-700" aria-hidden="true" />
        <h1 className="mt-4 text-xl text-amber-950">Two-factor authentication required</h1>
        <p className="mt-2 text-sm leading-relaxed text-amber-900">
          This account has two-factor authentication enrolled, and the authenticator step is not yet
          available in this build. Your password was accepted but no session was created.
        </p>
        <p className="mt-3 text-sm text-amber-900">
          Ask a super administrator to complete the TOTP setup, or to temporarily disable two-factor
          on this account.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div className="rounded-(--radius-card) border border-(--color-hairline) bg-white p-7 shadow-(--shadow-subtle) md:p-8">
        <div className="flex size-11 items-center justify-center rounded-xl bg-(--color-navy-50) text-(--color-primary)">
          <KeyRound className="size-5" aria-hidden="true" />
        </div>

        <h1 className="mt-5 text-2xl">Staff sign in</h1>
        <p className="mt-2 text-sm text-(--color-ink-subtle)">
          For clinic staff only. Patients should use the{" "}
          <Link
            href="/patient-login"
            className="font-medium text-(--color-action) underline underline-offset-2"
          >
            patient login
          </Link>
          .
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <Field label="Work email" htmlFor="email" required>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          <Field label="Password" htmlFor="password" required>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" variant="secondary" full disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            Sign in
          </Button>
        </form>

        <p className="mt-5 border-t border-(--color-hairline) pt-4 text-xs leading-relaxed text-(--color-ink-subtle)">
          This system holds patient health records. Access is logged. Do not share your password or
          leave this device signed in where others can use it.
        </p>
      </div>
    </div>
  );
}
