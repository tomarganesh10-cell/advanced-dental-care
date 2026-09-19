# Content Audit — chandigarhdentist.com

**Status:** BLOCKING. The redesign must not go live until every row marked
`NEEDS_VERIFICATION` below has been signed off by the clinic.

**Audit date:** 2026-09-19
**Auditor:** engineering
**Source of the claims below:** the existing site's copy as supplied to the
project by the client contact. The live site was **not** crawled as part of this
audit, so every figure here is second-hand and must be checked against both the
live page and the clinic's own records before launch.

---

## 1. Why this document exists

The previous site states the same fact differently in different places. A
medical practice publishing inconsistent numbers about itself is a
credibility problem before it is an SEO problem — and in India, advertising by
dental practitioners is constrained by the Dentists Act 1948 and the DCI Code of
Ethics, which prohibit claims that are misleading or that solicit patients
through exaggeration.

The rebuild therefore uses a **single source of truth**:
[`data/clinic-master-data.ts`](../data/clinic-master-data.ts). No page, template
or component hardcodes a clinic fact. Every claim carries a verification status,
and claims that are not `VERIFIED` are **not rendered** on the public site.

---

## 2. Conflicting claims found

| # | Claim | Value A | Value B | Where they disagree | Status |
|---|-------|---------|---------|--------------------|--------|
| 1 | Years of experience | 25 years | 18 years | Homepage source copy vs. rendered homepage | `NEEDS_VERIFICATION` |
| 2 | Patients / clients treated | 20,000 | 5,000 | Homepage source copy vs. rendered homepage | `NEEDS_VERIFICATION` |
| 3 | Practice start year | "since 1998" (Dr. Gupta practising) | Clinic "founded 2005" | Doctors page | `NEEDS_VERIFICATION` — these are two different facts and should be published as two separate statements, not one number |
| 4 | Google rating / review count | 4.9 / 1,514 reviews | — | Homepage, at time of audit | `DYNAMIC` — must never be hardcoded; see §5 |
| 5 | Number of certifications | Stated but unquantified | — | About page | `NEEDS_VERIFICATION` |
| 6 | Staff count | Not stated consistently | — | — | `NEEDS_VERIFICATION` |

### Why #1 and #2 matter most

"25 years" and "18 years" cannot both be true. Whichever is correct, the number
will be wrong again next year if it is written into the page as a literal. In
the new build both are **derived**: the master data file stores
`practiceSinceYear` and the site computes the elapsed years at render time. The
patient count is stored as a figure with an `asOf` date and is displayed as
"20,000+ patients treated (as of March 2026)" — or omitted entirely if the
clinic cannot substantiate it.

---

## 3. Claims requiring documentary evidence before publication

These are the claims most likely to attract a regulatory or competitor
complaint, and the ones we refuse to render until verified.

| Claim | Evidence required from the clinic | Status |
|-------|-----------------------------------|--------|
| Dr. Anshu Gupta — MDS, PGIMER Chandigarh | Degree certificate; DCI / State Dental Council registration number | `NEEDS_VERIFICATION` |
| Dr. Anshu Gupta — practising since 1998 | Registration date | `NEEDS_VERIFICATION` |
| Professional memberships (e.g. ICOI, IDA) | Current membership certificate with expiry | `NEEDS_VERIFICATION` |
| Implant systems: Nobel Biocare, Straumann, Osstem | Purchase invoices or distributor confirmation that these are *currently* stocked | `NEEDS_VERIFICATION` |
| In-house CBCT | Equipment invoice + AERB (Atomic Energy Regulatory Board) licence for the CBCT unit | `NEEDS_VERIFICATION` — an X-ray/CBCT claim without a current AERB registration is a legal exposure, not just a marketing one |
| Dental laser | Equipment invoice / make and model | `NEEDS_VERIFICATION` |
| Guided implant planning | Software licence (e.g. coDiagnostiX, Blue Sky Plan) | `NEEDS_VERIFICATION` |
| Digital Smile Design | Whether the clinic is DSD-certified, or simply performs digital smile *planning*. These are different claims — "DSD" is a trademarked programme | `NEEDS_VERIFICATION` |
| Specialist team (Endodontist, Orthodontist, OMFS, Pedodontist) | Each specialist's name, MDS specialty, registration number, and whether they are full-time or visiting | `NEEDS_VERIFICATION` — the site should say "visiting consultant" where that is the case |
| "20,000 patients" | Practice-management record count | `NEEDS_VERIFICATION` |

