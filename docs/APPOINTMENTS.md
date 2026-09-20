# Appointments

## Slot generation

A slot is offered only when **every** one of these holds:

1. it falls inside one of the doctor's weekly schedule blocks
2. the whole appointment fits inside that block — no slot that runs past closing
3. the clinic is not closed that day (`ClinicHoliday`)
4. the doctor is not on leave (`DoctorTimeOff`)
5. existing appointments in that window are below the block's capacity
6. it is far enough ahead to be honoured (two hours for public bookings)

### Blocks, not opening hours

A doctor's day is one or more blocks: 10:00–14:00 and 16:00–19:00. The gap is
lunch, handled by simply not having a block there rather than by a separate
break model.

A block carries `capacity` for clinics with more than one chair, and optional
`serviceSlugs` to restrict it — a Tuesday afternoon surgery list that only
accepts oral surgery.

### Duration comes from the treatment

Chair time per treatment is defined server-side in
`src/app/api/availability/route.ts`. A client that could name its own duration
could book a 10-minute slot for implant surgery and wreck the day.

Getting this wrong costs real money in either direction: too short and the day
runs late; too long and capacity is wasted.

### Two functions, deliberately

`getDayAvailability` is what the patient sees. `checkSlotBookable` is what
decides, and it runs **inside** the booking transaction.

The list a patient loaded may be seconds or minutes stale, and the gap between
"showed a slot" and "wrote the row" is exactly where double-booking lives.

## Preventing double booking

The naive version checks availability, then inserts. Two patients submitting the
same slot simultaneously both pass and both insert.

`bookAppointment` runs the check and the insert in one `SERIALIZABLE`
transaction. Postgres aborts the second rather than allowing the conflicting
write, and the API translates that abort (`40001` / `P2034`) into "that slot
just went".

The cost is occasional serialisation failures under contention. A retry is an
inconvenience; two patients in one chair is a clinic incident.

`tests/integration/booking.test.ts` fires three concurrent bookings at one slot
and asserts exactly one row exists. It has also been verified against the
running application.

### A different duplicate

Separately from the slot being full, the same patient booking two overlapping
appointments is rejected with its own message. That case is almost always a
double form submission, and telling the patient "you already have an appointment
at that time (ADC-A-XXXX)" is more useful than "that slot is taken".

## Lifecycle

```
REQUESTED ──────┬─→ CONFIRMED ──┬─→ CHECKED_IN ─→ IN_PROGRESS ─→ COMPLETED
                │               │
PENDING_        │               ├─→ NO_SHOW ─→ (correction) → CONFIRMED
CONFIRMATION ───┘               ├─→ RESCHEDULE_REQUESTED → RESCHEDULED
                                └─→ CANCELLED
```

Encoded as an explicit transition table in
`src/server/booking/state-machine.ts`. The invalid transitions are the
interesting ones:

- **COMPLETED cannot become CANCELLED.** That would silently unbill a visit that
  happened.
- **COMPLETED and CANCELLED are terminal.**
- **NO_SHOW can only be corrected back to CONFIRMED,** so the correction is
  visible in the status history rather than being a silent edit.
- **RESCHEDULED is terminal** — the replacement is a new row.

Every transition writes an `AppointmentStatusEvent`, which is what the timeline
in the UI renders. That is separate from the audit log: the timeline is for
staff and patients, the audit log is for investigations.

### Why a website booking is REQUESTED, not CONFIRMED

Auto-confirming would commit the doctor's diary to whoever filled in a form. The
clinic confirms. Staff booking on the phone create a `CONFIRMED` appointment
directly, because a human has already agreed it with the patient.

## Rescheduling

Creates a **new** appointment and marks the original `RESCHEDULED`, linked by
`rescheduledFromId`. The history then shows both, which matters when a patient
says "you moved me twice".

Staff rescheduling ignores the public two-hour lead time — the whole point of
phoning is to be fitted in.

## Notifications

Queued **inside** the booking transaction, so a rolled-back booking never
produces a confirmation for an appointment that does not exist.

| Event       | Channel                                   |
| ----------- | ----------------------------------------- |
| Requested   | WhatsApp + email                          |
| Confirmed   | WhatsApp + email, and reminders scheduled |
| 24h before  | WhatsApp                                  |
| 2h before   | WhatsApp                                  |
| Rescheduled | WhatsApp + email                          |
| Cancelled   | WhatsApp                                  |
| Completed   | Feedback request, 4 hours later           |

Reminders are future-dated outbox rows rather than a cron scan, so one cannot be
missed because a scanner was down at the wrong minute. They are deduped, and
cancelled or rescheduled appointments suppress theirs.

Feedback is requested four hours after the visit, not immediately — asking
someone how it went while they are still numb is not a fair sample.

## Front desk

`/admin/front-desk` is the day as a board: Expected → Waiting → With the doctor
→ Completed, plus a column for bookings awaiting confirmation.

It shows live waiting times because "how long has that person been sitting
there" is the most common question at a front desk and an appointment list
buries it. A clinical alert flag is shown — the flag only, never the underlying
record.
