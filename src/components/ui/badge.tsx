import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium [&_svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "bg-(--color-navy-100) text-(--color-navy-800)",
        info: "bg-(--color-medical-100) text-(--color-medical-800)",
        success: "bg-(--color-teal-100) text-(--color-teal-800)",
        warning: "bg-amber-100 text-amber-900",
        danger: "bg-red-100 text-red-900",
        outline: "border border-(--color-navy-200) bg-white text-(--color-ink-muted)",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps extends ComponentProps<"span">, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
