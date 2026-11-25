import { runContentionTest } from "@/lib/ops";
import { bad, ok, withOps, reject } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const auth = await withOps(request);
    if (auth.error) return reject(auth);
    const result = await runContentionTest(auth.user?.id || "ops-secret");
    return ok({ ok: true, ...result });
  } catch (error) {
    return bad(error, 500);
  }
}
