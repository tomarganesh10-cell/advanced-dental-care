import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Section wrapper with a consistent vertical rhythm.
 *
 * Generous, predictable spacing is most of what separates a premium medical
 * layout from a template one, so it is set once here rather than chosen per
 * page.
 */
export function Section({
  children,
  className,
  tone = "default",
  id,
}: {
  children: ReactNode;
  className?: string;
  tone?: "default" | "muted" | "sunken" | "dark";
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "py-16 md:py-24",
        tone === "muted" && "bg-white",
        tone === "sunken" && "bg-(--color-surface-sunken)",
        tone === "dark" && "bg-(--color-navy-900) text-(--color-navy-100)",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  tone = "light",
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  align?: "left" | "center";
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow ? (
        <p
          className={cn(
            "mb-2.5 text-xs font-semibold tracking-[0.16em] uppercase",
            tone === "dark" ? "text-(--color-teal-300)" : "text-(--color-accent)",
          )}
        >
          {eyebrow}
        </p>
      ) : null}
      <h2 className={cn("text-3xl leading-tight md:text-4xl", tone === "dark" && "text-white")}>
        {title}
      </h2>
      {description ? (
        <p
          className={cn(
            "mt-4 text-base leading-relaxed md:text-lg",
            tone === "dark" ? "text-(--color-navy-200)" : "text-(--color-ink-muted)",
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}
