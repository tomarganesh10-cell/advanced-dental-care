import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";
import { buildMetadata } from "@/lib/seo";
import { contact, identity } from "@data/clinic-master-data";

export const metadata: Metadata = buildMetadata({
  title: "Medical Disclaimer",
  description:
    "The limits of the health information on this website, and when to seek in-person dental or medical care.",
  path: "/medical-disclaimer",
});

export default function MedicalDisclaimerPage() {
  return (
    <LegalPage
      title="Medical disclaimer"
      lastUpdated="19 September 2026"
      breadcrumb={{ name: "Medical disclaimer", path: "/medical-disclaimer" }}
    >
      <h2>Information, not diagnosis</h2>
      <p>
        Everything on this website is general education about dental conditions and
        treatments. It is not a diagnosis, not a treatment plan and not a substitute for
        being examined. Two people with the same symptom frequently need different treatment,
        and the difference is usually only visible in the mouth or on a radiograph.
      </p>

      <h2>No patient relationship is created by reading this site</h2>
      <p>
        Reading these pages, submitting an enquiry or messaging us does not by itself make you
        a patient of {identity.legalName}. A clinician–patient relationship begins when you
        are examined and accepted for treatment.
      </p>

      <h2>Outcomes vary</h2>
      <p>
        Where this site describes what a treatment usually achieves, that is a general
        expectation, not a prediction about you. Results depend on your specific anatomy,
        medical history, oral hygiene, habits such as smoking or grinding, and how the
        treatment is maintained afterwards. Nothing here is a guarantee.
      </p>

      <h2>Before and after images</h2>
      <p>
        Cases shown in the smile gallery are individual patients, published with their
        written consent. They illustrate what has been achieved for that person. They are not
        a representation of what any other patient will achieve.
      </p>

      <h2>Remote and online assessment</h2>
      <p>
        Any assessment, plan or estimate we provide from photographs, scans or records before
        examining you in person is provisional. It can change after examination, and
        sometimes does. This applies particularly to treatment planned from abroad.
      </p>

      <h2>Urgent symptoms</h2>
      <p>
        Call the clinic on {contact.phone.display} during opening hours for dental pain,
        swelling or a broken tooth. Do not wait for a reply to a web form.
      </p>
      <p>
        <strong>Go to a hospital emergency department immediately</strong> — not to a dental
        clinic — if you have swelling that affects your breathing or swallowing, bleeding that
        will not stop, a facial injury, or a high fever with facial swelling. These are
        medical emergencies.
      </p>

      <h2>External links</h2>
      <p>
        Where we link to another organisation&apos;s information, we do not control that
        content and it may change.
      </p>
    </LegalPage>
  );
}
