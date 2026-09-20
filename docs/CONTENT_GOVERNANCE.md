# Content governance

What this website may and may not say about the practice.

Dental advertising in India is constrained by the Dentists Act 1948 and the
Dental Council of India's Code of Ethics, which prohibit claims that are
misleading or that solicit patients through exaggeration. Beyond the legal
position: a practice that overclaims attracts the patients most likely to be
disappointed.

---

## Never publish

### Guaranteed outcomes

Prohibited: "permanent solution", "lifetime guarantee", "100% success rate",
"painless", "risk-free", "guaranteed results".

Write instead: what the treatment usually achieves, with the variables that
affect it. Where a figure is quoted — implant survival, veneer longevity — it
carries a source and is stated as a range.

> _Wrong:_ "Dental implants are a permanent solution that lasts a lifetime."
>
> _Right:_ "Implants are intended as a long-term restoration and many last for
> decades, but nobody can guarantee a lifespan. Outcome depends on oral hygiene,
> smoking, gum health and regular maintenance."

### Superiority claims

Prohibited: "best dentist in Chandigarh", "No. 1 dental clinic", "most advanced
in North India", "leading", "premier".

These are unverifiable, prohibited under the ethics code, and a competitor can
screenshot them.

### Price-led solicitation

A transparent price _range_ on a treatment page is fine and useful. Framing
price as an inducement — "lowest cost implants in Chandigarh", "50% off this
month" — is not.

### Unevidenced capability claims

Equipment, techniques, certifications and implant systems are claims about facts
that can be checked. Each needs evidence before publication:

| Claim                   | Evidence required                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| CBCT imaging            | Equipment invoice **and a current AERB licence** for the unit                                        |
| Dental laser            | Invoice, make and model                                                                              |
| Guided implant planning | Software licence                                                                                     |
| "Digital Smile Design"  | The DSD certification itself — it is a trademarked programme. Otherwise say "digital smile planning" |
| Named implant systems   | Confirmation they are currently stocked                                                              |
| Specialist team members | Name, MDS branch, council registration, and full-time vs visiting                                    |
| Memberships             | Current certificate with expiry                                                                      |

### 24/7 availability

Unless the clinic actually staffs an out-of-hours service. A 24-hour line nobody
answers at 2am is worse than being clear about hours.

### Patient images without specific consent

Consent to treatment is not consent to publication. Publication requires
separate, specific, revocable written consent — enforced in code: a
`GalleryCase` is invisible to the public site unless `consentStatus = GRANTED`
and the consent has not expired.

### Fabricated or selectively solicited reviews

Reviews come from Google's API or they do not appear. The feedback form shows
every patient the Google review link regardless of their score — filtering who
is asked for a public review is review gating and breaches Google's policies. A
low score additionally raises an internal service-recovery alert, which is a
different thing: it is about fixing the experience, not suppressing the review.

---

## Always publish

- **The medical disclaimer** in the footer of every page.
- **A results disclaimer** with any before/after imagery.
- **Where results vary**, say so at the point the claim is made, not only in the
  small print.
- **The distinction between a dental emergency and a medical one.** Facial
  swelling affecting breathing or swallowing is a hospital, not a dental clinic.

---

## Statistics

Every number about the practice goes through
[`data/clinic-master-data.ts`](../data/clinic-master-data.ts) as a
`VerifiedClaim`. Unverified claims render as nothing.

Two rules:

1. **Durations are derived, never stored.** The file stores
   `clinicFoundedYear`, and "N years" is computed at render time. A literal
   "18 years" is wrong within a year of being typed — which is exactly how the
   old site ended up publishing 25 and 18 simultaneously.
2. **Counts carry an as-of date.** "20,000+ patients treated (as of March 2026)"
   is honest about being a snapshot. "20,000+ patients treated" quietly claims
   to be current forever.

---

## Approving content

1. Draft.
2. Check against this document.
3. Any factual claim about the practice → add it to
   `data/clinic-master-data.ts` as a claim, not to the page.
4. Verify in **Admin → Content verification**, recording the evidence seen.
5. Clinical content → a named dentist reviews it, and the review is published
   with the article (`reviewedBy`, `lastReviewed`).
6. Publish.

Steps 3 and 4 are not bureaucracy. They are the mechanism that stops this site
repeating what the last one did.
