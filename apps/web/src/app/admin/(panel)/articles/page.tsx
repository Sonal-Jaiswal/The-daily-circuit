import Link from "next/link";
import { ArticleStatus, getPrisma, type Prisma } from "@tdc/db";
import { sectionInfo } from "@tdc/core/content/paths";
import { formatIstDateTime } from "@tdc/core/time/ist";
import { ArticleStatusBadge, Empty, PageHeader } from "@/components/admin/ui";
import { Table, Td, Th } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";

export default async function ArticlesAdmin({ searchParams }: PageProps<"/admin/articles">) {
  await requireUser("dashboard:view");
  const { status, q } = await searchParams;
  const statusFilter = typeof status === "string" && status in ArticleStatus ? (status as ArticleStatus) : undefined;
  const query = typeof q === "string" ? q.trim().slice(0, 100) : "";
  const where: Prisma.ArticleWhereInput = {
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(query ? { headline: { contains: query, mode: "insensitive" } } : {}),
  };
  const articles = await getPrisma().article.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, headline: true, section: true, status: true, kind: true, reviewFlags: true, createdAt: true, publishedAt: true },
  });
  const tabs: Array<{ label: string; value?: ArticleStatus }> = [
    { label: "All" },
    { label: "Needs review", value: "NEEDS_REVIEW" },
    { label: "Approved", value: "APPROVED" },
    { label: "Published", value: "PUBLISHED" },
    { label: "Drafts", value: "DRAFT" },
    { label: "Failed", value: "FAILED" },
    { label: "Rejected", value: "REJECTED" },
    { label: "Archived", value: "ARCHIVED" },
  ];
  return (
    <>
      <PageHeader title="Articles" description="Generated and edited articles. Open one to review its validation report, edit it, approve or publish." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <Link
            key={t.label}
            href={t.value ? `/admin/articles?status=${t.value}` : "/admin/articles"}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${statusFilter === t.value ? "bg-neel text-surface" : "border border-border hover:bg-muted"}`}
          >
            {t.label}
          </Link>
        ))}
        <form className="ml-auto" action="/admin/articles">
          {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
          <input name="q" defaultValue={query} placeholder="Search headlines" aria-label="Search headlines" className="h-9 rounded-md border border-border bg-surface px-3 text-sm" />
        </form>
      </div>
      {articles.length ? (
        <Table>
          <thead>
            <tr>
              <Th>Headline</Th>
              <Th>Section</Th>
              <Th>Status</Th>
              <Th>Flags</Th>
              <Th>Created</Th>
              <Th>Published</Th>
            </tr>
          </thead>
          <tbody>
            {articles.map((a) => (
              <tr key={a.id}>
                <Td className="max-w-md">
                  <Link href={`/admin/articles/${a.id}`} className="font-semibold hover:text-neel">
                    {a.headline}
                  </Link>
                  {a.kind === "STOCK_MOVER" && <span className="ml-2 text-xs text-marigold-ink">stock mover</span>}
                </Td>
                <Td>{sectionInfo(a.section).name}</Td>
                <Td>
                  <ArticleStatusBadge status={a.status} />
                </Td>
                <Td className="max-w-xs text-xs text-ink-3">
                  <span className="line-clamp-2">{a.reviewFlags[0] ?? ""}</span>
                </Td>
                <Td className="tabular whitespace-nowrap text-ink-3">{formatIstDateTime(a.createdAt)}</Td>
                <Td className="tabular whitespace-nowrap text-ink-3">{a.publishedAt ? formatIstDateTime(a.publishedAt) : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <Empty>No articles match.</Empty>
      )}
    </>
  );
}
