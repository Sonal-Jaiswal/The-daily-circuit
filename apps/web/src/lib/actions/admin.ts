"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { z } from "zod";
import { Prisma, getPrisma, JobType, Role, type Section } from "@tdc/db";
import { audit } from "@tdc/core/audit";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@tdc/core/auth/password";
import { authenticate, createSession, destroyAllSessions, destroySession, SESSION_COOKIE } from "@tdc/core/auth/session";
import { createLlmGateway } from "@tdc/core/jobs/runner";
import { getEnv, llmModels } from "@tdc/core/env";
import { parseFeed } from "@tdc/core/collector/feed-parser";
import { isFetchAllowed } from "@tdc/core/collector/robots";
import { enqueueJob, cancelQueuedJob } from "@tdc/core/jobs/queue";
import { approveArticle, draftFromArticle, publishArticleNow, validateArticle, validationSources } from "@tdc/core/publishing/articles";
import { uniqueSlug } from "@tdc/core/publishing/slug";
import { rateLimit } from "@tdc/core/security/ratelimit";
import { ADSENSE_PUBLISHER_RE, AdSlotsSchema, ScoringWeightsSchema, WatchlistItemSchema } from "@tdc/core/settings";
import { isValidDateString, isValidHhmm, istDateString } from "@tdc/core/time/ist";
import { fetchText } from "@tdc/core/util/http";
import { readingTimeMinutes, slugify } from "@tdc/core/util/text";
import { markdownToPlainText } from "@tdc/core/content/markdown";
import { deskForSection } from "@tdc/core/content/paths";
import { validateDraft } from "@tdc/core/validation/validate";
import { authorize, sessionCookieOptions } from "@/lib/auth";
import { CONTENT_TAG } from "@/lib/data";
import { clientIpHash } from "@/lib/request";

export interface ActionState {
  ok: boolean;
  message: string;
}

const ok = (message: string): ActionState => ({ ok: true, message });
const fail = (message: string): ActionState => ({ ok: false, message });

async function guarded(fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await fn();
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error && String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw error;
    return fail(error instanceof Error ? error.message : "Something went wrong.");
  }
}

function modelGateway() {
  return createLlmGateway(getEnv(), getPrisma());
}

// ─── Authentication ─────────────────────────────────────────────────────────

export async function login(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return fail("Enter your email and password.");
  const prisma = getPrisma();
  const ipHash = await clientIpHash();
  const [byIp, byEmail] = await Promise.all([rateLimit(prisma, `login-ip:${ipHash ?? "unknown"}`, 10, 900), rateLimit(prisma, `login-email:${email}`, 5, 900)]);
  if (!byIp.allowed || !byEmail.allowed) return fail("Too many sign-in attempts. Wait 15 minutes and try again.");
  const user = await authenticate(prisma, email, password);
  if (!user) return fail("That email and password combination is not valid.");
  const { token, expiresAt } = await createSession(prisma, user.id, { ipHash });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  await audit(prisma, { actorId: user.id, action: "auth.login", entityType: "User", entityId: user.id, ipHash });
  redirect("/admin");
}

export async function logout(): Promise<void> {
  const store = await cookies();
  await destroySession(getPrisma(), store.get(SESSION_COOKIE)?.value);
  store.delete(SESSION_COOKIE);
  redirect("/admin/login");
}

// ─── Articles ───────────────────────────────────────────────────────────────

const ArticleEdit = z.object({
  id: z.uuid(),
  headline: z.string().trim().min(15).max(160),
  excerpt: z.string().trim().min(40).max(400),
  introduction: z.string().trim().min(40),
  body: z.string().trim().min(200),
  context: z.string().trim().min(20),
  whyItMatters: z.string().trim().min(20),
  implications: z.string().trim().min(20),
  risks: z.string().trim().min(20),
  keyFacts: z.string().trim().min(10),
  seoTitle: z.string().trim().min(10).max(70),
  seoDescription: z.string().trim().min(50).max(170),
  imageAlt: z.string().trim().min(5).max(200),
  imageUrl: z.union([z.literal(""), z.url({ protocol: /^https$/ })]),
  imageCredit: z.string().trim().max(200),
  imageLicense: z.string().trim().max(200),
});

