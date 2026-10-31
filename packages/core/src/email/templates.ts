import type { EmailMessage } from "./mailer";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function layout(title: string, bodyHtml: string, footerHtml = ""): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f6fa;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#161a33">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:10px;padding:32px">
<tr><td style="font-size:20px;font-weight:700;letter-spacing:-0.01em;padding-bottom:16px;color:#2f3a8f">The Daily Circuit</td></tr>
<tr><td><h1 style="font-size:22px;line-height:1.3;margin:0 0 16px">${esc(title)}</h1>${bodyHtml}</td></tr>
<tr><td style="padding-top:24px;font-size:12px;color:#5b6180;line-height:1.5">${footerHtml}</td></tr>
</table></td></tr></table></body></html>`;
}

export function confirmSubscriptionEmail(input: { to: string; confirmUrl: string; siteName: string }): EmailMessage {
  const html = layout(
    "Confirm your subscription",
    `<p style="font-size:15px;line-height:1.6">Someone (hopefully you) asked to receive ${esc(input.siteName)}'s evening edition by email. Confirm to start receiving it.</p>
<p><a href="${esc(input.confirmUrl)}" style="display:inline-block;background:#2f3a8f;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600">Confirm subscription</a></p>
<p style="font-size:13px;color:#5b6180">If you did not request this, ignore this email — you will not be subscribed. The link expires in 48 hours.</p>`,
  );
  return {
    to: input.to,
    subject: `Confirm your ${input.siteName} subscription`,
    html,
    text: `Confirm your subscription to ${input.siteName}'s evening edition:\n${input.confirmUrl}\n\nIf you did not request this, ignore this email. The link expires in 48 hours.`,
  };
}

export interface DigestArticle {
  headline: string;
  excerpt: string;
  url: string;
  sectionName: string;
}

export function dailyDigestEmail(input: { to: string; siteName: string; editionTitle: string; editionUrl: string; articles: DigestArticle[]; unsubscribeUrl: string; oneClickUnsubscribeUrl: string }): EmailMessage {
  const items = input.articles
    .map(
      (a) =>
        `<tr><td style="padding:12px 0;border-top:1px solid #e3e6ef"><div style="font-size:12px;color:#5b6180">${esc(a.sectionName)}</div><a href="${esc(a.url)}" style="font-size:17px;font-weight:650;color:#161a33;text-decoration:none;line-height:1.35">${esc(a.headline)}</a><div style="font-size:14px;color:#3a3f5c;line-height:1.5;margin-top:4px">${esc(a.excerpt)}</div></td></tr>`,
    )
    .join("");
  const html = layout(
    input.editionTitle,
    `<table role="presentation" width="100%">${items}</table><p><a href="${esc(input.editionUrl)}" style="color:#2f3a8f;font-weight:600">Read the full edition</a></p>`,
    `You are receiving this because you confirmed a subscription. <a href="${esc(input.unsubscribeUrl)}" style="color:#5b6180">Unsubscribe</a>. Articles are produced by an automated newsroom from linked sources and are not investment advice.`,
  );
  const text = `${input.editionTitle}\n\n${input.articles.map((a) => `${a.sectionName}: ${a.headline}\n${a.url}`).join("\n\n")}\n\nFull edition: ${input.editionUrl}\nUnsubscribe: ${input.unsubscribeUrl}`;
  return {
    to: input.to,
    subject: input.editionTitle,
    html,
    text,
    headers: { "List-Unsubscribe": `<${input.oneClickUnsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

export interface AdminReport {
  siteName: string;
  editionDate: string;
  aiPublished: number;
  marketPublished: number;
  needsReview: number;
  failed: number;
  skipped: number;
  sourcesProcessed: number;
  sourcesFailed: number;
  apiCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  monthToDateUsd: number;
  monthlyBudgetUsd: number;
  published: Array<{ headline: string; url: string }>;
  problems: string[];
  adminUrl: string;
}

export function adminReportEmail(to: string[], r: AdminReport): EmailMessage {
  const rows: Array<[string, string]> = [
    ["AI articles published", String(r.aiPublished)],
    ["Market articles published", String(r.marketPublished)],
    ["Held for review", String(r.needsReview)],
    ["Failed", String(r.failed)],
    ["Candidates not selected", String(r.skipped)],
    ["Sources processed", `${r.sourcesProcessed} (${r.sourcesFailed} failed)`],
    ["Claude API calls", `${r.apiCalls} · ${r.inputTokens.toLocaleString("en-IN")} in / ${r.outputTokens.toLocaleString("en-IN")} out tokens`],
    ["Estimated cost (edition)", `$${r.costUsd.toFixed(2)}`],
    ["Month to date", `$${r.monthToDateUsd.toFixed(2)} of $${r.monthlyBudgetUsd.toFixed(0)} budget`],
  ];
  const table = rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#5b6180;font-size:14px">${esc(k)}</td><td style="padding:6px 0;font-size:14px;font-weight:600;text-align:right">${esc(v)}</td></tr>`).join("");
  const links = r.published.map((a) => `<li style="margin:6px 0"><a href="${esc(a.url)}" style="color:#2f3a8f">${esc(a.headline)}</a></li>`).join("");
  const problems = r.problems.length ? `<h2 style="font-size:16px;margin:20px 0 8px">Errors and warnings</h2><ul style="padding-left:18px;font-size:14px;line-height:1.5">${r.problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : "";
  const html = layout(
    `Edition report — ${r.editionDate}`,
    `<table role="presentation" width="100%">${table}</table>${links ? `<h2 style="font-size:16px;margin:20px 0 8px">Published</h2><ul style="padding-left:18px">${links}</ul>` : ""}${problems}<p><a href="${esc(r.adminUrl)}" style="color:#2f3a8f;font-weight:600">Open the dashboard</a></p>`,
  );
  const text = [
    `${r.siteName} — edition report ${r.editionDate}`,
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    "Published:",
    ...r.published.map((a) => `- ${a.headline} ${a.url}`),
    ...(r.problems.length ? ["", "Errors and warnings:", ...r.problems.map((p) => `- ${p}`)] : []),
    "",
    `Dashboard: ${r.adminUrl}`,
  ].join("\n");
  return { to, subject: `[${r.siteName}] ${r.editionDate}: ${r.aiPublished + r.marketPublished} published, ${r.needsReview} for review, ${r.failed} failed`, html, text };
}

export function alertEmail(to: string[], input: { siteName: string; subject: string; details: string; adminUrl: string }): EmailMessage {
  return {
    to,
    subject: `[${input.siteName} alert] ${input.subject}`,
    html: layout(input.subject, `<pre style="white-space:pre-wrap;font-size:13px;background:#f4f6fa;padding:12px;border-radius:6px">${esc(input.details)}</pre><p><a href="${esc(input.adminUrl)}" style="color:#2f3a8f;font-weight:600">Open job logs</a></p>`),
    text: `${input.subject}\n\n${input.details}\n\n${input.adminUrl}`,
  };
}
