import type { NextRequest } from "next/server";
import { getPrisma } from "@tdc/db";
import { unsubscribe } from "@tdc/core/newsletter/service";

/** RFC 8058 one-click unsubscribe (List-Unsubscribe-Post) from mail clients. */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const ok = await unsubscribe(getPrisma(), token);
  return new Response(ok ? "Unsubscribed" : "Invalid token", { status: ok ? 200 : 400 });
}
