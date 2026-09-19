"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { NavGroup } from "./admin-nav";

export interface AdminShellProps {
  /** Pre-filtered on the server to what this person may see. */
  nav: NavGroup[];
  user: { fullName: string; role: string; roleLabel: string };
  badges?: Partial<Record<string, number>>;
  children: React.ReactNode;
}

export function AdminShell({ nav, user, badges = {}, children }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setSidebarOpen(false);
  }

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/staff-login");
    router.refresh();
  }

  return (
    <div className="min-h-dvh bg-[--color-surface-sunken]">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-[--color-hairline] bg-white">
        <div className="flex h-14 items-center gap-3 px-4">
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            className="flex size-9 items-center justify-center rounded-lg border border-[--color-navy-200] lg:hidden"
            aria-label={sidebarOpen ? "Close menu" : "Open menu"}
            aria-expanded={sidebarOpen}
          >
            {sidebarOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>

          <Link href="/admin" className="font-[family-name:--font-display] font-semibold text-[--color-primary]">
            Advanced Dental
            <span className="ml-2 rounded bg-[--color-navy-100] px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-[--color-navy-700] uppercase">
              Clinic
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm leading-tight font-medium text-[--color-ink]">{user.fullName}</p>
              <p className="text-[11px] text-[--color-ink-subtle]">{user.roleLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex size-9 items-center justify-center rounded-lg border border-[--color-navy-200] text-[--color-ink-muted] hover:bg-[--color-navy-50]"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <nav
          aria-label="Admin"
          className={cn(
            "fixed inset-y-0 top-14 z-20 w-64 overflow-y-auto border-r border-[--color-hairline] bg-white px-3 py-4 transition-transform lg:sticky lg:top-14 lg:h-[calc(100dvh-3.5rem)] lg:translate-x-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {nav.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="mb-1.5 px-3 text-[10px] font-semibold tracking-[0.12em] text-[--color-ink-subtle] uppercase">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive =
                    item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
                  const badge = item.badgeKey ? badges[item.badgeKey] : undefined;

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-[--color-medical-50] text-[--color-action]"
                            : "text-[--color-ink-muted] hover:bg-[--color-navy-50] hover:text-[--color-primary]",
                        )}
                      >
                        <Icon name={item.icon} className="size-4 shrink-0" aria-hidden="true" />
                        <span className="flex-1">{item.label}</span>
                        {badge && badge > 0 ? (
                          <span className="rounded-full bg-[--color-action] px-1.5 py-0.5 text-[10px] font-semibold text-white tabular-nums">
                            {badge > 99 ? "99+" : badge}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {sidebarOpen ? (
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 top-14 z-10 bg-black/30 lg:hidden"
          />
        ) : null}

        <main id="main" className="min-w-0 flex-1 px-4 py-6 md:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
