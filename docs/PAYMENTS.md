# Payments

Razorpay, because UPI is how people in India actually pay.

## The rule

**The client never decides that a payment succeeded.**

The browser receives a payment id and a signature from Razorpay's checkout and
posts them back. Those values are attacker-controllable — anyone can POST
whatever they like to the callback. A payment is marked `SUCCESS` only after
**both**:

1. the HMAC over `order_id|payment_id` verifies against our secret, **and**
2. the payment is fetched back from Razorpay's API and confirmed `captured` for
   the expected amount.

Step 2 is not redundant. A valid signature proves the ids came from a real
Razorpay flow; it does not prove money was captured, or captured for the right
amount.

## Flow

```
Patient clicks Pay
  │
  ├─ POST /api/payments/create
  │    └─ session → patientId  (never from the request body)
  │       amount read from the INVOICE server-side
  │       Razorpay order created
  │       payments row written: status CREATED, verifiedAt NULL
  │
  ├─ Razorpay checkout opens in the browser
  │
  ├─ POST /api/payments/verify   ← untrusted input
  │    ├─ verify HMAC signature ────────── fail → status FAILED, audited
  │    ├─ fetch payment from Razorpay ──── not captured → FAILED
  │    ├─ compare amount ────────────────── mismatch → FAILED
  │    └─ all pass → SUCCESS, verifiedAt set, invoice settled, receipt queued
  │
  └─ POST /api/payments/webhook  ← safety net
       verify raw-body HMAC, then reconcile idempotently
```

## Why `verifiedAt` exists separately from `status`

`verifiedAt` is the source of truth. Reporting queries filter on
`verifiedAt IS NOT NULL` rather than on `status = 'SUCCESS'`, so a row that
somehow reached `SUCCESS` without server-side verification could never be
counted as revenue. A row with `SUCCESS` and a null `verifiedAt` is, by
construction, a bug — and one that shows up as missing revenue rather than
phantom revenue.

## The webhook is not optional

The patient's browser can close before the callback fires. The money has left
their account and, without the webhook, nobody at the clinic would know.

Three things the handler gets deliberately right:

1. **Verifies the raw body before parsing.** Parsing and re-serialising changes
   the bytes and breaks the signature.
2. **Idempotent.** Razorpay retries until it gets a 2xx, so the same event
   arrives repeatedly; reconcile checks `verifiedAt` and no-ops. This is also
   what makes a replayed capture harmless.
3. **Returns 200 for unhandled events.** A non-2xx makes Razorpay retry forever,
   so an unrecognised event type would become a permanent retry loop.

Register it at `https://chandigarhdentist.com/api/payments/webhook` for
`payment.captured` and `payment.failed`, and set `RAZORPAY_WEBHOOK_SECRET` to
the secret Razorpay shows you at registration — it is **not** the API secret.

## Amounts

Integer **paise** throughout. No floats in the payment path.

The amount for an invoice payment is read from the invoice server-side. A client
cannot pay ₹1 against a ₹50,000 invoice by editing the request, because the
request's amount is ignored when an invoice is present.

Concurrent payments against one invoice read the balance **inside** the
transaction, so two settling at once cannot both compute from the same stale
starting point.

## Refunds

`createRefund` wraps the Razorpay API; `PAYMENT_REFUND` is held only by
`ACCOUNTANT` and `SUPER_ADMIN`. Refunds are audited with actor and reason.

## Testing

`tests/unit/payments.test.ts` covers signature verification: forgery, order
substitution, payment substitution, wrong secret, truncated signature, and a
body signed with the API secret instead of the webhook secret.

`tests/integration/payments.test.ts` covers the database side: forged signature
marks FAILED and never sets `verifiedAt`, webhook replay is idempotent, an
amount mismatch is refused, and invoice settlement is correct for both full and
partial payment.

Use Razorpay's test keys and their test card and UPI IDs before going live.

## Not implemented

- Invoice PDF generation
- Partial refunds from the admin UI (the API wrapper exists)
- Payment links sent by WhatsApp
- Subscription or instalment plans
