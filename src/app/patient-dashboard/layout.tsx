import Link from "next/link";
import type { Metadata } from "next";
import { PortalNav } from "@/components/portal/portal-nav";
import { requirePatientPage } from "@/server/auth/guards";
import { contact, identity } from "@data/clinic-master-data";

export const metadata: Metadata = {
  title: "Your records",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const principal = await requirePatientPage();

  return (
    <div className="flex min-h-dvh flex-col bg-(--color-surface-sunken)">
      <header className="border-b border-(--color-hairline) bg-white">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <Link
            href="/"
            className="font-[family-name:--font-display] font-semibold text-(--color-primary)"
          >
            {identity.shortName}
          </Link>

          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm leading-tight font-medium">{principal.fullName}</p>
              <p className="text-[11px] text-(--color-ink-subtle)">{principal.patientNumber}</p>
            </div>
            <a
              href={`tel:${contact.phone.e164}`}
              className="rounded-full border border-(--color-navy-200) px-3.5 py-1.5 text-sm font-medium text-(--color-action)"
            >
              Call clinic
            </a>
          </div>
        </div>
      </header>

      <PortalNav />

      <main id="main" className="container-page flex-1 py-6 md:py-8">
        {children}
      </main>

      <footer className="border-t border-(--color-hairline) bg-white py-5">
        <p className="container-page text-center text-xs leading-relaxed text-(--color-ink-subtle)">
          Your records are private to you and the clinicians treating you.{" "}
          <Link href="/patient-rights" className="underline underline-offset-2">
            Your data rights
          </Link>{" "}
          ·{" "}
          <Link href="/privacy-policy" className="underline underline-offset-2">
            Privacy
          </Link>
        </p>
      </footer>
    </div>
  );
}