/** keyFacts edited as one fact per line, with optional trailing [S1][S2] markers. */
function parseKeyFacts(text: string) {
  return text
    .split("\n")
    .map((l) => l.trim().replace(/^[-*•]\s*/, ""))
    .filter(Boolean)
    .map((line) => {
      const ids = [...line.matchAll(/\[(S\d{1,2})\]/g)].map((m) => m[1]!);
      return { fact: line.replace(/\s*\[(S\d{1,2})\]/g, "").trim(), sourceIds: ids };
    });
}

export async function saveArticle(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    const user = await authorize("articles:edit");
    const parsed = ArticleEdit.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail(`Check ${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message}`);
    const d = parsed.data;
    const prisma = getPrisma();
    const before = await prisma.article.findUniqueOrThrow({ where: { id: d.id }, include: { sources: true, tags: { include: { tag: true } } } });
    if (d.imageUrl && (!d.imageCredit || !d.imageLicense)) return fail("A third-party image needs both a credit and a licence note.");
    const keyFacts = parseKeyFacts(d.keyFacts);
    const next = { ...before, ...d, keyFacts, imageUrl: d.imageUrl || null, imageCredit: d.imageCredit || null, imageLicense: d.imageLicense || null };
    const report = validateDraft(draftFromArticle(next as typeof before), validationSources(before), { desk: deskForSection(before.section) });
    const isLive = before.status === "PUBLISHED";
    if (isLive && report.blocking.length) return fail(`Not saved. The published article would fail validation: ${report.blocking.join("; ")}`);
    const changed = await prisma.article.update({
      where: { id: d.id },
      data: {
        headline: d.headline,
        excerpt: d.excerpt,
        introduction: d.introduction,
        body: d.body,
        context: d.context,
        whyItMatters: d.whyItMatters,
        implications: d.implications,
        risks: d.risks,
        keyFacts: keyFacts as unknown as Prisma.InputJsonValue,
        seoTitle: d.seoTitle,
        seoDescription: d.seoDescription,
        imageAlt: d.imageAlt,
        imageUrl: d.imageUrl || null,
        imageCredit: d.imageCredit || null,
        imageLicense: d.imageLicense || null,
        readingTimeMinutes: readingTimeMinutes(markdownToPlainText(`${d.introduction}\n${d.body}\n${d.context}\n${d.whyItMatters}\n${d.implications}\n${d.risks}`)),
        validationReport: report as unknown as Prisma.InputJsonValue,
        reviewFlags: [...report.blocking, ...report.review].slice(0, 20),
        // Edited drafts need a fresh approval; live articles record a visible update time.
        ...(isLive ? { contentModifiedAt: new Date() } : { status: before.status === "FAILED" || before.status === "REJECTED" ? before.status : "NEEDS_REVIEW", requiresHumanReview: true }),
      },
    });
    await audit(prisma, {
      actorId: user.id,
      action: isLive ? "article.correct" : "article.edit",
      entityType: "Article",
      entityId: d.id,
      before: { headline: before.headline, excerpt: before.excerpt, body: before.body, status: before.status },
      after: { headline: changed.headline, excerpt: changed.excerpt, body: changed.body, status: changed.status },
    });
    if (isLive) updateTag(CONTENT_TAG);
    return ok(isLive ? "Correction saved and published. The article now shows an updated time." : report.blocking.length ? `Saved. ${report.blocking.length} blocking issue(s) must be fixed before approval.` : "Saved. Review the checks below, then approve.");
  });
}

