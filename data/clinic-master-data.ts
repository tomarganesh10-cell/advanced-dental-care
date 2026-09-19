/**
 * SINGLE SOURCE OF TRUTH for every public clinic fact.
 *
 * Rules:
 *  1. No page, component or template may hardcode a clinic fact. Import it here.
 *  2. Anything wrapped in `unverified()` will NOT render on the public site.
 *     That is deliberate — see docs/CONTENT_AUDIT.md.
 *  3. Values that change over time (patient counts, Google reviews, years of
 *     experience) are either derived at render time or fetched live. They are
 *     never frozen into the page.
 *  4. Once the clinic supplies evidence, flip `unverified(...)` to
 *     `verified(...)` with verifiedBy / verifiedOn / evidence filled in. The CI
 *     gate in scripts/check-content.ts rejects a VERIFIED claim that is missing
 *     its evidence fields.
 *
 * Operationally, the clinic edits these through /admin/content-verification;
 * this file is the checked-in default and the fallback when the database has no
 * override.
 */

import { unverified, verified, type VerifiedClaim } from "./verification";

const OLD_SITE = "previous site chandigarhdentist.com, copy supplied by client 2026-09";
const CLINIC_DIRECT = "clinic contact details supplied directly by client 2026-09";

// -----------------------------------------------------------------------------
// Identity — safe to publish
// -----------------------------------------------------------------------------

export const identity = {
  legalName: "Advanced Dental Care Centre",
  displayName: "Advanced Dental Care Centre",
  shortName: "Advanced Dental",
  tagline: "Advanced Dentistry. Personalised Care. Confident Smiles.",
  /**
   * Deliberately modest. Avoids "best", "No. 1", "most advanced" — see the
   * prohibited-claims list in docs/CONTENT_AUDIT.md §4.
   */
  description:
    "A multi-specialist dental practice in Sector 18-A, Chandigarh, offering implants, cosmetic dentistry, orthodontics, endodontics and oral surgery.",
  domain: "chandigarhdentist.com",
} as const;

// -----------------------------------------------------------------------------
// Contact & location
// -----------------------------------------------------------------------------

export const contact = {
  phone: {
    display: "+91 98551 23236",
    /** E.164, for tel: links and WhatsApp. */
    e164: "+919855123236",
    whatsapp: "919855123236",
  },
  email: {
    /**
     * NOTE: a yahoo.com address on a redesigned clinic site is a weak trust
     * signal and hurts deliverability. Recommend moving to
     * appointments@chandigarhdentist.com before launch.
     */
    primary: "chandigarhdentist@yahoo.com",
    appointments: "chandigarhdentist@yahoo.com",
  },
  address: {
    line1: "#20, First Floor",
    line2: "Sector 18-A",
    city: "Chandigarh",
    state: "Chandigarh",
    postalCode: "160018",
    country: "India",
    countryCode: "IN",
    /** Used for LocalBusiness schema and the map embed. */
    formatted: "#20, First Floor, Sector 18-A, Chandigarh – 160018, India",
  },
  /**
   * Coordinates are approximate for Sector 18-A and MUST be replaced with the
   * exact pin from the clinic's Google Business Profile before launch —
   * a wrong pin sends patients to the wrong building.
   */
  geo: unverified(
    { latitude: 30.7372, longitude: 76.7856 },
    {
      source: "approximate Sector 18-A centroid",
      notes: "Replace with the exact lat/long from the Google Business Profile.",
    },
  ),
  googleMapsPlaceUrl: unverified("", {
    source: "not supplied",
    notes: "Paste the clinic's Google Maps share link.",
  }),
} as const;

// -----------------------------------------------------------------------------
// Opening hours
// -----------------------------------------------------------------------------

export interface OpeningHours {
  /** 0 = Sunday … 6 = Saturday, matching JS getDay(). */
  dayOfWeek: number;
  /** 24h "HH:mm" in Asia/Kolkata. Null/null means closed. */
  opens: string | null;
  closes: string | null;
}

export const timezone = "Asia/Kolkata";

export const openingHours: VerifiedClaim<OpeningHours[]> = unverified(
  [
    { dayOfWeek: 1, opens: "10:00", closes: "19:00" },
    { dayOfWeek: 2, opens: "10:00", closes: "19:00" },
    { dayOfWeek: 3, opens: "10:00", closes: "19:00" },
    { dayOfWeek: 4, opens: "10:00", closes: "19:00" },
    { dayOfWeek: 5, opens: "10:00", closes: "19:00" },
    { dayOfWeek: 6, opens: "10:00", closes: "19:00" },
    { dayOfWeek: 0, opens: "11:00", closes: "16:00" },
  ],
  {
    source: OLD_SITE,
    notes:
      "Mon–Sat 10:00–19:00, Sun 11:00–16:00 per the old site. Re-confirm Sunday hours are still offered before launch — Sunday hours are a differentiator and also a staffing commitment.",
  },
);

