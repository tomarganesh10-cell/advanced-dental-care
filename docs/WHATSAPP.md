# WhatsApp, email and SMS

## Current state

`WHATSAPP_PROVIDER=console` by default. Messages are logged rather than sent.

This is not a stub. The full pipeline runs — queueing inside the business
transaction, consent checks, dedupe, scheduled reminders, retry classification,
delivery status, suppression — and only the final transmission is a log line.
That means the whole flow can be tested and demonstrated before Meta approves a
single template, and switching to live is one environment variable.

## Going live with WhatsApp

WhatsApp Business is not an API you can simply call. Sequence:

1. **Meta Business account** verified for the clinic.
2. **WhatsApp Business Account (WABA)** with the clinic's number. The number
   cannot already be registered to a personal WhatsApp account — if the clinic
   uses this number on a phone, that has to be resolved first, and it usually
   surprises people.
3. **Message templates submitted and approved.** Business-initiated messages
   outside the 24-hour customer-service window must use an approved template.
   Approval takes anywhere from minutes to days.
4. Set `WHATSAPP_PROVIDER=meta`, `WHATSAPP_TOKEN`,
   `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`.
5. Record each approved template name against its row in
   **Admin → Messages → Templates** (`providerTemplateName`).

### Templates to submit

| Key                        | Category       | Purpose                 |
| -------------------------- | -------------- | ----------------------- |
| `otp.verification`         | Authentication | Login and booking codes |
| `appointment.requested`    | Utility        | Booking acknowledgement |
| `appointment.confirmed`    | Utility        | Confirmation            |
| `appointment.reminder_24h` | Utility        | Day-before reminder     |
| `appointment.reminder_2h`  | Utility        | Same-day reminder       |
| `appointment.rescheduled`  | Utility        | Change of time          |
| `appointment.cancelled`    | Utility        | Cancellation            |
| `payment.receipt`          | Utility        | Payment receipt         |
| `feedback.request`         | Utility        | Post-visit feedback     |
| `lead.follow_up_1/3/7`     | Marketing      | Enquiry follow-up       |

Submit appointment messages as **Utility**, not Marketing. Utility templates are
cheaper, are less likely to be rejected, and are the correct category — a
reminder about an appointment the patient booked is a service message.

> **Keeping templates in step.** Editing a template body in the admin panel does
> **not** re-approve it with Meta. If the text diverges from the approved
> version, sends will fail. The admin editor warns on any template carrying a
> `providerTemplateName`.

## Consent

WhatsApp and SMS require explicit opt-in, checked in `isSuppressed()` before
anything is queued. A message without consent is written as `SUPPRESSED` with
the reason rather than silently dropped, so the gap is visible.

Transactional **email** about the patient's own appointment does not require
marketing consent — it is the service they asked for.

Opt-out: replying STOP, or reception clearing the consent. Either revokes the
consent record, which suppresses future messages on that channel. It does not
affect treatment, and the site says so.

## Not spamming people

Deliberate limits:

- **The enquiry follow-up sequence is three messages over seven days, then it
  stops.** A sequence that runs until the person replies is why people block
  clinic numbers, and Meta will suspend a business account for it.
- Any reply, booking or status change cancels the remaining messages
  (`cancelLeadFollowUps`).
- Reminders are deduped, so re-confirming an appointment does not double-send.
- Reminders scheduled for a time already in the past are skipped — an
  appointment booked for tomorrow morning is already inside the 24-hour window,
  and sending that reminder immediately is noise.

## The outbox

Queue rows are written **inside** the business transaction; a worker sends them.
If the booking rolls back, nothing was queued — the clinic never tells a patient
about an appointment that does not exist.

The worker distinguishes retryable from permanent failures. A 4xx other than 429
means the message itself is wrong; retrying burns quota and blocks the queue
behind it. Timeouts and 5xx retry with backoff at 2, 10 and 60 minutes.

```bash
npm run worker
```

**Without the worker running, nothing is ever sent.** See `docs/DEPLOYMENT.md`.

## Inbound webhooks

`/api/whatsapp/webhook` (delivery receipts) verifies
`X-Hub-Signature-256` against `WHATSAPP_APP_SECRET`. Without that check, anyone
who learns the callback URL can post fake delivery receipts — or fake inbound
patient messages.

## Costs

Meta charges per conversation, not per message, in 24-hour windows by category.
Authentication and Utility are cheaper than Marketing. At a few hundred
appointments a month this is small, but it is a real per-patient cost and worth
knowing before enabling the marketing sequence.

## Email

`EMAIL_PROVIDER=resend` with `EMAIL_PROVIDER_KEY`.

Before launch, set up SPF, DKIM and DMARC for the sending domain. Without them,
appointment confirmations land in spam, and the clinic concludes the system is
broken when it is the DNS.

> The clinic's current contact address is a yahoo.com address. It cannot be
> authenticated for sending and is a weak trust signal on a redesigned site.
> Moving to `appointments@chandigarhdentist.com` is recommended before launch.

## SMS

MSG91, as an authentication fallback. A patient without WhatsApp still needs to
be able to book, and template approval can lapse. India requires DLT
registration of sender IDs and templates — allow time for it.
