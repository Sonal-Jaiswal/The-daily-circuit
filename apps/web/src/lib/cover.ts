/**
 * Generative "circuit trace" covers. Every article gets an original illustration derived
 * from its slug, so the site never depends on images it is not licensed to use.
 * Pure and deterministic: the same slug always yields the same cover.
 */
export type CoverSection = "AI" | "TECHNOLOGY" | "MARKETS" | "IPO";

export const COVER_W = 1200;
export const COVER_H = 630;

const PALETTES: Record<CoverSection, { field: string; trace: string; accent: string; pad: string }> = {
  AI: { field: "#25307f", trace: "#97a1f2", accent: "#f2c14e", pad: "#e6e8f7" },
  TECHNOLOGY: { field: "#1b2246", trace: "#7f8ad6", accent: "#e9b54a", pad: "#c9cef2" },
  MARKETS: { field: "#6e4705", trace: "#f2c766", accent: "#e6e8f7", pad: "#fbf0d9" },
  IPO: { field: "#4e3304", trace: "#e3ad42", accent: "#a3acf7", pad: "#fbf0d9" },
};

function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function prng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Eight compass directions; traces only bend by 45° at a time, like PCB routing.
const DIRS = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
] as const;

export interface CoverTrace {
  d: string;
  width: number;
  opacity: number;
  accent: boolean;
  end: { x: number; y: number };
  start: { x: number; y: number };
}

export interface CoverModel {
  palette: (typeof PALETTES)[CoverSection];
  traces: CoverTrace[];
}

export function buildCover(seedText: string, section: CoverSection): CoverModel {
  const rand = prng(hash(seedText));
  const unit = 30;
  const cols = COVER_W / unit;
  const rows = Math.round(COVER_H / unit);
  const traces: CoverTrace[] = [];
  const buses = 5 + Math.floor(rand() * 4);
  const accentBus = Math.floor(rand() * buses);

  for (let b = 0; b < buses; b += 1) {
    // A bus is a bundle of parallel traces that share one route.
    const lanes = 2 + Math.floor(rand() * 4);
    // Spread bundles across the frame; some enter from beyond the left edge.
    const startX = Math.floor(rand() * cols * 0.55) - 3;
    const startY = 1 + Math.floor(((b + rand()) / buses) * (rows - 2));
    let dir = rand() < 0.5 ? 0 : rand() < 0.5 ? 1 : 7;
    const steps: Array<{ dir: number; len: number }> = [];
    const segments = 4 + Math.floor(rand() * 4);
    for (let s = 0; s < segments; s += 1) {
      steps.push({ dir, len: 3 + Math.floor(rand() * 10) });
      const turn = rand();
      dir = turn < 0.4 ? dir : turn < 0.7 ? (dir + 1) % 8 : (dir + 7) % 8;
      if (dir >= 2 && dir <= 6) dir = rand() < 0.5 ? 1 : 7; // keep flowing rightwards
    }
    for (let l = 0; l < lanes; l += 1) {
      let x = startX * unit;
      let y = (startY + l) * unit;
      const pts: Array<[number, number]> = [[x, y]];
      for (const step of steps) {
        const [dx, dy] = DIRS[step.dir]!;
        x += dx * step.len * unit;
        y += dy * step.len * unit;
        pts.push([x, y]);
      }
      traces.push({
        d: `M${pts.map(([px, py]) => `${px} ${py}`).join(" L")}`,
        width: 5 + Math.floor(rand() * 4),
        opacity: 0.5 + rand() * 0.45,
        accent: b === accentBus && l === 0,
        start: { x: pts[0]![0], y: pts[0]![1] },
        end: { x: pts.at(-1)![0], y: pts.at(-1)![1] },
      });
    }
  }
  return { palette: PALETTES[section], traces };
}

/** Standalone SVG markup (used for Open Graph images). */
export function coverSvg(seedText: string, section: CoverSection): string {
  const { palette, traces } = buildCover(seedText, section);
  const body = traces
    .map((t) => {
      const stroke = t.accent ? palette.accent : palette.trace;
      return `<path d="${t.d}" fill="none" stroke="${stroke}" stroke-width="${t.width}" stroke-linecap="round" stroke-linejoin="round" opacity="${t.accent ? 1 : t.opacity.toFixed(2)}"/>` +
        `<circle cx="${t.start.x}" cy="${t.start.y}" r="${t.width + 2}" fill="${palette.field}" stroke="${stroke}" stroke-width="3"/>` +
        `<circle cx="${t.end.x}" cy="${t.end.y}" r="${t.width + 5}" fill="${t.accent ? palette.accent : palette.pad}"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COVER_W} ${COVER_H}" width="${COVER_W}" height="${COVER_H}"><rect width="100%" height="100%" fill="${palette.field}"/>${body}</svg>`;
}