/**
 * Publishable hours used for booking slot generation. Unlike the public
 * display, booking falls back to these even when unverified — otherwise the
 * booking engine has no working window at all. The distinction is deliberate:
 * an unverified *display* claim misleads a reader; an unverified *operating
 * window* is just a default the clinic will correct in admin settings.
 */
export const defaultBookingHours = openingHours.value;

// -----------------------------------------------------------------------------
// Statistics — every one of these is currently disputed. See CONTENT_AUDIT §2.
// -----------------------------------------------------------------------------

export const statistics = {
  /**
   * Stored as a YEAR, not a duration. The site computes "N years" at render
   * time so it can never go stale.
   *
   * CONFLICT: old site says both 25 years and 18 years of experience, while the
   * doctors page says Dr. Gupta has practised since 1998 and founded the clinic
   * in 2005. Those are three different claims.
   */
  clinicFoundedYear: unverified(2005, {
    source: OLD_SITE,
    notes: "Doctors page states the clinic was founded in 2005. Needs a document.",
  }),
  doctorPractisingSinceYear: unverified(1998, {
    source: OLD_SITE,
    notes:
      "Distinct from the clinic's founding year. Publish as 'Dr. Gupta has practised since 1998', never merged into a single clinic-experience figure.",
  }),
  patientsTreated: unverified(20000, {
    source: OLD_SITE,
    asOf: undefined,
    notes:
      "CONFLICT: source copy says 20,000, rendered homepage says 5,000. Needs a count from the practice-management system plus an as-of date. Will render as 'N+ patients treated (as of <date>)' or be omitted.",
  }),
  certificationCount: unverified(0, {
    source: OLD_SITE,
    notes: "Old site refers to certifications without quantifying them. Needs a list.",
  }),
  staffCount: unverified(0, {
    source: "not stated",
    notes: "Needs a headcount split into dentists / clinical / front-office.",
  }),
} as const;

/**
 * Google rating is NEVER stored here. It is fetched live from the Places API
 * and cached — see src/server/integrations/google-places.ts. The old site's
 * hardcoded "4.9 / 1,514" is exactly the failure mode this avoids.
 */
export const googleReviews = {
  strategy: "live-places-api" as const,
  placeIdEnvVar: "GOOGLE_PLACE_ID",
  /** If the API is unavailable, render nothing rather than a stale number. */
  fallbackBehaviour: "omit" as const,
};

// -----------------------------------------------------------------------------
// Clinical team
// -----------------------------------------------------------------------------

export interface DoctorProfile {
  slug: string;
  name: string;
  /** Honorific used in copy. */
  title: string;
  qualifications: VerifiedClaim<string[]>;
  registration: VerifiedClaim<{ council: string; number: string } | null>;
  designation: string;
  specialInterests: string[];
  practisingSinceYear: VerifiedClaim<number | null>;
  memberships: VerifiedClaim<string[]>;
  /** "FULL_TIME" | "VISITING" — patients deserve to know which. */
  availability: VerifiedClaim<"FULL_TIME" | "VISITING">;
  bio: string;
  photo: string | null;
}

export const doctors: DoctorProfile[] = [
  {
    slug: "dr-anshu-gupta",
    name: "Dr. Anshu Gupta",
    title: "Dr.",
    designation: "Principal Dentist — Implantology & Cosmetic Dentistry",
    qualifications: unverified(["MDS — PGIMER, Chandigarh"], {
      source: OLD_SITE,
      notes: "Needs the degree certificate and the exact MDS specialty branch.",
    }),
    registration: unverified(null, {
      source: "not supplied",
      notes:
        "Dental Council registration number. Publishing a dentist's registration number is good practice and is expected by patients checking credentials.",
    }),
    specialInterests: [
      "Dental implants",
      "Full-mouth rehabilitation",
      "Cosmetic dentistry",
      "Smile design",
    ],
    practisingSinceYear: unverified(1998, {
      source: OLD_SITE,
      notes: "Cross-check against the registration date.",
    }),
    memberships: unverified([], {
      source: OLD_SITE,
      notes:
        "Old site references memberships. Each one needs a current certificate with an expiry date before it appears on the profile.",
    }),
    availability: verified("FULL_TIME", {
      source: CLINIC_DIRECT,
      verifiedBy: "clinic",
      verifiedOn: "2026-09-19",
      evidence: "Principal dentist and practice owner.",
    }),
    bio: "Dr. Anshu Gupta leads the implant and cosmetic dentistry practice at Advanced Dental Care Centre.",
    photo: null,
  },
];

/**
 * The old site describes a multi-specialist setup. Until each specialist is
 * named with their own registration, the site says "our specialist team"
 * generically rather than listing phantom doctors.
 */
