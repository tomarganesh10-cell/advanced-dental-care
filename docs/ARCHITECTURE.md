# Architecture

## Stack

| Layer          | Choice                                         | Why                                                                                                                                                                           |
| -------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework      | Next.js 16, App Router                         | Server components mean patient data is filtered on the server and never reaches the browser bundle. Server-side rendering also matters for a clinic competing on local search |
| Language       | TypeScript, strict, `noUncheckedIndexedAccess` |                                                                                                                                                                               |
| Styling        | Tailwind 4, CSS-first tokens                   |                                                                                                                                                                               |
| ORM            | Prisma 7 with the `pg` driver adapter          | Typed queries, migrations, and `$transaction` with a real isolation level                                                                                                     |
| Database       | PostgreSQL 16                                  | `SERIALIZABLE` is what prevents double-booking. This is not a feature to substitute                                                                                           |
| Cache / limits | Redis (optional)                               | Rate limiting across instances. Degrades to in-process memory                                                                                                                 |
| Storage        | S3-compatible, private                         | X-rays and clinical photographs                                                                                                                                               |
| Messaging      | Meta WhatsApp Cloud API, Resend, MSG91         | All behind one interface with a `console` implementation                                                                                                                      |
| Payments       | Razorpay                                       | UPI is how people in India actually pay                                                                                                                                       |

---

## The decisions that matter

### 1. Booking is serialised by the database

The naive version checks availability, then inserts. Two patients submitting the
same slot at the same moment both pass the check and both insert. This is not a
rare race — it is what happens the moment a clinic posts an offer.

`bookAppointment` re-checks availability **inside** a `SERIALIZABLE` transaction
with the insert. Postgres aborts the second transaction rather than allowing the
conflicting write, and the API layer translates that abort (`40001` / `P2034`)
into "that slot just went, please pick another".

The cost is occasional serialisation failures under contention. That is the
correct trade: a retry is an inconvenience, two patients in one chair is a
clinic incident.

`tests/integration/booking.test.ts` fires three concurrent bookings at one slot
and asserts exactly one row exists afterwards.

### 2. Notifications use a transactional outbox

The obvious implementation sends the WhatsApp message after creating the
appointment. If the transaction then rolls back, the patient has been told about
an appointment that does not exist. If the send fails, the appointment exists
and nobody was told.

Instead, `queueNotification` writes a row to `notification_messages` **inside**
the business transaction. A worker (`drainNotificationQueue`) picks it up
afterwards. The row and the appointment commit or roll back together.

The worker also distinguishes retryable from permanent failures — retrying a
message Meta rejected as malformed burns quota and blocks the queue behind it;
retrying a timeout is exactly right.

### 3. Authorisation lives in the query layer

`getPatientForStaff` returns `clinical: null` for a role without
`CLINICAL_VIEW`. Not hidden in the template — absent from the object. A page
written next year cannot leak a clinical note by forgetting a check, because the
note is not in the data it was given.

The same applies to private notes (`CLINICAL_VIEW_PRIVATE`), gallery consent
(`listPublicGalleryCases`), and portal scoping (every function in
`src/server/portal.ts` scopes on the session's `patientId` inside the query).

Middleware does redirects only. It sees a URL, not the row being read.

### 4. Clinic facts cannot be hardcoded

The previous site published 25 years and 18 years of experience, and 20,000 and
5,000 patients, simultaneously. That is what happens when facts are typed into
templates.

`data/clinic-master-data.ts` wraps every claim in a `VerifiedClaim` carrying a
status, a source and evidence. `publicValue()` returns `undefined` for anything
not `VERIFIED`, so a forgotten claim disappears from the page rather than
shipping as an unsubstantiated statement. Durations are derived from a stored
_year_, so "N years of experience" can never go stale.

The Google rating is fetched live and cached, and renders nothing on failure —
a missing star rating is a cosmetic gap, a wrong one is a false claim on a
medical website.

### 5. Money is integers

All amounts are `Int` paise. No floats anywhere in the payment path.

---

## Request flow

```
Browser
  │
  ├─ middleware.ts ─── per-request CSP nonce, request id,
  │                    redirect if a session cookie is absent
  │                    (convenience only — NOT the security boundary)
  │
  ├─ Server Component / Route Handler
  │     └─ guard (requireStaffPage / requirePatientApi)
  │          └─ resolves the session against the DATABASE
  │             (opaque token, hashed, checked for revocation + epoch)
  │
  ├─ Service layer (src/server/**)
  │     ├─ permission check
  │     ├─ business transaction
  │     │    ├─ writes
  │     │    └─ notification outbox rows
  │     └─ audit log (never fails the operation)
  │
  └─ Response
```

Background: `src/server/jobs/worker.ts` drains the outbox, prunes expired
sessions and OTP challenges, and refreshes the Google rating cache.

---

## Directory layout

```
data/                     Clinic facts and the treatment catalogue (plain data)
  clinic-master-data.ts     Single source of truth, claim-wrapped
  verification.ts           VerifiedClaim and the publish gate
  services.ts               Treatment catalogue
  legacy-redirects.ts       301 map from the old site

prisma/
  schema.prisma             47 models
  seed.ts                   Demo clinic (refuses to run in production)

src/
  app/
    (public)/               Marketing site
    (auth)/                 Sign-in
    admin/                  Staff area
    patient-dashboard/      Patient portal
    api/                    Route handlers
  components/
    ui/                     Primitives
    marketing/ booking/ admin/ portal/
  lib/                      Env, db, logger, rbac, errors, time, phone, seo
  server/                   Business logic
    auth/ booking/ notifications/ payments/ storage/ crm/ reports/
tests/
  unit/ integration/ e2e/
```

The rule: `src/lib` is infrastructure with no business logic; `src/server` holds
business logic and is never imported by a client component; `data/` is plain
data with no imports from `src/`.

---

## Where the bodies are buried

Things that will look wrong until you know why:

- **`checkSlotBookable` takes a client parameter.** So it can run inside the
  booking transaction. `getDayAvailability` is what the patient sees;
  `checkSlotBookable` is what decides.
- **Appointment duration is derived server-side from the treatment slug.** A
  client that could name its own duration could book a 10-minute slot for
  implant surgery.
- **Rescheduling creates a new row.** The original is marked `RESCHEDULED` and
  linked, so "you moved me twice" is answerable.
- **`useAsyncData` carries an eslint-disable.** The React compiler flags
  setting a loading flag in an effect. Here the extra render _is_ the behaviour
  — it shows the spinner. Confined to one hook rather than scattered.
- **Time-dependent work is extracted out of component bodies.** Reading the
  clock in a render is impure and can give two parts of one page different
  answers. `loadFrontDeskBoard()` and `getPortalAppointments()` exist for that
  reason.
- **The seed's doctors have no qualifications.** Deliberate; see STATUS.md.
