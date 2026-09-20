import Link from "next/link";
import { FileImage, Lock, ShieldCheck } from "lucide-react";
import { PageHeader, StatCard } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { prisma } from "@/lib/db";
import { features } from "@/lib/env";
import { PERMISSIONS } from "@/lib/rbac";
import { formatClinicDate } from "@/lib/time";
import { requireStaffPage } from "@/server/auth/guards";

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
  REFERRAL: "Referral",
  INSURANCE: "Insurance",
  OTHER: "Document",
};

export default async function DocumentsPage() {
  await requireStaffPage(PERMISSIONS.DOCUMENT_VIEW);

  const [documents, total, byKind, sharedCount] = await Promise.all([
    prisma.patientDocument.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        kind: true,
        title: true,
        mimeType: true,
        sizeBytes: true,
        isVisibleToPatient: true,
        takenAt: true,
        createdAt: true,
        patient: { select: { id: true, fullName: true, patientNumber: true } },
      },
    }),
    prisma.patientDocument.count({ where: { deletedAt: null } }),
    prisma.patientDocument.groupBy({
      by: ["kind"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.patientDocument.count({ where: { deletedAt: null, isVisibleToPatient: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="Patient documents"
        description="X-rays, scans and reports. Stored privately and served only through short-lived signed links."
      />

      {!features.storage ? (
        <div className="mb-5 flex items-start gap-3 rounded-[--radius-card] border border-amber-200 bg-amber-50 p-4">
          <Lock className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
          <p className="text-sm text-amber-900">
            <strong>Document storage is not configured.</strong> Set the storage bucket and
            credentials before uploading anything. Until then no document can be uploaded or
            downloaded — see docs/DEPLOYMENT.md.
          </p>
        </div>
      ) : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Documents" value={total} icon={<FileImage className="size-4" />} />
        <StatCard label="Shared with patients" value={sharedCount} hint="Visible in the portal" />
        <StatCard label="Types in use" value={byKind.length} />
      </div>

      {documents.length === 0 ? (
        <EmptyState
          title="No documents yet"
          description="Upload is not yet built — see docs/STATUS.md."
        />
      ) : (
        <div className="overflow-x-auto rounded-[--radius-card] border border-[--color-hairline] bg-white">
          <table className="w-full min-w-[44rem] text-sm">
            <caption className="sr-only">Patient documents</caption>
            <thead className="border-b border-[--color-hairline] bg-[--color-surface-sunken]">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Document
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Patient
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Type
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  Size
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Added
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Patient can see
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[--color-hairline]">
              {documents.map((document) => (
                <tr key={document.id}>
                  <td className="px-4 py-2.5 font-medium">{document.title}</td>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/patients/${document.patient.id}`}
                      className="text-[--color-action] hover:underline"
                    >
                      {document.patient.fullName}
                    </Link>
                    <span className="block text-xs text-[--color-ink-subtle]">
                      {document.patient.patientNumber}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[--color-ink-muted]">
                    {KIND_LABELS[document.kind] ?? document.kind}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[--color-ink-subtle] tabular-nums">
                    {formatBytes(document.sizeBytes)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-[--color-ink-subtle]">
                    {formatClinicDate(document.takenAt ?? document.createdAt, "d MMM yyyy")}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={document.isVisibleToPatient ? "success" : "neutral"}>
                      {document.isVisibleToPatient ? "Shared" : "Not shared"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 flex items-start gap-3 rounded-[--radius-card] border border-[--color-hairline] bg-[--color-surface-sunken] p-4">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[--color-accent]" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-[--color-ink-subtle]">
          Documents default to <strong>not shared</strong>. A scan appearing in a patient&apos;s
          portal before anyone has explained it produces anxiety rather than informed patients, so
          sharing is an explicit decision. Patients remain entitled to their full record on request.
          Every download — by staff or by the patient — is recorded in the audit log.
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