export async function revalidateArticleAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    const user = await authorize("articles:review");
    const id = z.uuid().parse(formData.get("id"));
    const prisma = getPrisma();
    const before = await prisma.article.findUniqueOrThrow({ where: { id }, select: { status: true } });
    if (before.status === "PUBLISHED") return fail("Published articles are validated when a correction is saved.");
    const settings = await prisma.siteSettings.findUniqueOrThrow({ where: { id: "default" } });
    const { report, status } = await validateArticle(prisma, id, {
      llm: modelGateway(),
      classifierModel: llmModels().classifier,
      factCheck: settings.enableFactCheckPass,
      autoPublish: false, // a human is looking at it: always leave the approval to them
    });
    await audit(prisma, { actorId: user.id, action: "article.validate", entityType: "Article", entityId: id, after: { status, blocking: report.blocking.length, review: report.review.length } });
    return ok(report.blocking.length ? `${report.blocking.length} blocking issue(s) remain.` : report.review.length ? `No blocking issues. ${report.review.length} item(s) need your judgement before approval.` : "All checks passed. You can approve the article.");
  });
}

export async function approveArticleAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    const user = await authorize("articles:review");
    const id = z.uuid().parse(formData.get("id"));
    const prisma = getPrisma();
    const a = await approveArticle(prisma, id, user.id);
    await audit(prisma, { actorId: user.id, action: "article.approve", entityType: "Article", entityId: id, after: { status: a.status } });
    return ok("Approved. It will publish with its edition, or you can publish it now.");
  });
}

export async function rejectArticleAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    const user = await authorize("articles:review");
    const id = z.uuid().parse(formData.get("id"));
    const reason = z.string().trim().min(3, "Give a short reason").max(500).parse(formData.get("reason"));
    const prisma = getPrisma();
    const before = await prisma.article.findUniqueOrThrow({ where: { id }, select: { status: true } });
    if (before.status === "PUBLISHED") return fail("Use Unpublish for a live article.");
    await prisma.article.update({ where: { id }, data: { status: "REJECTED", rejectionReason: reason, reviewedById: user.id, reviewedAt: new Date() } });
    await audit(prisma, { actorId: user.id, action: "article.reject", entityType: "Article", entityId: id, before, after: { status: "REJECTED", reason } });
    return ok("Rejected. It will not be published.");
  });
}

export async function publishNowAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    const user = await authorize("articles:publish");
    const id = z.uuid().parse(formData.get("id"));
    const prisma = getPrisma();
    const a = await publishArticleNow(prisma, id);
    await audit(prisma, { actorId: user.id, action: "article.publish", entityType: "Article", entityId: id, after: { publishedAt: a.publishedAt } });
    updateTag(CONTENT_TAG);
    return ok("Published.");
  });
}

export async function unpublishAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    const user = await authorize("articles:publish");
    const id = z.uuid().parse(formData.get("id"));
    const reason = z.string().trim().min(3, "Give a short reason").max(500).parse(formData.get("reason"));
    const prisma = getPrisma();
    await prisma.article.update({ where: { id }, data: { status: "ARCHIVED", rejectionReason: reason } });
    await audit(prisma, { actorId: user.id, action: "article.unpublish", entityType: "Article", entityId: id, after: { status: "ARCHIVED", reason } });
    updateTag(CONTENT_TAG);
    return ok("Unpublished. The URL now returns 404 and is removed from the sitemaps.");
  });
}

// ─── Jobs ───────────────────────────────────────────────────────────────────

export async function triggerJob(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    const user = await authorize("jobs:trigger");
    const type = z.enum(JobType).parse(formData.get("type"));
    const date = String(formData.get("editionDate") || istDateString());
    if (!isValidDateString(date)) return fail("Enter the edition date as YYYY-MM-DD.");
    const force = formData.get("force") === "on";
    const prisma = getPrisma();
    const running = await prisma.jobExecution.count({ where: { type, editionDate: new Date(`${date}T00:00:00Z`), status: { in: ["QUEUED", "RUNNING"] } } });
    if (running) return fail(`A ${type} job for ${date} is already queued or running.`);
    const { job } = await enqueueJob(prisma, { type, editionDate: date, trigger: "MANUAL", requestedById: user.id, payload: { force } });
    await audit(prisma, { actorId: user.id, action: "job.trigger", entityType: "JobExecution", entityId: job.id, after: { type, date, force } });
    return ok(`Queued ${type} for ${date}. The worker checks for jobs every 20 seconds around the evening run and every 10 minutes at other times.`);
  });
}