---

## 4. Claims that must not be made at all

Carried into the build as lint-able content rules (see
`docs/CONTENT_GOVERNANCE.md`):

- **No guaranteed outcomes.** "Permanent solution", "lifetime guarantee",
  "100% success", "painless" — all prohibited. Implant survival is quoted as a
  range with a source, or not quoted.
- **No superiority claims.** "Best dentist in Chandigarh", "No. 1 dental
  clinic", "most advanced in North India" — unverifiable and prohibited under
  the DCI ethics code.
- **No price-led solicitation** framed as an inducement ("lowest cost implants",
  "50% off"). Transparent price *ranges* on a treatment page are fine.
- **No 24/7 emergency availability** unless the clinic actually staffs it. The
  emergency section says what it can honestly say: call during clinic hours,
  and what to do outside them.
- **No before/after image** without written, specific, revocable patient
  consent on file. Enforced in code: `GalleryCase` rows are invisible to the
  public site unless `consentStatus = GRANTED` and the consent has not expired.
- **No fabricated or selectively-solicited reviews.** Reviews come from Google's
  API or they don't appear.

---

## 5. Google rating and review count

The old site prints `4.9 / 1,514` as static text. That number was stale the day
it was typed.

**New behaviour:** the rating and count are fetched server-side from the Google
Places API, cached in Redis for `GOOGLE_PLACES_CACHE_TTL` (default 6h), and
rendered from that cache. If the API key is missing or the call fails, the
component renders **nothing** — no fallback number. A missing star rating is a
cosmetic gap; a wrong one is a false claim.

Implementation: `src/server/integrations/google-places.ts`, surfaced by
`src/components/marketing/google-rating.tsx`.

---

## 6. Content worth preserving from the old site

The existing site has real SEO equity. The following content is to be migrated,
not rewritten from scratch:

| Old content | Disposition |
|-------------|-------------|
| Doctor credentials and clinical focus | Migrate to `/doctors/dr-anshu-gupta`, re-verified |
| Treatment/service descriptions | Migrate, split one-page service list into dedicated pages |
| Patient testimonials (text) | Migrate; re-confirm consent for named testimonials |
| Video testimonials | Migrate; re-confirm consent |
| Dental tourism / international patient content | Migrate and expand — this is a genuine differentiator |
| Technology page (CBCT, laser) | Migrate **only the verified subset** |
| Clinic timings, address, phone | Move into master data; single source |
| Blog articles, if any | Migrate with original publish dates preserved |

Old URLs are preserved or 301-redirected. See
[`docs/SEO_MIGRATION.md`](./SEO_MIGRATION.md) and
[`data/legacy-redirects.ts`](../data/legacy-redirects.ts).

---

## 7. Verified facts (safe to publish today)

These come from the clinic's own contact details and were supplied directly:

| Fact | Value |
|------|-------|
| Practice name | Advanced Dental Care Centre |
| Address | #20, First Floor, Sector 18-A, Chandigarh – 160018, India |
| Phone | +91 98551 23236 |
| Email | chandigarhdentist@yahoo.com |
| Hours | Mon–Sat 10:00–19:00; Sun 11:00–16:00 |
| Principal dentist | Dr. Anshu Gupta |

Even these should be re-confirmed at launch — in particular whether Sunday
hours are still current, and whether the yahoo.com address is the one the clinic
wants on a redesigned site (a domain-based address would be better for
deliverability and for the trust signal).

---

## 8. Sign-off

The Content Verification screen in the admin panel (`/admin/content-verification`)
tracks each claim above. A claim moves to `VERIFIED` only when a named person
records what evidence they saw and when. Until then the public site omits it.

| Claim group | Verified by | Date | Evidence |
|-------------|-------------|------|----------|
| Experience & patient counts | _pending_ | | |
| Doctor credentials | _pending_ | | |
| Technology & equipment | _pending_ | | |
| Specialist team | _pending_ | | |
| Memberships | _pending_ | | |
