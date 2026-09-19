import { redirect } from "next/navigation";

/**
 * The old site used /dental-tourism. Rather than maintaining two pages that
 * say the same thing and compete in search, this route redirects to the single
 * canonical page. The redirect is also in data/legacy-redirects.ts for the
 * paths that never existed as routes here.
 */
export default function DentalTourismPage() {
  redirect("/international-patients");
}
