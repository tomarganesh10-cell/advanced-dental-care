# Database

PostgreSQL 16, Prisma 7. 47 models.

## Conventions

| Convention                                     | Reason                                                 |
| ---------------------------------------------- | ------------------------------------------------------ |
| UUID primary keys                              | Ids appear in URLs. Sequential integers are enumerable |
| `createdAt` / `updatedAt` everywhere           |                                                        |
| `deletedAt` soft delete on significant records | Clinical and financial records must stay recoverable   |
| Money as `Int` paise                           | No floats anywhere near money                          |
| UTC timestamps                                 | Display conversion to Asia/Kolkata happens in the app  |
| `snake_case` table names via `@@map`           | Readable in psql                                       |

## Model groups

**Auth** — `User`, `Session`, `OtpChallenge`, `PermissionGrant`

**Staff** — `Staff`, `Doctor`, `DoctorSchedule`, `DoctorTimeOff`,
`ClinicHoliday`, `Attendance`, `LeaveRequest`

**Patients** — `Patient`, `PatientConsent`, `MedicalHistory`

**Clinical** — `ClinicalNote`, `TreatmentPlan`, `TreatmentPlanItem`,
`Prescription`, `PrescriptionItem`, `PatientDocument`

**Appointments** — `Appointment`, `AppointmentStatusEvent`

**CRM** — `Lead`, `LeadActivity`, `InternationalPatientEnquiry`

**Money** — `Payment`, `Refund`, `Invoice`, `InvoiceItem`, `InvoiceCounter`

**Messaging** — `NotificationTemplate`, `NotificationMessage`

**Feedback** — `ReviewRequest`, `Feedback`, `Testimonial`

**Content** — `GalleryCase`, `GalleryMedia`, `BlogPost`, `BlogCategory`,
`ContentBlock`, `SeoMetadata`, `ContentClaim`

**System** — `AuditLog`, `DataSubjectRequest`, `Setting`, `IntegrationCache`,
`AnalyticsEvent`

## Decisions worth knowing

**`MedicalHistory` is a separate table, not columns on `Patient`.** It is read
by a narrower set of roles, updated on a different cadence, and versioning it
later is easier from its own table.

**`ClinicalNote` has `lockedAt` and `amendmentOfId`.** Notes are locked after a
grace period and corrected by appending an amendment, not by rewriting. A
medical record that can be silently edited after the fact is worthless as a
record — to the patient as much as to the clinic.

**`PatientConsent` stores the verbatim text presented.** So the record survives
a later change of wording, and "what exactly did I agree to" is answerable.

**`PatientDocument.isVisibleToPatient` defaults to false.** Staff decide
explicitly what a patient sees unsupervised. An un-discussed radiograph causes
worry rather than informing.

**`GalleryCase` gates on `consentStatus` and `consentExpiresAt`.** Consent to
publish is separate from consent to treat, and is revocable.

**`Appointment.rescheduledFromId` links the chain.** Rescheduling creates a new
row rather than editing in place, so "you moved me twice" is answerable.

**`NotificationMessage.dedupeKey` is unique.** Two workers both scheduling the
24-hour reminder produces one row, not two messages.

**`Payment.verifiedAt` is separate from `status`.** Reporting filters on it, so
an unverified row can never be counted as revenue.

**`InvoiceCounter` gives gapless per-year numbering.** Tax requirement, not a
nicety.

**`Setting` holds the patient number counter.** A Postgres sequence would be
simpler but could not be set to continue from the clinic's existing paper
records.

## Indexes

Chosen from the queries the application actually runs:

```
appointments   (startsAt, status)        calendar and today's list
               (doctorId, startsAt)      per-doctor diary and conflict checks
               (patientId, startsAt)     patient history
patients       (phone) (email) (fullName)   reception search
leads          (status, createdAt) (assignedToId, status) (nextFollowUpAt)
notification_messages (status, scheduledFor)   the worker's only query
audit_logs     (entity, entityId, createdAt) (actorId, createdAt)
attendance     unique (staffId, date)    one record per person per day
```

## Migrations

```bash
npm run prisma:migrate      # development: create and apply
npx prisma migrate deploy   # production: apply only
```

Never `migrate dev` or `db push` against production. Read the generated SQL
before applying — Prisma will drop a column to match a schema change without
asking twice.

## Growth

`audit_logs` and `analytics_events` grow fastest. At a few thousand appointments
a year neither is a problem; partition by month before they become slow, not
after.

`notification_messages` should have delivered rows older than a year archived —
the body text is a copy of what was sent to a patient and does not need to live
in the hot table forever.
