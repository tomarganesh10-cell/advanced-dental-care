# Build status

An honest account of what works, what is partial and what has not been built.

Last updated: 2026-09-19

---

## Verified working

These have been exercised against a running application and a real database,
not just compiled.

| Feature                       | Evidence                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Public website, all routes    | 46 routes build and render; typecheck and lint clean                                                                |
| Slot availability engine      | 22 integration tests: schedules, capacity, holidays, half-days, time off, lead time                                 |
| Booking, end to end           | Exercised live: availability → OTP → confirm → appointment + patient + lead + consent + queued notifications        |
| Double-booking prevention     | Three concurrent bookings for one slot → exactly one appointment, two clean conflict errors                         |
| OTP issue/verify              | 13 integration tests: expiry, attempt limits, single use, destination binding, purpose binding                      |
| Patient isolation             | 13 integration tests covering cross-patient access, document IDOR, and the clinical/administrative permission split |
| Payment verification          | 22 tests: signature forgery, order substitution, webhook replay, amount mismatch, invoice settlement                |
| Patient number allocation     | Gapless and unique under 25-way concurrency, including first-ever allocation                                        |
| RBAC matrix                   | 21 unit tests pinning every role boundary                                                                           |
| Content verification workflow | Claims cannot be marked verified without recorded evidence                                                          |
| Attendance                    | Check-in/out, lateness against the staff member's own shift, audited adjustments                                    |

---

## Working, but not yet connected to a live service

Complete code paths that run against a `console` provider until the clinic
supplies credentials. They are not stubs — the full pipeline (queueing, consent
checks, retries, delivery status, suppression) runs; only the final transmission
is logged instead of sent.

| Feature            | What is needed                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| WhatsApp messaging | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, and Meta-approved templates. See [WHATSAPP.md](WHATSAPP.md) |
| Email              | `EMAIL_PROVIDER=resend` and an API key                                                                    |
| SMS                | MSG91 credentials                                                                                         |
| Razorpay payments  | Live key, secret and webhook secret. The full verification path is implemented and tested                 |
| Document storage   | An S3-compatible **private** bucket and credentials                                                       |
| Google rating      | `GOOGLE_PLACES_API_KEY` and `GOOGLE_PLACE_ID`. Without them the site shows no rating at all, deliberately |
| Maps               | `NEXT_PUBLIC_GOOGLE_MAPS_KEY` (the keyless embed works as a fallback)                                     |

---

## Partial

| Feature          | What exists                                                                   | What is missing                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Doctor dashboard | Today's list scoped to the doctor, full clinical record view                  | Authoring clinical notes and prescriptions from the UI. The data model, permissions and audit trail are in place; the forms are not |
| Treatment plans  | Model, portal display, admin listing                                          | Creating and editing a plan from the admin UI                                                                                       |
| Invoicing        | Model, portal display, payment settlement, gapless numbering design           | Creating an invoice from the admin UI; PDF generation                                                                               |
| Smile gallery    | Consent-gated public display, categories, filtering                           | Admin upload and consent capture UI                                                                                                 |
| Blog             | Public listing and article pages with medical-review attribution              | Admin authoring UI                                                                                                                  |
| Staff management | Listing, roles, permission model                                              | Creating and editing staff from the UI                                                                                              |
| Reports          | Dashboard aggregates, lead source performance                                 | Date-range filtering and CSV export beyond attendance                                                                               |
| MFA              | Enrolment is modelled, and an account with MFA enrolled cannot complete login | The TOTP verification step itself. Deliberately fails closed rather than silently skipping the factor                               |

---

## Not started

- Two-way WhatsApp (inbound patient messages into an admin inbox)
- Lab work tracking
- Inventory
- Recall campaigns (six-month check-up reminders)
- Multi-location support — the model assumes one clinic
- Patient-facing rescheduling (a deliberate choice; see [PATIENT_PORTAL.md](PATIENT_PORTAL.md))
- Automated accessibility and Lighthouse runs in CI

---

## Known limitations

**Rate limiting falls back to in-process memory when Redis is unavailable.**
Correct for a single instance; behind more than one it is bypassable by
reconnecting. Set `REDIS_URL` in production.

**The Google Places rating is cached for six hours.** A rating change is not
immediately reflected. That is the right trade-off against per-request API cost,
but it should be stated rather than discovered.

**Invoice numbering is designed to be gapless but is not yet exercised under
concurrency** the way patient numbering is — the invoice creation UI does not
exist yet, so the path is untested. Do not put it into production billing
without an integration test mirroring `tests/integration/references.test.ts`.

**Soft deletes are not enforced at the database level.** Application queries
filter on `deletedAt`, but a direct SQL query would see deleted rows. This is
intentional for clinical records, which must remain recoverable, but it means
any new query must remember the filter.

**The seed creates doctors with empty qualifications.** This is deliberate —
qualifications are verified claims and must be entered with evidence, not
invented by a script. The doctor profile pages will say so until they are.
