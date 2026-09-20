"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, LogIn, Play, UserX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { transitionAppointmentAction } from "@/app/admin/appointments/actions";
import type { AppointmentStatus } from "@/lib/db";

/**
 * Status buttons for one appointment.
 *
 * Only the transitions valid from the current status are offered, mirroring the
 * server-side state machine. Cancelling prompts for a reason inline, because a
 * cancellation report full of blanks tells the clinic nothing about why people
 * cancel.
 */

interface Action {
  to: AppointmentStatus;
  label: string;
  icon: React.ReactNode;
  variant?: "primary" | "outline" | "danger" | "ghost";
  needsReason?: boolean;
}

const ACTIONS_BY_STATUS: Partial<Record<AppointmentStatus, Action[]>> = {
  REQUESTED: [
    { to: "CONFIRMED", label: "Confirm", icon: <Check className="size-4" />, variant: "primary" },
    {
      to: "CANCELLED",
      label: "Decline",
      icon: <X className="size-4" />,
      variant: "ghost",
      needsReason: true,
    },
  ],
  PENDING_CONFIRMATION: [
    { to: "CONFIRMED", label: "Confirm", icon: <Check className="size-4" />, variant: "primary" },
    {
      to: "CANCELLED",
      label: "Cancel",
      icon: <X className="size-4" />,
      variant: "ghost",
      needsReason: true,
    },
  ],
  CONFIRMED: [
    { to: "CHECKED_IN", label: "Check in", icon: <LogIn className="size-4" />, variant: "primary" },
    {
      to: "NO_SHOW",
      label: "Did not attend",
      icon: <UserX className="size-4" />,
      variant: "outline",
    },
    {
      to: "CANCELLED",
      label: "Cancel",
      icon: <X className="size-4" />,
      variant: "ghost",
      needsReason: true,
    },
  ],
  CHECKED_IN: [
    {
      to: "IN_PROGRESS",
      label: "With doctor",
      icon: <Play className="size-4" />,
      variant: "primary",
    },
    {
      to: "NO_SHOW",
      label: "Left without being seen",
      icon: <UserX className="size-4" />,
      variant: "outline",
    },
  ],
  IN_PROGRESS: [
    { to: "COMPLETED", label: "Complete", icon: <Check className="size-4" />, variant: "primary" },
  ],
  NO_SHOW: [
    {
      to: "CONFIRMED",
      label: "Recorded in error",
      icon: <Check className="size-4" />,
      variant: "outline",
    },
  ],
};

export function AppointmentActions({
  appointmentId,
  status,
  size = "sm",
}: {
  appointmentId: string;
  status: AppointmentStatus;
  size?: "sm" | "md";
}) {
  const [pending, startTransition] = useTransition();
  const [reasonFor, setReasonFor] = useState<AppointmentStatus | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const actions = ACTIONS_BY_STATUS[status] ?? [];
  if (actions.length === 0) return null;

  function submit(to: AppointmentStatus, withReason?: string) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("appointmentId", appointmentId);
      formData.set("to", to);
      if (withReason) formData.set("reason", withReason);

      const result = await transitionAppointmentAction(formData);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) {
        setReasonFor(null);
        setReason("");
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {actions.map((action) => (
          <Button
            key={action.to}
            size={size}
            variant={action.variant ?? "outline"}
            disabled={pending}
            onClick={() => {
              if (action.needsReason) {
                setReasonFor(action.to);
                setMessage(null);
              } else {
                submit(action.to);
              }
            }}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : action.icon}
            {action.label}
          </Button>
        ))}
      </div>

      {reasonFor ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit(reasonFor, reason);
          }}
          className="flex flex-wrap gap-2 rounded-lg border border-[--color-hairline] bg-[--color-surface-sunken] p-3"
        >
          <label htmlFor={`reason-${appointmentId}`} className="w-full text-xs font-medium">
            Why is this being cancelled?
          </label>
          <input
            id={`reason-${appointmentId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            maxLength={500}
            autoFocus
            placeholder="Patient unwell, clinician unavailable, patient rescheduled…"
            className="h-9 min-w-0 flex-1 rounded-lg border border-[--color-navy-200] bg-white px-3 text-sm"
          />
          <Button type="submit" size="sm" variant="danger" disabled={pending || !reason.trim()}>
            Confirm cancellation
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setReasonFor(null);
              setReason("");
            }}
          >
            Keep
          </Button>
        </form>
      ) : null}

      {message ? (
        <p
          role="status"
          className={`text-xs ${message.ok ? "text-[--color-teal-700]" : "text-[--color-danger]"}`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
