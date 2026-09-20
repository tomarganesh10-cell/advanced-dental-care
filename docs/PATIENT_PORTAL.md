# Patient portal

## What a patient sees

| Section        | Contents                                                                      |
| -------------- | ----------------------------------------------------------------------------- |
| Overview       | Next appointment, treatment plan summary, outstanding balance, document count |
| Appointments   | Upcoming and past, with status and reference                                  |
| Treatment plan | Steps, progress, estimate — once shared                                       |
| Records        | Documents staff have shared, and prescriptions                                |
| Invoices       | Itemised, with online payment                                                 |

## What a patient does not see, and why

**Clinicians' private notes.** `privateNote` is stripped in the query layer.
These exist so clinicians can think in writing — "patient very anxious, allow
extra time", "suspect bruxism, watch the 46 restoration" — and they read badly
out of context. A patient is entitled to their full record on request, which is
a different thing from a note appearing unexplained in an app at 11pm.

**Documents not marked visible.** `isVisibleToPatient` defaults to false. Staff
share a radiograph once they have been through it with the patient. A CBCT
appearing in a portal before anyone has explained it produces anxiety, not
informed patients. The portal says this explicitly and tells them how to request
their full record.

**Draft treatment plans.** A `DRAFT` plan is a clinician thinking out loud.
Only `PROPOSED` and beyond, with `isVisibleToPatient`, appear.

**Draft invoices.** Not yet a bill, so not shown as one.

## What is deliberately not built

**Self-service rescheduling.** It sounds patient-friendly. In a single-location
clinic it produces gaps nobody fills — a patient moves from Tuesday 10:00 to
Thursday 16:00 and the Tuesday slot sits empty, where reception taking the call
could have offered it to the person who rang that morning in pain.

The portal shows the clinic's number prominently and explains this. If the
clinic later runs at a volume where self-service pays for itself, the state
machine already has `RESCHEDULE_REQUESTED`.

## Isolation

Every portal query scopes on the session's `patientId` **inside the query**.
No function in `src/server/portal.ts` accepts a patient id from the caller,
because the cross-patient bug is always the same shape: a handler that reads an
id from a URL and forgets to compare it to the session.

Document downloads go through `/api/portal/documents/[id]`, which:

1. requires a valid patient session
2. confirms the document belongs to that patient **and** is marked visible
3. logs the access
4. mints a signed URL valid for 120 seconds

"Not yours" and "does not exist" both return 404, so ids cannot be probed.

Covered by 13 integration tests in `tests/integration/patient-isolation.test.ts`.

## Sign-in

Mobile OTP. No password — see `docs/AUTH.md` for the reasoning.

A patient created by reception has no portal account until they first use it;
the account is created on that first verified login. This means a walk-in
patient can be registered in ten seconds without inventing credentials for them.

## Accessibility

The portal is used by people who are anxious, in pain, or elderly. Practical
consequences:

- Minimum 44px tap targets in the booking flow
- Real labels, never placeholder-as-label
- Visible focus rings everywhere
- Status carried by text and icon, not colour alone
- `prefers-reduced-motion` respected
- Pinch-zoom not disabled
