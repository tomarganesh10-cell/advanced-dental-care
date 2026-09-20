"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  FileImage,
  LayoutDashboard,
  LogOut,
  ReceiptText,
  Stethoscope,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/patient-dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/patient-dashboard/appointments", label: "Appointments", icon: CalendarDays },
  { href: "/patient-dashboard/treatment-plan", label: "Treatment", icon: Stethoscope },
  { href: "/patient-dashboard/documents", label: "Records", icon: FileImage },
  { href: "/patient-dashboard/invoices", label: "Invoices", icon: ReceiptText },
];

export function PortalNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/patient-login");
    router.refresh();
  }

  return (
    <nav aria-label="Your records" className="border-b border-[--color-hairline] bg-white">
      <div className="container-page flex items-center gap-1 overflow-x-auto">
        {ITEMS.map((item) => {
          const isActive =
            item.href === "/patient-dashboard"
              ? pathname === "/patient-dashboard"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition-colors",
                isActive
                  ? "border-[--color-action] text-[--color-action]"
                  : "border-transparent text-[--color-ink-muted] hover:text-[--color-primary]",
              )}
            >
              <item.icon className="size-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => void signOut()}
          className="ml-auto flex shrink-0 items-center gap-1.5 px-3 py-3 text-sm font-medium text-[--color-ink-subtle] hover:text-[--color-ink]"
        >
          <LogOut className="size-4" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </nav>
  );
}
