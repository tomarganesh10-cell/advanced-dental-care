import { Quote, Star } from "lucide-react";
import { listPublishedTestimonials } from "@/server/gallery";
import { GoogleRating } from "./google-rating";
import { googleReviewsUrl } from "@/server/integrations/google-places";

/**
 * Patient testimonials.
 *
 * Only rows explicitly marked published AND consented appear. Nothing here is
 * generated, paraphrased or selected by rating — the Google rating beside it
 * is fetched live, so the two cannot drift apart.
 */
export async function Testimonials({ limit = 6 }: { limit?: number }) {
  const testimonials = await listPublishedTestimonials(limit);
  const reviewsUrl = googleReviewsUrl();

  if (testimonials.length === 0) {
    // Still show the live Google rating if we have one — it is real social
    // proof even with no testimonials migrated yet.
    return (
      <div className="container-page flex justify-center">
        <GoogleRating showLink />
      </div>
    );
  }

  return (
    <div className="container-page">
      <div className="mb-8 flex justify-center">
        <GoogleRating showLink />
      </div>

      <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {testimonials.map((testimonial) => (
          <li
            key={testimonial.id}
            className="flex flex-col rounded-[--radius-card] border border-[--color-hairline] bg-white p-6"
          >
            <Quote className="size-6 text-[--color-navy-200]" aria-hidden="true" />

            {testimonial.rating ? (
              <div className="mt-3 flex gap-0.5" aria-label={`${testimonial.rating} out of 5`}>
                {Array.from({ length: 5 }, (_, index) => (
                  <Star
                    key={index}
                    className={
                      index < (testimonial.rating ?? 0)
                        ? "size-3.5 fill-amber-400 text-amber-400"
                        : "size-3.5 text-[--color-navy-200]"
                    }
                    aria-hidden="true"
                  />
                ))}
              </div>
            ) : null}

            <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-[--color-ink-muted]">
              {testimonial.quote}
            </blockquote>

            <figcaption className="mt-4 border-t border-[--color-hairline] pt-3 text-sm">
              <span className="font-medium text-[--color-ink]">{testimonial.authorName}</span>
              {testimonial.authorLocation ? (
                <span className="text-[--color-ink-subtle]"> · {testimonial.authorLocation}</span>
              ) : null}
            </figcaption>
          </li>
        ))}
      </ul>

      {reviewsUrl ? (
        <div className="mt-8 text-center">
          <a
            href={reviewsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-[--color-action] underline underline-offset-4"
          >
            Read all reviews on Google
          </a>
        </div>
      ) : null}
    </div>
  );
}
