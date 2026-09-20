import { AlertTriangle, Inbox, Loader2, Lock, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/**
 * Standard UI states.
 *
 * Every data-backed screen in this app renders one of these rather than a blank
 * area. An empty region gives the user no way to tell "nothing here yet" from
 * "it is broken" from "still loading", and support calls follow.
 */

interface StateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

function StateShell({
  icon,
  title,
  description,
  action,
  className,
  tone = "neutral",
}: StateProps & { icon: ReactNode; tone?: "neutral" | "danger" }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[--radius-card] border border-dashed px-6 py-12 text-center",
        tone === "danger"
          ? "border-red-200 bg-red-50/50"
          : "border-[--color-navy-200] bg-[--color-surface-muted]",
        className,
      )}
    >
      <div
        className={cn(
          "mb-3 flex size-11 items-center justify-center rounded-full",
          tone === "danger"
            ? "bg-red-100 text-red-700"
            : "bg-[--color-navy-100] text-[--color-navy-700]",
        )}
        aria-hidden="true"
      >
        {icon}
      </div>
      <p className="font-semibold text-[--color-primary]">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-[--color-ink-subtle]">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function EmptyState(props: StateProps) {
  return <StateShell icon={<Inbox className="size-5" />} {...props} />;
}

export function ErrorState({ onRetry, ...props }: StateProps & { onRetry?: () => void }) {
  return (
    <StateShell
      icon={<AlertTriangle className="size-5" />}
      tone="danger"
      {...props}
      action={
        props.action ??
        (onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        ) : null)
      }
    />
  );
}

export function OfflineState(props: StateProps) {
  return <StateShell icon={<WifiOff className="size-5" />} {...props} />;
}

export function NoAccessState(props: StateProps) {
  return <StateShell icon={<Lock className="size-5" />} {...props} />;
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-3 py-12 text-sm text-[--color-ink-subtle]"
    >
      <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

/** Skeleton block for content-shaped loading. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-[--color-navy-100]", className)}
      aria-hidden="true"
    />
  );
}
