# Authentication and permissions

## Two populations, two mechanisms

|            | Staff                  | Patients               |
| ---------- | ---------------------- | ---------------------- |
| Credential | Email + password       | Mobile OTP             |
| Session    | 8 hours (one shift)    | 7 days                 |
| Cookie     | `adcc_staff_session`   | `adcc_patient_session` |
| MFA        | Modelled, fails closed | Not applicable         |

**Why patients have no password.** They use the portal perhaps three times a
year. They would reuse a password, forget it, and the reset flow would become
the weakest link in the system. The mobile number is already verified at booking
and is already how the clinic contacts them.

**Why staff do have one.** They sign in daily, often on a shared workstation,
and an 8-hour session bounded by a password is the right shape for a shift.

## Sessions

Opaque random tokens (32 bytes, base64url), stored **hashed** with SHA-256. The
raw token exists only in the cookie; a database dump contains no usable session.

Not JWTs. The trade-off is a database read per request; what it buys is instant
revocation, which a self-contained signed token cannot offer without a
revocation list that costs the same read.

Every user carries a `sessionEpoch`. Incrementing it invalidates every session
that user holds at once — that is what a password change or "sign out
everywhere" does.

A session is valid only if all of these hold: it exists, it is not revoked, it
has not expired, the user is active and not soft-deleted, and the session's
epoch matches the user's current epoch.

## Guards

```
requireStaffPage(permission?)    → redirects (server components)
requirePatientPage()             → redirects
requireStaffApi(permission?)     → throws 401/403 (route handlers)
requirePatientApi()              → throws
assertOwnedByPatient(principal, resourcePatientId)
```

Every protected surface calls one. **Middleware is not the boundary** — it sees
a URL, not the row being read, and a cookie's presence is not proof it is valid.

## Login protections

- Per-IP limit, per-account limit, 15-minute time-boxed lockout
- A missing account is compared against a real dummy Argon2 hash, so the timing
  matches a wrong password — the login form is not an account enumerator
- A deactivated account fails with the same message as a wrong password, so a
  former employee cannot confirm their account still exists
- Every failure is audited with the reason

Lockout is time-boxed rather than permanent because a permanent lockout needs a
human to clear it, which in a small clinic means the one administrator who is on
leave.

## OTP

Six digits, 5-minute expiry, 5 attempts, single use. The safety comes from those
controls, not from the code length — 10^6 is small.

- The hash is bound to the destination, so a code for one number cannot be
  replayed against another
- Issuing a new code retires any outstanding one
- Consumption uses a compare-and-set, so two concurrent requests with the same
  valid code cannot both succeed
- Per-destination, per-IP and resend-cooldown limits

The patient OTP endpoint responds **identically** for a registered and an
unregistered number. Telling a stranger that a given mobile belongs to a dental
patient is itself disclosure of health information about that person.

## Permission matrix

Legend: ● full · ◐ partial · ○ none

|                             | Super Admin | Clinic Admin | Doctor | Assistant | Reception | Manager | Marketing | Accountant |
| --------------------------- | ----------- | ------------ | ------ | --------- | --------- | ------- | --------- | ---------- |
| Appointments — view         | ●           | ●            | ●      | ●         | ●         | ●       | ○         | ●          |
| Appointments — book/confirm | ●           | ●            | ◐      | ○         | ●         | ○       | ○         | ○          |
| Appointments — cancel       | ●           | ●            | ○      | ○         | ●         | ○       | ○         | ○          |
| Patients — contact details  | ●           | ●            | ●      | ●         | ●         | ●       | **○**     | ●          |
| **Clinical notes — read**   | ●           | ●            | ●      | ●         | **○**     | **○**   | **○**     | **○**      |
| **Clinical notes — write**  | ●           | ○            | ●      | ○         | ○         | ○       | ○         | ○          |
| **Private notes**           | ●           | ○            | ●      | ○         | ○         | ○       | ○         | ○          |
| Prescriptions — write       | ●           | ○            | ●      | ○         | ○         | ○       | ○         | ○          |
| Documents — view            | ●           | ●            | ●      | ●         | ○         | ○       | ○         | ○          |
| Invoices — create           | ●           | ●            | ○      | ○         | ●         | ○       | ○         | ●          |
| **Refunds**                 | ●           | ○            | ○      | ○         | ○         | ○       | ○         | ●          |
| Leads                       | ●           | ●            | ○      | ○         | ●         | ●       | ●         | ○          |
| Staff — manage              | ●           | ●            | ○      | ○         | ○         | ◐       | ○         | ○          |
| Attendance — own            | ●           | ●            | ●      | ●         | ●         | ●       | ●         | ●          |
| Attendance — all            | ●           | ●            | ○      | ○         | ○         | ●       | ○         | ○          |
| Website content             | ●           | ●            | ○      | ○         | ○         | ◐       | ●         | ○          |
| Verify claims               | ●           | ●            | ○      | ○         | ○         | ○       | ○         | ○          |
| Audit log                   | ●           | ●            | ○      | ○         | ○         | ○       | ○         | ○          |
| Permissions                 | ●           | ○            | ○      | ○         | ○         | ○       | ○         | ○          |

The bolded cells are the boundaries that matter:

- **Reception cannot read clinical notes.** They have the most walk-up contact
  and the least clinical need.
- **Marketing has no patient access at all.** A lead is a marketing object; a
  patient is a medical one.
- **Doctors cannot refund.** Clinical authority and financial authority are
  separate.
- **Only a super admin changes permissions.**

## Per-user grants

Role defaults are a starting point. `PermissionGrant` records per-user
exceptions:

- An **ALLOW** adds a capability the role lacks — a senior receptionist given
  refund rights without becoming an accountant.
- A **DENY** removes one the role includes, and **always wins**. This is what
  lets a capability be withdrawn from one person without inventing a new role.
- Grants may expire, for temporary cover.

Every change is audited.

## Enforcement, in order

1. **Query layer** — restricted data is absent from the returned object. A page
   cannot leak what it was never given.
2. **Guards** — every page and route handler.
3. **Server actions** — re-check independently. A server action is a public HTTP
   endpoint with a generated name; "only the button calls it" is not a security
   property.
4. **UI** — navigation is filtered to what the person can reach, so they are not
   shown doors that will refuse them. This is courtesy, not control.
