export interface RetryOptions {
  retries: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Return false to stop retrying (e.g. 4xx responses). */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  sleep?: (ms: number) => Promise<void>;
}

export const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Exponential backoff with full jitter. `retries` is the number of attempts after the first. */
export function backoffDelay(attempt: number, baseDelayMs = 500, maxDelayMs = 30_000, random = Math.random): number {
  const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      return await fn(attempt);
    } catch (error) {
      const canRetry = attempt <= options.retries && (options.shouldRetry?.(error, attempt) ?? true);
      if (!canRetry) throw error;
      const delay = backoffDelay(attempt, options.baseDelayMs, options.maxDelayMs);
      options.onRetry?.(error, attempt, delay);
      await sleep(delay);
    }
  }
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Retry network failures, timeouts, 408, 429 and 5xx. */
export function isTransientError(error: unknown): boolean {
  if (error instanceof HttpError) {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }
  if (error instanceof Error) {
    return error.name === "AbortError" || error.name === "TimeoutError" || error.name === "TypeError" || /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket/i.test(error.message);
  }
  return false;
}
