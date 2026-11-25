import { setOperatorStatus } from "@/lib/ops";
import { bad, ok, withUser, reject } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withUser(["admin"]);
    if (auth.error || !auth.user) return reject(auth);
    const { id } = await context.params;
    const body = (await request.json()) as { status?: string };
    const result = await setOperatorStatus(id, body.status || "", auth.user.id);
    return ok(result);
  } catch (error) {
    return bad(error);
  }
}
