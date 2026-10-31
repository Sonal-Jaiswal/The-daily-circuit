import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getPrisma } from "@tdc/db";
import { can } from "@tdc/core/auth/rbac";
import { articlePath, sectionInfo } from "@tdc/core/content/paths";
import { formatIstDateTime } from "@tdc/core/time/ist";
import type { ValidationReport } from "@tdc/core/validation/validate";
import type { FactCheck } from "@tdc/core/editorial/schema";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { ArticleStatusBadge, PageHeader, usd } from "@/components/admin/ui";
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth";
import { approveArticleAction, changeSlug, publishNowAction, rejectArticleAction, revalidateArticleAction, saveArticle, unpublishAction } from "@/lib/actions/admin";

function Field({ name, label, defaultValue, rows, hint, maxLength }: { name: string; label: string; defaultValue: string; rows?: number; hint?: string; maxLength?: number }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`f-${name}`}>{label}</Label>
      {rows ? <Textarea id={`f-${name}`} name={name} defaultValue={defaultValue} rows={rows} className="font-mono text-[13px]" /> : <Input id={`f-${name}`} name={name} defaultValue={defaultValue} maxLength={maxLength} />}
      {hint && <p className="text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

export default async function ArticleEditor({ params }: PageProps<"/admin/articles/[id]">) {
  const user = await requireUser("dashboard:view");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const prisma = getPrisma();
  const a = await prisma.article.findUnique({
    where: { id },
    include: { sources: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] }, tags: { include: { tag: true } }, reviewedBy: { select: { name: true } }, cluster: { include: { candidates: { select: { id: true, originalHeadline: true, rankingExplanation: true, totalScore: true, isClusterPrimary: true } } } } },
  });
  if (!a) notFound();
  const [usage, history] = await Promise.all([
    prisma.apiUsage.aggregate({ where: { articleId: id }, _sum: { costUsd: true }, _count: true }),
    prisma.auditLog.findMany({ where: { entityType: "Article", entityId: id }, orderBy: { createdAt: "desc" }, take: 20, include: { actor: { select: { name: true } } } }),
  ]);
  const report = (a.validationReport as (ValidationReport & { factCheck?: FactCheck | null }) | null) ?? null;
  const keyFacts = (Array.isArray(a.keyFacts) ? a.keyFacts : []) as Array<{ fact: string; sourceIds?: string[] } | string>;
  const keyFactsText = keyFacts.map((k) => (typeof k === "string" ? k : `${k.fact} ${(k.sourceIds ?? []).map((s) => `[${s}]`).join("")}`)).join("\n");
  const canEdit = can(user.role, "articles:edit");
  const canReview = can(user.role, "articles:review");
  const canPublish = can(user.role, "articles:publish");
  const live = a.status === "PUBLISHED";

  return (
    <>
      <PageHeader
        title={a.headline}
        description={`${sectionInfo(a.section).name} · created ${formatIstDateTime(a.createdAt)}${a.publishedAt ? ` · published ${formatIstDateTime(a.publishedAt)}` : ""}${a.generatedByModel ? ` · ${a.generatedByModel}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <ArticleStatusBadge status={a.status} />
            {live && (
              <Link href={articlePath(a)} className="text-sm font-semibold text-neel hover:underline" target="_blank">
                View live
              </Link>
            )}
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {report && (
            <Card>
              <CardHeader>
                <CardTitle>Validation report</CardTitle>
                <p className="text-xs text-ink-3">Checked {formatIstDateTime(new Date(report.checkedAt))}</p>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {report.blocking.length > 0 && (
                  <div>
                    <p className="font-semibold text-down">Blocking (must fix before approval)</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5">{report.blocking.map((b, i) => <li key={i}>{b}</li>)}</ul>
                  </div>
                )}
                {report.review.length > 0 && (
                  <div>
                    <p className="font-semibold text-marigold-ink">Needs an editor&apos;s judgement</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5">{report.review.map((b, i) => <li key={i}>{b}</li>)}</ul>
                  </div>
                )}
                {report.warnings.length > 0 && (
                  <div>
                    <p className="font-semibold text-ink-2">Warnings</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-2">{report.warnings.map((b, i) => <li key={i}>{b}</li>)}</ul>
                  </div>
                )}
                {!report.blocking.length && !report.review.length && <p className="text-up">All checks passed.</p>}
                {report.factCheck && (
                  <details className="rounded-md border border-border p-3">
                    <summary className="cursor-pointer font-semibold">Fact-check: {report.factCheck.overall.toLowerCase()} ({report.factCheck.claims.length} claims)</summary>
                    <ul className="mt-2 space-y-1">
                      {report.factCheck.claims.map((c, i) => (
                        <li key={i}>
                          <span className={c.verdict === "SUPPORTED" ? "text-up" : c.verdict === "PARTIALLY_SUPPORTED" ? "text-marigold-ink" : "text-down"}>{c.verdict.toLowerCase().replace("_", " ")}</span>: {c.claim}
                          {c.note && <span className="text-ink-3"> ({c.note})</span>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{live ? "Correct the published article" : "Edit article"}</CardTitle>
              <p className="text-xs text-ink-3">
                Restricted Markdown: blank lines between paragraphs, &ldquo;### &rdquo; subheads, &ldquo;- &rdquo; lists. Cite sources with [S1] markers. No URLs in text.
                {live ? " Saving a correction re-runs validation and shows an Updated time on the article." : " Saving re-runs validation; approve afterwards."}
              </p>
            </CardHeader>
            <CardContent>
              {canEdit && !["REJECTED", "ARCHIVED"].includes(a.status) && a.body ? (
                <ActionForm action={saveArticle} className="space-y-4">
                      <input type="hidden" name="id" value={a.id} />
                      <Field name="headline" label="Headline" defaultValue={a.headline} maxLength={160} />
                      <Field name="excerpt" label="Excerpt" defaultValue={a.excerpt} rows={3} />
                      <Field name="introduction" label="Introduction" defaultValue={a.introduction} rows={4} />
                      <Field name="body" label="Body" defaultValue={a.body} rows={18} />
                      <Field name="context" label="Context" defaultValue={a.context} rows={4} />
                      <Field name="whyItMatters" label="Why it matters" defaultValue={a.whyItMatters} rows={4} />
                      <Field name="keyFacts" label="Key facts" defaultValue={keyFactsText} rows={6} hint="One fact per line, each ending with its source markers, e.g. [S1]." />
                      <Field name="implications" label="What could happen next (analysis)" defaultValue={a.implications} rows={4} />
                      <Field name="risks" label="Risks and open questions" defaultValue={a.risks} rows={4} />
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field name="seoTitle" label="SEO title" defaultValue={a.seoTitle} maxLength={70} />
                        <Field name="imageAlt" label="Image alt text" defaultValue={a.imageAlt} maxLength={200} />
                      </div>
                      <Field name="seoDescription" label="SEO description" defaultValue={a.seoDescription} rows={2} />
                      <fieldset className="grid gap-4 rounded-md border border-border p-3 md:grid-cols-3">
                        <legend className="px-1 text-xs font-semibold text-ink-3">Licensed image (optional; otherwise the generated cover is used)</legend>
                        <Field name="imageUrl" label="Image URL (https)" defaultValue={a.imageUrl ?? ""} />
                        <Field name="imageCredit" label="Credit" defaultValue={a.imageCredit ?? ""} />
                        <Field name="imageLicense" label="Licence" defaultValue={a.imageLicense ?? ""} />
                      </fieldset>
                      <SubmitButton pendingLabel="Saving…">{live ? "Save correction" : "Save changes"}</SubmitButton>
                </ActionForm>
              ) : (
                <p className="text-sm text-ink-2">{a.body ? "This article cannot be edited in its current status, or your role does not allow editing." : "Generation failed before any text was written. Fix the cause (see flags), then rerun the generation stage for this edition."}</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Decision</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {canReview && !live && a.body && (
                <ActionForm action={revalidateArticleAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <SubmitButton variant="outline" className="w-full" pendingLabel="Validating…">
                    Run validation again
                  </SubmitButton>
                </ActionForm>
              )}
              {canReview && ["NEEDS_REVIEW", "DRAFT"].includes(a.status) && (
                <ActionForm action={approveArticleAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <SubmitButton className="w-full" disabled={!report || report.blocking.length > 0} pendingLabel="Approving…">
                    Approve for publication
                  </SubmitButton>
                  {report && report.blocking.length > 0 && <p className="mt-1 text-xs text-ink-3">Fix the blocking issues first.</p>}
                </ActionForm>
              )}
              {canPublish && a.status === "APPROVED" && (
                <ActionForm action={publishNowAction} confirm="Publish this article now?">
                  <input type="hidden" name="id" value={a.id} />
                  <SubmitButton className="w-full" pendingLabel="Publishing…">
                    Publish now
                  </SubmitButton>
                  {a.scheduledFor && <p className="mt-1 text-xs text-ink-3">Otherwise it publishes automatically at {formatIstDateTime(a.scheduledFor)}.</p>}
                </ActionForm>
              )}
              {canReview && !live && !["REJECTED", "ARCHIVED"].includes(a.status) && (
                <ActionForm action={rejectArticleAction} className="space-y-2" confirm="Reject this article? It will not be published.">
                  <input type="hidden" name="id" value={a.id} />
                  <Input name="reason" placeholder="Reason for rejecting" required minLength={3} aria-label="Reason for rejecting" />
                  <SubmitButton variant="outline" className="w-full">
                    Reject
                  </SubmitButton>
                </ActionForm>
              )}
              {canPublish && live && (
                <ActionForm action={unpublishAction} className="space-y-2" confirm="Unpublish this article? Its URL will return 404.">
                  <input type="hidden" name="id" value={a.id} />
                  <Input name="reason" placeholder="Reason for withdrawing" required minLength={3} aria-label="Reason for withdrawing" />
                  <SubmitButton variant="destructive" className="w-full">
                    Unpublish
                  </SubmitButton>
                </ActionForm>
              )}
              {a.rejectionReason && <p className="text-sm text-ink-2">Reason recorded: {a.rejectionReason}</p>}
              {a.reviewedBy && <p className="text-xs text-ink-3">Reviewed by {a.reviewedBy.name}{a.reviewedAt ? ` on ${formatIstDateTime(a.reviewedAt)}` : ""}.</p>}
            </CardContent>
          </Card>

          {canEdit && !live && a.status !== "ARCHIVED" && (
            <Card>
              <CardHeader>
                <CardTitle>URL</CardTitle>
              </CardHeader>
              <CardContent>
                <ActionForm action={changeSlug} className="space-y-2">
                  <input type="hidden" name="id" value={a.id} />
                  <Input name="slug" defaultValue={a.slug} aria-label="URL slug" />
                  <SubmitButton variant="outline" size="sm">
                    Change slug
                  </SubmitButton>
                  <p className="text-xs text-ink-3">URLs are permanent once published.</p>
                </ActionForm>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Sources ({a.sources.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm">
                {a.sources.map((s) => (
                  <li key={s.id}>
                    <span className="font-semibold">{s.citationId}</span> {s.publisherName}
                    {s.isPrimary && <span className="text-ink-3"> (primary)</span>}:{" "}
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-neel underline [overflow-wrap:anywhere]">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {a.cluster && (
            <Card>
              <CardHeader>
                <CardTitle>Why this story was selected</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-ink-2">
                {a.cluster.candidates
                  .filter((c) => c.isClusterPrimary)
                  .map((c) => (
                    <p key={c.id}>{c.rankingExplanation}</p>
                  ))}
                <p className="text-ink-3">{a.cluster.candidates.length} report(s) of this event were grouped together.</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
              <p className="text-xs text-ink-3">
                Claude cost for this article: {usd(Number(usage._sum.costUsd ?? 0))} over {usage._count} call(s)
              </p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-xs">
                {history.map((h) => (
                  <li key={h.id}>
                    <span className="tabular text-ink-3">{formatIstDateTime(h.createdAt)}</span> {h.action} by {h.actor?.name ?? "system"}
                  </li>
                ))}
                {!history.length && <li className="text-ink-3">No editorial actions yet.</li>}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
