"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Clock, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkInAction, checkOutAction } from "@/app/admin/attendance/actions";

export interface AttendanceClockProps {
  fullName: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  lateMinutes: number;
  monthSummary: { present: number; late: number; leave: number; absent: number; hours: string };
}

/**
 * Staff check-in card.
 *
 * One obvious action at a time — check in, or check out — because this is used
 * at the start of a shift by someone with a coat in one hand.
 */
export function AttendanceClock({
  fullName,
  checkedInAt,
  checkedOutAt,
  lateMinutes,
  monthSummary,
}: AttendanceClockProps) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const result = await action();
      setMessage({ ok: result.ok, text: result.message });
    });
  }

  const state = !checkedInAt ? "out" : !checkedOutAt ? "in" : "done";

  return (
    <div className="rounded-[--radius-card] border border-[--color-hairline] bg-white p-6">
      <p className="text-sm text-[--color-ink-subtle]">Welcome back,</p>
      <h2 className="text-xl">{fullName.split(" ")[0]}</h2>

      <div className="mt-5">
        {state === "out" ? (
          <Button size="lg" full onClick={() => run(checkInAction)} disabled={pending}>
            <LogIn aria-hidden="true" />
            Check in
          </Button>
        ) : state === "in" ? (
          <>
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-[--color-teal-50] p-3 text-sm text-[--color-teal-900]">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
              <span>
                Checked in at <strong>{checkedInAt}</strong>
                {lateMinutes > 0 ? ` · ${lateMinutes} min late` : ""}
              </span>
            </div>
            <Button size="lg" variant="outline" full onClick={() => run(checkOutAction)} disabled={pending}>
              <LogOut aria-hidden="true" />
              Check out
            </Button>
          </>
        ) : (
          <div className="flex items-center gap-2 rounded-lg bg-[--color-navy-50] p-3 text-sm text-[--color-navy-900]">
            <Clock className="size-4 shrink-0" aria-hidden="true" />
            <span>
              {checkedInAt} – {checkedOutAt}. Shift recorded.
            </span>
          </div>
        )}
      </div>

      {message ? (
        <p
          role="status"
          className={`mt-3 rounded-lg p-2.5 text-sm ${
            message.ok ? "bg-[--color-teal-50] text-[--color-teal-900]" : "bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <dl className="mt-6 grid grid-cols-2 gap-3 border-t border-[--color-hairline] pt-5 text-sm sm:grid-cols-5">
        {[
          { label: "Present", value: monthSummary.present },
          { label: "Late", value: monthSummary.late },
          { label: "Leave", value: monthSummary.leave },
          { label: "Absent", value: monthSummary.absent },
          { label: "Hours", value: monthSummary.hours },
        ].map((item) => (
          <div key={item.label}>
            <dt className="text-xs text-[--color-ink-subtle]">{item.label}</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-[--color-ink-subtle]">This month</p>
    </div>
  );
}
