import { getPrisma } from "@tdc/db";
import { can } from "@tdc/core/auth/rbac";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { Empty, PageHeader } from "@/components/admin/ui";
import { Card, CardContent, CardHeader, CardTitle, Input, Textarea } from "@/components/ui/primitives";
import { updateCategory, updateTagAction } from "@/lib/actions/admin";
import { requireUser } from "@/lib/auth";

export default async function TaxonomyPage() {
  const user = await requireUser("dashboard:view");
  const manage = can(user.role, "taxonomy:manage");
  const prisma = getPrisma();
  const [categories, tags] = await Promise.all([
    prisma.category.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { articles: true } } } }),
    prisma.tag.findMany({ orderBy: { name: "asc" }, take: 300, include: { _count: { select: { articles: true } } } }),
  ]);
  return (
    <>
      <PageHeader title="Categories and tags" description="Categories map to the site's sections and URLs, so they can be renamed but not removed. Tags are created by the writer and can be cleaned up here." />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          {categories.map((c) => (
            <Card key={c.id}>
              <CardHeader>
                <CardTitle>
                  /{c.slug} <span className="text-sm font-normal text-ink-3">({c._count.articles} articles)</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ActionForm action={updateCategory} className="space-y-2">
                  <input type="hidden" name="id" value={c.id} />
                  <Input name="name" defaultValue={c.name} disabled={!manage} aria-label="Category name" />
                  <Textarea name="description" defaultValue={c.description} rows={2} disabled={!manage} aria-label="Category description" />
                  {manage && (
                    <SubmitButton size="sm" variant="outline">
                      Save
                    </SubmitButton>
                  )}
                </ActionForm>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Tags ({tags.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {tags.length ? (
              <ul className="divide-y divide-border">
                {tags.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
                    {manage ? (
                      <ActionForm action={updateTagAction} className="flex flex-1 items-center gap-2">
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="intent" value="rename" />
                        <Input name="name" defaultValue={t.name} className="h-8" aria-label={`Rename ${t.name}`} />
                        <SubmitButton size="sm" variant="ghost">
                          Rename
                        </SubmitButton>
                      </ActionForm>
                    ) : (
                      <span className="flex-1">{t.name}</span>
                    )}
                    <span className="tabular text-xs text-ink-3">{t._count.articles}</span>
                    {manage && (
                      <ActionForm action={updateTagAction} confirm={`Delete tag "${t.name}"?`}>
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="intent" value="delete" />
                        <SubmitButton size="sm" variant="ghost">
                          Delete
                        </SubmitButton>
                      </ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Tags appear as articles are written.</Empty>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
