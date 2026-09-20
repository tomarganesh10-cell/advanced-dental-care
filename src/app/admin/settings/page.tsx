import Link from "next/link";
import { AlertTriangle, CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/db";
import { env, features } from "@/lib/env";
import { PERMISSIONS } from "@/lib/rbac";
import { formatClinicDateTime } from "@/lib/time";
import { requireStaffPage } from "@/server/auth/guards";
import { contact, identity, openingHours } from "@data/clinic-master-data";
import { flattenClaims } from "@data/verification";
import clinicMasterData from "@data/clinic-master-data";

export const dynamic = "force-dynamic";

/**
 * Settings.
 *
 * Mostly a readiness board rather than a form. The genuinely useful thing this
 * screen can do today is tell the clinic what is configured and what is not —
 * "why are no WhatsApp messages going out" has an answer here rather than
 * requiring someone to read an env file.
 *
 * Nothing on this page displays a secret value, only whether one is present.
 */
export default async function SettingsPage() {
  await requireStaffPage(PERMISSIONS.SETTINGS_VIEW);

  const [settings, claimRows, patientCounter] = await Promise.all([
    prisma.setting.findMany({ orderBy: { key: "asc" } }),
    prisma.contentClaim.findMany({ select: { status: true } }),
    prisma.setting.findUnique({ where: { key: "patient_number_counter" } }),
  ]);

  const fileClaims = flattenClaims(clinicMasterData);
  const verifiedInDb = claimRows.filter((row) => row.status === "VERIFIED").length;
  const verifiedInFile = fileClaims.filter((claim) => claim.status === "VERIFIED").length;
  const pendingClaims = fileClaims.length - Math.max(verifiedInDb, verifiedInFile);

  const integrations = [
    {
      name: "WhatsApp",
      ready: env.WHATSAPP_PROVIDER === "meta",
      detail:
        env.WHATSAPP_PROVIDER === "meta"
          ? "Live, sending through the Meta Cloud API"
          : env.WHATSAPP_PROVIDER === "console"
            ? "Logging only — messages are not being sent to patients"
            : "Disabled",
      doc: "docs/WHATSAPP.md",
    },
    {
      name: "Email",
      ready: env.EMAIL_PROVIDER === "resend" || env.EMAIL_PROVIDER === "smtp",
      detail:
        env.EMAIL_PROVIDER === "console"
          ? "Logging only — emails are not being sent"
          : `Provider: ${env.EMAIL_PROVIDER}`,
      doc: "docs/WHATSAPP.md",
    },
    {
      name: "SMS",
      ready: env.SMS_PROVIDER === "msg91",
      detail: env.SMS_PROVIDER === "console" ? "Logging only" : `Provider: ${env.SMS_PROVIDER}`,
      doc: "docs/WHATSAPP.md",
    },
    {
      name: "Online payments",
      ready: features.payments,
      detail: features.payments
        ? "Razorpay configured"
        : "Not configured — patients cannot pay online",
      doc: "docs/PAYMENTS.md",
    },
    {
      name: "Document storage",
      ready: features.storage,
      detail: features.storage
        ? `Bucket: ${env.STORAGE_BUCKET}`
        : "Not configured — X-rays cannot be uploaded or downloaded",
      doc: "docs/DEPLOYMENT.md",
    },
    {
      name: "Google reviews",
      ready: features.googleReviews,
      detail: features.googleReviews
        ? "Live rating fetched and cached"
        : "Not configured — the website shows no rating at all, deliberately",
      doc: "docs/CONTENT_AUDIT.md",
    },
    {
      name: "Google Maps",
      ready: features.maps,
      detail: features.maps ? "API key configured" : "Using the keyless embed fallback",
      doc: "docs/DEPLOYMENT.md",
    },
    {
      name: "Analytics",
      ready: features.analytics,
      detail: features.analytics
        ? "GA configured, plus first-party event capture"
        : "First-party event capture only",
      doc: "docs/ARCHITECTURE.md",
    },
    {
      name: "Redis",
      ready: features.redis,
      detail: features.redis
        ? "Shared rate limiting enabled"
        : "In-process limiter only — bypassable behind more than one instance",
      doc: "docs/DEPLOYMENT.md",
    },
  ];

  const notReady = integrations.filter((integration) => !integration.ready);

  return (
    <>
      <PageHeader
        title="Settings"
        description="What is configured, and what still needs attention before launch."
      />

      {notReady.length > 0 ? (
        <div className="mb-5 flex items-start gap-3 rounded-(--radius-card) border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
          <p className="text-sm text-amber-900">
            <strong>
              {notReady.length} integration{notReady.length === 1 ? " is" : "s are"} not live.
            </strong>{" "}
            This is expected before launch. Anything listed as &ldquo;logging only&rdquo; means the
            full pipeline runs but nothing reaches patients.
          </p>
        </div>
      ) : null}

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-(--color-ink-subtle) uppercase">
          Integrations
        </h2>
        <ul className="divide-y divide-(--color-hairline) overflow-hidden rounded-(--radius-card) border border-(--color-hairline) bg-white">
          {integrations.map((integration) => (
            <li key={integration.name} className="flex items-start gap-3 px-4 py-3">
              {integration.ready ? (
                <CheckCircle2
                  className="mt-0.5 size-4 shrink-0 text-(--color-teal-600)"
                  aria-hidden="true"
                />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{integration.name}</p>
                <p className="text-xs text-(--color-ink-subtle)">{integration.detail}</p>
              </div>
              <Badge tone={integration.ready ? "success" : "warning"}>
                {integration.ready ? "Live" : "Not live"}
              </Badge>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-(--color-ink-subtle)">
          Credentials are held in the environment and never shown here. Only whether a value is
          present is displayed.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-(--color-ink-subtle) uppercase">
          Clinic details
        </h2>
        <dl className="grid gap-3 rounded-(--radius-card) border border-(--color-hairline) bg-white p-5 text-sm sm:grid-cols-2">
          <Row label="Practice name" value={identity.legalName} />
          <Row label="Address" value={contact.address.formatted} />
          <Row label="Phone" value={contact.phone.display} />
          <Row label="Email" value={contact.email.primary} />
          <Row label="Opening hours" value={`${openingHours.value.length} day(s) configured`} />
          <Row
            label="Next patient number"
            value={
              typeof patientCounter?.value === "number"
                ? `ADC-P-${String(patientCounter.value + 1).padStart(6, "0")}`
                : "ADC-P-000001"
            }
          />
        </dl>
        <p className="mt-2 text-xs text-(--color-ink-subtle)">
          These come from <code className="font-mono">data/clinic-master-data.ts</code>. Changing
          them is a code change by design, so the address and phone number on invoices, emails and
          the website cannot drift apart.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-(--color-ink-subtle) uppercase">
          Content verification
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-card) border border-(--color-hairline) bg-white p-5">
          <div>
            <p className="text-sm">
              <strong>{fileClaims.length}</strong> public claims,{" "}
              <strong>{Math.max(verifiedInDb, verifiedInFile)}</strong> verified,{" "}
              <strong>{pendingClaims}</strong> withheld from the website.
            </p>
            <p className="mt-1 text-xs text-(--color-ink-subtle)">
              Claims are hidden until someone records the evidence behind them.
            </p>
          </div>
          <Link
            href="/admin/content-verification"
            className="inline-flex items-center gap-1.5 rounded-full border border-(--color-navy-200) px-4 py-2 text-sm font-medium text-(--color-action) hover:bg-(--color-navy-50)"
          >
            Open
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {settings.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-(--color-ink-subtle) uppercase">
            Stored settings
          </h2>
          <div className="overflow-hidden rounded-(--radius-card) border border-(--color-hairline) bg-white">
            <table className="w-full text-sm">
              <caption className="sr-only">Application settings</caption>
              <thead className="border-b border-(--color-hairline) bg-(--color-surface-sunken)">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">
                    Key
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">
                    Value
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-left font-medium">
                    Updated
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-hairline)">
                {settings.map((setting) => (
                  <tr key={setting.key}>
                    <td className="px-4 py-2.5 font-mono text-xs">{setting.key}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-(--color-ink-muted)">
                      {JSON.stringify(setting.value)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-(--color-ink-subtle)">
                      {formatClinicDateTime(setting.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-(--color-ink-subtle)">{label}</dt>
      <dd className="mt-0.5 text-(--color-ink)">{value}</dd>
    </div>
  );
}
