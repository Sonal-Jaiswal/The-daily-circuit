/**
 * Phrases that could amount to investment advice or a recommendation. A match never blocks
 * a story outright — it routes the story to a human editor (SEBI's Investment Adviser and
 * Research Analyst regulations govern personalised advice and research recommendations).
 */
const ADVICE_PATTERNS: Array<{ id: string; re: RegExp }> = [
  { id: "imperative-trade", re: /\b(you|investors|readers|traders)\s+(should|must|may want to|might want to|could consider|are advised to)\s+(buy|sell|hold|accumulate|exit|invest|subscribe|apply|avoid|book)/i },
  { id: "recommendation-word", re: /\b(strong\s+buy|buy\s+rating|sell\s+rating|outperform\s+rating|overweight\s+rating|accumulate\s+rating)\b/i },
  { id: "target-price", re: /\b(target\s+price|price\s+target|tp\s+of)\b/i },
  { id: "stop-loss", re: /\bstop[\s-]?loss\b/i },
  { id: "hype", re: /\b(multibagger|sure[\s-]shot|guaranteed\s+returns?|can'?t\s+lose|must[\s-]buy|jackpot)\b/i },
  { id: "ipo-advice", re: /\b(subscribe|apply|avoid)\s+(to|for)?\s*(the|this)?\s*ipo\b/i },
  { id: "good-investment", re: /\b(good|great|safe|solid|attractive)\s+(investment|bet|buy|pick)\b/i },
  { id: "buy-the-dip", re: /\b(buy\s+(the|on)\s+dips?|time\s+to\s+(buy|sell))\b/i },
];

export interface AdviceMatch {
  id: string;
  excerpt: string;
}

export function detectInvestmentAdvice(text: string): AdviceMatch[] {
  const matches: AdviceMatch[] = [];
  for (const { id, re } of ADVICE_PATTERNS) {
    const m = re.exec(text);
    if (m) {
      const start = Math.max(0, m.index - 40);
      matches.push({ id, excerpt: text.slice(start, m.index + m[0].length + 40).replace(/\s+/g, " ").trim() });
    }
  }
  return matches;
}

const CLICKBAIT = /(you won'?t believe|shocking|mind[\s-]?blowing|jaw[\s-]?dropping|this is why|here'?s why you|what happens next|will blow your mind|goes viral|!{1,}|\?$)/i;

export function isClickbait(headline: string): boolean {
  return CLICKBAIT.test(headline.trim());
}
