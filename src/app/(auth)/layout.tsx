import Link from "next/link";
import { contact, identity } from "@data/clinic-master-data";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-(--color-surface-sunken)">
      <header className="border-b border-(--color-hairline) bg-white">
        <div className="container-page flex h-16 items-center justify-between">
          <Link
            href="/"
            className="font-[family-name:--font-display] font-semibold text-(--color-primary)"
          >
            {identity.displayName}
          </Link>
          <a
            href={`tel:${contact.phone.e164}`}
            className="text-sm font-medium text-(--color-action)"
          >
            {contact.phone.display}
          </a>
        </div>
      </header>

      <main id="main" className="flex flex-1 items-center justify-center px-5 py-12">
        {children}
      </main>

      <footer className="border-t border-(--color-hairline) bg-white py-5">
        <p className="container-page text-center text-xs text-(--color-ink-subtle)">
          © {new Date().getFullYear()} {identity.legalName} ·{" "}
          <Link href="/privacy-policy" className="underline underline-offset-2">
            Privacy
          </Link>
        </p>
      </footer>
    </div>
  );
}
