import { CheckCircle2, Circle, CircleDot, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { formatPaise } from "@/lib/utils";
import { requirePatientPage } from "@/server/auth/guards";
import { getPortalOverview } from "@/server/portal";
import { contact, disclaimers } from "@data/clinic-master-data";

export const dynamic = "force-dynamic";

const ITEM_ICONS = {
  COMPLETED: CheckCircle2,
  IN_PROGRESS: CircleDot,
  PLANNED: Circle,
  CANCELLED: Circle,
} as const;

export default async function PortalTreatmentPlanPage() {
  const principal = await requirePatientPage();
  const { plan } = await getPortalOverview(principal);

  if (!plan) {
    return (
      <>
        <h1 className="mb-6 text-2xl">Your treatment plan</h1>
        <EmptyState
          title="No treatment plan shared yet"
          description="Your dentist will share a plan here once one has been discussed and agreed with you. If you have had a consultation and expected to see something, call the clinic."
        />
      </>
    );
  }

  const completed = plan.items.filter((item) => item.status === "COMPLETED").length;
  const progress = plan.items.length > 0 ? Math.round((completed / plan.items.length) * 100) : 0;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl">{plan.title}</h1>
        {plan.summary ? (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-(--color-ink-muted)">
            {plan.summary}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone={plan.status === "IN_PROGRESS" ? "info" : "neutral"}>
            {plan.status.toLowerCase().replace(/_/g, " ")}
          </Badge>
          <span className="text-sm text-(--color-ink-subtle)">
            {completed} of {plan.items.length} steps completed
          </span>
        </div>
      </div>

      {/* Progress */}
      <div className="mb-6">
        <div
          className="h-2 overflow-hidden rounded-full bg-(--color-navy-100)"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Treatment progress"
        >
          <div
            className="h-full rounded-full bg-(--color-accent)"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <ol className="space-y-3">
        {plan.items.map((item, index) => {
          const Icon = ITEM_ICONS[item.status as keyof typeof ITEM_ICONS] ?? Circle;
          const isCancelled = item.status === "CANCELLED";

          return (
            <li
              key={item.id}
              className={`flex gap-4 rounded-(--radius-card) border border-(--color-hairline) bg-white p-5 ${
                isCancelled ? "opacity-60" : ""
              }`}
            >
              <span
                className={`mt-0.5 shrink-0 ${
                  item.status === "COMPLETED"
                    ? "text-(--color-teal-600)"
                    : item.status === "IN_PROGRESS"
                      ? "text-(--color-action)"
                      : "text-(--color-navy-300)"
                }`}
                aria-hidden="true"
              >
                <Icon className="size-5" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className={`font-medium ${isCancelled ? "line-through" : ""}`}>
                    {index + 1}. {item.description}
                  </p>
                  {item.unitPricePaise > 0 ? (
                    <span className="shrink-0 text-sm text-(--color-ink-muted) tabular-nums">
                      {formatPaise(item.unitPricePaise * item.quantity)}
                    </span>
                  ) : null}
                </div>

                {item.toothNumbers.length > 0 ? (
                  <p className="mt-1 text-xs text-(--color-ink-subtle)">
                    Teeth: {item.toothNumbers.join(", ")}
                  </p>
                ) : null}

                <p className="mt-1.5 text-xs text-(--color-ink-subtle)">
                  {item.status.toLowerCase().replace(/_/g, " ")}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {plan.estimatedTotalPaise > 0 ? (
        <div className="mt-5 flex items-center justify-between rounded-(--radius-card) border border-(--color-hairline) bg-white px-5 py-4">
          <span className="font-medium">Estimated total</span>
          <span className="font-[family-name:--font-display] text-xl font-semibold tabular-nums">
            {formatPaise(plan.estimatedTotalPaise)}
          </span>
        </div>
      ) : null}

      <div className="mt-6 flex items-start gap-3 rounded-(--radius-card) border border-(--color-hairline) bg-(--color-surface-sunken) p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-(--color-ink-subtle)" aria-hidden="true" />
        <div className="text-xs leading-relaxed text-(--color-ink-subtle)">
          <p>
            This is an estimate based on what was found at your examination. If something changes
            during treatment — and occasionally it does — we will discuss it with you before going
            ahead, not afterwards.
          </p>
          <p className="mt-2">{disclaimers.medical}</p>
          <p className="mt-2">
            Questions about the plan? Call {contact.phone.display} and ask to speak to your dentist.
          </p>
        </div>
      </div>
    </>
  );
}
