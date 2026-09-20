import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";
import { buildMetadata } from "@/lib/seo";
import { contact } from "@data/clinic-master-data";

export const metadata: Metadata = buildMetadata({
  title: "Your Data Rights",
  description:
    "How to access, correct, export or delete your personal and dental records held by Advanced Dental Care Centre.",
  path: "/patient-rights",
});

export default function PatientRightsPage() {
  return (
    <LegalPage
      title="Your data rights"
      lastUpdated="19 September 2026"
      breadcrumb={{ name: "Your data rights", path: "/patient-rights" }}
    >
      <p>
        Your dental records are about you, and you have rights over them. This page explains what
        you can ask for and what actually happens when you ask.
      </p>

      <h2>See what we hold</h2>
      <p>
        Your appointments, treatment plan, prescriptions, shared images and invoices are in your
        patient portal at any time. For the complete record, including clinical notes, ask reception
        or email <a href={`mailto:${contact.email.primary}`}>{contact.email.primary}</a>. We will
        respond within 30 days and there is no charge for a first copy.
      </p>

      <h2>Get a copy to take elsewhere</h2>
      <p>
        If you are moving practice or want a second opinion, we will provide your records —
        including radiographs and, for implant patients, the system and components used. We will not
        delay or obstruct this. A patient who wants a second opinion should get one.
      </p>

      <h2>Correct something</h2>
      <p>
        If your contact details, date of birth or medical history are wrong, tell us and we will
        correct them.
      </p>
      <p>
        Clinical notes work differently. A note that records what a clinician observed on a given
        day is not edited after the fact — that is what makes a medical record trustworthy. If you
        disagree with something recorded, we add your account alongside it as an amendment, dated
        and attributed, and both remain visible. Quietly rewriting history would make the record
        worthless to you as well as to us.
      </p>

      <h2>Stop messages</h2>
      <p>
        Reply STOP to any WhatsApp or SMS message, or tell reception. This stops reminders and
        follow-ups. It does not affect your treatment, and you can turn them back on.
      </p>

      <h2>Withdraw photo consent</h2>
      <p>
        If you consented to your before/after images being published and change your mind, tell us
        and they come off the website. You do not need to give a reason.
      </p>

      <h2>Delete your data</h2>
      <p>Here is the honest position, because this is where policies often mislead.</p>
      <p>
        We can delete your portal account, your contact preferences, your marketing consents and any
        enquiry data that never became a clinical record. We do that on request.
      </p>
      <p>
        We cannot delete clinical records that professional and legal obligations require us to
        retain. Those retention periods exist to protect patients — a record of what treatment you
        had, and why, is what allows any future clinician to treat you safely, and what allows a
        complaint or claim to be investigated fairly.
      </p>
      <p>
        So when you ask us to delete everything, we will tell you specifically what we are keeping,
        on what basis and for how long, delete what we are not obliged to keep, and restrict the
        remainder to that legal purpose only. You will get that in writing.
      </p>

      <h2>How to make a request</h2>
      <p>
        Email <a href={`mailto:${contact.email.primary}`}>{contact.email.primary}</a> or call{" "}
        {contact.phone.display}. Tell us which of the above you want. We will verify your identity
        first — that step protects you from someone else requesting your records — and respond
        within 30 days.
      </p>

      <h2>If you are not satisfied</h2>
      <p>
        Tell us first; most problems are a misunderstanding we can fix quickly. If you remain
        unsatisfied you can complain to the Data Protection Board of India, and, for concerns about
        clinical care or conduct, to the relevant State Dental Council.
      </p>
    </LegalPage>
  );
}
