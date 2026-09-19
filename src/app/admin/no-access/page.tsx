import Link from "next/link";
import { NoAccessState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/**
 * Shown when a signed-in staff member reaches a page their role does not cover.
 *
 * Deliberately does not name the missing permission. Telling someone exactly
 * which permission would unlock a page turns the UI into a map of what exists
 * beyond their access, and invites them to ask for it by name rather than by
 * need.
 */
export default function NoAccessPage() {
  return (
    <div className="mx-auto max-w-lg py-12">
      <NoAccessState
        title="You do not have access to that page"
        description="Your role does not include this area of the system. If you need it for your work, ask a clinic administrator."
        action={
          <Button asChild variant="outline">
            <Link href="/admin">Back to overview</Link>
          </Button>
        }
      />
    </div>
  );
}
