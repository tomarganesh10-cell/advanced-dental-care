import { Download, FileImage, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { formatClinicDate } from "@/lib/time";
import { requirePatientPage } from "@/server/auth/guards";
import { getPortalDocuments, getPortalPrescriptions } from "@/server/portal";
import { contact } from "@data/clinic-master-data";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  XRAY: "X-ray",
  CBCT: "CBCT scan",
  INTRAORAL_PHOTO: "Clinical photograph",
  EXTRAORAL_PHOTO: "Photograph",
  LAB_REPORT: "Laboratory report",
  CONSENT_FORM: "Consent form",
  INVOICE: "Invoice",
  PRESCRIPTION: "Prescription",
  REFERRAL: "Referral letter",
  INSURANCE: "Insurance document",
  OTHER: "Document",
};

export default async function PortalDocumentsPage() {
  const principal = await requirePatientPage();
  const [documents, prescriptions] = await Promise.all([
    getPortalDocuments(principal),
    getPortalPrescriptions(principal),
  ]);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl">Your records</h1>
        <p className="mt-1 text-sm text-(--color-ink-subtle)">
          Documents and prescriptions the clinic has shared with you.
        </p>
      </div>

      <section className="mb-8" aria-label="Documents">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-(--color-ink-subtle) uppercase">
          Documents
        </h2>

        {documents.length === 0 ? (
          <EmptyState
            title="No documents shared yet"
            description="X-rays and reports appear here once your dentist has been through them with you."
          />
        ) : (
          <ul className="divide-y divide-(--color-hairline) overflow-hidden rounded-(--radius-card) border border-(--color-hairline) bg-white">
            {documents.map((document) => (
              <li key={document.id} className="flex items-center gap-4 px-4 py-3.5">
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-(--color-navy-50) text-(--color-navy-600)"
                  aria-hidden="true"
                >
                  <FileImage className="size-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{document.title}</p>
                  <p className="text-xs text-(--color-ink-subtle)">
                    {KIND_LABELS[document.kind] ?? document.kind} ·{" "}
                    {formatClinicDate(document.takenAt ?? document.createdAt, "d MMM yyyy")} ·{" "}
                    {formatBytes(document.sizeBytes)}
                  </p>
                  {document.description ? (
                    <p className="mt-0.5 text-xs text-(--color-ink-muted)">
                      {document.description}
                    </p>
                  ) : null}
                </div>

                {/*
                  The link goes to our own route, which checks the session,
                  confirms the document belongs to this patient, logs the access
                  and only then issues a short-lived signed URL. There is no
                  public URL for any patient document.
                */}
                <a
                  href={`/api/portal/documents/${document.id}`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-(--color-navy-200) px-3 py-1.5 text-sm font-medium text-(--color-action) hover:bg-(--color-navy-50)"
                >
                  <Download className="size-3.5" aria-hidden="true" />
                  Download
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Prescriptions">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-(--color-ink-subtle) uppercase">
          Prescriptions
        </h2>

        {prescriptions.length === 0 ? (
          <EmptyState title="No prescriptions" />
        ) : (
          <ul className="space-y-3">
            {prescriptions.map((prescription) => (
              <li
                key={prescription.id}
                className="rounded-(--radius-card) border border-(--color-hairline) bg-white p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {formatClinicDate(prescription.issuedAt, "d MMMM yyyy")}
                  </p>
                  <Badge tone="outline">{prescription.reference}</Badge>
                </div>
                {prescription.doctor ? (
                  <p className="mt-0.5 text-xs text-(--color-ink-subtle)">
                    Prescribed by {prescription.doctor.displayName}
                  </p>
                ) : null}

                <ul className="mt-3 space-y-2">
                  {prescription.items.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-lg bg-(--color-surface-sunken) p-3 text-sm"
                    >
                      <p className="font-medium">
                        {item.drugName}
                        {item.strength ? ` ${item.strength}` : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-(--color-ink-muted)">
                        {[
                          item.dosage,
                          item.frequency,
                          item.durationDays ? `for ${item.durationDays} days` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {item.instructions ? (
                        <p className="mt-1 text-xs text-(--color-ink-subtle)">
                          {item.instructions}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>

                {prescription.notes ? (
                  <p className="mt-3 text-xs text-(--color-ink-muted)">{prescription.notes}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-8 flex items-start gap-3 rounded-(--radius-card) border border-(--color-hairline) bg-white p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-(--color-ink-subtle)" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-(--color-ink-subtle)">
          Not everything in your record appears here. Your dentist shares images and reports once
          they have been through them with you, because a scan without an explanation usually causes
          more worry than it resolves. You are entitled to your full record at any time — ask
          reception, or call {contact.phone.display}.
        </p>
      </div>
    </>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
