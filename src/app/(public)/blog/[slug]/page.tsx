import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { marked } from "marked";
import { CalendarDays, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { BookingCta } from "@/components/marketing/booking-cta";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { Section } from "@/components/marketing/section";
import { JsonLd } from "@/components/seo/json-ld";
import { prisma } from "@/lib/db";
import { articleSchema, buildMetadata, faqSchema } from "@/lib/seo";
import { formatClinicDate } from "@/lib/time";
import { disclaimers } from "@data/clinic-master-data";

export const revalidate = 600;

async function loadPost(slug: string) {
  return prisma.blogPost
    .findFirst({
      where: { slug, isPublished: true, deletedAt: null },
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        content: true,
        publishedAt: true,
        updatedContentAt: true,
        readingMinutes: true,
        medicallyReviewedAt: true,
        seoTitle: true,
        seoDescription: true,
        coverImageUrl: true,
        faqs: true,
        tags: true,
        category: { select: { slug: true, name: true } },
        authorName: true,
        authorDoctor: { select: { displayName: true, slug: true } },
        medicalReviewer: { select: { displayName: true, slug: true } },
      },
    })
    .catch(() => null);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await loadPost(slug);
  if (!post) return {};

  return buildMetadata({
    title: post.seoTitle ?? post.title,
    description: post.seoDescription ?? post.summary,
    path: `/blog/${post.slug}`,
    type: "article",
    ogImage: post.coverImageUrl ?? undefined,
    publishedTime: post.publishedAt?.toISOString(),
    modifiedTime: (post.updatedContentAt ?? post.publishedAt)?.toISOString(),
  });
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await loadPost(slug);
  if (!post) notFound();

  const authorName = post.authorDoctor?.displayName ?? post.authorName ?? "The clinical team";

  /**
   * Markdown is rendered with `marked` and its own sanitiser settings. Post
   * bodies are authored by clinic staff in the admin panel, not by the public,
   * but an admin account is still a lower trust boundary than the application
   * itself — so raw HTML passthrough is disabled rather than trusted.
   */
  const html = await marked.parse(post.content, { async: true, gfm: true, breaks: false });

  const faqs = Array.isArray(post.faqs)
    ? (post.faqs as Array<{ question: string; answer: string }>)
    : [];

  return (
    <>
      <Breadcrumbs
        items={[
          { name: "Blog", path: "/blog" },
          { name: post.title, path: `/blog/${post.slug}` },
        ]}
      />

      <article className="container-page max-w-3xl pb-12">
        {post.category ? (
          <Link
            href={`/blog?category=${post.category.slug}`}
            className="text-xs font-semibold tracking-wide text-(--color-accent) uppercase"
          >
            {post.category.name}
          </Link>
        ) : null}

        <h1 className="mt-3 text-3xl leading-tight md:text-4xl">{post.title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-(--color-ink-muted)">{post.summary}</p>

        {/*
          Authorship, review status and dates sit at the top, not buried at the
          bottom. For health content, who wrote it and when it was last checked
          is part of the information, not metadata.
        */}
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-(--color-hairline) py-4 text-sm text-(--color-ink-subtle)">
          <span className="flex items-center gap-1.5">
            <UserRound className="size-4" aria-hidden="true" />
            {post.authorDoctor ? (
              <Link href={`/doctors/${post.authorDoctor.slug}`} className="hover:underline">
                {authorName}
              </Link>
            ) : (
              authorName
            )}
          </span>

          {post.publishedAt ? (
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-4" aria-hidden="true" />
              Published {formatClinicDate(post.publishedAt, "d MMMM yyyy")}
            </span>
          ) : null}

          {post.updatedContentAt ? (
            <span className="flex items-center gap-1.5">
              <RefreshCw className="size-4" aria-hidden="true" />
              Updated {formatClinicDate(post.updatedContentAt, "d MMMM yyyy")}
            </span>
          ) : null}

          {post.readingMinutes ? <span>{post.readingMinutes} min read</span> : null}
        </div>

        {post.medicalReviewer && post.medicallyReviewedAt ? (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-(--color-teal-50) p-4 text-sm text-(--color-teal-900)">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              Clinically reviewed by{" "}
              <Link
                href={`/doctors/${post.medicalReviewer.slug}`}
                className="font-medium underline"
              >
                {post.medicalReviewer.displayName}
              </Link>{" "}
              on {formatClinicDate(post.medicallyReviewedAt, "d MMMM yyyy")}.
            </span>
          </p>
        ) : null}

        <div
          className="prose-clinic mt-8 [&_a]:text-(--color-action) [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mt-9 [&_h2]:mb-3 [&_h2]:text-xl [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-base [&_li]:mt-1.5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        {faqs.length > 0 ? (
          <div className="mt-12">
            <h2 className="mb-5 text-xl">Common questions</h2>
            <FaqAccordion faqs={faqs} />
          </div>
        ) : null}

        <p className="mt-10 rounded-(--radius-card) border border-(--color-hairline) bg-(--color-surface-sunken) p-5 text-xs leading-relaxed text-(--color-ink-subtle)">
          {disclaimers.medical}
        </p>
      </article>

      <Section tone="sunken">
        <BookingCta title="Have a question about your own teeth?" />
      </Section>

      <JsonLd
        data={[
          articleSchema({
            title: post.title,
            description: post.summary,
            slug: post.slug,
            publishedAt: post.publishedAt ?? new Date(),
            updatedAt: post.updatedContentAt,
            authorName,
            reviewerName: post.medicalReviewer?.displayName ?? null,
            reviewedAt: post.medicallyReviewedAt,
            imageUrl: post.coverImageUrl,
          }),
          ...(faqs.length > 0 ? [faqSchema(faqs)] : []),
        ]}
      />
    </>
  );
}
