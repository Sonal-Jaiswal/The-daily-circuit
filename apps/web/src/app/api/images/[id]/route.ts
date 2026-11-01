import { z } from "zod";
import { getPrisma } from "@tdc/db";
import { getCurrentUser } from "@/lib/auth";

/**
 * Serves stored AI illustrations. Published articles' images are public and cached for a year
 * (an id's content never changes); unpublished ones are visible only to signed-in staff.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/images/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  const image = await getPrisma().articleImage.findUnique({ where: { id }, select: { data: true, mimeType: true, article: { select: { status: true } } } });
  if (!image) return new Response("Not found", { status: 404 });
  const isPublic = image.article.status === "PUBLISHED";
  if (!isPublic && !(await getCurrentUser())) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mimeType,
      "Cache-Control": isPublic ? "public, max-age=31536000, immutable" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
