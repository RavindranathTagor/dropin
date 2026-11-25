import { bad, ok } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return bad(new Error("payload_required"));
    }
    return ok({ ok: true });
  } catch (error) {
    return bad(error, 400);
  }
}
