/**
 * Restricted Markdown used for article bodies. Produces an AST that the web app renders to
 * React elements — no raw HTML ever reaches the page, so there is nothing to sanitise.
 */
export type Inline =
  | { type: "text"; value: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] }
  | { type: "cite"; id: string };

export type Block =
  | { type: "p"; children: Inline[]; raw: string }
  | { type: "h2" | "h3"; children: Inline[]; raw: string }
  | { type: "ul" | "ol"; items: Inline[][]; raw: string };

const TOKEN_RE = /\[(S\d{1,2})\]|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ type: "text", value: text.slice(last, idx) });
    if (m[1]) out.push({ type: "cite", id: m[1] });
    else if (m[2] && m[3]) out.push({ type: "link", href: m[3], children: [{ type: "text", value: m[2] }] });
    else if (m[4]) out.push({ type: "strong", children: parseInline(m[4]) });
    else if (m[5]) out.push({ type: "em", children: parseInline(m[5]) });
    last = idx + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const chunks = source
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((c) => c.trim())
    .filter(Boolean);
  for (const chunk of chunks) {
    const lines = chunk.split("\n").map((l) => l.trim());
    const heading = /^(#{2,4})\s+(.+)$/.exec(lines[0]!);
    if (heading && lines.length === 1) {
      const level = heading[1]!.length === 2 ? "h2" : "h3";
      blocks.push({ type: level, children: parseInline(heading[2]!), raw: heading[2]! });
      continue;
    }
    if (heading) {
      blocks.push({ type: heading[1]!.length === 2 ? "h2" : "h3", children: parseInline(heading[2]!), raw: heading[2]! });
      lines.shift();
    }
    if (lines.length && lines.every((l) => /^[-*•]\s+/.test(l))) {
      blocks.push({ type: "ul", items: lines.map((l) => parseInline(l.replace(/^[-*•]\s+/, ""))), raw: lines.join("\n") });
      continue;
    }
    if (lines.length && lines.every((l) => /^\d+[.)]\s+/.test(l))) {
      blocks.push({ type: "ol", items: lines.map((l) => parseInline(l.replace(/^\d+[.)]\s+/, ""))), raw: lines.join("\n") });
      continue;
    }
    if (lines.length) {
      const raw = lines.join(" ").replace(/^#+\s+/, "");
      blocks.push({ type: "p", children: parseInline(raw), raw });
    }
  }
  return blocks;
}

/** Plain text, for reading time, feeds and search snippets. */
export function markdownToPlainText(source: string): string {
  return source
    .replace(/\[(S\d{1,2})\]/g, "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*•]\s+/gm, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}
