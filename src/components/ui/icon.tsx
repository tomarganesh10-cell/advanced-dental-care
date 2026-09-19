import * as icons from "lucide-react";
import type { LucideProps } from "lucide-react";
import { Circle } from "lucide-react";

/**
 * Renders a lucide icon by name.
 *
 * The data files reference icons as strings so the treatment catalogue stays
 * plain data rather than importing React. An unknown name falls back to a
 * neutral shape rather than crashing the page — a typo in content should not
 * take down a route.
 */
type IconComponent = (props: LucideProps) => React.ReactNode;

export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const registry = icons as unknown as Record<string, IconComponent | undefined>;
  const Component = registry[name];

  if (typeof Component !== "function") {
    return <Circle {...props} />;
  }

  return <Component {...props} />;
}
