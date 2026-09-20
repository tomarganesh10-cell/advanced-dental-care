"use client";

import { useEffect } from "react";
import { AlertTriangle, Phone, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Root error boundary.
 *
 * Shows the digest, not the message. Next generates a digest for server errors
 * and keeps the detail server-side; surfacing the digest lets a patient quote a
 * reference to reception without the page leaking a stack trace.
 *
 * Whatever has broken, the phone number still works — which for a clinic is the
 * more important fallback.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled application error", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-20 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-red-100">
        <AlertTriangle className="size-7 text-red-700" aria-hidden="true" />
      </div>

      <h1 className="mt-5 text-2xl md:text-3xl">Something went wrong</h1>
      <p className="mt-3 max-w-md text-[--color-ink-muted]">
        This is a problem at our end, not yours. Try again — and if you were booking an appointment,
        please call us so it does not get missed.
      </p>

      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Button onClick={reset} size="lg">
          <RotateCw aria-hidden="true" />
          Try again
        </Button>
        <Button asChild variant="outline" size="lg">
          <a href="tel:+919855123236">
            <Phone aria-hidden="true" />
            Call the clinic
          </a>
        </Button>
      </div>

      {error.digest ? (
        <p className="mt-8 text-xs text-[--color-ink-subtle]">
          Reference for our team: <code className="font-mono">{error.digest}</code>
        </p>
      ) : null}
    </div>
  );
}