export const specialistTeam = unverified(
  [
    { specialty: "Endodontics", label: "Endodontist" },
    { specialty: "Orthodontics", label: "Orthodontist" },
    { specialty: "Oral & Maxillofacial Surgery", label: "Oral & Maxillofacial Surgeon" },
    { specialty: "Pedodontics", label: "Paediatric Dentist" },
  ],
  {
    source: OLD_SITE,
    notes:
      "Each specialist needs a name, MDS branch, registration number, and full-time vs visiting status before appearing.",
  },
);

// -----------------------------------------------------------------------------
// Technology — publish only what has an invoice behind it
// -----------------------------------------------------------------------------

export interface TechnologyItem {
  slug: string;
  name: string;
  summary: string;
  /** What it actually does for the patient, in plain language. */
  patientBenefit: string;
}

export const technology: VerifiedClaim<TechnologyItem>[] = [
  unverified(
    {
      slug: "cbct",
      name: "CBCT 3D imaging",
      summary: "Cone-beam CT scanning for three-dimensional assessment of bone and anatomy.",
      patientBenefit:
        "Lets the dentist assess bone volume and the position of nerves and sinuses before implant surgery, rather than estimating from a flat X-ray.",
    },
    {
      source: OLD_SITE,
      notes:
        "REQUIRES a current AERB licence for the unit, not just an invoice. Do not publish without it.",
    },
  ),
  unverified(
    {
      slug: "dental-laser",
      name: "Dental laser",
      summary: "Laser-assisted soft-tissue procedures.",
      patientBenefit:
        "Used for some gum procedures where it can mean less bleeding and a shorter recovery than a scalpel.",
    },
    { source: OLD_SITE, notes: "Needs make and model." },
  ),
  unverified(
    {
      slug: "guided-implant-planning",
      name: "Guided implant planning",
      summary: "Implant position planned on the 3D scan and transferred to surgery via a guide.",
      patientBenefit:
        "The implant position is decided on a computer before surgery rather than freehand at the chair.",
    },
    { source: OLD_SITE, notes: "Needs the planning software licence." },
  ),
  unverified(
    {
      slug: "digital-smile-planning",
      name: "Digital smile planning",
      summary: "Photographic and digital planning of tooth shape and proportion before treatment.",
      patientBenefit: "You see a preview of the proposed result before any tooth is prepared.",
    },
    {
      source: OLD_SITE,
      notes:
        "Old site says 'Digital Smile Design'. DSD is a trademarked certification programme — only use that exact name if the clinic holds the certification. Otherwise 'digital smile planning' is the honest phrasing.",
    },
  ),
  unverified(
    {
      slug: "intraoral-scanning",
      name: "Digital intraoral scanning",
      summary: "Digital impressions in place of putty trays.",
      patientBenefit: "No impression material, and the scan can be re-taken instantly if needed.",
    },
    { source: "inferred from old site", notes: "Confirm whether a scanner is actually in use." },
  ),
];

export const implantSystems = unverified(["Nobel Biocare", "Straumann", "Osstem"], {
  source: OLD_SITE,
  notes:
    "Naming implant brands is a strong trust signal but is a factual claim about stock. Confirm these are currently used before publishing.",
});

// -----------------------------------------------------------------------------
// Compliance & disclaimers
// -----------------------------------------------------------------------------

export const disclaimers = {
  medical:
    "Information on this website is provided for general education and does not replace a professional dental consultation, diagnosis or treatment plan. Outcomes vary between patients.",
  results:
    "Treatment results shown are specific to the individual patient and are published with their consent. They are not a prediction of the result any other patient will achieve.",
  emergency:
    "For a dental emergency, please call the clinic during working hours. If you have facial swelling affecting your breathing or swallowing, uncontrolled bleeding, or a facial injury, go to a hospital emergency department immediately.",
} as const;

/** Displayed in the footer. Required by the content governance rules. */
export const footerDisclaimer = disclaimers.medical;

export const socialProfiles = {
  facebook: unverified("", { source: "not supplied" }),
  instagram: unverified("", { source: "not supplied" }),
  youtube: unverified("", { source: "not supplied" }),
  googleBusiness: unverified("", { source: "not supplied" }),
} as const;

// -----------------------------------------------------------------------------
// Derived helpers — never hardcode a duration
// -----------------------------------------------------------------------------

/** Years since a given year, computed at render time. */
export function yearsSince(year: number, now: Date = new Date()): number {
  return Math.max(0, now.getFullYear() - year);
}

export const clinicMasterData = {
  identity,
  contact,
  timezone,
  openingHours,
  statistics,
  googleReviews,
  doctors,
  specialistTeam,
  technology,
  implantSystems,
  disclaimers,
  socialProfiles,
} as const;

export default clinicMasterData;
