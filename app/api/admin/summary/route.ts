import { adminSummary } from "@/lib/ops";
import { bad, ok, withUser, reject } from "@/lib/http";

export async function GET() {
  try {
    const auth = await withUser(["admin"]);
    if (auth.error || !auth.user) return reject(auth);
    return ok({ ok: true, ...(await adminSummary()) });
  } catch (error) {
    return bad(error, 500);
  }
}
