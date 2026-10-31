import { getPublicSettings } from "@/lib/data";

/**
 * ads.txt is served only once an administrator has entered a real AdSense publisher ID.
 * We never publish a placeholder ID.
 */
export async function GET() {
  const { ads } = await getPublicSettings();
  if (!ads.publisherId) return new Response("Not found", { status: 404 });
  return new Response(`google.com, ${ads.publisherId}, DIRECT, f08c47fec0942fa0\n`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
