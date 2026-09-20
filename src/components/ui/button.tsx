import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Button.
 *
 * Minimum target height is 44px on the primary sizes — the booking flow is
 * mostly used on phones, often one-handed, and a 32px tap target is the
 * difference between a booking and a bounce.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-[--color-action] text-white shadow-[--shadow-subtle] hover:bg-[--color-action-hover]",
        secondary:
          "bg-[--color-primary] text-white shadow-[--shadow-subtle] hover:bg-[--color-primary-hover]",
        outline:
          "border border-[--color-navy-200] bg-white text-[--color-primary] hover:bg-[--color-navy-50]",
        ghost: "text-[--color-primary] hover:bg-[--color-navy-50]",
        accent: "bg-[--color-accent] text-white hover:bg-[--color-teal-700]",
        whatsapp: "bg-[#128C7E] text-white hover:bg-[#0f7568]",
        danger: "bg-[--color-danger] text-white hover:bg-[#8f1c13]",
        link: "text-[--color-action] underline underline-offset-4 hover:text-[--color-action-hover]",
      },
      size: {
        sm: "h-9 px-4 text-[13px]",
        md: "h-11 px-5",
        lg: "h-12 px-7 text-base",
        xl: "h-14 px-8 text-base",
        icon: "size-11",
      },
      full: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", full: false },
  },
);

export interface ButtonProps extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, full, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, full }), className)} {...props} />;
}

export { buttonVariants };