export async function cancelJob(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    const user = await authorize("jobs:trigger");
    const id = z.uuid().parse(formData.get("id"));
    const cancelled = await cancelQueuedJob(getPrisma(), id);
    if (cancelled) await audit(getPrisma(), { actorId: user.id, action: "job.cancel", entityType: "JobExecution", entityId: id });
    return cancelled ? ok("Cancelled.") : fail("Only queued jobs can be cancelled.");
  });
}

// ─── Sources ────────────────────────────────────────────────────────────────

const SourceInput = z.object({
  name: z.string().trim().min(2).max(120),
  feedUrl: z.url({ protocol: /^https$/, error: "Use an https:// feed URL" }),
  homepageUrl: z.url({ protocol: /^https?$/ }),
  desk: z.enum(["AI", "MARKETS"]),
  kind: z.enum(["OFFICIAL", "COMPANY", "REGULATOR", "EXCHANGE", "PUBLISHER", "WIRE"]),
  reliability: z.coerce.number().min(0.1).max(1),
  termsNote: z.string().trim().max(1000).optional(),
});

/** New sources are checked first: robots.txt must allow us and the feed must parse. */
export async function addSource(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    const user = await authorize("sources:manage");
    const parsed = SourceInput.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
    const s = parsed.data;
    if (!(await isFetchAllowed(s.feedUrl))) return fail("That site's robots.txt does not allow automated access to the feed.");
    let items = 0;
    try {
      const res = await fetchText(s.feedUrl, { timeoutMs: 15_000 });
      items = parseFeed(res.text).items.length;
    } catch (error) {
      return fail(`The feed could not be read: ${(error as Error).message}`);
    }
    const prisma = getPrisma();
    const created = await prisma.newsSource.create({
      data: {
        ...s,
        slug: `${slugify(s.name, 50)}-${Date.now().toString(36)}`,
        type: "RSS",
        termsNote: s.termsNote || null,
        requiresLicenseReview: s.kind === "PUBLISHER" || s.kind === "WIRE",
        // Third-party publishers start disabled until an editor confirms their terms.
        isEnabled: !(s.kind === "PUBLISHER" || s.kind === "WIRE"),
      },
    });
    await audit(prisma, { actorId: user.id, action: "source.create", entityType: "NewsSource", entityId: created.id, after: s });
    return ok(`Added ${s.name} (${items} items in the feed).${created.isEnabled ? "" : " Publisher sources start disabled: enable it after confirming the publisher's terms."}`);
  });
}

export async function updateSource(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    const user = await authorize("sources:manage");
    const id = z.uuid().parse(formData.get("id"));
    const intent = z.enum(["enable", "disable", "delete", "reliability", "license-confirmed"]).parse(formData.get("intent"));
    const prisma = getPrisma();
    const before = await prisma.newsSource.findUniqueOrThrow({ where: { id } });
    if (intent === "delete") {
      const used = await prisma.newsCandidate.count({ where: { sourceId: id } });
      if (used) {
        await prisma.newsSource.update({ where: { id }, data: { isEnabled: false } });
        await audit(prisma, { actorId: user.id, action: "source.disable", entityType: "NewsSource", entityId: id });
        return ok("This source has collected stories, so it was disabled instead of deleted to keep attribution history.");
      }
      await prisma.newsSource.delete({ where: { id } });
      await audit(prisma, { actorId: user.id, action: "source.delete", entityType: "NewsSource", entityId: id, before });
      return ok("Deleted.");
    }
    const data: Prisma.NewsSourceUpdateInput =
      intent === "enable"
        ? { isEnabled: true }
        : intent === "disable"
          ? { isEnabled: false }
          : intent === "license-confirmed"
            ? { requiresLicenseReview: false, termsNote: `${before.termsNote ?? ""}\nTerms confirmed by ${user.email} on ${istDateString()}.`.trim() }
            : { reliability: z.coerce.number().min(0.1).max(1).parse(formData.get("reliability")) };
    if (intent === "enable" && before.requiresLicenseReview) return fail("Confirm this publisher's terms first (Mark terms confirmed), then enable it.");
    await prisma.newsSource.update({ where: { id }, data });
    await audit(prisma, { actorId: user.id, action: `source.${intent}`, entityType: "NewsSource", entityId: id, before: { isEnabled: before.isEnabled, reliability: before.reliability }, after: data });
    return ok("Source updated.");
  });
}

