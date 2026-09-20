"use client";

import Script from "next/script";
import { useState } from "react";
import { CheckCircle2, CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Razorpay checkout launcher.
 *
 * What this component does NOT do is decide that a payment succeeded. Razorpay
 * hands the browser an order id, a payment id and a signature; those go
 * straight to our server, which verifies the signature and then asks Razorpay
 * directly whether the money was actually captured for the right amount. The
 * success state below is set from OUR server's answer, never from the SDK's
 * callback alone.
 *
 * That matters because everything in this file is attacker-controllable. A
 * determined user can call the handler with any values they like; the server
 * is what stops that from marking an invoice paid.
 */

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => {
      open: () => void;
      on: (event: string, handler: (response: unknown) => void) => void;
    };
  }
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { name?: string; contact?: string; email?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
  modal?: { ondismiss?: () => void };
}

export function PayInvoiceButton({
  invoiceId,
  amountLabel,
  invoiceNumber,
  patientName,
  patientPhone,
}: {
  invoiceId: string;
  amountLabel: string;
  invoiceNumber: string;
  patientName: string;
  patientPhone: string;
}) {
  const [scriptReady, setScriptReady] = useState(false);
  const [state, setState] = useState<"idle" | "starting" | "open" | "verifying" | "done" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function startPayment() {
    setState("starting");
    setError(null);

    try {
      // 1. Ask our server to create the order. The amount comes from the
      //    invoice balance server-side, not from this component.
      const createResponse = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });

      const created = (await createResponse.json()) as {
        ok: boolean;
        data?: { orderId: string; amountPaise: number; reference: string; keyId: string };
        error?: { message: string };
      };

      if (!created.ok || !created.data) {
        setError(created.error?.message ?? "We could not start the payment.");
        setState("error");
        return;
      }

      if (!window.Razorpay) {
        setError(
          "The payment window could not load. Please check your connection or pay at the clinic.",
        );
        setState("error");
        return;
      }

      // 2. Open checkout.
      setState("open");

      const checkout = new window.Razorpay({
        key: created.data.keyId,
        amount: created.data.amountPaise,
        currency: "INR",
        name: "Advanced Dental Care Centre",
        description: `Invoice ${invoiceNumber}`,
        order_id: created.data.orderId,
        prefill: { name: patientName, contact: patientPhone },
        notes: { invoiceNumber, reference: created.data.reference },
        theme: { color: "#1d53d8" },
        modal: {
          ondismiss: () => {
            // The patient closed the window. Nothing has been paid, and the
            // payment row stays CREATED for staff to see if they ask about it.
            setState("idle");
          },
        },
        handler: async (response) => {
          setState("verifying");

          // 3. Our server verifies. This is the only thing that can mark it paid.
          const verifyResponse = await fetch("/api/payments/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(response),
          });

          const verified = (await verifyResponse.json()) as {
            ok: boolean;
            data?: { status: string };
            error?: { message: string };
          };

          if (!verified.ok || verified.data?.status !== "SUCCESS") {
            setError(
              verified.error?.message ??
                "We could not confirm that payment. If money has left your account, please call the clinic with your invoice number.",
            );
            setState("error");
            return;
          }

          setState("done");
          // Reload so the invoice list reflects the settled balance from the
          // server rather than from anything this component believes.
          window.location.reload();
        },
      });

      checkout.open();
    } catch {
      setError("Something went wrong starting the payment. Please try again or pay at the clinic.");
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-(--color-teal-700)">
        <CheckCircle2 className="size-4" aria-hidden="true" />
        Payment received
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="lazyOnload"
        onLoad={() => setScriptReady(true)}
      />

      <Button
        onClick={() => void startPayment()}
        disabled={!scriptReady || state === "starting" || state === "open" || state === "verifying"}
      >
        {state === "starting" || state === "verifying" ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <CreditCard aria-hidden="true" />
        )}
        {state === "verifying" ? "Confirming payment…" : `Pay ${amountLabel}`}
      </Button>

      {error ? (
        <p role="alert" className="max-w-sm text-xs leading-relaxed text-(--color-danger)">
          {error}
        </p>
      ) : null}
    </div>
  );
}
