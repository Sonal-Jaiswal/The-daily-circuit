import { revalidatePath, revalidateTag } from "next/cache";
import { safeEqual } from "@tdc/core/util/crypto";
import { CONTENT_TAG } from "@/lib/data";

/**
 * Called by the background worker after publication. Expires every public page so the new
 * edition appears on the very next request (no stale window for news).
 */
export async function POST(request: Request) {
  const secret = process.env.INTERNAL_JOB_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { paths?: unknown };
  revalidateTag(CONTENT_TAG, { expire: 0 });
  const paths = Array.isArray(body.paths) ? body.paths.filter((p): p is string => typeof p === "string" && p.startsWith("/")).slice(0, 50) : [];
  for (const p of paths) revalidatePath(p);
  return Response.json({ revalidated: true, tag: CONTENT_TAG, paths: paths.length });
}
