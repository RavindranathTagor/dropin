import { familyView } from "@/lib/amma";
import { ready } from "@/lib/db";
import { bad, ok } from "@/lib/http";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    await ready();
    const { token } = await context.params;
    const view = await familyView(token);
    if (!view) return bad(new Error("family_link_not_found"), 404);
    return ok({ ok: true, ...view });
  } catch (error) {
    return bad(error, 500);
  }
}
