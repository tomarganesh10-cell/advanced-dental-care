import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { PageHeader, StatCard } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/lib/rbac";
import { formatClinicDate } from "@/lib/time";
import { requireStaffPage } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

export default async function BlogAdminPage() {
  await requireStaffPage(PERMISSIONS.BLOG_MANAGE);

  const posts = await prisma.blogPost.findMany({
    where: { deletedAt: null },
    orderBy: [{ isPublished: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      isPublished: true,
      publishedAt: true,
      updatedContentAt: true,
      medicallyReviewedAt: true,
      createdAt: true,
      category: { select: { name: true } },
      authorDoctor: { select: { displayName: true } },
      authorName: true,
      medicalReviewer: { select: { displayName: true } },
    },
  });

  const published = posts.filter((post) => post.isPublished);
  const unreviewed = published.filter((post) => !post.medicallyReviewedAt);

  return (
    <>
      <PageHeader title="Blog" description="Health content, and who has checked it." />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Published" value={published.length} />
        <StatCard label="Drafts" value={posts.length - published.length} />
        <StatCard
          label="Published without clinical review"
          value={unreviewed.length}
          tone={unreviewed.length > 0 ? "warning" : "default"}
        />
      </div>

      {posts.length === 0 ? (
        <EmptyState
          title="No articles yet"
          description="Articles migrated from the previous site are held as drafts until a clinician has re-reviewed them."
        />
      ) : (
        <div className="overflow-x-auto rounded-(--radius-card) border border-(--color-hairline) bg-white">
          <table className="w-full min-w-[44rem] text-sm">
            <caption className="sr-only">Blog articles</caption>
            <thead className="border-b border-(--color-hairline) bg-(--color-surface-sunken)">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Title
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Author
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Clinical review
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Published
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-hairline)">
              {posts.map((post) => (
                <tr key={post.id}>
                  <td className="px-4 py-3">
                    {post.isPublished ? (
                      <Link
                        href={`/blog/${post.slug}`}
                        className="font-medium text-(--color-action) hover:underline"
                      >
                        {post.title}
                      </Link>
                    ) : (
                      <span className="font-medium">{post.title}</span>
                    )}
                    {post.category ? (
                      <span className="block text-xs text-(--color-ink-subtle)">
                        {post.category.name}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-(--color-ink-muted)">
                    {post.authorDoctor?.displayName ?? post.authorName ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {post.medicalReviewer && post.medicallyReviewedAt ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-(--color-teal-700)">
                        <ShieldCheck className="size-3.5" aria-hidden="true" />
                        {post.medicalReviewer.displayName},{" "}
                        {formatClinicDate(post.medicallyReviewedAt, "d MMM yyyy")}
                      </span>
                    ) : (
                      <span className="text-xs text-(--color-ink-subtle)">Not reviewed</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-(--color-ink-subtle)">
                    {post.publishedAt ? formatClinicDate(post.publishedAt, "d MMM yyyy") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={post.isPublished ? "success" : "neutral"}>
                      {post.isPublished ? "Published" : "Draft"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-xs leading-relaxed text-(--color-ink-subtle)">
        Health content should name the clinician who checked it and when — patients and search
        engines both treat unattributed medical advice as less trustworthy, and rightly. The
        authoring UI is not yet built; see docs/STATUS.md.
      </p>
    </>
  );
}
