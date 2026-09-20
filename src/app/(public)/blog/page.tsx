import Link from "next/link";
import type { Metadata } from "next";
import { CalendarDays, ShieldCheck } from "lucide-react";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { Section } from "@/components/marketing/section";
import { EmptyState } from "@/components/ui/states";
import { prisma } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";
import { formatClinicDate } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = buildMetadata({
  title: "Dental Health Blog",
  description:
    "Articles on dental implants, cosmetic dentistry, orthodontics and oral health from the dentists at Advanced Dental Care Centre, Chandigarh.",
  path: "/blog",
});

export const revalidate = 600;

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;

  const [posts, categories] = await Promise.all([
    prisma.blogPost
      .findMany({
        where: {
          isPublished: true,
          deletedAt: null,
          ...(category ? { category: { slug: category } } : {}),
        },
        orderBy: { publishedAt: "desc" },
        take: 30,
        select: {
          id: true,
          slug: true,
          title: true,
          summary: true,
          publishedAt: true,
          readingMinutes: true,
          medicallyReviewedAt: true,
          category: { select: { slug: true, name: true } },
          authorDoctor: { select: { displayName: true } },
          authorName: true,
        },
      })
      .catch(() => []),
    prisma.blogCategory
      .findMany({ orderBy: { displayOrder: "asc" }, select: { slug: true, name: true } })
      .catch(() => []),
  ]);

  return (
    <>
      <Breadcrumbs items={[{ name: "Blog", path: "/blog" }]} />

      <div className="container-page pb-8">
        <h1 className="text-3xl md:text-4xl">Dental health blog</h1>
        <p className="prose-clinic mt-4">
          Written by the clinicians here and reviewed before publication. Where an article discusses
          treatment, it names the dentist who checked it and when — health content you cannot trace
          to a person is health content you should not rely on.
        </p>
      </div>

      {categories.length > 0 ? (
        <div className="container-page">
          <ul className="flex flex-wrap gap-2">
            <li>
              <Link
                href="/blog"
                className={cn(
                  "inline-block rounded-full border px-4 py-2 text-sm font-medium",
                  !category
                    ? "border-[--color-action] bg-[--color-action] text-white"
                    : "border-[--color-navy-200] bg-white text-[--color-ink-muted] hover:bg-[--color-navy-50]",
                )}
              >
                All
              </Link>
            </li>
            {categories.map((item) => (
              <li key={item.slug}>
                <Link
                  href={`/blog?category=${item.slug}`}
                  className={cn(
                    "inline-block rounded-full border px-4 py-2 text-sm font-medium",
                    category === item.slug
                      ? "border-[--color-action] bg-[--color-action] text-white"
                      : "border-[--color-navy-200] bg-white text-[--color-ink-muted] hover:bg-[--color-navy-50]",
                  )}
                >
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Section className="pt-8">
        <div className="container-page">
          {posts.length === 0 ? (
            <EmptyState
              title="No articles published yet"
              description="Articles migrated from the previous site are held as drafts until a clinician has re-reviewed them. They will appear here once approved."
            />
          ) : (
            <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <li key={post.id}>
                  <Link
                    href={`/blog/${post.slug}`}
                    className="flex h-full flex-col rounded-[--radius-card] border border-[--color-hairline] bg-white p-6 transition-shadow hover:shadow-[--shadow-card]"
                  >
                    {post.category ? (
                      <span className="text-xs font-semibold tracking-wide text-[--color-accent] uppercase">
                        {post.category.name}
                      </span>
                    ) : null}
                    <h2 className="mt-2 text-lg leading-snug font-semibold">{post.title}</h2>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-[--color-ink-muted]">
                      {post.summary}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[--color-hairline] pt-3 text-xs text-[--color-ink-subtle]">
                      {post.publishedAt ? (
                        <span className="flex items-center gap-1">
                          <CalendarDays className="size-3" aria-hidden="true" />
                          {formatClinicDate(post.publishedAt, "d MMM yyyy")}
                        </span>
                      ) : null}
                      {post.readingMinutes ? <span>{post.readingMinutes} min read</span> : null}
                      {post.medicallyReviewedAt ? (
                        <span className="flex items-center gap-1 text-[--color-teal-700]">
                          <ShieldCheck className="size-3" aria-hidden="true" />
                          Clinically reviewed
                        </span>
                      ) : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>
    </>
  );
}
