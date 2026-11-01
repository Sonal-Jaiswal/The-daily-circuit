export const SITE = {
  name: "The Daily Circuit",
  shortName: "Daily Circuit",
  tagline: "AI and Indian markets, every evening at 9.",
  description:
    "An automated evening edition covering artificial intelligence and Indian financial markets. Up to ten AI stories and ten market stories each night at 9:00 pm IST, each linked to its sources.",
  locale: "en_IN",
} as const;

/** The model family that currently writes articles, for reader-facing disclosures. */
export function aiModelsLabel(): string {
  const providers = (process.env.LLM_PROVIDERS || process.env.LLM_PROVIDER || "anthropic").split(",").map((p) => p.trim()).filter(Boolean);
  if (providers.length > 1) return "AI language models from several providers (each article names the model that wrote it)";
  return modelFamilyLabel(providers[0] === "gemini" ? "gemini" : providers[0] === "anthropic" ? "claude" : providers[0] ?? "");
}

/** Reader-facing name for the model recorded on an article. */
export function modelFamilyLabel(model: string | null | undefined): string {
  if (model?.startsWith("gemini")) return "Google\u2019s Gemini models";
  if (model?.startsWith("claude")) return "Anthropic\u2019s Claude models";
  if (model?.startsWith("grok")) return "xAI\u2019s Grok models";
  if (model?.includes("/")) return `the open model ${model.replace(/:free$/, "")} (via OpenRouter)`;
  if (model) return `the AI model ${model}`;
  return "AI language models";
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function absoluteUrl(path: string): string {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

export const NAV = [
  { href: "/", label: "Home" },
  { href: "/ai", label: "AI News" },
  { href: "/markets", label: "Indian Markets" },
  { href: "/ipo", label: "IPO" },
  { href: "/technology", label: "Technology" },
  { href: "/edition", label: "Daily Edition" },
  { href: "/about", label: "About" },
] as const;

export const FOOTER_LINKS = [
  { href: "/about", label: "About" },
  { href: "/authors", label: "Authors" },
  { href: "/editorial-policy", label: "Editorial policy" },
  { href: "/corrections", label: "Corrections" },
  { href: "/disclaimer", label: "Financial disclaimer" },
  { href: "/privacy-policy", label: "Privacy policy" },
  { href: "/terms", label: "Terms of use" },
  { href: "/contact", label: "Contact" },
  { href: "/rss.xml", label: "RSS" },
] as const;

export function contactEmail(): string | null {
  return process.env.CONTACT_EMAIL || null;
}

export function correctionsEmail(): string | null {
  return process.env.CORRECTIONS_EMAIL || process.env.CONTACT_EMAIL || null;
}