// ─── Taxonomy ───────────────────────────────────────────────────────────────

export async function updateCategory(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    const user = await authorize("taxonomy:manage");
    const input = z.object({ id: z.uuid(), name: z.string().trim().min(2).max(60), description: z.string().trim().min(10).max(400) }).parse(Object.fromEntries(formData));
    const prisma = getPrisma();
    await prisma.category.update({ where: { id: input.id }, data: { name: input.name, description: input.description } });
    await audit(prisma, { actorId: user.id, action: "category.update", entityType: "Category", entityId: input.id, after: input });
    updateTag(CONTENT_TAG);
    return ok("Category saved.");
  });
}

export async function updateTagAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    const user = await authorize("taxonomy:manage");
    const id = z.uuid().parse(formData.get("id"));
    const intent = z.enum(["rename", "delete"]).parse(formData.get("intent"));
    const prisma = getPrisma();
    if (intent === "delete") {
      await prisma.tag.delete({ where: { id } });
    } else {
      const name = z.string().trim().min(2).max(40).parse(formData.get("name"));
      await prisma.tag.update({ where: { id }, data: { name } });
    }
    await audit(prisma, { actorId: user.id, action: `tag.${intent}`, entityType: "Tag", entityId: id });
    updateTag(CONTENT_TAG);
    return ok(intent === "delete" ? "Tag deleted." : "Tag renamed.");
  });
}

// ─── Settings ───────────────────────────────────────────────────────────────

export async function saveSettings(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    const user = await authorize("settings:manage");
    const f = Object.fromEntries(formData);
    const publishTimeIst = String(f.publishTimeIst ?? "");
    if (!isValidHhmm(publishTimeIst)) return fail("Publish time must be HH:mm in 24-hour IST, e.g. 21:00.");
    const num = (k: string, min: number, max: number) => z.coerce.number().min(min).max(max).parse(f[k]);
    const weights = ScoringWeightsSchema.safeParse({
      importance: num("wImportance", 0, 1),
      credibility: num("wCredibility", 0, 1),
      freshness: num("wFreshness", 0, 1),
      impact: num("wImpact", 0, 1),
      interest: num("wInterest", 0, 1),
    });
    if (!weights.success) return fail(weights.error.issues[0]?.message ?? "Invalid weights.");
    let watchlist: unknown;
    try {
      watchlist = JSON.parse(String(f.watchlist || "[]"));
    } catch {
      return fail("The watchlist must be valid JSON.");
    }
    const wl = z.array(WatchlistItemSchema).safeParse(watchlist);
    if (!wl.success) return fail(`Watchlist: ${wl.error.issues[0]?.path.join(".")} ${wl.error.issues[0]?.message}`);
    const publisherId = String(f.adsensePublisherId ?? "").trim();
    if (publisherId && !ADSENSE_PUBLISHER_RE.test(publisherId)) return fail("The AdSense publisher ID looks like pub-0000000000000000.");
    const slots = AdSlotsSchema.safeParse({
      header: String(f.slotHeader || "") || undefined,
      inArticle: String(f.slotInArticle || "") || undefined,
      sidebar: String(f.slotSidebar || "") || undefined,
      footer: String(f.slotFooter || "") || undefined,
    });
    if (!slots.success) return fail("Ad slot IDs are numeric (from your AdSense account).");
    const adsEnabled = f.adsEnabled === "on";
    if (adsEnabled && !publisherId) return fail("Ads cannot be enabled without an approved AdSense publisher ID.");
    const data = {
      publishTimeIst,
      maxAiArticles: num("maxAiArticles", 0, 10),
      maxMarketArticles: num("maxMarketArticles", 0, 10),
      minSelectionScore: num("minSelectionScore", 0, 1),
      latePublishGraceMin: num("latePublishGraceMin", 0, 720),
      monthlyBudgetUsd: num("monthlyBudgetUsd", 0, 100000),
      significantMovePct: num("significantMovePct", 0.5, 50),
      scoringWeights: weights.data,
      marketWatchlist: wl.data,
      autoPublish: f.autoPublish === "on",
      enableFactCheckPass: f.enableFactCheckPass === "on",
      newsletterDigestEnabled: f.newsletterDigestEnabled === "on",
      adsEnabled,
      adsensePublisherId: publisherId || null,
      adSlots: slots.data,
      updatedById: user.id,
    };
    const prisma = getPrisma();
    const before = await prisma.siteSettings.findUnique({ where: { id: "default" } });
    await prisma.siteSettings.update({ where: { id: "default" }, data });
    await audit(prisma, { actorId: user.id, action: "settings.update", entityType: "SiteSettings", entityId: "default", before, after: data });
    updateTag(CONTENT_TAG);
    return ok("Settings saved. The scheduler uses the new publish time from its next check.");
  });
}

