import { evidenceBundle } from "@/lib/ops";
import { bad, ok, withOps, reject } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const auth = await withOps(request);
    if (auth.error) return reject(auth);
    return ok({ ok: true, ...(await evidenceBundle()) });
  } catch (error) {
    return bad(error, 500);
  }
}
