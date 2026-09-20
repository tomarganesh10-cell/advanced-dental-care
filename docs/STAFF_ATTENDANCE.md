# Staff attendance

## What it records

Check-in time, check-out time, the hours between them, and lateness against that
staff member's own shift.

## What it deliberately does not record

No location tracking. No screenshots. No idle monitoring. No keystroke counting.
No application usage.

This is a deliberate line. Attendance software is where workplace tools most
easily become surveillance, and a dental practice with a handful of staff has no
need for any of it. The clinic needs to know who was in and for how long, for
payroll and cover. Everything beyond that damages trust for no operational
return.

Optional and **off by default**: IP restriction, for clinics that want
"check-in must happen on the clinic network". It stores the IP of the check-in,
nothing else.

## Lateness

Measured against the staff member's configured shift start, with a 10-minute
grace period.

Without a configured shift, lateness is **zero** rather than measured against an
assumed 9am. A receptionist on an evening shift would otherwise be marked late
every single day, and the person fixing that would be told the system is wrong.

## Half days

A shift under four hours is recorded as `HALF_DAY` rather than a full day, so
monthly totals are not quietly wrong.

## Corrections

People forget to clock out. A manager with `ATTENDANCE_ADJUST` can fix a record,
and:

- **a reason is required** — the form will not submit without one
- the previous values are written to the audit log before being overwritten
- the record is visibly marked as edited
- the staff member can see their own full history including the adjustment

Silent edits to someone's hours are how payroll disputes start. "My hours were
changed and nobody told me" has to be answerable.

## Staff can always see their own record

A record about someone that they cannot see is a record they cannot correct.
Every role has `ATTENDANCE_SELF`.

`ATTENDANCE_VIEW_ALL` — the team board and monthly summary — is limited to
managers and admins.

## Export

CSV for payroll, gated on `ATTENDANCE_EXPORT`.

The exporter neutralises formula-injection prefixes (`=`, `+`, `-`, `@`) in
names. A staff list is user-controlled data and Excel executes formulas in
opened CSVs, so this is not theoretical.

## Leave

`LeaveRequest` models request → approve/reject with a decision note. The model
and permissions exist; the request UI does not yet. See `docs/STATUS.md`.
