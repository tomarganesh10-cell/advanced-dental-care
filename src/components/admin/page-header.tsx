import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-[--color-ink-subtle]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "warning" | "danger" | "success";
  icon?: ReactNode;
}) {
  const toneClasses = {
    default: "border-[--color-hairline] bg-white",
    warning: "border-amber-200 bg-amber-50",
    danger: "border-red-200 bg-red-50",
    success: "border-[--color-teal-200] bg-[--color-teal-50]",
  } as const;

  return (
    <div className={`rounded-[--radius-card] border p-4 ${toneClasses[tone]}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-[--color-ink-subtle] uppercase">
          {label}
        </p>
        {icon ? (
          <span className="text-[--color-ink-subtle]" aria-hidden="true">
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-2 font-[family-name:--font-display] text-2xl font-semibold text-[--color-primary] tabular-nums">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-[--color-ink-subtle]">{hint}</p> : null}
    </div>
  );
}
