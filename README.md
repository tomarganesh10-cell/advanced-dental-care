# Advanced Dental Care Centre — clinic platform

A digital clinic platform for **Advanced Dental Care Centre**, #20 First Floor,
Sector 18-A, Chandigarh – 160018.

Not a website with a contact form. A public site, an online booking engine, a
patient portal, clinical records, a CRM, staff attendance, payments and an audit
trail — built so that a patient enquiry, a booking, a visit, an invoice and a
follow-up are one connected record rather than five disconnected ones.

---

## What is here

| Area                                                                 | State                                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Public website, SEO, structured data                                 | Working                                                                         |
| Online booking with OTP verification                                 | Working, tested under concurrency                                               |
| Appointment lifecycle and notifications                              | Working, with a transactional outbox                                            |
| Patient portal (appointments, plan, records, invoices)               | Working                                                                         |
| Admin: overview, front desk, appointments, patients, CRM, attendance | Working                                                                         |
| Content verification workflow                                        | Working                                                                         |
| Payments (Razorpay)                                                  | Working, server-verified. Needs live keys                                       |
| Document storage (S3-compatible)                                     | Working. Needs a bucket                                                         |
| WhatsApp / email / SMS                                               | Provider abstraction working; `console` by default until templates are approved |
| Doctor and reception dashboards                                      | Overview and front desk done; clinical note authoring is the main gap           |

See [`docs/STATUS.md`](docs/STATUS.md) for an honest list of what is finished,
what is partial and what has not been started.

---

## Before this goes live

**Read [`docs/CONTENT_AUDIT.md`](docs/CONTENT_AUDIT.md) first.** The existing
site publishes contradictory figures — 25 years and 18 years of experience,
20,000 and 5,000 patients treated — and technology claims (CBCT, implant
systems) that have not been evidenced.

This build will not print any of them. Clinic facts live in
[`data/clinic-master-data.ts`](data/clinic-master-data.ts) wrapped in a claim
that carries a verification status, and anything not `VERIFIED` renders as
nothing. The clinic verifies claims in **Admin → Content verification**, where a
claim cannot be marked verified without recording what evidence was seen.

One of those claims is not merely a marketing question: publishing a CBCT
capability requires a current AERB licence for the unit.

---

## Quick start

Requirements: Node 20.11+, PostgreSQL 16+, and optionally Redis.

```bash
cp .env.example .env          # fill in DATABASE_URL and AUTH_SECRET
npm install
npx prisma migrate deploy
npm run db:seed               # demo clinic: staff, doctors, patients, bookings
npm run dev
```

Then:

- Public site — <http://localhost:3000>
- Staff — <http://localhost:3000/staff-login> (`admin@example.com` / the seed password)
- Patient — <http://localhost:3000/patient-login> (`+91 90000 00001`; the OTP is printed to the server log in development)

Generate a real `AUTH_SECRET` with `openssl rand -base64 48`. The app refuses to
**start** in production with a placeholder, an http:// site URL, or OTP echoing
enabled — see [`src/lib/env.ts`](src/lib/env.ts).

---

## Commands

```bash
npm run dev               # development server
npm run build             # production build
npm run verify            # typecheck + lint + all tests

npm test                  # unit tests only (fast, no database)
npm run test:integration  # integration tests (needs TEST_DATABASE_URL)
npm run test:e2e          # Playwright

npm run prisma:migrate    # create and apply a migration
npm run db:seed           # demo data (refuses to run in production)
npm run db:reset          # drop, migrate, re-seed
npm run worker            # drain the notification outbox
```

---

## Architecture in one page

**Next.js 16 (App Router) · TypeScript · Tailwind 4 · Prisma 7 · PostgreSQL 16 ·
Redis (optional)**

A few decisions are worth knowing before reading the code, because they explain
why things are where they are:

**Booking is serialised by the database, not by application logic.** Availability
is re-checked inside a `SERIALIZABLE` transaction with the insert. Checking
availability in application code and then inserting is a textbook race, and it
is not theoretical — a clinic posting an offer gets simultaneous submissions for
the same slot. Verified by a test that fires three concurrent bookings at one
slot and asserts exactly one row exists.

**Notifications are written inside the business transaction.** Queue rows go
into `notification_messages` in the same transaction as the booking, and a
worker sends them. If the booking rolls back, no confirmation was ever queued —
so the clinic never tells a patient about an appointment that does not exist.

**Permissions are enforced in the query layer, not the template.** A role
without `CLINICAL_VIEW` receives an object with no clinical data in it, so a
future page cannot leak notes by forgetting a check. Reception can book, bill
and check in, and cannot read a diagnosis. Marketing has no patient access at
all.

**Patient portal queries never take an id from the caller.** Every function
scopes on the session's `patientId` inside the query, because the
cross-patient bug is always the same shape: a handler that reads an id from a
URL and forgets to compare it.

**Clinic facts cannot be hardcoded.** See the content audit above.

Full detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Documentation

| Document                                            | What it covers                                      |
| --------------------------------------------------- | --------------------------------------------------- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)             | System design and the reasoning behind it           |
| [DATABASE.md](docs/DATABASE.md)                     | Schema, conventions, indexes, retention             |
| [AUTH.md](docs/AUTH.md)                             | Sessions, OTP, RBAC matrix                          |
| [SECURITY.md](docs/SECURITY.md)                     | Threat model and controls                           |
| [APPOINTMENTS.md](docs/APPOINTMENTS.md)             | Slot engine and lifecycle                           |
| [PATIENT_PORTAL.md](docs/PATIENT_PORTAL.md)         | What a patient can see and why                      |
| [STAFF_ATTENDANCE.md](docs/STAFF_ATTENDANCE.md)     | Attendance, and what it deliberately does not track |
| [CRM.md](docs/CRM.md)                               | Lead pipeline and attribution                       |
| [WHATSAPP.md](docs/WHATSAPP.md)                     | Messaging providers and Meta template approval      |
| [PAYMENTS.md](docs/PAYMENTS.md)                     | Razorpay flow and verification                      |
| [SEO_MIGRATION.md](docs/SEO_MIGRATION.md)           | URL map and launch checklist                        |
| [CONTENT_AUDIT.md](docs/CONTENT_AUDIT.md)           | Every disputed claim on the old site                |
| [CONTENT_GOVERNANCE.md](docs/CONTENT_GOVERNANCE.md) | What this site may and may not claim                |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md)                 | Running it in production                            |
| [BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md)         | Backups and a restore you have actually tested      |
| [ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md)               | For clinic staff, not developers                    |
| [STATUS.md](docs/STATUS.md)                         | What is done, partial, and not started              |

---

## Testing

```bash
npm test                  # 63 unit tests, no external dependencies
npm run test:integration  # 62 integration tests against a real database
```

Integration tests use a real PostgreSQL database because what they verify —
`SERIALIZABLE` preventing a double booking, a transactional outbox rolling back
with its transaction, cascade behaviour — lives in the database. A mocked Prisma
client would pass every one of them while production double-booked.

They refuse to run unless the target database name contains `test`, because they
truncate every table.

Three real bugs were found this way and are documented in the commit history:
an OTP attempt counter rolled back by its own transaction, a patient-number
allocation race on first use, and phone normalisation silently converting a
mistyped local number into an undeliverable foreign one.

---

## Licence

Proprietary. Built for Advanced Dental Care Centre.
