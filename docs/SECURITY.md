# Security

This application holds dental records, radiographs, clinical photographs and
payment data. This document states what is protected, how, and — as importantly
— what is **not** claimed.

## What this system does not claim

**It is not HIPAA compliant.** HIPAA is a United States framework that does not
apply to an Indian dental practice, and claiming it would be a false statement
of regulatory status rather than a reassurance. The controls below are designed
against India's Digital Personal Data Protection Act 2023 and ordinary clinical
record-keeping obligations.

**It has not been penetration tested.** The controls are considered and tested,
but no third party has attacked this system. Before handling significant patient
volume, commission one.

**No system is perfectly secure.** Where this document says a control exists, it
exists and is tested. It does not say the system cannot be breached.

---

## Threat model

Ranked by likelihood × harm for a clinic of this size.

| #   | Threat                                 | Control                                                                                                                                      |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | One patient sees another's records     | Portal queries scope on the session's patient id **inside the query**; no portal function accepts a caller-supplied id. 13 integration tests |
| 2   | Staff access records beyond their role | Permissions enforced in the query layer, so restricted data is absent from the object rather than hidden in the UI                           |
| 3   | Radiographs or photographs leak        | Private bucket, unguessable UUID keys, short-lived signed URLs minted only after an ownership check, access logged                           |
| 4   | Booking spam or diary flooding         | OTP verification before any write; per-IP, per-destination and cooldown limits                                                               |
| 5   | Payment fraud                          | Server-side HMAC verification **and** an independent fetch from Razorpay confirming capture and amount                                       |
| 6   | Credential stuffing                    | Per-IP and per-account limits, time-boxed lockout, uniform failure responses                                                                 |
| 7   | Account enumeration                    | Login, patient OTP and document endpoints respond identically for existing and non-existing subjects                                         |
| 8   | Malicious upload                       | Type allowlist plus magic-byte verification; everything served `Content-Disposition: attachment`                                             |
| 9   | Stored XSS via admin content           | Markdown rendered without raw HTML passthrough; JSON-LD escapes `<`                                                                          |
| 10  | Insider misuse                         | Every record view, export and download is audited with actor, time and IP                                                                    |

---

## Authentication

**Staff** — email and password. Argon2id at the OWASP floor (19 MiB, t=2, p=1).
Passwords are never logged; `src/lib/logger.ts` redacts them structurally.

Login failures are uniform. A missing account is compared against a real dummy
hash so the timing matches a wrong password, and a deactivated account returns
the same message as a wrong password — a former employee cannot confirm their
account still exists.

Lockout is time-boxed at 15 minutes rather than permanent. A permanent lockout
needs a human to clear it, which in a small clinic means the one administrator
who is on leave.

**Patients** — OTP to the registered mobile, no password. Patients use the
portal three times a year; they would reuse a password, forget it, and the reset
flow would become the weakest link. The number is already verified at booking.

**MFA** — enrolment is modelled. An account with MFA enrolled **cannot complete
login** until the TOTP step ships. Failing closed is the only honest option: an
MFA step that can be skipped is worse than none, because it looks like
protection.

## Sessions

Opaque random tokens stored server-side, hashed with SHA-256. Not JWTs.

The trade-off is one database read per request. What it buys is instant
revocation — a stolen staff session can be killed immediately, which a
self-contained signed token cannot do without a revocation list that costs the
same read.

Each user carries a `sessionEpoch`. Incrementing it invalidates every session
that user holds at once, which is what a password change or "sign out
everywhere" does.

Cookies: `httpOnly`, `sameSite=lax`, `secure` in production, with an explicit
expiry. `lax` still allows the return journey from Razorpay and from an emailed
link while blocking cross-site POSTs.

## One-time passwords

Six digits is only 10^6, so the safety comes from the controls, not the code:

- 5-minute expiry
- 5 attempts, after which even the correct code is refused
- single use, consumed by a compare-and-set so two concurrent requests with the
  same code cannot both succeed
- the hash is bound to the destination, so a code issued for one number cannot
  be replayed against another
- per-destination, per-IP and cooldown rate limits

