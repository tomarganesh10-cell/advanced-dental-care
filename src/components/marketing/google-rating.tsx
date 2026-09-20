import { Star } from "lucide-react";
import { getGoogleRating, googleReviewsUrl } from "@/server/integrations/google-places";
import { formatCount } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * Google rating badge.
 *
 * Renders nothing when no live rating is available. That is the whole point of
 * this component — see docs/CONTENT_AUDIT.md §5.
 */
export async function GoogleRating({
  className,
  tone = "light",
  showLink = false,
}: {
  className?: string;
  tone?: "light" | "dark";
  showLink?: boolean;
}) {
  const rating = await getGoogleRating();
  if (!rating) return null;

  const reviewsUrl = googleReviewsUrl();
  const rounded = Math.round(rating.ratingValue * 10) / 10;

  return (
    <div className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-1", className)}>
      <div className="flex items-center gap-1" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((index) => (
          <Star
            key={index}
            className={cn(
              "size-4",
              index <= Math.round(rounded)
                ? "fill-amber-400 text-amber-400"
                : tone === "dark"
                  ? "text-white/25"
                  : "text-(--color-navy-200)",
            )}
          />
        ))}
      </div>

      <p className={cn("text-sm", tone === "dark" ? "text-white" : "text-(--color-ink)")}>
        <span className="font-semibold">{rounded.toFixed(1)}</span>
        <span className={tone === "dark" ? "text-white/70" : "text-(--color-ink-subtle)"}>
          {" "}
          from {formatCount(rating.reviewCount)} Google reviews
        </span>
      </p>

      {showLink && reviewsUrl ? (
        <a
          href={reviewsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "text-sm font-medium underline underline-offset-4",
            tone === "dark" ? "text-white" : "text-(--color-action)",
          )}
        >
          Read all reviews
        </a>
      ) : null}
    </div>
  );
}
