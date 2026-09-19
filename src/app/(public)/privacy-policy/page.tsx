import Link from "next/link";
import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";
import { buildMetadata } from "@/lib/seo";
import { contact, identity } from "@data/clinic-master-data";

export const metadata: Metadata = buildMetadata({
  title: "Privacy Policy",
  description: `How ${identity.legalName} collects, uses, stores and protects your personal and health information.`,
  path: "/privacy-policy",
});

/**
 * Privacy policy.
 *
 * Written against India's Digital Personal Data Protection Act 2023 and the
 * clinical record-keeping obligations that sit alongside it. Deliberately does
 * NOT claim HIPAA compliance — HIPAA is a US framework that does not apply to an
 * Indian dental practice, and claiming it would be a false statement of
 * regulatory status, not a reassurance.
 */
export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      lastUpdated="19 September 2026"
      breadcrumb={{ name: "Privacy policy", path: "/privacy-policy" }}
    >
      <p>
        This policy explains what personal information {identity.legalName} collects, why we
        collect it, how we look after it and what rights you have over it. It covers this
        website, the patient portal and the records we keep as your dental practice.
      </p>

      <h2>Who is responsible for your data</h2>
      <p>
        {identity.legalName}, {contact.address.formatted}, is the data fiduciary for the
        information described here. For any question about your data, contact us at{" "}
        <a href={`mailto:${contact.email.primary}`}>{contact.email.primary}</a> or{" "}
        {contact.phone.display}.
      </p>

      <h2>What we collect</h2>
      <h3>When you use this website</h3>
      <ul>
        <li>Your name, mobile number and email when you book or enquire</li>
        <li>The treatment you asked about and anything you tell us in the message field</li>
        <li>
          How you reached the site (search, an advertisement, a link), so we know which of
          our own efforts are worth continuing
        </li>
      </ul>
      <p>
        Our own analytics records events such as &ldquo;a booking was started&rdquo; without
        any identifier that links back to a person.
      </p>

      <h3>When you become a patient</h3>
      <ul>
        <li>Identity and contact details, date of birth and address</li>
        <li>Medical history, allergies, medications and relevant conditions</li>
        <li>Clinical findings, diagnoses, treatment plans and notes</li>
        <li>X-rays, CBCT scans and clinical photographs</li>
        <li>Appointment history, invoices and payment records</li>
      </ul>
      <p>
        Health information is sensitive personal data and we treat it accordingly. We collect
        the minimum needed to treat you safely — the medical history questions exist because
        the answers change how treatment is planned, not to build a profile.
      </p>

      <h2>Why we use it</h2>
      <ul>
        <li>To provide dental care, which is the primary purpose of almost everything we hold</li>
        <li>To arrange, confirm and remind you about appointments</li>
        <li>To issue invoices and process payments</li>
        <li>To meet our legal and professional record-keeping obligations</li>
        <li>To respond to your enquiries</li>
      </ul>
      <p>
        We do not sell your data. We do not share it with advertisers. We do not use your
        clinical information for marketing.
      </p>

      <h2>Messaging you</h2>
      <p>
        Appointment confirmations, reminders and receipts are part of providing your care and
        are sent to the contact details you give us. WhatsApp and SMS messaging require your
        consent, which you give when booking and can withdraw at any time by replying STOP or
        telling reception. Withdrawing consent for messages does not affect your treatment.
      </p>

      <h2>Who can see your records</h2>
      <ul>
        <li>The clinicians involved in your care</li>
        <li>
          Front-office staff, who can see your contact and appointment details but cannot
          open your clinical notes
        </li>
        <li>Our accountant, for invoices and payments only</li>
        <li>A laboratory or specialist we refer you to, with the information they need</li>
      </ul>
      <p>
        Access is controlled by role, every access to a patient record is logged, and those
        logs are reviewable. Staff who do not need your clinical record cannot reach it.
      </p>

      <h2>Service providers</h2>
      <p>We use third parties for specific functions, each with access limited to that function:</p>
      <ul>
        <li>Cloud hosting and database storage</li>
        <li>WhatsApp, SMS and email delivery for appointment messages</li>
        <li>Payment processing — card and UPI details go to the payment provider, never to us</li>
        <li>Encrypted file storage for X-rays and documents</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        Dental records are kept for the periods required by professional and legal
        obligations, which outlast your treatment and, in the case of records relating to
        someone treated as a minor, run past adulthood. Website enquiries that do not become
        patient records are kept for up to two years. Marketing consents are kept as long as
        the consent stands, plus a record of its withdrawal.
      </p>

      <h2>How we protect it</h2>
      <ul>
        <li>Encryption in transit and at rest</li>
        <li>Role-based access, with the least access needed for each job</li>
        <li>Audit logging of access to patient records</li>
        <li>X-rays and documents served only through short-lived, signed links</li>
        <li>Regular encrypted backups</li>
      </ul>
      <p>
        No system is perfectly secure, and we would rather say that than imply otherwise. If a
        breach affects your data we will tell you and the relevant authority.
      </p>

      <h2>Your rights</h2>
      <ul>
        <li>Ask what we hold about you and get a copy</li>
        <li>Ask us to correct anything inaccurate</li>
        <li>Withdraw consent for messaging or for the use of your photographs</li>
        <li>Ask us to delete your data</li>
        <li>Nominate someone to exercise these rights if you are unable to</li>
        <li>Complain to us, and to the Data Protection Board of India</li>
      </ul>
      <p>
        On deletion, one honest caveat: we cannot delete clinical records we are legally
        required to retain, and we will not pretend otherwise. Where that applies we will
        tell you exactly what we are keeping and why, delete everything we are not obliged to
        keep, and stop all non-essential processing. See{" "}
        <Link href="/patient-rights">your data rights</Link> for how to make a request.
      </p>

      <h2>Cookies</h2>
      <p>
        This site uses a small number of cookies and similar storage: one to keep you signed
        in to the patient portal, and browser storage to remember which campaign brought you
        here for the duration of your visit. If analytics is enabled, it is configured with
        IP anonymisation. We do not use advertising or cross-site tracking cookies.
      </p>

      <h2>Children</h2>
      <p>
        We treat children, and their records are created and accessed by a parent or
        guardian. The patient portal is for adults; a guardian manages a child&apos;s
        appointments and records.
      </p>

      <h2>Changes</h2>
      <p>
        If we change this policy we will update the date above. Material changes affecting how
        we use patient data will be communicated directly, not just posted.
      </p>
    </LegalPage>
  );
}