// ─── Users ──────────────────────────────────────────────────────────────────

export async function createUser(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    const admin = await authorize("users:manage");
    const input = z
      .object({
        email: z.string().trim().toLowerCase().pipe(z.email()),
        name: z.string().trim().min(2).max(80),
        role: z.enum(Role),
        password: z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`),
      })
      .safeParse(Object.fromEntries(formData));
    if (!input.success) return fail(input.error.issues[0]?.message ?? "Check the form.");
    const prisma = getPrisma();
    const created = await prisma.user.create({ data: { email: input.data.email, name: input.data.name, role: input.data.role, passwordHash: await hashPassword(input.data.password) } }).catch((e) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new Error("A user with that email already exists.");
      throw e;
    });
    await audit(prisma, { actorId: admin.id, action: "user.create", entityType: "User", entityId: created.id, after: { email: created.email, role: created.role } });
    return ok(`Created ${created.email}. Share the temporary password securely and ask them to change it.`);
  });
}

export async function updateUser(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    const admin = await authorize("users:manage");
    const id = z.uuid().parse(formData.get("id"));
    const intent = z.enum(["deactivate", "activate", "role", "password"]).parse(formData.get("intent"));
    if (id === admin.id && (intent === "deactivate" || intent === "role")) return fail("You cannot change your own role or deactivate yourself.");
    const prisma = getPrisma();
    if (intent === "password") {
      const password = z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`).parse(formData.get("password"));
      await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(password) } });
      await destroyAllSessions(prisma, id);
    } else if (intent === "role") {
      await prisma.user.update({ where: { id }, data: { role: z.enum(Role).parse(formData.get("role")) } });
    } else {
      await prisma.user.update({ where: { id }, data: { isActive: intent === "activate" } });
      if (intent === "deactivate") await destroyAllSessions(prisma, id);
    }
    await audit(prisma, { actorId: admin.id, action: `user.${intent}`, entityType: "User", entityId: id });
    return ok("User updated.");
  });
}

export async function markMessageHandled(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    await authorize("messages:view");
    await getPrisma().contactMessage.update({ where: { id: z.uuid().parse(formData.get("id")) }, data: { handled: true } });
    return ok("Marked as handled.");
  });
}

/** Slug is permanent once published; editors may change it only before publication. */
export async function changeSlug(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    const user = await authorize("articles:edit");
    const id = z.uuid().parse(formData.get("id"));
    const requested = slugify(String(formData.get("slug") ?? ""), 80);
    const prisma = getPrisma();
    const a = await prisma.article.findUniqueOrThrow({ where: { id }, select: { status: true, slug: true, section: true } });
    if (a.status === "PUBLISHED" || a.status === "ARCHIVED") return fail("Published URLs are permanent and cannot be changed.");
    const slug = await uniqueSlug(prisma, requested, id, id);
    await prisma.article.update({ where: { id }, data: { slug } });
    await audit(prisma, { actorId: user.id, action: "article.slug", entityType: "Article", entityId: id, before: { slug: a.slug }, after: { slug } });
    return ok(`URL set to /${(a.section as Section).toLowerCase()}/${slug}.`);
  });
}