> **A bug worth recording.** The attempt counter was originally incremented
> inside the same transaction that threw on a wrong code — so the throw rolled
> the increment back, the counter never moved, and an attacker had unlimited
> guesses. Found by `tests/integration/otp.test.ts`. The counter is now written
> outside any transaction that rejects.

## Authorisation

Permissions are `resource:action` strings. Resolution order, strictest first:

1. `SUPER_ADMIN` → everything
2. An explicit **DENY** grant → denied, regardless of role
3. An explicit ALLOW grant (not expired) → allowed
4. The role default

Deny-beats-allow means a capability can be removed from one person without
inventing a new role for them.

The boundaries that matter most:

- **Reception cannot read clinical notes.** They handle the most walk-up traffic
  and have the least clinical need.
- **Marketing has no patient access at all.** A lead is a marketing object; a
  patient is a medical one.
- **Doctors have no financial authority.** They can see that an invoice exists,
  not alter or refund it.
- **Assistants can read the clinical record but not author it,** and cannot read
  another clinician's private notes.

## Patient documents

- Bucket is **private**. There is no public URL for any patient document.
- Keys are `patients/{uuid}/{kind}/{uuid}.ext` — knowing one tells you nothing
  about any other.
- Downloads go through `/api/portal/documents/[id]`, which checks the session,
  confirms ownership, logs the access, and then mints a URL valid for 120
  seconds.
- Uploads validated by declared type **and** magic bytes (including DICOM's
  offset-128 signature). A `.jpg` that is actually HTML is a stored-XSS payload.
- Everything stored with `Content-Disposition: attachment` and AES-256
  server-side encryption.
- "Not yours" and "does not exist" both return 404.

## Payments

A payment reaches `SUCCESS` only when **both** hold:

1. the HMAC over `order_id|payment_id` verifies against our secret, and
2. the payment is fetched back from Razorpay and confirmed `captured` for the
   expected amount.

Step 2 is not redundant: a valid signature proves the ids came from a real
Razorpay flow, not that money was captured for the right amount.

`verifiedAt` is the source of truth. Reporting queries filter on it rather than
on `status`, so a row that somehow reached `SUCCESS` without verification could
never be counted as revenue.

The webhook verifies the **raw body** before parsing — parsing and re-serialising
changes the bytes and breaks the signature. It is idempotent against replays and
returns 200 for unhandled events, because a non-2xx makes Razorpay retry
forever.

## Transport and headers

Set in `next.config.ts` and `src/middleware.ts`:

- HSTS with `includeSubDomains; preload`
- CSP per request with a script nonce and `strict-dynamic`
- `X-Frame-Options: DENY` and `frame-ancestors 'none'`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` denying camera and microphone
- `no-store` and `X-Robots-Tag: noindex` on `/admin`, `/patient-dashboard` and `/api`

`style-src` allows `unsafe-inline` because Next inlines critical CSS. That is a
style relaxation, not a script one — inline styles cannot execute.

## Audit logging

Every record view, export, download, permission change and financial action is
recorded with actor, role, action, entity, timestamp, IP and user agent.

Two rules the rest of the codebase depends on:

1. **A failed audit write never fails the operation being audited.** Refusing to
   check a patient in because the audit table is full would be worse than a gap
   in the trail — and the gap is itself logged.
2. **Clinical content never goes into the audit table.** The trail records that
   a diagnosis changed and by whom, not what it said. Copying note text there
   would create a second, less-protected copy of the record. Enforced by a
   field denylist in `src/server/audit.ts`.

## Secrets

All configuration comes from the environment and is validated at boot by
`src/lib/env.ts`. In production the app **refuses to start** with:

- a placeholder or short `AUTH_SECRET`
- an `http://` site URL (session cookies are Secure-only)
- `OTP_DEV_ECHO` enabled (it logs one-time codes)
- a Razorpay key without its secret or webhook secret
- a storage bucket without credentials

These run at server boot, not at build time, so CI can build an image without
production secrets. `SKIP_ENV_VALIDATION=1` affects the build only and has no
effect at runtime.

## Reporting a vulnerability

Email the clinic at the address in `data/clinic-master-data.ts`. Please allow a
reasonable period before disclosure.
