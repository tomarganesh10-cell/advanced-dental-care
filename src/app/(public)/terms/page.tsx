import Link from "next/link";
import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";
import { buildMetadata } from "@/lib/seo";
import { contact, identity } from "@data/clinic-master-data";

export const metadata: Metadata = buildMetadata({
  title: "Terms of Use",
  description: `Terms governing use of the ${identity.legalName} website, booking system and patient portal.`,
  path: "/terms",
});

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      lastUpdated="19 September 2026"
      breadcrumb={{ name: "Terms of use", path: "/terms" }}
    >
      <p>
        These terms apply to this website, the online booking system and the patient portal operated
        by {identity.legalName}, {contact.address.formatted}.
      </p>

      <h2>Using this website</h2>
      <p>
        You may use this site to learn about our services, book appointments and manage your own
        care. You may not attempt to access another person&apos;s records, probe the site for
        vulnerabilities, scrape it at scale, or submit false information.
      </p>

      <h2>Booking appointments</h2>
      <ul>
        <li>
          A booking made online is a <strong>request</strong> until the clinic confirms it. You will
          receive a message when it is confirmed.
        </li>
        <li>You must give a mobile number you control; it is verified by a one-time code.</li>
        <li>
          Please tell us as early as you can if you cannot attend. Repeated non-attendance may mean
          we ask you to confirm by phone before we hold future appointments.
        </li>
        <li>
          We may need to move an appointment — for a clinical emergency, or if a clinician is
          unwell. We will contact you as soon as we know.
        </li>
      </ul>

      <h2>Patient portal</h2>
      <ul>
        <li>Your portal account is personal to you. Do not share access.</li>
        <li>
          Access uses a one-time code sent to your registered mobile number. Tell us immediately if
          that number changes or you lose the device.
        </li>
        <li>
          The portal is for viewing your records and managing appointments. It is not a channel for
          urgent clinical problems — call the clinic for those.
        </li>
      </ul>

      <h2>Fees and payment</h2>
      <ul>
        <li>
          Treatment costs are set out in a written estimate after examination. Prices on this site,
          where shown, are indicative and are not an offer.
        </li>
        <li>Payment is due as set out in your treatment plan.</li>
        <li>
          Online payments are processed by a third-party payment provider. We do not receive or
          store your card details.
        </li>
        <li>Refunds for treatment not yet provided are handled case by case; ask reception.</li>
      </ul>

      <h2>Clinical decisions</h2>
      <p>
        Treatment is provided on clinical judgement. We may decline to provide a requested treatment
        where we do not believe it is in your interest, and we will explain why. You may always seek
        a second opinion, and we will provide your records for it.
      </p>

      <h2>Content</h2>
      <p>
        The text, images and design of this site belong to {identity.legalName} unless stated
        otherwise. Health information here is general and subject to our{" "}
        <Link href="/medical-disclaimer">medical disclaimer</Link>.
      </p>

      <h2>Availability</h2>
      <p>
        We aim to keep the site and portal available but cannot guarantee uninterrupted service. If
        the booking system is unavailable, call {contact.phone.display}.
      </p>

      <h2>Liability</h2>
      <p>
        Nothing in these terms limits our liability for clinical negligence or for anything that
        cannot be limited under law. Our liability for the website itself — as distinct from the
        care we provide — is limited to what is reasonable and foreseeable.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of India, and the courts at Chandigarh have
        jurisdiction.
      </p>

      <h2>Contact</h2>
      <p>
        {contact.email.primary} · {contact.phone.display}
      </p>
    </LegalPage>
  );
}
