import { Suspense } from "react";
import type { Metadata } from "next";
import { StaffLoginForm } from "@/components/admin/staff-login-form";
import { LoadingState } from "@/components/ui/states";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Staff Sign In",
  description: "Clinic staff sign-in.",
  path: "/staff-login",
  noIndex: true,
});

export default function StaffLoginPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <StaffLoginForm />
    </Suspense>
  );
}
