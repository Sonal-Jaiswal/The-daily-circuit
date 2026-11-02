import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/admin/ui";
import { requireUser } from "@/lib/auth";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-lg border border-border bg-card p-5">
      <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
      <div className="mt-2 space-y-2 text-[0.95rem] leading-relaxed text-ink-2 [&_li]:ml-5 [&_li]:list-disc [&_ol>li]:list-decimal [&_strong]:text-ink">{children}</div>
    </section>
  );
}

const CONTENTS = [
  ["rhythm", "How a day works"],
  ["review", "Reviewing articles"],
  ["edit", "Editing and corrections"],
  ["write", "Writing your own article"],
  ["candidates", "Candidates: why a story was picked"],
  ["jobs", "Jobs: running stages by hand"],
  ["sources", "News sources"],
  ["settings", "Settings: quantity, topics and style"],
  ["usage", "AI usage and providers"],
  ["people", "Users, messages and subscribers"],
  ["trouble", "When something goes wrong"],
] as const;

export default async function HelpPage() {
  await requireUser("dashboard:view");
  return (
    <>
      <PageHeader title="How to use the dashboard" description="What each page does and the few things you need to do by hand. The newsroom runs itself every evening; this page covers the rest." />
      <nav aria-label="Contents" className="mb-6 flex flex-wrap gap-2 text-sm">
        {CONTENTS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-md border border-border bg-surface px-3 py-1.5 hover:bg-muted">
            {label}
          </a>
        ))}
      </nav>
      <div className="max-w-3xl space-y-4">
        <Section id="rhythm" title="How a day works">
          <p>Everything below happens automatically every evening (times in IST; they move with the publish time in Settings):</p>
          <ol>
            <li><strong>7:55 pm</strong>: the runner starts on GitHub Actions.</li>
            <li><strong>8:00 pm, Collect</strong>: reads every enabled news source.</li>
            <li><strong>8:15 pm, Process</strong>: drops old and duplicate stories, asks the AI to classify the rest, and groups reports of the same event.</li>
            <li><strong>8:25 pm, Rank</strong>: scores stories (importance, source credibility, freshness, impact, interest) and picks up to your daily limit per desk.</li>
            <li><strong>8:30 pm, Write</strong>: the AI writes each article from its sources, and an illustration is generated. If a draft fails, the next-best story is written instead.</li>
            <li><strong>8:50 pm, Validate</strong>: automated checks on citations, quotes, figures and investment-advice wording. Clean articles are approved; doubtful ones wait for you.</li>
            <li><strong>9:00 pm, Publish</strong>: approved articles go live.</li>
            <li><strong>9:05 pm</strong>: the site refreshes and the daily report is emailed.</li>
          </ol>
          <p>
            Each desk aims for at least the daily minimum (Settings, 5 by default). When too few stories clear the usual bar, it also uses
            weaker stories, stories up to three days old, and unused stories from recent editions, and replaces drafts that fail. If there
            is still not enough real news, fewer are published: nothing is invented, and podcasts, guides, opinion and routine notices are never used.
          </p>
        </Section>

        <Section id="review" title="Reviewing articles">
          <p>
            Open <Link href="/admin/articles?status=NEEDS_REVIEW" className="text-neel underline">Articles → Needs review</Link>. Each article shows its <strong>validation report</strong>:
          </p>
          <ul>
            <li><strong>Blocking</strong> (red): must be fixed by editing before it can be approved, e.g. a quote that is not in any source.</li>
            <li><strong>Needs judgement</strong> (amber): read it and decide, e.g. wording that might sound like investment advice.</li>
            <li><strong>Warnings</strong>: informational only.</li>
          </ul>
          <p>
            Then click <strong>Approve for publication</strong> (it goes live at 9 pm, or press <strong>Publish now</strong>), or <strong>Reject</strong> with a reason. Statuses: draft → needs review → approved → published; failed means the AI could not write it (usually too little source material).
          </p>
        </Section>

        <Section id="edit" title="Editing and corrections">
          <p>Open any article and change the text in the editor, then <strong>Save</strong>.</p>
          <ul>
            <li>For AI articles, keep the <code>[S1]</code> citation markers next to claims, and do not add URLs in the text.</li>
            <li>Saving a <strong>published</strong> article is a correction: the page shows an “Updated” time. AI articles must still pass the checks.</li>
            <li><strong>Unpublish</strong> withdraws an article (its URL returns 404 and it leaves the sitemaps).</li>
            <li>You can remove an AI illustration from the right-hand panel; the article then shows its pattern cover.</li>
          </ul>
        </Section>

        <Section id="write" title="Writing your own article">
          <p>
            Occasionally you may want to publish something yourself. Go to <Link href="/admin/articles/new" className="text-neel underline">Articles → Write an article</Link>.
          </p>
          <ol>
            <li>Pick the section, write a headline, a one-to-two sentence summary and the article.</li>
            <li>Add sources (optional), one per line: <code>URL | publisher | title</code>. Cite them in the text as <code>[S1]</code>, <code>[S2]</code>.</li>
            <li>Choose <strong>Save as draft</strong> or <strong>Publish now</strong>. Drafts can be published later from the article page.</li>
          </ol>
          <p>Your article carries your name and says it was written by an editor, not AI. Market and IPO articles always show the investment disclaimer.</p>
        </Section>

        <Section id="candidates" title="Candidates: why a story was picked">
          <p>
            <Link href="/admin/candidates" className="text-neel underline">Candidates</Link> lists every collected story for a date and desk, with its score and a written explanation: selected, below the minimum score, outside the freshness window, a duplicate, or not news.
          </p>
        </Section>

        <Section id="jobs" title="Jobs: running stages by hand">
          <p>
            <Link href="/admin/jobs" className="text-neel underline">Jobs</Link> shows every run and its log. To rerun something, choose a stage and a date and press <strong>Run stage</strong>; for a full manual run, queue them in order: Collect, Process, Rank, Write, Validate, Prepare edition, Publish.
          </p>
          <p>
            Outside the evening run, queued jobs start the next time the runner works. To start it immediately: GitHub → the repository → <strong>Actions → Evening edition → Run workflow</strong> (mode <em>run</em>). Mode <em>check</em> tests every AI provider and image generation; mode <em>illustrate</em> adds images to articles that have none.
          </p>
          <p>Every stage is safe to rerun: nothing is collected, written or published twice.</p>
        </Section>

        <Section id="sources" title="News sources">
          <p>
            <Link href="/admin/sources" className="text-neel underline">Sources</Link> lists the feeds the newsroom reads. Enable, disable, adjust reliability (0.1–1; higher ranks better), or add a new RSS feed (it is checked before saving).
          </p>
          <p>
            Publishers marked <strong>terms to confirm</strong> are used only through their headline. When you are satisfied their terms allow reading their public pages for fact-checking and linking, press <strong>Mark terms confirmed</strong>; articles from them become richer.
          </p>
        </Section>

        <Section id="settings" title="Settings: quantity, topics and style">
          <ul>
            <li><strong>Publish time</strong>: the whole schedule moves with it (collection starts an hour earlier).</li>
            <li><strong>Articles per day</strong>: up to 20 per desk. More articles use more of the free AI allowance; 10–12 per desk is comfortable on the free tiers.</li>
            <li><strong>Publish automatically</strong>: when off, every article waits for your approval.</li>
            <li><strong>Writing style and instructions</strong>: plain-language notes for the writer, e.g. “explain technical terms simply” or “always mention the impact on Indian users”. They cannot override the accuracy rules.</li>
            <li><strong>Topics to prioritise</strong> (per desk): stories matching these get a small ranking boost, e.g. “Indian AI startups, semiconductors”.</li>
            <li><strong>Selection model</strong>: the score weights (must add up to 1) and the minimum score. Lower the minimum to publish more marginal stories.</li>
            <li><strong>Monthly AI budget</strong>: writing stops for the month when reached (free providers count as $0).</li>
            <li><strong>Advertising</strong>: stays off until you enter an approved AdSense publisher ID.</li>
          </ul>
          <p>The four site sections (AI, Technology, Markets, IPO) are built into the site&apos;s addresses and menus; adding a brand-new section is a code change.</p>
        </Section>

        <Section id="usage" title="AI usage and providers">
          <p>
            <Link href="/admin/usage" className="text-neel underline">AI usage</Link> shows every model request, by purpose, model and day, with estimated cost. The newsroom tries providers in order (Gemini, OpenRouter, Groq, then paid ones if configured); if one hits its free limit, the next takes over. Each article names the model that wrote it.
          </p>
        </Section>

        <Section id="people" title="Users, messages and subscribers">
          <ul>
            <li><strong>Users</strong> (admins only): add people as Admin (everything), Editor (review, edit, publish, sources) or Viewer (read-only). Reset passwords here; change your own after the first sign-in.</li>
            <li><strong>Messages</strong>: contact-form submissions, including corrections and grievances (aim to resolve within 15 days).</li>
            <li><strong>Subscribers</strong>: newsletter sign-ups; only confirmed addresses receive email.</li>
          </ul>
        </Section>

        <Section id="trouble" title="When something goes wrong">
          <ul>
            <li><strong>No articles tonight</strong>: check Jobs. “Insufficient information” means the sources were too thin; “All model providers failed” means the free AI limits were reached (try again later or add a provider).</li>
            <li><strong>An article has an error</strong>: open it, correct it and save; or unpublish it.</li>
            <li><strong>A source keeps failing</strong>: the Overview lists it; disable it in Sources if it stays broken.</li>
            <li><strong>Emails not arriving</strong>: the sending domain must be verified in Resend for addresses other than your Resend account email.</li>
          </ul>
        </Section>
      </div>
    </>
  );
}
