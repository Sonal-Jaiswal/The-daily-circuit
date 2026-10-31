import { Fragment, type ReactNode } from "react";
import { parseMarkdown, type Inline } from "@tdc/core/content/markdown";

/**
 * Renders the restricted Markdown AST as React elements. Citation markers become links to the
 * numbered source list; unknown markers render as plain text, never as links.
 */
function renderInline(nodes: Inline[], citations: Map<string, number>, key = "i"): ReactNode[] {
  return nodes.map((n, i) => {
    const k = `${key}-${i}`;
    switch (n.type) {
      case "text":
        return <Fragment key={k}>{n.value}</Fragment>;
      case "strong":
        return <strong key={k}>{renderInline(n.children, citations, k)}</strong>;
      case "em":
        return <em key={k}>{renderInline(n.children, citations, k)}</em>;
      case "link":
        return (
          <a key={k} href={n.href} rel="noopener noreferrer nofollow" target="_blank">
            {renderInline(n.children, citations, k)}
          </a>
        );
      case "cite": {
        const num = citations.get(n.id);
        if (!num) return null;
        return (
          <a key={k} href={`#source-${num}`} className="cite" aria-label={`Source ${num}`}>
            [{num}]
          </a>
        );
      }
    }
  });
}

export function RichText({ text, citations, className }: { text: string; citations: Map<string, number>; className?: string }) {
  const blocks = parseMarkdown(text);
  return (
    <div className={className}>
      {blocks.map((b, i) => {
        if (b.type === "p") return <p key={i}>{renderInline(b.children, citations, `p${i}`)}</p>;
        if (!("items" in b)) {
          const Heading = b.type === "h2" ? "h2" : "h3";
          return <Heading key={i}>{renderInline(b.children, citations, `h${i}`)}</Heading>;
        }
        const List = b.type === "ul" ? "ul" : "ol";
        return (
          <List key={i}>
            {b.items.map((item, j) => (
              <li key={j}>{renderInline(item, citations, `l${i}-${j}`)}</li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
