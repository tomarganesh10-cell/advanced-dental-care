"use client";

import { AlertCircle } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Form field primitives.
 *
 * Every input is wired to a real <label> and, when invalid, to an error message
 * via aria-describedby with aria-invalid set. Placeholder-as-label is not used
 * anywhere: it disappears the moment someone types, which is worst for exactly
 * the users who need the label most.
 */

export interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, hint, error, required, children, className }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-[--color-ink]">
        {label}
        {required ? (
          <span className="ml-1 text-[--color-danger]" aria-hidden="true">
            *
          </span>
        ) : (
          <span className="ml-1.5 text-xs font-normal text-[--color-ink-subtle]">(optional)</span>
        )}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-[--color-ink-subtle]">{hint}</p> : null}
      {error ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 text-xs font-medium text-[--color-danger]"
        >
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

const controlBase =
  "w-full rounded-lg border bg-white px-3.5 text-[15px] text-[--color-ink] transition-colors placeholder:text-[--color-ink-subtle]/70 disabled:cursor-not-allowed disabled:bg-[--color-surface-sunken] disabled:opacity-70";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        controlBase,
        "h-11",
        props["aria-invalid"] ? "border-[--color-danger]" : "border-[--color-navy-200]",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        controlBase,
        "min-h-24 py-2.5 leading-relaxed",
        props["aria-invalid"] ? "border-[--color-danger]" : "border-[--color-navy-200]",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        controlBase,
        "h-11 pr-9",
        props["aria-invalid"] ? "border-[--color-danger]" : "border-[--color-navy-200]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export interface CheckboxFieldProps extends Omit<ComponentProps<"input">, "type"> {
  label: ReactNode;
  description?: ReactNode;
}

export function CheckboxField({ label, description, className, id, ...props }: CheckboxFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = description ? `${inputId}-description` : undefined;

  return (
    <div className={cn("flex gap-3", className)}>
      <input
        id={inputId}
        type="checkbox"
        aria-describedby={descriptionId}
        className="mt-0.5 size-4.5 shrink-0 rounded border-[--color-navy-300] accent-[--color-action]"
        {...props}
      />
      <div className="space-y-0.5">
        <label htmlFor={inputId} className="block text-sm leading-snug text-[--color-ink]">
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="text-xs text-[--color-ink-subtle]">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
