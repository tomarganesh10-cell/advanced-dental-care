import type { Metadata } from "next";
import { PatientLoginForm } from "@/components/portal/patient-login-form";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Patient Login",
  description: "Sign in to view your appointments, treatment plan, records and invoices.",
  path: "/patient-login",
  noIndex: true,
});

export default function PatientLoginPage() {
  return <PatientLoginForm />;
}
