import { siteUrl } from "../env";
import { HttpError } from "./retry";

/** We identify ourselves honestly; we never impersonate a browser. */
export function crawlerUserAgent(): string {
  return `TheDailyCircuitBot/1.0 (+${siteUrl()}/editorial-policy)`;
}

export interface FetchTextOptions {
  timeoutMs?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

export interface FetchTextResult {
  status: number;
  url: string;
  text: string;
  headers: Headers;
  notModified: boolean;
}

export interface FetchBytesResult {
  status: number;
  url: string;
  body: Buffer;
  headers: Headers;
  notModified: boolean;
}

/** GET with timeout, size cap and an honest user agent. Throws HttpError on non-2xx (except 304). */
export async function fetchBytes(url: string, options: FetchTextOptions = {}): Promise<FetchBytesResult> {
  const { timeoutMs = 15_000, maxBytes = 3_000_000, headers = {}, fetchImpl = fetch } = options;
  const response = await fetchImpl(url, {
    headers: { "User-Agent": crawlerUserAgent(), Accept: "*/*", ...headers },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status === 304) {
    return { status: 304, url: response.url || url, body: Buffer.alloc(0), headers: response.headers, notModified: true };
  }
  if (!response.ok) {
    throw new HttpError(`GET ${url} returned ${response.status}`, response.status, url);
  }
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) {
    throw new HttpError(`GET ${url} body too large (${declared} bytes)`, 413, url);
  }
  const reader = response.body?.getReader();
  if (!reader) {
    return { status: response.status, url: response.url || url, body: Buffer.from(await response.arrayBuffer()), headers: response.headers, notModified: false };
  }
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new HttpError(`GET ${url} body exceeded ${maxBytes} bytes`, 413, url);
    }
    chunks.push(value);
  }
  return { status: response.status, url: response.url || url, body: Buffer.concat(chunks), headers: response.headers, notModified: false };
}

/** Like fetchBytes, decoded as UTF-8. */
export async function fetchText(url: string, options: FetchTextOptions = {}): Promise<FetchTextResult> {
  const { body, ...rest } = await fetchBytes(url, options);
  return { ...rest, text: new TextDecoder("utf-8").decode(body) };
}
