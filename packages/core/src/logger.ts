type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

function serialize(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!data) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v;
  }
  return out;
}

/** Structured JSON logs on stdout — picked up by Vercel, Render and Railway log drains. */
export function createLogger(bindings: Record<string, unknown> = {}, minLevel?: Level): Logger {
  const threshold = order[minLevel ?? ((process.env.LOG_LEVEL as Level | undefined) ?? "info")] ?? order.info;
  const emit = (level: Level, message: string, data?: Record<string, unknown>) => {
    if (order[level] < threshold) return;
    const line = JSON.stringify({ ts: new Date().toISOString(), level, message, ...bindings, ...serialize(data) });
    if (level === "error" || level === "warn") console.error(line);
    else console.log(line);
  };
  return {
    debug: (m, d) => emit("debug", m, d),
    info: (m, d) => emit("info", m, d),
    warn: (m, d) => emit("warn", m, d),
    error: (m, d) => emit("error", m, d),
    child: (b) => createLogger({ ...bindings, ...b }, minLevel),
  };
}

export const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return silentLogger;
  },
};
